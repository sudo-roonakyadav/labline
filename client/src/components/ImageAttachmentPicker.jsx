import { useRef, useEffect } from 'react';

const MAX_ATTACHMENTS = 3;
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];

function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * ImageAttachmentPicker component
 *
 * Provides a clean, accessible file selector with image previews,
 * allowance tracker, and per-image removal.
 */
export default function ImageAttachmentPicker({
  selectedFiles = [],
  onFilesChange,
  maxFiles = MAX_ATTACHMENTS,
  disabled = false,
  error = null,
  onError,
}) {
  const fileInputRef = useRef(null);

  // Clean up object URLs on unmount or file changes
  useEffect(() => {
    return () => {
      selectedFiles.forEach((f) => {
        if (f.previewUrl) {
          URL.revokeObjectURL(f.previewUrl);
        }
      });
    };
  }, []);

  const handleFileSelect = (e) => {
    const rawFiles = Array.from(e.target.files || []);
    if (rawFiles.length === 0) return;

    if (onError) onError(null);

    const availableSlots = maxFiles - selectedFiles.length;
    if (availableSlots <= 0) {
      if (onError) onError(`Maximum limit of ${maxFiles} images already reached.`);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    const newAccepted = [];
    const errors = [];

    for (const file of rawFiles) {
      if (selectedFiles.length + newAccepted.length >= maxFiles) {
        errors.push(`Maximum ${maxFiles} images allowed. Additional images were skipped.`);
        break;
      }

      // 1. Size validation
      if (file.size > MAX_FILE_SIZE_BYTES) {
        errors.push(`"${file.name}" exceeds the 5 MB limit (${formatFileSize(file.size)}).`);
        continue;
      }

      if (file.size === 0) {
        errors.push(`"${file.name}" is an empty file.`);
        continue;
      }

      // 2. Extension validation
      const lowerName = file.name.toLowerCase();
      const hasValidExt = ALLOWED_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
      if (!hasValidExt) {
        errors.push(`"${file.name}" has an unsupported format. Allowed: .jpg, .jpeg, .png, .webp.`);
        continue;
      }

      // 3. MIME type validation
      const normalizedMime = (file.type || '').toLowerCase();
      if (normalizedMime && !ALLOWED_MIME_TYPES.includes(normalizedMime)) {
        errors.push(`"${file.name}" has an unsupported MIME type (${normalizedMime}).`);
        continue;
      }

      // Accept file and create preview URL
      const previewUrl = URL.createObjectURL(file);
      newAccepted.push({
        id: `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        file,
        previewUrl,
        name: file.name,
        size: file.size,
      });
    }

    if (errors.length > 0 && onError) {
      onError(errors.join(' '));
    }

    if (newAccepted.length > 0) {
      onFilesChange([...selectedFiles, ...newAccepted]);
    }

    // Reset input value so selecting the same file again triggers onChange
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemove = (fileIdToRemove) => {
    const target = selectedFiles.find((f) => f.id === fileIdToRemove);
    if (target && target.previewUrl) {
      URL.revokeObjectURL(target.previewUrl);
    }
    const updated = selectedFiles.filter((f) => f.id !== fileIdToRemove);
    onFilesChange(updated);
    if (onError) onError(null);
  };

  const remainingSlots = maxFiles - selectedFiles.length;

  return (
    <div className="attachment-picker-container">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        style={{ display: 'none' }}
        onChange={handleFileSelect}
        disabled={disabled || remainingSlots <= 0}
        aria-label="Upload images"
      />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <button
          type="button"
          className="btn btn-secondary attachment-trigger-btn"
          onClick={() => fileInputRef.current && fileInputRef.current.click()}
          disabled={disabled || remainingSlots <= 0}
          title={remainingSlots <= 0 ? 'Maximum 3 images reached' : 'Select images (JPEG, PNG, WebP up to 5 MB)'}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '5px 10px',
            fontSize: 12,
            borderColor: selectedFiles.length > 0 ? 'var(--color-signal-border)' : 'var(--color-border)',
            color: selectedFiles.length > 0 ? 'var(--color-warm-white)' : 'var(--color-neutral)',
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
            <circle cx="9" cy="9" r="2" />
            <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
          </svg>
          <span>Attach images</span>
        </button>

        <span
          className="font-mono"
          style={{
            fontSize: 11,
            color: remainingSlots === 0 ? 'var(--color-signal)' : 'var(--color-neutral-muted)',
            letterSpacing: '0.02em',
          }}
        >
          {selectedFiles.length} / {maxFiles} images ({remainingSlots} remaining)
        </span>
      </div>

      {error && (
        <div
          className="form-field-error font-mono"
          role="alert"
          style={{ marginTop: 6 }}
        >
          {error}
        </div>
      )}

      {selectedFiles.length > 0 && (
        <div className="attachment-previews-list" style={{ marginTop: 8 }}>
          {selectedFiles.map((item) => (
            <div key={item.id} className="attachment-preview-chip">
              <img
                src={item.previewUrl}
                alt={item.name}
                className="attachment-preview-thumb"
              />
              <div className="attachment-preview-meta">
                <span className="attachment-preview-name" title={item.name}>
                  {item.name}
                </span>
                <span className="attachment-preview-size font-mono">
                  {formatFileSize(item.size)}
                </span>
              </div>
              <button
                type="button"
                className="attachment-remove-btn"
                onClick={() => handleRemove(item.id)}
                disabled={disabled}
                aria-label={`Remove image ${item.name}`}
                title="Remove image"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
