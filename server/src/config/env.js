import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Attempt loading .env from current directory, server root, or workspace root
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

function resolveClientOrigin() {
  if (process.env.CLIENT_ORIGIN && process.env.CLIENT_ORIGIN.trim()) {
    const raw = process.env.CLIENT_ORIGIN.trim();
    return raw.includes(',') ? raw.split(',').map((o) => o.trim()) : raw;
  }
  if (process.env.RENDER_EXTERNAL_URL && process.env.RENDER_EXTERNAL_URL.trim()) {
    return process.env.RENDER_EXTERNAL_URL.trim();
  }
  return 'http://localhost:5173';
}

export const config = {
  port: parseInt(process.env.PORT, 10) || 5000,
  host: process.env.HOST || '0.0.0.0',
  nodeEnv: process.env.NODE_ENV || 'development',
  clientOrigin: resolveClientOrigin(),
  mongodbUri: process.env.MONGODB_URI,
  jwtSecret: process.env.JWT_SECRET,
};

export function validateConfig() {
  const missing = [];
  const errors = [];

  if (!process.env.PORT && !config.port) {
    missing.push('PORT');
  } else if (Number.isNaN(config.port) || config.port <= 0 || config.port > 65535) {
    errors.push(`PORT must be a valid port number (1-65535). Received: "${process.env.PORT}"`);
  }

  // Origin resolution validation
  if (config.nodeEnv === 'production') {
    if (!process.env.CLIENT_ORIGIN && !process.env.RENDER_EXTERNAL_URL) {
      missing.push('CLIENT_ORIGIN (or RENDER_EXTERNAL_URL on Render)');
    }
  }

  if (process.env.CLIENT_ORIGIN) {
    const origins = Array.isArray(config.clientOrigin) ? config.clientOrigin : [config.clientOrigin];
    for (const origin of origins) {
      if (!origin.startsWith('http://') && !origin.startsWith('https://')) {
        errors.push(`CLIENT_ORIGIN must start with "http://" or "https://". Received: "${origin}"`);
      }
    }
  } else if (process.env.RENDER_EXTERNAL_URL) {
    if (!process.env.RENDER_EXTERNAL_URL.startsWith('http://') && !process.env.RENDER_EXTERNAL_URL.startsWith('https://')) {
      errors.push(`RENDER_EXTERNAL_URL must start with "http://" or "https://". Received: "${process.env.RENDER_EXTERNAL_URL}"`);
    }
  }

  if (!process.env.MONGODB_URI) {
    missing.push('MONGODB_URI');
  } else if (
    !process.env.MONGODB_URI.startsWith('mongodb://') &&
    !process.env.MONGODB_URI.startsWith('mongodb+srv://')
  ) {
    errors.push(`MONGODB_URI must start with "mongodb://" or "mongodb+srv://".`);
  }

  if (!process.env.JWT_SECRET) {
    missing.push('JWT_SECRET');
  } else if (process.env.JWT_SECRET.length < 32) {
    errors.push('JWT_SECRET must be at least 32 characters long for cryptographic security.');
  }

  if (missing.length > 0 || errors.length > 0) {
    const errorLines = [
      '',
      '======================================================================',
      '[CONFIG ERROR] Required server configuration is missing or invalid:',
      ...missing.map((key) => `  - Missing variable: ${key}`),
      ...errors.map((msg) => `  - ${msg}`),
      '',
      'Please check .env.example and populate your .env file.',
      '======================================================================',
      '',
    ];
    throw new Error(errorLines.join('\n'));
  }
}
