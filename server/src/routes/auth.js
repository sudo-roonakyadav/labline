import crypto from 'crypto';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { User } from '../models/User.js';
import { config } from '../config/env.js';
import { generateToken, getCookieOptions, COOKIE_NAME } from '../utils/token.js';
import { requireAuth } from '../middleware/auth.js';
import { noCache } from '../middleware/cache.js';

export const authRouter = Router();

// Ensure authentication responses are never cached by browsers or intermediate proxies
authRouter.use(noCache);

/**
 * Timing-safe string comparison for invitation code verification.
 * Pre-validates types and buffer lengths before calling crypto.timingSafeEqual.
 */
function verifyTeacherInviteCode(candidateCode, serverCode) {
  if (!serverCode || typeof serverCode !== 'string') {
    return false;
  }
  if (!candidateCode || typeof candidateCode !== 'string') {
    return false;
  }
  const cleanCandidate = candidateCode.trim();
  const cleanServer = serverCode.trim();
  if (cleanCandidate.length === 0 || cleanServer.length === 0) {
    return false;
  }
  const candBuf = Buffer.from(cleanCandidate, 'utf8');
  const servBuf = Buffer.from(cleanServer, 'utf8');
  if (candBuf.length !== servBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(candBuf, servBuf);
}

// POST /api/auth/register - Dual registration (Student or Teacher)
authRouter.post('/register', async (req, res, next) => {
  try {
    const { email, name, password, accountType, inviteCode } = req.body;
    const errors = [];

    // Account type validation: defaults to "student" for backwards compatibility
    let normalizedAccountType = 'student';
    if (accountType !== undefined && accountType !== null) {
      if (typeof accountType !== 'string') {
        errors.push('Account type must be either "student" or "teacher".');
      } else {
        const rawType = accountType.trim().toLowerCase();
        if (rawType === '' || rawType === 'student') {
          normalizedAccountType = 'student';
        } else if (rawType === 'teacher') {
          normalizedAccountType = 'teacher';
        } else {
          errors.push('Account type must be either "student" or "teacher".');
        }
      }
    }

    if (!email || typeof email !== 'string' || !/^\S+@\S+\.\S+$/.test(email.trim())) {
      errors.push('A valid email address is required.');
    }

    if (!name || typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 60) {
      errors.push('Display name must be between 2 and 60 characters.');
    }

    if (!password || typeof password !== 'string' || password.length < 8) {
      errors.push('Password must be at least 8 characters long.');
    }

    // Teacher-specific configuration and invite code validation
    let configuredInvite = '';
    if (normalizedAccountType === 'teacher') {
      configuredInvite = (config.teacherInviteCode || process.env.TEACHER_INVITE_CODE || '').trim();
      if (!configuredInvite) {
        return res.status(503).json({
          error: 'Service Unavailable',
          message: 'Teacher registration is not configured on this server.',
        });
      }

      if (!inviteCode || typeof inviteCode !== 'string' || !inviteCode.trim()) {
        errors.push('Teacher invitation code is required.');
      }
    }

    if (errors.length > 0) {
      return res.status(422).json({
        error: 'Unprocessable Entity',
        message: 'Validation failed',
        details: errors,
      });
    }

    // For teacher accounts, verify the invitation code with timing-safe comparison
    if (normalizedAccountType === 'teacher') {
      const isCodeValid = verifyTeacherInviteCode(inviteCode, configuredInvite);
      if (!isCodeValid) {
        return res.status(403).json({
          error: 'Forbidden',
          message: 'Invalid teacher invitation code.',
        });
      }
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Check for duplicate account
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(409).json({
        error: 'Conflict',
        message: 'An account with this email address is already registered.',
      });
    }

    // Security rule: Account type determines role.
    // Client-supplied `role` is strictly ignored to prevent privilege escalation.
    // Teacher maps to internal role "mentor"; student maps to "student".
    const assignedRole = normalizedAccountType === 'teacher' ? 'mentor' : 'student';

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({
      email: normalizedEmail,
      name: name.trim(),
      passwordHash,
      role: assignedRole,
    });

    const token = generateToken(user);
    res.cookie(COOKIE_NAME, token, getCookieOptions());

    res.status(201).json({
      message: 'Account registered successfully.',
      user: user.toSafeObject(),
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/login - User authentication
authRouter.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(422).json({
        error: 'Unprocessable Entity',
        message: 'Both email and password are required.',
      });
    }

    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const user = await User.findOne({ email: normalizedEmail }).select('+passwordHash');

    if (!user) {
      // Intentionally uniform error message to prevent account enumeration
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid email or password.',
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid email or password.',
      });
    }

    const token = generateToken(user);
    res.cookie(COOKIE_NAME, token, getCookieOptions());

    res.status(200).json({
      message: 'Authentication successful.',
      user: user.toSafeObject(),
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/logout - Terminate session cookie
authRouter.post('/logout', (req, res) => {
  const options = getCookieOptions();
  res.clearCookie(COOKIE_NAME, {
    httpOnly: options.httpOnly,
    secure: options.secure,
    sameSite: options.sameSite,
    path: options.path,
  });

  res.status(200).json({
    message: 'Logged out successfully.',
  });
});

// GET /api/auth/me - Current authenticated user session
authRouter.get('/me', requireAuth, (req, res) => {
  res.status(200).json({
    user: req.user.toSafeObject(),
  });
});
