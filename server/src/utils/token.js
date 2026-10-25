import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';

export const COOKIE_NAME = 'labline_session';

export function getCookieOptions() {
  return {
    httpOnly: true,
    secure: config.nodeEnv === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
    path: '/',
  };
}

export function generateToken(user) {
  if (!config.jwtSecret) {
    throw new Error('JWT_SECRET is not configured.');
  }

  const payload = {
    sub: user._id.toString(),
    email: user.email,
    role: user.role,
  };

  return jwt.sign(payload, config.jwtSecret, { expiresIn: '7d' });
}

export function verifyToken(token) {
  if (!config.jwtSecret) {
    throw new Error('JWT_SECRET is not configured.');
  }

  return jwt.verify(token, config.jwtSecret);
}
