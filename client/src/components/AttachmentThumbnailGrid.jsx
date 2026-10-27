import { useState } from 'react';

function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * AttachmentThumbnailGrid component
 *
 * Renders a row/grid of saved image attachments with thumbnail previews,
 * metadata pills, and click-to-enlarge functionality.
 */
export default function AttachmentThumbnailGrid({
  attachments = [],
  requestId,
  onOpenLightbox,
  layout = 'row', // 'row' | 'grid'
}) {
  const [failedImages, setFailedImages] = useState({});

  if (!attachments || !Array.isArray(attachments) || attachments.length === 0 || !requestId) {
    return null;
  }

  const handleImageError = (attachmentId) => {
    setFailedImages((prev) => ({ ...prev, [attachmentId]: true }));
  };

  return (
    <div className={`attachment-grid-wrapper layout-${layout}`}>
      {attachments.map((att) => {
        const attachmentId = att._id || att.fileId;
        const imageUrl = `/api/requests/${requestId}/attachments/${attachmentId}`;
        const hasFailed = failedImages[attachmentId];

        return (
          <button
            key={attachmentId}
            type="button"
            className="attachment-item-card"
            onClick={() =>
              onOpenLightbox &&
              onOpenLightbox({
                url: imageUrl,
                originalName: att.originalName || att.filename || 'Attachment',
                size: att.size,
                mimeType: att.mimeType,
              })
            }
            aria-label={`View enlarged image: ${att.originalName || 'Attachment'}`}
          >
            <div className="attachment-thumb-frame">
              {!hasFailed ? (
                <img
                  src={imageUrl}
                  alt={att.originalName || 'Attachment thumbnail'}
                  className="attachment-thumb-img"
                  loading="lazy"
                  onError={() => handleImageError(attachmentId)}
                />
              ) : (
                <div className="attachment-thumb-fallback font-mono">
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
                    <line x1="9" y1="9" x2="15" y2="15" />
                    <line x1="15" y1="9" x2="9" y2="15" />
                  </svg>
                  <span>Unavailable</span>
                </div>
              )}
            </div>

            <div className="attachment-item-info">
              <span className="attachment-item-title" title={att.originalName}>
                {att.originalName || 'Image'}
              </span>
              <span className="attachment-item-size font-mono">
                {formatFileSize(att.size)}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
