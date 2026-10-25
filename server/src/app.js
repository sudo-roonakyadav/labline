import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { healthRouter } from './routes/health.js';
import { authRouter } from './routes/auth.js';
import { requestsRouter } from './routes/requests.js';
import { queueRouter } from './routes/queue.js';

export function createApp(clientOrigin) {
  const app = express();

  app.use(
    cors({
      origin: clientOrigin,
      credentials: true,
    })
  );

  app.use(express.json());
  app.use(cookieParser());

  // Mount API endpoints
  app.use('/api', healthRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/requests', requestsRouter);
  app.use('/api/queue', queueRouter);

  // Unhandled API route fallback
  app.use('/api', (req, res) => {
    res.status(404).json({
      error: 'Not Found',
      message: `API endpoint ${req.method} ${req.originalUrl} not found.`,
    });
  });

  // Global error handler
  app.use((err, req, res, next) => {
    console.error('[Unhandled Server Error]', err);
    res.status(500).json({
      error: 'Internal Server Error',
      message: err.message,
    });
  });

  return app;
}
