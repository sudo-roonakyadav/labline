import { Router } from 'express';
import mongoose from 'mongoose';
import { HelpRequest } from '../models/HelpRequest.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { emitQueueChange } from '../socket/index.js';
import { calculateQueueIntelligence } from '../utils/queueIntelligence.js';

export const requestsRouter = Router();

const VALID_CATEGORIES = ['dsa', 'frontend', 'backend', 'database', 'environment', 'other'];

// Helper to validate ObjectId format
function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

// ---------------------------------------------------------------------------
// STUDENT ENDPOINTS
// ---------------------------------------------------------------------------

// POST /api/requests - Student creates a new help request
requestsRouter.post('/', requireAuth, requireRole('student'), async (req, res, next) => {
  try {
    const { topic, description, codeSnippet, category } = req.body;
    const errors = [];

    if (!topic || typeof topic !== 'string' || topic.trim().length < 2 || topic.trim().length > 100) {
      errors.push('Topic must be between 2 and 100 characters.');
    }

    if (!description || typeof description !== 'string' || description.trim().length < 5 || description.trim().length > 1000) {
      errors.push('Description must be between 5 and 1000 characters.');
    }

    if (codeSnippet !== undefined && codeSnippet !== null) {
      if (typeof codeSnippet !== 'string' || codeSnippet.length > 3000) {
        errors.push('Code snippet cannot exceed 3000 characters.');
      }
    }

    let resolvedCategory = 'other';
    if (category !== undefined && category !== null && category !== '') {
      if (typeof category !== 'string' || !VALID_CATEGORIES.includes(category.toLowerCase())) {
        errors.push(`Category must be one of: ${VALID_CATEGORIES.join(', ')}.`);
      } else {
        resolvedCategory = category.toLowerCase();
      }
    }

    if (errors.length > 0) {
      return res.status(422).json({
        error: 'Unprocessable Entity',
        message: 'Validation failed',
        details: errors,
      });
    }

    const newRequest = await HelpRequest.create({
      student: req.user._id,
      topic: topic.trim(),
      description: description.trim(),
      codeSnippet: (codeSnippet || '').trim(),
      category: resolvedCategory,
      status: 'waiting',
    });

    // Calculate queue position for the newly created request
    const queuePosition = await HelpRequest.countDocuments({
      status: 'waiting',
      createdAt: { $lte: newRequest.createdAt },
    });

    const intelligence = await calculateQueueIntelligence(queuePosition);
    const populated = await newRequest.populate('student', 'name email');

    // Notify real-time listeners of queue state change
    emitQueueChange('created');

    res.status(201).json({
      message: 'Help request created successfully.',
      request: {
        ...populated.toObject(),
        queuePosition,
        intelligence,
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/requests/mine - Student views own requests and queue position
requestsRouter.get('/mine', requireAuth, requireRole('student'), async (req, res, next) => {
  try {
    const { status, category, search } = req.query;
    const filter = { student: req.user._id };

    if (status && ['waiting', 'claimed', 'in_progress', 'resolved', 'cancelled'].includes(status)) {
      filter.status = status;
    }

    if (category && VALID_CATEGORIES.includes(category.toLowerCase())) {
      filter.category = category.toLowerCase();
    }

    if (search && typeof search === 'string' && search.trim().length > 0) {
      filter.$or = [
        { topic: { $regex: search.trim(), $options: 'i' } },
        { description: { $regex: search.trim(), $options: 'i' } },
        { resolutionNotes: { $regex: search.trim(), $options: 'i' } },
      ];
    }

    const requests = await HelpRequest.find(filter)
      .sort({ createdAt: -1 })
      .populate('mentor', 'name email');

    // Compute live queue position and telemetry for waiting requests
    const enhancedRequests = await Promise.all(
      requests.map(async (doc) => {
        const obj = doc.toObject();
        if (obj.status === 'waiting') {
          obj.queuePosition = await HelpRequest.countDocuments({
            status: 'waiting',
            createdAt: { $lte: obj.createdAt },
          });
          obj.intelligence = await calculateQueueIntelligence(obj.queuePosition);
        } else {
          obj.queuePosition = null;
          obj.intelligence = null;
        }
        return obj;
      })
    );

    res.status(200).json({
      requests: enhancedRequests,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/requests/:id/cancel - Student cancels own waiting request
requestsRouter.post('/:id/cancel', requireAuth, requireRole('student'), async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Invalid request ID format.',
      });
    }

    const request = await HelpRequest.findById(id);

    if (!request) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Help request not found.',
      });
    }

    // Authorization: Student can only cancel their own request
    if (request.student.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You can only cancel your own help requests.',
      });
    }

    // Status rule: Only waiting requests can be cancelled
    if (request.status !== 'waiting') {
      return res.status(409).json({
        error: 'Conflict',
        message: `Cannot cancel a request that is already "${request.status}". Only waiting requests can be cancelled.`,
      });
    }

    request.status = 'cancelled';
    request.cancelledAt = new Date();
    await request.save();

    emitQueueChange('cancelled');

    res.status(200).json({
      message: 'Help request cancelled successfully.',
      request,
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// MENTOR ENDPOINTS
// ---------------------------------------------------------------------------

// POST /api/requests/:id/claim - Mentor atomically claims a waiting request
requestsRouter.post('/:id/claim', requireAuth, requireRole('mentor'), async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Invalid request ID format.',
      });
    }

    // ATOMIC CLAIM: Only update if status is currently 'waiting'.
    // Prevents race conditions when multiple mentors attempt to claim concurrently.
    const claimedRequest = await HelpRequest.findOneAndUpdate(
      { _id: id, status: 'waiting' },
      {
        $set: {
          status: 'claimed',
          mentor: req.user._id,
          claimedAt: new Date(),
        },
      },
      { new: true }
    )
      .populate('student', 'name email')
      .populate('mentor', 'name email');

    if (!claimedRequest) {
      const existing = await HelpRequest.findById(id);
      if (!existing) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'Help request not found.',
        });
      }
      return res.status(409).json({
        error: 'Conflict',
        message: `This request is no longer available (current status: "${existing.status}").`,
      });
    }

    emitQueueChange('claimed');

    res.status(200).json({
      message: 'Help request claimed successfully.',
      request: claimedRequest,
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/requests/:id/status - Assigned mentor transitions status (in_progress -> resolved)
requestsRouter.patch('/:id/status', requireAuth, requireRole('mentor'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status: targetStatus, resolutionNotes } = req.body;

    if (!isValidObjectId(id)) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Invalid request ID format.',
      });
    }

    if (!targetStatus || !['in_progress', 'resolved'].includes(targetStatus)) {
      return res.status(422).json({
        error: 'Unprocessable Entity',
        message: 'Status must be updated to either "in_progress" or "resolved".',
      });
    }

    if (resolutionNotes !== undefined && resolutionNotes !== null) {
      if (typeof resolutionNotes !== 'string' || resolutionNotes.length > 1000) {
        return res.status(422).json({
          error: 'Unprocessable Entity',
          message: 'Resolution notes cannot exceed 1000 characters.',
        });
      }
    }

    const request = await HelpRequest.findById(id);

    if (!request) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Help request not found.',
      });
    }

    // Authorization: Only the assigned mentor can update this request
    if (!request.mentor || request.mentor.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Only the mentor assigned to this request can update its status.',
      });
    }

    // Validate sequential transitions:
    // claimed -> in_progress
    // in_progress -> resolved
    if (targetStatus === 'in_progress') {
      if (request.status !== 'claimed') {
        return res.status(409).json({
          error: 'Conflict',
          message: `Cannot transition from "${request.status}" to "in_progress". Request must be in "claimed" state.`,
        });
      }
      request.status = 'in_progress';
      request.inProgressAt = new Date();
    } else if (targetStatus === 'resolved') {
      if (request.status !== 'in_progress') {
        return res.status(409).json({
          error: 'Conflict',
          message: `Cannot transition from "${request.status}" to "resolved". Request must be "in_progress" first.`,
        });
      }
      request.status = 'resolved';
      request.resolvedAt = new Date();
      if (resolutionNotes !== undefined && resolutionNotes !== null) {
        request.resolutionNotes = resolutionNotes.trim();
      }
    }

    await request.save();
    await request.populate('student', 'name email');
    await request.populate('mentor', 'name email');

    emitQueueChange('status_updated');

    res.status(200).json({
      message: `Help request moved to "${request.status}".`,
      request,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/requests/:id/feedback - Student submits verified outcome rating & comment
requestsRouter.post('/:id/feedback', requireAuth, requireRole('student'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rating, comment } = req.body;

    if (!isValidObjectId(id)) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Invalid request ID format.',
      });
    }

    const request = await HelpRequest.findById(id);

    if (!request) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Help request not found.',
      });
    }

    // Authorization: Student can only submit feedback on their own request
    if (request.student.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You can only submit feedback for your own help requests.',
      });
    }

    // Must be resolved
    if (request.status !== 'resolved') {
      return res.status(409).json({
        error: 'Conflict',
        message: `Feedback can only be submitted for resolved requests (current status: "${request.status}").`,
      });
    }

    // Check if feedback already submitted
    if (request.feedback && request.feedback.rating) {
      return res.status(409).json({
        error: 'Conflict',
        message: 'Feedback has already been recorded for this session.',
      });
    }

    const numRating = Number(rating);
    if (!Number.isInteger(numRating) || numRating < 1 || numRating > 5) {
      return res.status(422).json({
        error: 'Unprocessable Entity',
        message: 'Rating must be an integer between 1 and 5.',
      });
    }

    if (comment !== undefined && comment !== null) {
      if (typeof comment !== 'string' || comment.length > 500) {
        return res.status(422).json({
          error: 'Unprocessable Entity',
          message: 'Feedback comment cannot exceed 500 characters.',
        });
      }
    }

    request.feedback = {
      rating: numRating,
      comment: (comment || '').trim(),
      submittedAt: new Date(),
    };

    await request.save();
    await request.populate('student', 'name email');
    await request.populate('mentor', 'name email');

    emitQueueChange('feedback_submitted');

    res.status(200).json({
      message: 'Feedback recorded successfully.',
      request,
    });
  } catch (err) {
    next(err);
  }
});
