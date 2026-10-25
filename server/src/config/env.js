import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Attempt loading .env from current directory, server root, or workspace root
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const config = {
  port: parseInt(process.env.PORT, 10) || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
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

  if (!process.env.CLIENT_ORIGIN) {
    missing.push('CLIENT_ORIGIN');
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
