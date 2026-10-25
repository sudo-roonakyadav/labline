import { Router } from 'express';
import { getDbStatus } from '../config/db.js';

export const healthRouter = Router();

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
