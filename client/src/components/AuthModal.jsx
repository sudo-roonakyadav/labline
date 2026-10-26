import { useState, useEffect } from 'react';

/**
 * Dual Registration & Authentication Modal for LabLine / SIGNAL Protocol.
 * Supports:
 *  - Sign In (existing students and mentors)
 *  - Register: Step 1 (Account Architecture Selection: Student vs Teacher)
 *  - Register: Step 2 (Dedicated Student form or Invitation-protected Teacher form)
 */
export default function AuthModal({
  isOpen,
  initialMode = 'login',
  initialAccountType = null,
  onClose,
  onSuccess,
}) {
  const [mode, setMode] = useState(initialMode);
  const [accountType, setAccountType] = useState(initialAccountType);
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    inviteCode: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Sync state whenever modal opens or initialMode/initialAccountType changes
  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setAccountType(initialAccountType);
      setError(null);
      setSuccessMsg(null);
      setForm({ name: '', email: '', password: '', inviteCode: '' });
    }
  }, [isOpen, initialMode, initialAccountType]);

  // Handle ESC key to dismiss modal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Handle Mode Switching (Sign In vs Register)
  const handleSwitchMode = (newMode) => {
    setMode(newMode);
    setError(null);
    setSuccessMsg(null);
    if (newMode === 'register') {
      setAccountType(initialAccountType || null);
    }
  };

  // Submit Handler for both Login and Dual Registration
  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccessMsg(null);

    const isLogin = mode === 'login';
    const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';

    let payload;
    if (isLogin) {
      payload = {
        email: form.email.trim(),
        password: form.password,
      };
    } else {
      payload = {
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        accountType: accountType || 'student',
      };
      if (accountType === 'teacher') {
        payload.inviteCode = form.inviteCode.trim();
      }
    }

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        // Format readable validation error messages from backend
        let errMsg = data.message || data.error || 'Authentication failed.';
        if (Array.isArray(data.details) && data.details.length > 0) {
          errMsg = data.details.join(' ');
        }
        throw new Error(errMsg);
      }

      const roleLabel = data.user.role === 'mentor' ? 'Teacher' : 'Student';
      setSuccessMsg(`Session established for ${data.user.name} (${roleLabel}).`);

      // Defer transition slightly to show confirmation before closing modal
      setTimeout(() => {
        onSuccess(data.user);
      }, 350);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const isWideSelection = mode === 'register' && !accountType;

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      <div
        className={`auth-card ${isWideSelection ? 'auth-card-wide' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Topbar Navigation */}
        <div className="auth-card-topbar">
          <div className="auth-mode-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'login'}
              className={`auth-tab-btn ${mode === 'login' ? 'active' : ''}`}
              onClick={() => handleSwitchMode('login')}
            >
              Sign In
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'register'}
              className={`auth-tab-btn ${mode === 'register' ? 'active' : ''}`}
              onClick={() => handleSwitchMode('register')}
            >
              Register
            </button>
          </div>

          <button
            type="button"
            className="auth-close-btn font-mono"
            onClick={onClose}
            aria-label="Close authentication modal"
          >
            [ESC]
          </button>
        </div>

        {/* Modal Body */}
        <div className="auth-card-body">
          {error && <div className="alert-box error font-mono" role="alert">{error}</div>}
          {successMsg && <div className="alert-box success font-mono" role="status">{successMsg}</div>}

          {/* =============================================================== */}
          {/* VIEW A: SIGN IN FORM                                            */}
          {/* =============================================================== */}
          {mode === 'login' && (
            <div className="auth-step-container">
              <div className="auth-step-meta font-mono">
                <span className="step-tag">01 // ACCESS</span>
                <span className="step-sub">OPERATIONAL CREDENTIALS</span>
              </div>
              <h2 id="auth-modal-title" className="auth-step-title font-display">
                Sign In to LabLine
              </h2>

              <form onSubmit={handleSubmit} className="auth-form-stack">
                <div className="input-group">
                  <label className="input-label font-mono" htmlFor="login-email">
                    ACADEMIC EMAIL
                  </label>
                  <input
                    id="login-email"
                    type="email"
                    className="signal-input"
                    placeholder="name@university.edu"
                    required
                    autoComplete="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    disabled={submitting}
                  />
                </div>

                <div className="input-group">
                  <label className="input-label font-mono" htmlFor="login-password">
                    PASSWORD
                  </label>
                  <input
                    id="login-password"
                    type="password"
                    className="signal-input"
                    placeholder="Enter your account password"
                    required
                    autoComplete="current-password"
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
                  {submitting ? 'VERIFYING CREDENTIALS...' : 'AUTHENTICATE SESSION →'}
                </button>
              </form>

              <div className="auth-footer-prompt font-mono">
                <span>New to the lab?</span>{' '}
                <button
                  type="button"
                  className="auth-link-inline font-mono"
                  onClick={() => handleSwitchMode('register')}
                >
                  Choose account type and register →
                </button>
              </div>
            </div>
          )}

          {/* =============================================================== */}
          {/* VIEW B: REGISTRATION - STEP 1 (ACCOUNT TYPE SELECTION)          */}
          {/* =============================================================== */}
          {mode === 'register' && !accountType && (
            <div className="auth-step-container">
              <div className="auth-step-meta font-mono">
                <span className="step-tag">01 // IDENTITY PROTOCOL</span>
                <span className="step-sub">CHOOSE OPERATIONAL ROLE</span>
              </div>
              <h2 id="auth-modal-title" className="auth-step-title font-display">
                Create Your Account
              </h2>
              <p className="auth-step-intro">
                Select your designated role within the laboratory assistance ecosystem.
              </p>

              <div className="account-selection-grid" role="group" aria-label="Account type choices">
                {/* 1. Student Choice Panel */}
                <div
                  className="account-choice-panel student-panel"
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setAccountType('student');
                    setError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setAccountType('student');
                      setError(null);
                    }
                  }}
                  aria-label="Select Student Account: Submit doubts, track queue, review sessions"
                >
                  <div className="choice-panel-header">
                    <span className="choice-panel-badge font-mono">ROLE 01 // STUDENT</span>
                    <span className="choice-dot student" />
                  </div>

                  <div className="choice-illustration-wrap" aria-hidden="true">
                    <svg className="choice-svg" viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <rect x="4" y="8" width="64" height="48" rx="2" stroke="#222824" strokeWidth="1.5" fill="#0B0D0C" />
                      <line x1="4" y1="20" x2="68" y2="20" stroke="#222824" strokeWidth="1" />
                      <circle cx="12" cy="14" r="2" fill="#D6FF55" />
                      <circle cx="19" cy="14" r="2" fill="#3A453D" />
                      <circle cx="26" cy="14" r="2" fill="#3A453D" />
                      <path d="M14 32L22 38L14 44" stroke="#D6FF55" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      <line x1="28" y1="44" x2="40" y2="44" stroke="#F3F1E8" strokeWidth="2" strokeLinecap="round" />
                      <path d="M46 30C52 32 54 38 52 44" stroke="#55D6FF" strokeWidth="1.5" strokeDasharray="2 2" />
                      <path d="M40 60L52 60" stroke="#222824" strokeWidth="2" strokeLinecap="round" />
                      <path d="M20 60L32 60" stroke="#222824" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </div>

                  <div className="choice-content">
                    <h3 className="choice-title font-display">Student</h3>
                    <p className="choice-summary font-mono">
                      Broadcast doubts, request live assistance, and learn with continuous mentor feedback.
                    </p>

                    <ul className="choice-feature-list font-mono">
                      <li>
                        <span className="feature-bullet">▸</span>
                        <span>Submit doubts and code snippets.</span>
                      </li>
                      <li>
                        <span className="feature-bullet">▸</span>
                        <span>Track queue position and session progress.</span>
                      </li>
                      <li>
                        <span className="feature-bullet">▸</span>
                        <span>Review completed sessions and feedback.</span>
                      </li>
                    </ul>
                  </div>

                  <div className="choice-action-bar">
                    <span className="choice-cta-text font-mono">
                      Select Student Identity →
                    </span>
                  </div>
                </div>

                {/* 2. Teacher Choice Panel */}
                <div
                  className="account-choice-panel teacher-panel"
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setAccountType('teacher');
                    setError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setAccountType('teacher');
                      setError(null);
                    }
                  }}
                  aria-label="Select Teacher Account: Manage queue, assist students, record resolutions. Invitation code required."
                >
                  <div className="choice-panel-header">
                    <span className="choice-panel-badge font-mono">ROLE 02 // TEACHER</span>
                    <span className="invite-tag font-mono">INVITATION CODE</span>
                  </div>

                  <div className="choice-illustration-wrap" aria-hidden="true">
                    <svg className="choice-svg" viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <circle cx="36" cy="36" r="30" stroke="#222824" strokeWidth="1.5" fill="#0B0D0C" />
                      <circle cx="36" cy="36" r="20" stroke="#222824" strokeWidth="1" strokeDasharray="3 3" />
                      <circle cx="36" cy="36" r="10" stroke="#222824" strokeWidth="1" />
                      <line x1="36" y1="6" x2="36" y2="66" stroke="#222824" strokeWidth="1" />
                      <line x1="6" y1="36" x2="66" y2="36" stroke="#222824" strokeWidth="1" />
                      <path d="M36 36L56 22" stroke="#55D6FF" strokeWidth="2" strokeLinecap="round" />
                      <circle cx="48" cy="24" r="3" fill="#D6FF55" />
                      <circle cx="26" cy="46" r="2" fill="#55D6FF" />
                      <path d="M36 16A20 20 0 0 1 54 28" stroke="#55D6FF" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  </div>

                  <div className="choice-content">
                    <h3 className="choice-title font-display">Teacher</h3>
                    <p className="choice-summary font-mono">
                      Coordinate laboratory triage, claim student doubts atomically, and track learning progress.
                    </p>

                    <ul className="choice-feature-list font-mono">
                      <li>
                        <span className="feature-bullet">▸</span>
                        <span>Manage the live queue.</span>
                      </li>
                      <li>
                        <span className="feature-bullet">▸</span>
                        <span>Assist students and manage sessions.</span>
                      </li>
                      <li>
                        <span className="feature-bullet">▸</span>
                        <span>Record resolution notes and manage availability.</span>
                      </li>
                    </ul>
                  </div>

                  <div className="choice-action-bar">
                    <span className="choice-cta-text font-mono">
                      Select Teacher Identity →
                    </span>
                  </div>
                </div>
              </div>

              <div className="auth-footer-prompt font-mono">
                <span>Already have an account?</span>{' '}
                <button
                  type="button"
                  className="auth-link-inline font-mono"
                  onClick={() => handleSwitchMode('login')}
                >
                  Sign In →
                </button>
              </div>
            </div>
          )}

          {/* =============================================================== */}
          {/* VIEW C: REGISTRATION - STEP 2 (ROLE-SPECIFIC FORM)              */}
          {/* =============================================================== */}
          {mode === 'register' && accountType && (
            <div className="auth-step-container">
              {/* Back navigation & active identity badge */}
              <div className="auth-form-header">
                <button
                  type="button"
                  className="auth-back-btn font-mono"
                  onClick={() => {
                    setAccountType(null);
                    setError(null);
                  }}
                  aria-label="Back to account type selection"
                >
                  ← BACK TO ACCOUNT SELECTION
                </button>

                <span className={`identity-badge font-mono ${accountType}`}>
                  {accountType === 'teacher' ? 'TEACHER / MENTOR' : 'STUDENT'}
                </span>
              </div>

              <h2 id="auth-modal-title" className="auth-step-title font-display">
                {accountType === 'teacher' ? 'Teacher Registration' : 'Student Registration'}
              </h2>

              {accountType === 'teacher' && (
                <div className="teacher-invitation-box font-mono">
                  <div className="notice-icon">ℹ</div>
                  <div className="notice-text">
                    Teacher accounts require an administrative invitation code issued by the course coordinator. If you do not have a code, please return to select Student registration.
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmit} className="auth-form-stack">
                <div className="input-group">
                  <label className="input-label font-mono" htmlFor="register-name">
                    FULL NAME
                  </label>
                  <input
                    id="register-name"
                    type="text"
                    className="signal-input"
                    placeholder="e.g. Ronak Yadav"
                    required
                    autoComplete="name"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    disabled={submitting}
                  />
                  <span className="input-hint font-mono">2 to 60 characters</span>
                </div>

                <div className="input-group">
                  <label className="input-label font-mono" htmlFor="register-email">
                    ACADEMIC EMAIL
                  </label>
                  <input
                    id="register-email"
                    type="email"
                    className="signal-input"
                    placeholder={accountType === 'teacher' ? 'faculty@scaler.com' : 'student@scaler.com'}
                    required
                    autoComplete="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    disabled={submitting}
                  />
                </div>

                <div className="input-group">
                  <label className="input-label font-mono" htmlFor="register-password">
                    PASSWORD
                  </label>
                  <input
                    id="register-password"
                    type="password"
                    className="signal-input"
                    placeholder="Minimum 8 characters"
                    required
                    autoComplete="new-password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    disabled={submitting}
                  />
                </div>

                {accountType === 'teacher' && (
                  <div className="input-group">
                    <label className="input-label font-mono" htmlFor="register-invite-code">
                      TEACHER INVITATION CODE
                    </label>
                    <input
                      id="register-invite-code"
                      type="password"
                      className="signal-input font-mono"
                      placeholder="e.g. LL-TEACH-••••••••"
                      required
                      autoComplete="off"
                      value={form.inviteCode}
                      onChange={(e) => setForm({ ...form, inviteCode: e.target.value })}
                      disabled={submitting}
                    />
                    <span className="input-hint font-mono">
                      Confidential departmental token verified securely against the server.
                    </span>
                  </div>
                )}

                <button
                  type="submit"
                  className="btn-signal-submit"
                  disabled={submitting}
                >
                  {submitting
                    ? 'TRANSMITTING CREDENTIALS...'
                    : accountType === 'teacher'
                    ? 'VERIFY & INITIALIZE TEACHER ACCOUNT →'
                    : 'INITIALIZE STUDENT IDENTITY →'}
                </button>
              </form>

              <div className="auth-footer-prompt font-mono">
                <span>Already have an account?</span>{' '}
                <button
                  type="button"
                  className="auth-link-inline font-mono"
                  onClick={() => handleSwitchMode('login')}
                >
                  Sign In →
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
