import { Router } from 'express';
import { HelpRequest } from '../models/HelpRequest.js';
import { User } from '../models/User.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { calculateQueueIntelligence } from '../utils/queueIntelligence.js';
import { emitQueueChange } from '../socket/index.js';

export const queueRouter = Router();

const VALID_CATEGORIES = ['dsa', 'frontend', 'backend', 'database', 'environment', 'other'];
const ACTIVE_STATUSES = ['waiting', 'claimed', 'in_progress', 'awaiting_mentor', 'awaiting_student'];

// GET /api/queue - Mentor views waiting and active requests (with optional category filtering)
queueRouter.get('/', requireAuth, requireRole('mentor'), async (req, res, next) => {
  try {
    const { category, status } = req.query;

    const filter = {
      status: { $in: ACTIVE_STATUSES },
    };

    if (category && VALID_CATEGORIES.includes(category.toLowerCase())) {
      filter.category = category.toLowerCase();
    }

    if (status && ACTIVE_STATUSES.includes(status)) {
      filter.status = status;
    }

    // Strict FIFO ordering preserved across filtered view
    const activeRequests = await HelpRequest.find(filter)
      .sort({ createdAt: 1 })
      .populate('student', 'name email')
      .populate('mentor', 'name email');

    let waitingCounter = 0;
    const enrichedQueue = activeRequests.map((doc) => {
      const item = doc.toObject();
      if (item.status === 'waiting') {
        waitingCounter += 1;
        item.queuePosition = waitingCounter;
      } else {
        item.queuePosition = null;
      }
      return item;
    });

    const intelligence = await calculateQueueIntelligence(1);

    res.status(200).json({
      queue: enrichedQueue,
      intelligence,
      activeFilter: {
        category: category || null,
        status: status || null,
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/queue/history - Mentor views recently resolved requests with student feedback & resolution notes
queueRouter.get('/history', requireAuth, requireRole('mentor'), async (req, res, next) => {
  try {
    const { category, search } = req.query;
    const filter = { status: 'resolved' };

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

    const resolvedRequests = await HelpRequest.find(filter)
      .sort({ resolvedAt: -1, createdAt: -1 })
      .limit(50)
      .populate('student', 'name email')
      .populate('mentor', 'name email');

    res.status(200).json({
      history: resolvedRequests,
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/queue/availability - Mentor toggles active availability
queueRouter.patch('/availability', requireAuth, requireRole('mentor'), async (req, res, next) => {
  try {
    const { isAvailable } = req.body;

    if (typeof isAvailable !== 'boolean') {
      return res.status(422).json({
        error: 'Unprocessable Entity',
        message: 'isAvailable must be a boolean value.',
      });
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      { isAvailable },
      { new: true }
    );

    emitQueueChange('mentor_availability');

    res.status(200).json({
      message: `Mentor availability set to ${isAvailable ? 'available' : 'unavailable'}.`,
      user: updatedUser.toSafeObject(),
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/queue/intelligence - Public/authorized queue telemetry summary
queueRouter.get('/intelligence', async (req, res, next) => {
  try {
    const waitingCount = await HelpRequest.countDocuments({ status: 'waiting' });
    const intelligence = await calculateQueueIntelligence(Math.max(1, waitingCount));

    res.status(200).json({
      waitingCount,
      ...intelligence,
    });
  } catch (err) {
    next(err);
  }
});
