import multer from 'multer';
import {
  MAX_ATTACHMENT_COUNT,
  MAX_FILE_SIZE_BYTES,
  validateImageFile,
} from '../utils/imageStorage.js';

// Multer memory storage engine — keeps file in memory as Buffer for validation before GridFS streaming
const memoryStorage = multer.memoryStorage();

const multerHandler = multer({
  storage: memoryStorage,
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
    files: MAX_ATTACHMENT_COUNT + 5, // Allow catching count violation cleanly in handler
  },
});

/**
 * Middleware supporting optional image uploads for requests and messages.
 * Automatically handles multipart/form-data while letting application/json pass through.
 *
 * @param {string} fieldName - The multipart form field containing files (default: 'images')
 * @param {number} maxFiles - Maximum allowed files (default: 3)
 */
export function uploadImages(fieldName = 'images', maxFiles = MAX_ATTACHMENT_COUNT) {
  const uploadArray = multerHandler.array(fieldName, maxFiles + 5);

  return (req, res, next) => {
    const contentType = req.headers['content-type'] || '';

    // If not multipart form data, pass through to existing JSON parsing
    if (!contentType.toLowerCase().includes('multipart/form-data')) {
      req.files = req.files || [];
      return next();
    }

    uploadArray(req, res, (err) => {
      if (err) {
        if (err instanceof multer.MulterError) {
          if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(422).json({
              error: 'Unprocessable Entity',
              message: 'Validation failed',
              details: [`One or more attached files exceed the 5 MB size limit.`],
            });
          }
          if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
            return res.status(422).json({
              error: 'Unprocessable Entity',
              message: 'Validation failed',
              details: [`Cannot attach more than ${maxFiles} images.`],
            });
          }
        }
        return res.status(422).json({
          error: 'Unprocessable Entity',
          message: 'Upload processing failed',
          details: [err.message],
        });
      }

      req.files = req.files || [];

      // Check max files limit
      if (req.files.length > maxFiles) {
        return res.status(422).json({
          error: 'Unprocessable Entity',
          message: 'Validation failed',
          details: [`Cannot attach more than ${maxFiles} images (received ${req.files.length}).`],
        });
      }

      // Validate each image buffer, extension, MIME type, and magic bytes
      const validationErrors = [];
      for (const file of req.files) {
        const result = validateImageFile(file);
        if (!result.valid) {
          validationErrors.push(result.error);
        }
      }

      if (validationErrors.length > 0) {
        return res.status(422).json({
          error: 'Unprocessable Entity',
          message: 'Validation failed',
          details: validationErrors,
        });
      }

      next();
    });
  };
}
