import { useState, useEffect } from 'react';

export default function AuthModal({
  isOpen,
  initialMode = 'login',
  onClose,
  onSuccess,
}) {
  const [mode, setMode] = useState(initialMode);
  const [form, setForm] = useState({ email: '', name: '', password: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  useEffect(() => {
    setMode(initialMode);
    setError(null);
    setSuccessMsg(null);
  }, [initialMode, isOpen]);

  // Handle ESC key to close
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccessMsg(null);

    const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
    const payload =
      mode === 'login'
        ? { email: form.email, password: form.password }
        : { email: form.email, name: form.name, password: form.password };

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error || 'Authentication failed.');
      }

      setSuccessMsg(`Authenticated as ${data.user.name} (${data.user.role}).`);
      setTimeout(() => {
        onSuccess(data.user);
      }, 400);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="auth-card" onClick={(e) => e.stopPropagation()}>
        {/* Modal Top Bar */}
        <div className="auth-card-topbar">
          <div className="auth-mode-tabs">
            <button
              type="button"
              className={`auth-tab-btn ${mode === 'login' ? 'active' : ''}`}
              onClick={() => {
                setMode('login');
                setError(null);
              }}
            >
              Sign In
            </button>
            <button
              type="button"
              className={`auth-tab-btn ${mode === 'register' ? 'active' : ''}`}
              onClick={() => {
                setMode('register');
                setError(null);
              }}
            >
              Register Student
            </button>
          </div>

          <button
            type="button"
            className="auth-close-btn font-mono"
            onClick={onClose}
            aria-label="Close authentication modal"
          >
            [ESC ✕]
          </button>
        </div>

        {/* Modal Body */}
        <div className="auth-card-body">
          {error && <div className="alert-box error font-mono">{error}</div>}
          {successMsg && <div className="alert-box success font-mono">{successMsg}</div>}

          <form onSubmit={handleSubmit} className="auth-form-stack">
            {mode === 'register' && (
              <div className="input-group">
                <label className="input-label font-mono" htmlFor="auth-modal-name">
                  FULL NAME
                </label>
                <input
                  id="auth-modal-name"
                  type="text"
                  className="signal-input"
                  placeholder="e.g. Ronak Yadav"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  disabled={submitting}
                />
                <span className="input-hint font-mono">2 to 60 characters</span>
              </div>
            )}

            <div className="input-group">
              <label className="input-label font-mono" htmlFor="auth-modal-email">
                ACADEMIC EMAIL
              </label>
              <input
                id="auth-modal-email"
                type="email"
                className="signal-input"
                placeholder="student@scaler.com"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                disabled={submitting}
              />
            </div>

            <div className="input-group">
              <label className="input-label font-mono" htmlFor="auth-modal-password">
                PASSWORD
              </label>
              <input
                id="auth-modal-password"
                type="password"
                className="signal-input"
                placeholder="Minimum 8 characters"
                required
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                disabled={submitting}
              />
            </div>

            <button
              type="submit"
              className="btn-signal-submit"
              disabled={submitting}
            >
              {submitting
                ? 'TRANSMITTING CREDENTIALS...'
                : mode === 'login'
                ? 'AUTHENTICATE SESSION →'
                : 'INITIALIZE STUDENT IDENTITY →'}
            </button>
          </form>

          <div className="auth-disclaimer font-mono">
            Public registration creates student credentials. Mentor privileges require administrative CLI verification (`npm run promote-mentor`) to ensure security isolation.
          </div>
        </div>
      </div>
    </div>
  );
}
