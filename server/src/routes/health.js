import { Router } from 'express';
import { getDbStatus } from '../config/db.js';

export const healthRouter = Router();

// GET /api/health - Comprehensive diagnostic health endpoint (always returns 200 with honest subsystem state)
healthRouter.get('/health', (req, res) => {
  const db = getDbStatus();

  res.status(200).json({
    status: db.connected ? 'healthy' : 'degraded',
    service: 'labline-server',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    database: {
      status: db.status,
      connected: db.connected,
      host: db.host,
      name: db.name,
    },
    realtime: {
      status: 'operational',
      engine: 'socket.io',
    },
  });
});

// GET /api/health/ready - Production readiness probe (returns 200 only when DB is connected, otherwise 503)
healthRouter.get('/health/ready', (req, res) => {
  const db = getDbStatus();

  if (db.connected) {
    return res.status(200).json({
      status: 'ready',
      database: 'connected',
      timestamp: new Date().toISOString(),
    });
  }

  return res.status(503).json({
    status: 'unavailable',
    database: db.status,
    timestamp: new Date().toISOString(),
    error: 'Database connection is not ready.',
  });
});
