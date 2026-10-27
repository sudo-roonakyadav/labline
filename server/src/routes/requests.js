import { Router } from 'express';
import mongoose from 'mongoose';
import { HelpRequest } from '../models/HelpRequest.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { uploadImages } from '../middleware/upload.js';
import { emitQueueChange, emitRequestMessage } from '../socket/index.js';
import { calculateQueueIntelligence } from '../utils/queueIntelligence.js';
import {
  uploadImageToGridFS,
  deleteImageFromGridFS,
  getGridFSFileInfo,
  openDownloadStream,
} from '../utils/imageStorage.js';

export const requestsRouter = Router();

const VALID_CATEGORIES = ['dsa', 'frontend', 'backend', 'database', 'environment', 'other'];
const VALID_STATUSES = ['waiting', 'claimed', 'in_progress', 'awaiting_mentor', 'awaiting_student', 'resolved', 'cancelled'];

// Helper to validate ObjectId format
function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

// ---------------------------------------------------------------------------
// STUDENT ENDPOINTS
// ---------------------------------------------------------------------------

// POST /api/requests - Student creates a new help request
requestsRouter.post('/', requireAuth, requireRole('student'), uploadImages('images', 3), async (req, res, next) => {
  const uploadedAttachments = [];
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

    // Upload verified image files to GridFS before persisting the request
    if (Array.isArray(req.files) && req.files.length > 0) {
      for (const file of req.files) {
        const attachment = await uploadImageToGridFS(file, {
          uploadedBy: req.user._id,
        });
        uploadedAttachments.push(attachment);
      }
    }

    const newRequest = await HelpRequest.create({
      student: req.user._id,
      topic: topic.trim(),
      description: description.trim(),
      codeSnippet: (codeSnippet || '').trim(),
      category: resolvedCategory,
      status: 'waiting',
      attachments: uploadedAttachments,
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
    // Atomic rollback: clean up GridFS files if document creation fails
    for (const att of uploadedAttachments) {
      if (att && att.fileId) {
        await deleteImageFromGridFS(att.fileId).catch(() => {});
      }
    }
    next(err);
  }
});

// GET /api/requests/mine - Student views own requests and queue position
requestsRouter.get('/mine', requireAuth, requireRole('student'), async (req, res, next) => {
  try {
    const { status, category, search } = req.query;
    const filter = { student: req.user._id };

    if (status && VALID_STATUSES.includes(status)) {
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

// PATCH /api/requests/:id/status - Assigned mentor transitions status (claimed -> in_progress)
// Note: Mentors CANNOT close sessions. Only the student can confirm resolution and close.
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

    // Strict rule: Mentors cannot close sessions
    if (targetStatus === 'resolved') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Mentors cannot close sessions. Only the student who owns the request can close it and submit its final rating.',
      });
    }

    if (!targetStatus || !['in_progress'].includes(targetStatus)) {
      return res.status(422).json({
        error: 'Unprocessable Entity',
        message: 'Status can only be updated to "in_progress".',
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

    if (request.status === 'resolved' || request.status === 'cancelled') {
      return res.status(409).json({
        error: 'Conflict',
        message: `Cannot update a request with status "${request.status}".`,
      });
    }

    if (request.status !== 'claimed' && request.status !== 'in_progress' && request.status !== 'awaiting_mentor' && request.status !== 'awaiting_student') {
      return res.status(409).json({
        error: 'Conflict',
        message: `Cannot transition from "${request.status}" to "in_progress". Request must be in "claimed" state.`,
      });
    }

    request.status = 'in_progress';
    if (!request.inProgressAt) {
      request.inProgressAt = new Date();
    }
    if (resolutionNotes !== undefined && resolutionNotes !== null) {
      request.resolutionNotes = resolutionNotes.trim();
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

// GET /api/requests/:id - Fetch single help request with messages & participants
requestsRouter.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Invalid request ID format.',
      });
    }

    const request = await HelpRequest.findById(id)
      .populate('student', 'name email')
      .populate('mentor', 'name email');

    if (!request) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Help request not found.',
      });
    }

    // Authorization: Students can only view their own requests. Mentors can view any request.
    if (req.user.role === 'student' && request.student._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You can only view your own help requests.',
      });
    }

    res.status(200).json({ request });
  } catch (err) {
    next(err);
  }
});

