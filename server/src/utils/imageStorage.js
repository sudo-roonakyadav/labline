import crypto from 'crypto';
import path from 'path';
import { Readable } from 'stream';
import mongoose from 'mongoose';

export const MAX_ATTACHMENT_COUNT = 3;
export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
export const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];

/**
 * Validates actual binary content (magic bytes) of an image buffer.
 * Supports JPEG, PNG, and WebP.
 *
 * @param {Buffer} buffer
 * @returns {string|null} Detected MIME type or null if unrecognized
 */
export function detectImageMimeType(buffer) {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length < 12) {
    return null;
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png';
  }

  // WebP: RIFF (bytes 0-3) + WEBP (bytes 8-11)
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return 'image/webp';
  }

  return null;
}

/**
 * Validates file buffer, declared MIME type, extension, and file size.
 *
 * @param {object} file - { buffer, originalname, mimetype, size }
 * @returns {{ valid: boolean, error?: string, detectedMime?: string }}
 */
export function validateImageFile({ buffer, originalname, mimetype, size }) {
  const byteSize = size || (buffer ? buffer.length : 0);

  if (!buffer || buffer.length === 0 || byteSize === 0) {
    return { valid: false, error: 'Empty file is not allowed.' };
  }

  if (byteSize > MAX_FILE_SIZE_BYTES) {
    return {
      valid: false,
      error: `File "${originalname || 'image'}" exceeds the 5 MB limit (size: ${(byteSize / (1024 * 1024)).toFixed(2)} MB).`,
    };
  }

  const ext = path.extname(originalname || '').toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return {
      valid: false,
      error: `File "${originalname || 'image'}" has an unsupported file extension "${ext}". Allowed: .jpg, .jpeg, .png, .webp.`,
    };
  }

  const normalizedMime = (mimetype || '').toLowerCase().trim();
  if (!ALLOWED_MIME_TYPES.includes(normalizedMime)) {
    return {
      valid: false,
      error: `File "${originalname || 'image'}" has an unsupported MIME type "${normalizedMime}". Allowed: image/jpeg, image/png, image/webp.`,
    };
  }

  const detectedMime = detectImageMimeType(buffer);
  if (!detectedMime) {
    return {
      valid: false,
      error: `File "${originalname || 'image'}" is malformed or not a valid image format.`,
    };
  }

  if (detectedMime !== normalizedMime) {
    return {
      valid: false,
      error: `File "${originalname || 'image'}" signature (${detectedMime}) does not match declared type (${normalizedMime}).`,
    };
  }

  return { valid: true, detectedMime };
}

let cachedGridFSBucket = null;

/**
 * Retrieves the MongoDB GridFSBucket instance for the attachments bucket.
 */
export function getGridFSBucket() {
  if (!mongoose.connection.db) {
    throw new Error('Database is not connected. GridFS bucket unavailable.');
  }

  // In case mongoose reconnects to another db instance, reset if db instance changed
  if (!cachedGridFSBucket || cachedGridFSBucket.s.db !== mongoose.connection.db) {
    cachedGridFSBucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
      bucketName: 'attachments',
    });
  }

  return cachedGridFSBucket;
}

/**
 * Uploads an in-memory image buffer to MongoDB GridFS.
 *
 * @param {object} file - Multer file object with buffer, originalname, mimetype, size
 * @param {object} meta - { uploadedBy, requestId }
 * @returns {Promise<object>} Attachment metadata record
 */
export async function uploadImageToGridFS(file, { uploadedBy = null, requestId = null } = {}) {
  const bucket = getGridFSBucket();
  const safeBaseName = path
    .basename(file.originalname || 'attachment')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 80);
  const storedFilename = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}-${safeBaseName}`;

  return new Promise((resolve, reject) => {
    const uploadStream = bucket.openUploadStream(storedFilename, {
      contentType: file.mimetype,
      metadata: {
        originalName: file.originalname || safeBaseName,
        mimeType: file.mimetype,
        size: file.size || file.buffer.length,
        uploadedBy: uploadedBy ? uploadedBy.toString() : null,
        requestId: requestId ? requestId.toString() : null,
      },
    });

    const readable = Readable.from(file.buffer);
    readable
      .pipe(uploadStream)
      .on('error', (err) => reject(err))
      .on('finish', () => {
        resolve({
          fileId: uploadStream.id,
          filename: storedFilename,
          originalName: file.originalname || safeBaseName,
          mimeType: file.mimetype,
          size: file.size || file.buffer.length,
          createdAt: new Date(),
        });
      });
  });
}

/**
 * Deletes a file and its chunks from MongoDB GridFS.
 *
 * @param {string|mongoose.Types.ObjectId} fileId
 */
export async function deleteImageFromGridFS(fileId) {
  if (!fileId) return;
  try {
    const bucket = getGridFSBucket();
    const id = typeof fileId === 'string' ? new mongoose.Types.ObjectId(fileId) : fileId;
    await bucket.delete(id);
  } catch (err) {
    console.error(`[GridFS] Error deleting file ${fileId}:`, err.message);
  }
}

/**
 * Fetches file descriptor from GridFS files collection.
 *
 * @param {string|mongoose.Types.ObjectId} fileId
 */
export async function getGridFSFileInfo(fileId) {
  const bucket = getGridFSBucket();
  const id = typeof fileId === 'string' ? new mongoose.Types.ObjectId(fileId) : fileId;
  const files = await bucket.find({ _id: id }).toArray();
  return files.length > 0 ? files[0] : null;
}

/**
 * Opens a readable download stream for a GridFS file.
 *
 * @param {string|mongoose.Types.ObjectId} fileId
 */
export function openDownloadStream(fileId) {
  const bucket = getGridFSBucket();
  const id = typeof fileId === 'string' ? new mongoose.Types.ObjectId(fileId) : fileId;
  return bucket.openDownloadStream(id);
}
