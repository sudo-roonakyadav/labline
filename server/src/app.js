import express from 'express';
import cors from 'cors';
import { healthRouter } from './routes/health.js';

export function createApp(clientOrigin) {
  const app = express();

  app.use(
    cors({
      origin: clientOrigin,
      credentials: true,
    })
  );

  app.use(express.json());

  // Mount API endpoints
  app.use('/api', healthRouter);

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
