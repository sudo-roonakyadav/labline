import { HelpRequest } from '../models/HelpRequest.js';
import { User } from '../models/User.js';

/**
 * Queue Intelligence Engine
 * 
 * Assumptions & Mathematical Framework:
 * 1. Resolution throughput is estimated exclusively from verified recent completed sessions
 *    within the last 24 hours (bounded window: up to 15 recent resolved requests).
 * 2. Minimum sample threshold: At least 3 valid resolved sessions must be recorded
 *    to provide an honest, data-backed estimate. If fewer than 3 exist, estimatedWaitMinutes
 *    is explicitly returned as null with an explanation rather than presenting an invented number.
 * 3. Mentor availability factor: Considers verified mentors currently marked `isAvailable: true`.
 *    If 0 mentors are available, wait time cannot be guaranteed and is returned as null.
 * 4. Formula:
 *    meanResolutionMins = sum(durations) / sampleSize / 60000 ms
 *    estimatedWaitMinutes = round((queuePosition * meanResolutionMins) / availableMentors)
 */

export async function calculateQueueIntelligence(queuePosition = 1) {
  try {
    // 1. Count active mentors on duty
    const availableMentors = await User.countDocuments({
      role: 'mentor',
      isAvailable: true,
    });

    // 2. Fetch recent resolved requests to determine empirical throughput
    const recentResolved = await HelpRequest.find({
      status: 'resolved',
      resolvedAt: { $ne: null },
      $or: [{ inProgressAt: { $ne: null } }, { claimedAt: { $ne: null } }],
    })
      .sort({ resolvedAt: -1 })
      .limit(15);

    const validDurations = [];
    for (const req of recentResolved) {
      const start = req.inProgressAt || req.claimedAt;
      const end = req.resolvedAt;
      if (start && end && end > start) {
        const durationMinutes = (end.getTime() - start.getTime()) / 60000;
        // Exclude test anomalies (< 0.2 min or > 240 mins)
        if (durationMinutes >= 0.2 && durationMinutes <= 240) {
          validDurations.push(durationMinutes);
        }
      }
    }

    // Check sample size constraint
    if (validDurations.length < 3) {
      return {
        estimatedWaitMinutes: null,
        averageResolutionMinutes: null,
        availableMentors,
        sampleSize: validDurations.length,
        confidence: 'insufficient_data',
        reason: 'Insufficient historical data (requires at least 3 completed sessions).',
      };
    }

    if (availableMentors === 0) {
      const avgMinutes = Math.round(
        validDurations.reduce((a, b) => a + b, 0) / validDurations.length
      );
      return {
        estimatedWaitMinutes: null,
        averageResolutionMinutes: avgMinutes,
        availableMentors: 0,
        sampleSize: validDurations.length,
        confidence: 'no_mentors_available',
        reason: 'No mentors are currently marked available on duty.',
      };
    }

    const totalDuration = validDurations.reduce((a, b) => a + b, 0);
    const avgMins = Math.max(1, Math.round(totalDuration / validDurations.length));
    const estimatedWait = Math.max(1, Math.round((queuePosition * avgMins) / availableMentors));

    return {
      estimatedWaitMinutes: estimatedWait,
      averageResolutionMinutes: avgMins,
      availableMentors,
      sampleSize: validDurations.length,
      confidence: validDurations.length >= 8 ? 'high' : 'moderate',
      reason: null,
    };
  } catch (err) {
    return {
      estimatedWaitMinutes: null,
      averageResolutionMinutes: null,
      availableMentors: 0,
      sampleSize: 0,
      confidence: 'error',
      reason: 'Failed to compute wait estimate telemetry.',
    };
  }
}
