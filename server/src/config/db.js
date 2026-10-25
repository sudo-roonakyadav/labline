import mongoose from 'mongoose';

const READY_STATE_MAP = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
};

export function getDbStatus() {
  const readyState = mongoose.connection.readyState;
  return {
    readyState,
    status: READY_STATE_MAP[readyState] || 'unknown',
    connected: readyState === 1,
    host: mongoose.connection.host || null,
    name: mongoose.connection.name || null,
  };
}

export async function connectDB(uri) {
  if (!uri) {
    throw new Error('connectDB called without a valid MONGODB_URI.');
  }

  // Mask credentials in connection string for safe console logging if present
  const sanitizedUri = uri.replace(/\/\/([^:]+):([^@]+)@/, '//$1:****@');

  try {
    console.log(`[Database] Attempting connection to MongoDB at ${sanitizedUri}...`);
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 3000,
      connectTimeoutMS: 3000,
    });
    console.log(`[Database] MongoDB connection established successfully.`);
  } catch (err) {
    console.error(`[Database Error] Could not establish MongoDB connection: ${err.message}`);
    console.warn(`[Database Warning] Operating in disconnected database mode. Data persistence is inactive.`);
  }
}
