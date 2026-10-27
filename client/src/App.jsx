import { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import Navbar from './components/Navbar.jsx';
import LandingHero from './components/LandingHero.jsx';
import LandingWorkflows from './components/LandingWorkflows.jsx';
import StudentWorkspace from './components/StudentWorkspace.jsx';
import MentorWorkspace from './components/MentorWorkspace.jsx';
import AuthModal from './components/AuthModal.jsx';
import Footer from './components/Footer.jsx';

function formatDuration(dateString) {
  if (!dateString) return '0m';
  const diffMs = Math.max(0, Date.now() - new Date(dateString).getTime());
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return '< 1m';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMins = minutes % 60;
  return `${hours}h ${remainingMins}m`;
}

export default function App() {
  // Primary View Mode: 'landing' | 'workspace'
  const [activeView, setActiveView] = useState('landing');
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState('login');
  const [authModalAccountType, setAuthModalAccountType] = useState(null);

  const handleOpenAuth = (mode = 'login', accountType = null) => {
    setAuthModalMode(mode);
    setAuthModalAccountType(accountType);
    setAuthModalOpen(true);
  };

  // Authentication State
  const [currentUser, setCurrentUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState('login'); // 'login' | 'register'
  const [authForm, setAuthForm] = useState({ email: '', name: '', password: '' });
  const [authError, setAuthError] = useState(null);
  const [authSuccess, setAuthSuccess] = useState(null);
  const [authSubmitting, setAuthSubmitting] = useState(false);

  // Student Help Request State
  const [myRequests, setMyRequests] = useState([]);
  const [myRequestsLoading, setMyRequestsLoading] = useState(false);
  const [requestSubmitting, setRequestSubmitting] = useState(false);
  const [requestError, setRequestError] = useState(null);
  const [requestSuccess, setRequestSuccess] = useState(null);

  // Mentor Queue State
  const [mentorQueue, setMentorQueue] = useState([]);
  const [mentorQueueLoading, setMentorQueueLoading] = useState(false);
  const [queueActionError, setQueueActionError] = useState(null);
  const [queueIntelligence, setQueueIntelligence] = useState(null);

  // Real-time WebSocket State
  const [socketConnected, setSocketConnected] = useState(false);
  const socketRef = useRef(null);

  // Lifecycle & Concurrency Stability Refs
  const currentUserRef = useRef(currentUser);
  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  const isMountedRef = useRef(true);
  const refreshTimerRef = useRef(null);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
    };
  }, []);

  // Handle direct hash navigation on initial landing page load and refreshes
  useEffect(() => {
    if (activeView === 'landing' && window.location.hash) {
      const targetId = window.location.hash.replace('#', '');
      const targetEl = document.getElementById(targetId);
      if (targetEl) {
        setTimeout(() => {
          targetEl.scrollIntoView({ behavior: 'smooth' });
        }, 100);
      }
    }
  }, [activeView]);

  // -------------------------------------------------------------------------
  // API FETCHERS
  // -------------------------------------------------------------------------

  const checkSession = useCallback(async () => {
    setAuthLoading(true);
    try {
      const res = await fetch('/api/auth/me', {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!isMountedRef.current) return;

      if (res.ok) {
        const data = await res.json();
        if (!isMountedRef.current) return;
        setCurrentUser(data.user);
        setActiveView('workspace');
      } else {
        setCurrentUser(null);
        setActiveView('landing');
      }
    } catch (err) {
      if (isMountedRef.current) {
        setCurrentUser(null);
        setActiveView('landing');
      }
    } finally {
      if (isMountedRef.current) {
        setAuthLoading(false);
      }
    }
  }, []);

  const fetchMyRequests = useCallback(async () => {
    setMyRequestsLoading(true);
    try {
      const res = await fetch('/api/requests/mine', {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!isMountedRef.current) return;

      if (res.ok) {
        const data = await res.json();
        if (!isMountedRef.current) return;
        setMyRequests(data.requests || []);
        setRequestError(null);
      } else if (res.status === 401) {
        setCurrentUser(null);
        setMyRequests([]);
      } else {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || `HTTP ${res.status}`);
      }
    } catch (err) {
      if (isMountedRef.current) {
        setRequestError(err.message);
      }
    } finally {
      if (isMountedRef.current) {
        setMyRequestsLoading(false);
      }
    }
  }, []);

  const fetchQueue = useCallback(async () => {
    setMentorQueueLoading(true);
    try {
      const res = await fetch('/api/queue', {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!isMountedRef.current) return;

      if (res.ok) {
        const data = await res.json();
        if (!isMountedRef.current) return;
        setMentorQueue(data.queue || []);
        setQueueActionError(null);
      } else if (res.status === 401) {
        setCurrentUser(null);
        setMentorQueue([]);
      } else {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || `HTTP ${res.status}`);
      }
    } catch (err) {
      if (isMountedRef.current) {
        setQueueActionError(err.message);
      }
    } finally {
      if (isMountedRef.current) {
        setMentorQueueLoading(false);
      }
    }
  }, []);

  const fetchQueueIntelligence = useCallback(async () => {
    try {
      const res = await fetch('/api/queue/intelligence', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (!isMountedRef.current) return;
        setQueueIntelligence(data);
      }
    } catch (err) {
      // Non-critical telemetry probe
    }
  }, []);

  // Bounded coalesced refresh to avoid hammering endpoints on high-frequency socket broadcasts
  const triggerBoundedRefresh = useCallback(() => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
    }
    refreshTimerRef.current = setTimeout(() => {
      if (!isMountedRef.current) return;
      const user = currentUserRef.current;
      if (user?.role === 'student') {
        fetchMyRequests();
      } else if (user?.role === 'mentor') {
        fetchQueue();
        fetchQueueIntelligence();
      }
    }, 200);
  }, [fetchMyRequests, fetchQueue, fetchQueueIntelligence]);

  // -------------------------------------------------------------------------
  // LIFECYCLE & SOCKET SETUP
  // -------------------------------------------------------------------------

  // 1. Initial application/session bootstrap - executed ONCE on mount
  useEffect(() => {
    checkSession();
  }, [checkSession]);

  // 2. Persistent Socket.IO connection - initialized ONCE for application lifetime
  useEffect(() => {
    const socket = io({
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      if (!isMountedRef.current) return;
      setSocketConnected(true);
    });

    // Server-originated queue change broadcast -> triggers bounded refresh via stable ref
    socket.on('queue:changed', () => {
      triggerBoundedRefresh();
    });

    socket.on('request:message', () => {
      triggerBoundedRefresh();
    });

    socket.on('disconnect', () => {
      if (!isMountedRef.current) return;
      setSocketConnected(false);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [triggerBoundedRefresh]);

  // 3. User workspace data synchronization - runs ONLY when authenticated user identity or role changes
  const userKey = currentUser ? `${currentUser._id || currentUser.id}:${currentUser.role}` : null;
  useEffect(() => {
    const user = currentUserRef.current;
    if (user?.role === 'student') {
      fetchMyRequests();
    } else if (user?.role === 'mentor') {
      fetchQueue();
      fetchQueueIntelligence();
    } else {
      setMyRequests([]);
      setMentorQueue([]);
    }
  }, [userKey, fetchMyRequests, fetchQueue, fetchQueueIntelligence]);

  // -------------------------------------------------------------------------
  // USER ACTIONS
  // -------------------------------------------------------------------------

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthSubmitting(true);
    setAuthError(null);
    setAuthSuccess(null);

    const endpoint = authMode === 'login' ? '/api/auth/login' : '/api/auth/register';
    const payload =
      authMode === 'login'
        ? { email: authForm.email, password: authForm.password }
        : { email: authForm.email, name: authForm.name, password: authForm.password };

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error || 'Authentication request failed.');
      }

      setCurrentUser(data.user);
      setAuthSuccess(`Welcome, ${data.user.name}. Signed in as ${data.user.role}.`);
      setAuthForm({ email: '', name: '', password: '' });
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
      setCurrentUser(null);
      setMyRequests([]);
      setMentorQueue([]);
      setActiveView('landing');
    } catch (err) {
      console.error('Logout error:', err.message);
    }
  };

  const handleCreateRequest = async ({ topic, description, codeSnippet, category }) => {
    setRequestSubmitting(true);
    setRequestError(null);
    setRequestSuccess(null);

    try {
      const res = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ topic, description, codeSnippet, category }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error || 'Failed to submit help request.');
      }

      setRequestSuccess(`Request submitted. Position in queue: #${data.request.queuePosition}`);
      fetchMyRequests();
      return true;
    } catch (err) {
      setRequestError(err.message);
      return false;
    } finally {
      setRequestSubmitting(false);
    }
  };

  const handleCancelRequest = async (requestId) => {
    if (!window.confirm('Are you sure you want to cancel this request?')) return;
    try {
      const res = await fetch(`/api/requests/${requestId}/cancel`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error || 'Failed to cancel request.');
      }
      fetchMyRequests();
    } catch (err) {
      alert(`Could not cancel request: ${err.message}`);
    }
  };

  const handleSubmitFeedback = async (requestId, { rating, comment }) => {
    try {
      const res = await fetch(`/api/requests/${requestId}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ rating, comment }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Failed to record session feedback.');
      }
      fetchMyRequests();
      return true;
    } catch (err) {
      throw err;
    }
  };

  const handlePostMessage = async (requestId, content) => {
    try {
      const res = await fetch(`/api/requests/${requestId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ content }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error || 'Failed to post message.');
      }
      if (currentUser?.role === 'student') {
        fetchMyRequests();
      } else {
        fetchQueue();
      }
      return data;
    } catch (err) {
      throw err;
    }
  };

  const handleCloseRequest = async (requestId, { rating, comment }) => {
    try {
      const res = await fetch(`/api/requests/${requestId}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ rating, comment }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error || 'Failed to close request.');
      }
      fetchMyRequests();
      return data;
    } catch (err) {
      throw err;
    }
  };

  const handleClaimRequest = async (requestId) => {
    setQueueActionError(null);
    try {
      const res = await fetch(`/api/requests/${requestId}/claim`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Unable to accept request.');
      }
      fetchQueue();
    } catch (err) {
      setQueueActionError(err.message);
      fetchQueue();
    }
  };

  const handleUpdateStatus = async (requestId, targetStatus, resolutionNotes) => {
    setQueueActionError(null);
    try {
      const payload = { status: targetStatus };
      if (resolutionNotes !== undefined) {
        payload.resolutionNotes = resolutionNotes;
      }
      const res = await fetch(`/api/requests/${requestId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Failed to update request status.');
      }
      fetchQueue();
      return true;
    } catch (err) {
      setQueueActionError(err.message);
      return false;
    }
  };

  const handleToggleAvailability = async (isAvailable) => {
    try {
      const res = await fetch('/api/queue/availability', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ isAvailable }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Failed to update availability.');
      }
      setCurrentUser(data.user);
      fetchQueue();
    } catch (err) {
      setQueueActionError(err.message);
    }
  };

  // Student partition
  const activeStudentRequest = myRequests.find((r) =>
    ['waiting', 'claimed', 'in_progress', 'awaiting_mentor', 'awaiting_student'].includes(r.status)
  );
  const pastStudentRequests = myRequests.filter((r) => ['resolved', 'cancelled'].includes(r.status));

  // Mentor partition
  const waitingQueue = mentorQueue.filter((r) => r.status === 'waiting');
  const myAssignedRequests = mentorQueue.filter(
    (r) =>
      ['claimed', 'in_progress', 'awaiting_mentor', 'awaiting_student'].includes(r.status) &&
      (r.mentor?._id === currentUser?.id || r.mentor?.id === currentUser?.id || r.mentor === currentUser?.id)
  );
  const otherActiveRequests = mentorQueue.filter(
    (r) =>
      ['claimed', 'in_progress'].includes(r.status) &&
      r.mentor?._id !== currentUser?.id &&
      r.mentor?.id !== currentUser?.id &&
      r.mentor !== currentUser?.id
  );

  return (
    <div className="app-layout">
      {/* Top Application Header */}
      <Navbar
        currentUser={currentUser}
        socketConnected={socketConnected}
        activeView={activeView}
        setActiveView={setActiveView}
        onOpenAuth={handleOpenAuth}
        onLogout={handleLogout}
      />

      {activeView === 'landing' ? (
        <>
          <main>
            <LandingHero
              currentUser={currentUser}
              onOpenAuth={handleOpenAuth}
              onEnterWorkspace={() => setActiveView('workspace')}
            />

            <LandingWorkflows onOpenAuth={handleOpenAuth} />
          </main>
          <Footer />
        </>
      ) : (
        <main className="page-container">
          {authLoading ? (
            <div className="empty-box" style={{ margin: '64px auto', maxWidth: '400px' }}>
              <div className="empty-box-title">Loading session...</div>
            </div>
          ) : !currentUser ? (
            /* ----------------------------------------------------------------- */
            /* UNAUTHENTICATED AUTH VIEW                                         */
            /* ----------------------------------------------------------------- */
            <div className="auth-wrapper">
              <div className="section-card" style={{ maxWidth: '460px', margin: '48px auto', textAlign: 'center' }}>
                <div className="section-card-header font-mono" style={{ justifyContent: 'center' }}>
                  <span>AUTHENTICATION REQUIRED</span>
                </div>
                <div className="section-card-body" style={{ padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center' }}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--color-signal)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                  <h2 className="font-display" style={{ fontSize: '20px', color: 'var(--color-warm-white)' }}>
                    Authentication Required
                  </h2>
                  <p style={{ fontSize: '13px', color: 'var(--color-neutral)', lineHeight: 1.5 }}>
                    Please sign in or register to access your personal Student Dashboard or Mentor Dashboard.
                  </p>
                  <div style={{ display: 'flex', gap: '12px', width: '100%', marginTop: '6px' }}>
                    <button
                      type="button"
                      className="btn-ghost"
                      style={{ flex: 1, padding: '10px' }}
                      onClick={() => handleOpenAuth('login')}
                    >
                      Sign In
                    </button>
                    <button
                      type="button"
                      className="btn-signal"
                      style={{ flex: 1, padding: '10px' }}
                      onClick={() => handleOpenAuth('register')}
                    >
                      Register
                    </button>
                  </div>
                  <button
                    type="button"
                    className="font-mono"
                    style={{ background: 'transparent', border: 'none', color: 'var(--color-neutral-muted)', fontSize: '11px', cursor: 'pointer', marginTop: '6px' }}
                    onClick={() => setActiveView('landing')}
                  >
                    Return to Overview
                  </button>
                </div>
              </div>
            </div>
          ) : currentUser.role === 'student' ? (
            <StudentWorkspace
              currentUser={currentUser}
              myRequests={myRequests}
              myRequestsLoading={myRequestsLoading}
              fetchMyRequests={fetchMyRequests}
              onCreateRequest={handleCreateRequest}
              onCancelRequest={handleCancelRequest}
              onSubmitFeedback={handleSubmitFeedback}
              onPostMessage={handlePostMessage}
              onCloseRequest={handleCloseRequest}
              requestSubmitting={requestSubmitting}
              requestError={requestError}
              requestSuccess={requestSuccess}
            />
          ) : (
            <MentorWorkspace
              currentUser={currentUser}
              mentorQueue={mentorQueue}
              mentorQueueLoading={mentorQueueLoading}
              fetchQueue={() => {
                fetchQueue();
                fetchQueueIntelligence();
              }}
              onClaimRequest={handleClaimRequest}
              onUpdateStatus={handleUpdateStatus}
              onToggleAvailability={handleToggleAvailability}
              onPostMessage={handlePostMessage}
              queueActionError={queueActionError}
              queueIntelligence={queueIntelligence}
            />
          )}
        </main>
      )}

  {/* Accessible Authentication Modal */}
  <AuthModal
    isOpen={authModalOpen}
    initialMode={authModalMode}
    initialAccountType={authModalAccountType}
    onClose={() => setAuthModalOpen(false)}
    onSuccess={(user) => {
      setCurrentUser(user);
      setAuthModalOpen(false);
      setActiveView('workspace');
    }}
  />
</div>
);
}