// POST /api/requests/:id/messages - Post a mentor reply or student follow-up message
requestsRouter.post('/:id/messages', requireAuth, uploadImages('images', 3), async (req, res, next) => {
  const uploadedAttachments = [];
  try {
    const { id } = req.params;
    const { content } = req.body;

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

    // Active session validation:
    if (request.status === 'waiting') {
      return res.status(409).json({
        error: 'Conflict',
        message: 'Request must be accepted by a mentor before conversation can begin.',
      });
    }

    if (['resolved', 'cancelled'].includes(request.status)) {
      return res.status(409).json({
        error: 'Conflict',
        message: `Cannot post message to a request with status "${request.status}".`,
      });
    }

    // Authorization & status transition
    let nextStatus = request.status;
    if (req.user.role === 'mentor') {
      if (!request.mentor || request.mentor.toString() !== req.user._id.toString()) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Only the mentor assigned to this request can post replies.',
        });
      }
      nextStatus = 'awaiting_student';
    } else if (req.user.role === 'student') {
      if (request.student.toString() !== req.user._id.toString()) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'You can only post follow-ups to your own help request.',
        });
      }
      nextStatus = 'awaiting_mentor';
    } else {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Invalid user role for conversation.',
      });
    }

    // Content & attachment validation
    const trimmedContent = typeof content === 'string' ? content.trim() : '';
    const hasFiles = Array.isArray(req.files) && req.files.length > 0;

    if (!trimmedContent && !hasFiles) {
      return res.status(422).json({
        error: 'Unprocessable Entity',
        message: 'Message content or at least one image attachment is required.',
      });
    }

    if (content && typeof content === 'string' && content.length > 2000) {
      return res.status(422).json({
        error: 'Unprocessable Entity',
        message: 'Message cannot exceed 2000 characters.',
      });
    }

    if (hasFiles) {
      for (const file of req.files) {
        const attachment = await uploadImageToGridFS(file, {
          uploadedBy: req.user._id,
          requestId: request._id,
        });
        uploadedAttachments.push(attachment);
      }
    }

    const messageEntry = {
      sender: req.user._id,
      senderRole: req.user.role,
      senderName: req.user.name,
      content: trimmedContent,
      attachments: uploadedAttachments,
      createdAt: new Date(),
    };

    request.messages.push(messageEntry);
    request.status = nextStatus;
    if (!request.inProgressAt) {
      request.inProgressAt = new Date();
    }

    await request.save();
    await request.populate('student', 'name email');
    await request.populate('mentor', 'name email');

    const createdMsg = request.messages[request.messages.length - 1];

    emitQueueChange('message_posted');
    emitRequestMessage(request._id, createdMsg);

    res.status(201).json({
      message: 'Message posted successfully.',
      request,
      newMessage: createdMsg,
    });
  } catch (err) {
    // Atomic rollback: clean up GridFS files if message saving fails
    for (const att of uploadedAttachments) {
      if (att && att.fileId) {
        await deleteImageFromGridFS(att.fileId).catch(() => {});
      }
    }
    next(err);
  }
});

// GET /api/requests/:id/attachments/:attachmentId - Secure image attachment retrieval
requestsRouter.get('/:id/attachments/:attachmentId', requireAuth, async (req, res, next) => {
  try {
    const { id, attachmentId } = req.params;

    if (!isValidObjectId(id) || !isValidObjectId(attachmentId)) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Invalid request or attachment ID format.',
      });
    }

    const request = await HelpRequest.findById(id);

    if (!request) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Help request not found.',
      });
    }

    // Authorization: Students may only view attachments from their own help requests.
    // Mentors may view attachments for requests in the system.
    if (req.user.role === 'student' && request.student.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You can only view attachments from your own help requests.',
      });
    }

    // Find attachment in either request.attachments or in any message's attachments
    let foundAttachment = null;
    if (Array.isArray(request.attachments)) {
      foundAttachment = request.attachments.id(attachmentId);
    }

    if (!foundAttachment && Array.isArray(request.messages)) {
      for (const msg of request.messages) {
        if (Array.isArray(msg.attachments)) {
          const match = msg.attachments.id(attachmentId);
          if (match) {
            foundAttachment = match;
            break;
          }
        }
      }
    }

    if (!foundAttachment) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Attachment not found on this help request.',
      });
    }

    const fileInfo = await getGridFSFileInfo(foundAttachment.fileId);
    if (!fileInfo) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Attachment file not found in storage.',
      });
    }

    res.setHeader('Content-Type', foundAttachment.mimeType);
    res.setHeader('Content-Length', fileInfo.length);
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(foundAttachment.originalName)}"`
    );
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    const downloadStream = openDownloadStream(foundAttachment.fileId);
    downloadStream.on('error', (err) => {
      console.error('[GridFS Download Error]', err);
      if (!res.headersSent) {
        res.status(500).json({
          error: 'Internal Server Error',
          message: 'Failed to read attachment stream.',
        });
      }
    });

    res.on('close', () => {
      if (!res.writableEnded) {
        downloadStream.destroy();
      }
    });

    downloadStream.pipe(res);
  } catch (err) {
    next(err);
  }
});

// POST /api/requests/:id/close - Student closes session with rating & feedback
requestsRouter.post('/:id/close', requireAuth, requireRole('student'), async (req, res, next) => {
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

    // Authorization: Only the student who created the request can close it
    if (request.student.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Only the student who created the request can close it.',
      });
    }

    // Status checks
    if (request.status === 'resolved') {
      return res.status(409).json({
        error: 'Conflict',
        message: 'Cannot close an already-closed request.',
      });
    }

    if (request.status === 'cancelled') {
      return res.status(409).json({
        error: 'Conflict',
        message: 'Cannot close a cancelled request.',
      });
    }

    if (request.status === 'waiting') {
      return res.status(409).json({
        error: 'Conflict',
        message: 'Request has not been accepted by a mentor yet.',
      });
    }

    // Rating validation: integer between 1 and 5
    if (rating === undefined || rating === null) {
      return res.status(422).json({
        error: 'Unprocessable Entity',
        message: 'Rating must be an integer between 1 and 5.',
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

    request.status = 'resolved';
    request.resolvedAt = new Date();
    request.feedback = {
      rating: numRating,
      comment: (comment || '').trim(),
      submittedAt: new Date(),
    };

    await request.save();
    await request.populate('student', 'name email');
    await request.populate('mentor', 'name email');

    emitQueueChange('resolved');

    res.status(200).json({
      message: 'Help request marked as resolved and feedback recorded.',
      request,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/requests/:id/feedback - Student submits verified outcome rating & comment for resolved request
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

    if (rating === undefined || rating === null) {
      return res.status(422).json({
        error: 'Unprocessable Entity',
        message: 'Rating must be an integer between 1 and 5.',
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
