import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { User } from '../models/User.js';
import { generateToken, getCookieOptions, COOKIE_NAME } from '../utils/token.js';
import { requireAuth } from '../middleware/auth.js';

export const authRouter = Router();

// POST /api/auth/register - Public student registration
authRouter.post('/register', async (req, res, next) => {
  try {
    const { email, name, password } = req.body;
    const errors = [];

    if (!email || typeof email !== 'string' || !/^\S+@\S+\.\S+$/.test(email.trim())) {
      errors.push('A valid email address is required.');
    }

    if (!name || typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 60) {
      errors.push('Display name must be between 2 and 60 characters.');
    }

    if (!password || typeof password !== 'string' || password.length < 8) {
      errors.push('Password must be at least 8 characters long.');
    }

    if (errors.length > 0) {
      return res.status(422).json({
        error: 'Unprocessable Entity',
        message: 'Validation failed',
        details: errors,
      });
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

    // Security rule: Public registration always creates student role. Client role inputs are ignored.
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({
      email: normalizedEmail,
      name: name.trim(),
      passwordHash,
      role: 'student',
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
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
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
