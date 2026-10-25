import { Router } from 'express';
import { HelpRequest } from '../models/HelpRequest.js';
import { requireAuth, requireRole } from '../middleware/auth.js';

export const queueRouter = Router();

// GET /api/queue - Mentor views waiting and active requests
queueRouter.get('/', requireAuth, requireRole('mentor'), async (req, res, next) => {
  try {
    const activeRequests = await HelpRequest.find({
      status: { $in: ['waiting', 'claimed', 'in_progress'] },
    })
      .sort({ createdAt: 1 }) // FIFO ordering
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

    res.status(200).json({
      queue: enrichedQueue,
    });
  } catch (err) {
    next(err);
  }
});
