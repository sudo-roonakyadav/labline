import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import { healthRouter } from './routes/health.js';
import { authRouter } from './routes/auth.js';
import { requestsRouter } from './routes/requests.js';
import { queueRouter } from './routes/queue.js';
import { config } from './config/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientDistPath = path.resolve(__dirname, '../../client/dist');
const clientIndexPath = path.resolve(clientDistPath, 'index.html');

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

  // Unhandled API route fallback - MUST always return JSON 404, never SPA HTML
  app.use('/api', (req, res) => {
    res.status(404).json({
      error: 'Not Found',
      message: `API endpoint ${req.method} ${req.originalUrl} not found.`,
    });
  });

  // In production, serve static assets from client/dist and fallback non-API GET to index.html
  if (config.nodeEnv === 'production') {
    app.use(express.static(clientDistPath));

    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) {
        return next();
      }
      res.sendFile(clientIndexPath, (err) => {
        if (err) {
          next(err);
        }
      });
    });
  }

  // Global 404 handler for unmatched non-API routes (e.g. non-GET requests in production, or all non-API in dev)
  app.use((req, res) => {
    res.status(404).json({
      error: 'Not Found',
      message: `Resource ${req.method} ${req.originalUrl} not found.`,
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
