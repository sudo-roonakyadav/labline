import { useEffect, useRef } from 'react';

function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * ImageLightboxModal component
 *
 * Fullscreen accessible image lightbox modal with keyboard escape control.
 */
export default function ImageLightboxModal({ attachment, onClose }) {
  const closeButtonRef = useRef(null);

  useEffect(() => {
    // Focus close button on open
    if (closeButtonRef.current) {
      closeButtonRef.current.focus();
    }

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    // Prevent background scrolling while modal is open
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  if (!attachment) return null;

  const { url, originalName, size, mimeType } = attachment;

  return (
    <div
      className="lightbox-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`Enlarged image: ${originalName || 'Attachment'}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="lightbox-content-box">
        {/* Lightbox Header Bar */}
        <div className="lightbox-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <span className="lightbox-filename" title={originalName}>
              {originalName || 'Image Attachment'}
            </span>
            {size ? (
              <span className="lightbox-size font-mono">
                {formatFileSize(size)}
              </span>
            ) : null}
            {mimeType ? (
              <span className="lightbox-mime font-mono">
                {mimeType.replace('image/', '').toUpperCase()}
              </span>
            ) : null}
          </div>

          <button
            ref={closeButtonRef}
            type="button"
            className="lightbox-close-btn"
            onClick={onClose}
            aria-label="Close enlarged image (Press Escape)"
            title="Close (Esc)"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Lightbox Image Stage */}
        <div className="lightbox-stage">
          <img
            src={url}
            alt={originalName || 'Attachment preview'}
            className="lightbox-img"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
              const parent = e.currentTarget.parentElement;
              if (parent && !parent.querySelector('.lightbox-error')) {
                const errDiv = document.createElement('div');
                errDiv.className = 'lightbox-error font-mono';
                errDiv.textContent = 'Unable to render image attachment.';
                parent.appendChild(errDiv);
              }
            }}
          />
        </div>

        {/* Lightbox Footer Bar */}
        <div className="lightbox-footer">
          <span style={{ fontSize: 11, color: 'var(--color-neutral-muted)' }}>
            Press <kbd style={{ padding: '2px 5px', background: 'var(--color-charcoal)', border: '1px solid var(--color-border)', borderRadius: 2 }}>Esc</kbd> or click outside to dismiss.
          </span>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary"
            style={{ padding: '4px 10px', fontSize: 11 }}
          >
            Open in new tab
          </a>
        </div>
      </div>
    </div>
  );
}
