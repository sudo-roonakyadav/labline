import { Server } from 'socket.io';

let ioInstance = null;

export function initSocket(httpServer, clientOrigin) {
  ioInstance = new Server(httpServer, {
    cors: {
      origin: clientOrigin,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingInterval: 10000,
    pingTimeout: 5000,
  });

  ioInstance.on('connection', (socket) => {
    console.log(`[Socket.IO] Client connected: ${socket.id}`);

    // Emit initial handshake event for client connection verification
    socket.emit('system:handshake', {
      status: 'operational',
      socketId: socket.id,
      timestamp: new Date().toISOString(),
    });

    // Support diagnostics ping
    socket.on('system:ping', (payload) => {
      socket.emit('system:pong', {
        ...payload,
        receivedAt: new Date().toISOString(),
      });
    });

    socket.on('disconnect', (reason) => {
      console.log(`[Socket.IO] Client disconnected: ${socket.id} (${reason})`);
    });
  });

  return ioInstance;
}

export function getIO() {
  if (!ioInstance) {
    throw new Error('Socket.IO has not been initialized. Call initSocket first.');
  }
  return ioInstance;
}

// Server-originated signal emitted after successful DB mutations.
// Never broadcasts private ticket data.
export function emitQueueChange(action = 'update') {
  if (ioInstance) {
    ioInstance.emit('queue:changed', {
      action,
      timestamp: new Date().toISOString(),
    });
  }
}

