import { User } from '../models/User.js';
import { verifyToken, COOKIE_NAME } from '../utils/token.js';

export async function requireAuth(req, res, next) {
  try {
    let token = req.cookies?.[COOKIE_NAME];

    // Optional Bearer token header support for API consumers
    if (!token && req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required. Please sign in.',
      });
    }

    let decoded;
    try {
      decoded = verifyToken(token);
    } catch (err) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Session has expired or token is invalid.',
      });
    }

    const user = await User.findById(decoded.sub);
    if (!user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'The user session is no longer valid.',
      });
    }

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

export function requireRole(...allowedRoles) {
  const roles = allowedRoles.flat();

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required before checking permissions.',
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: `Forbidden: requires ${roles.join(' or ')} privileges.`,
      });
    }

    next();
  };
}
