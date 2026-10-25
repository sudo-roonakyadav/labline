import http from 'http';
import { config, validateConfig } from './config/env.js';
import { connectDB } from './config/db.js';
import { createApp } from './app.js';
import { initSocket } from './socket/index.js';

// Validate configuration on boot; abort immediately with explicit diagnostic if invalid
validateConfig();

const app = createApp(config.clientOrigin);
const httpServer = http.createServer(app);

// Initialize Socket.IO real-time gateway
initSocket(httpServer, config.clientOrigin);

// Initiate database connection asynchronously without masking status
connectDB(config.mongodbUri).catch((err) => {
  console.error('[Database Fatal Error]', err);
});

httpServer.listen(config.port, () => {
  console.log(`[LabLine Server] Operational on http://localhost:${config.port}`);
  console.log(`[LabLine Server] Health check available at http://localhost:${config.port}/api/health`);
});

// Graceful termination handling
function handleShutdown(signal) {
  console.log(`\n[LabLine Server] Received ${signal}. Terminating cleanly...`);
  httpServer.close(() => {
    console.log('[LabLine Server] HTTP & Socket.IO server closed.');
    process.exit(0);
  });
}

process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));
