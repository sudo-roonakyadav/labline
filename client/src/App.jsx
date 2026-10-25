import { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import Navbar from './components/Navbar.jsx';
import LandingHero from './components/LandingHero.jsx';
import SignalVisualizer from './components/SignalVisualizer.jsx';
import LandingWorkflows from './components/LandingWorkflows.jsx';
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
  // Primary View Mode: 'landing' | 'workspace' | 'diagnostics'
  const [activeView, setActiveView] = useState('landing');
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState('login');

  // Secondary Tab in Workspace (if applicable): 'workbench' | 'diagnostics'
  const [activeTab, setActiveTab] = useState('workbench');

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
  const [requestForm, setRequestForm] = useState({ topic: '', description: '', codeSnippet: '' });
  const [requestSubmitting, setRequestSubmitting] = useState(false);
  const [requestError, setRequestError] = useState(null);
  const [requestSuccess, setRequestSuccess] = useState(null);

  // Mentor Queue State
  const [mentorQueue, setMentorQueue] = useState([]);
  const [mentorQueueLoading, setMentorQueueLoading] = useState(false);
  const [queueActionError, setQueueActionError] = useState(null);

  // Diagnostics State
  const [healthData, setHealthData] = useState(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthError, setHealthError] = useState(null);
  const [healthLatency, setHealthLatency] = useState(null);
  const [lastChecked, setLastChecked] = useState(null);

  // WebSocket State
  const [socketConnected, setSocketConnected] = useState(false);
  const [socketId, setSocketId] = useState(null);
  const [socketTransport, setSocketTransport] = useState(null);
  const [socketPingLatency, setSocketPingLatency] = useState(null);
  const [telemetryLogs, setTelemetryLogs] = useState([]);
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

  const addLog = useCallback((source, message, level = 'info') => {
    const timestamp = new Date().toISOString().substring(11, 23);
    const id = `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    setTelemetryLogs((prev) => [{ id, timestamp, source, message, level }, ...prev.slice(0, 49)]);
  }, []);

  // -------------------------------------------------------------------------
  // API FETCHERS
  // -------------------------------------------------------------------------

  const fetchHealth = useCallback(async () => {
    setHealthLoading(true);
    const startTime = performance.now();
    try {
      const res = await fetch('/api/health', { cache: 'no-store' });
      const latency = Math.round(performance.now() - startTime);
      if (!isMountedRef.current) return;

      setHealthLatency(latency);
      setLastChecked(new Date().toLocaleTimeString());

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }

      const json = await res.json();
      if (!isMountedRef.current) return;

      setHealthData(json);
      setHealthError(null);
      addLog('HTTP', `GET /api/health -> ${res.status} OK (${latency}ms)`, 'success');
    } catch (err) {
      if (!isMountedRef.current) return;
      setHealthError(err.message);
      setHealthData(null);
      addLog('HTTP', `GET /api/health failed: ${err.message}`, 'error');
    } finally {
      if (isMountedRef.current) {
        setHealthLoading(false);
      }
    }
  }, [addLog]);

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
        addLog('AUTH', `Restored session for ${data.user.email} (${data.user.role})`, 'success');
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
  }, [addLog]);

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
        addLog('API', `Failed to load student requests: ${err.message}`, 'error');
      }
    } finally {
      if (isMountedRef.current) {
        setMyRequestsLoading(false);
      }
    }
  }, [addLog]);

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
        addLog('API', `Failed to load mentor queue: ${err.message}`, 'error');
      }
    } finally {
      if (isMountedRef.current) {
        setMentorQueueLoading(false);
      }
    }
  }, [addLog]);

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
      }
    }, 200);
  }, [fetchMyRequests, fetchQueue]);

  // -------------------------------------------------------------------------
  // LIFECYCLE & SOCKET SETUP
  // -------------------------------------------------------------------------

  // 1. Initial application/session bootstrap - executed ONCE on mount
  useEffect(() => {
    addLog('SYSTEM', 'Initializing LabLine application');
    checkSession();
  }, [addLog, checkSession]);

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
      setSocketId(socket.id);
      const transportName = socket.io?.engine?.transport?.name || 'websocket';
      setSocketTransport(transportName);
      addLog('SOCKET', `Connected [${socket.id}] via ${transportName}`, 'success');
    });

    socket.on('system:pong', (payload) => {
      if (!isMountedRef.current) return;
      if (payload?.clientTimestamp) {
        const rtt = Math.round(performance.now() - payload.clientTimestamp);
        setSocketPingLatency(rtt);
        addLog('SOCKET', `Ping round-trip: ${rtt}ms`, 'success');
      }
    });

    // Server-originated queue change broadcast -> triggers bounded refresh via stable ref
    socket.on('queue:changed', (payload) => {
      addLog('SOCKET', `Queue changed: [${payload.action}]`, 'info');
      triggerBoundedRefresh();
    });

    socket.on('disconnect', (reason) => {
      if (!isMountedRef.current) return;
      setSocketConnected(false);
      setSocketId(null);
      addLog('SOCKET', `Disconnected: ${reason}`, 'warn');
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [addLog, triggerBoundedRefresh]);

  // 3. User workspace data synchronization - runs ONLY when authenticated user identity or role changes
  const userKey = currentUser ? `${currentUser._id || currentUser.id}:${currentUser.role}` : null;
  useEffect(() => {
    const user = currentUserRef.current;
    if (user?.role === 'student') {
      fetchMyRequests();
    } else if (user?.role === 'mentor') {
      fetchQueue();
    } else {
      setMyRequests([]);
      setMentorQueue([]);
    }
  }, [userKey, fetchMyRequests, fetchQueue]);

  // If user opens diagnostics tab and healthData is missing, fetch once
  useEffect(() => {
    if (activeTab === 'diagnostics' && !healthData && !healthLoading) {
      fetchHealth();
    }
  }, [activeTab, healthData, healthLoading, fetchHealth]);

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
      addLog('AUTH', `Signed in as ${data.user.email}`, 'success');
    } catch (err) {
      setAuthError(err.message);
      addLog('AUTH', `Authentication failed: ${err.message}`, 'error');
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
      addLog('AUTH', 'User signed out', 'info');
      setCurrentUser(null);
      setMyRequests([]);
      setMentorQueue([]);
      setActiveView('landing');
    } catch (err) {
      addLog('AUTH', `Logout error: ${err.message}`, 'error');
    }
  };

  const handleCreateRequest = async (e) => {
    e.preventDefault();
    setRequestSubmitting(true);
    setRequestError(null);
    setRequestSuccess(null);

    try {
      const res = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(requestForm),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error || 'Failed to submit help request.');
      }

      setRequestSuccess(`Request added to queue. Position: #${data.request.queuePosition}`);
      setRequestForm({ topic: '', description: '', codeSnippet: '' });
      addLog('QUEUE', `Created help request: "${data.request.topic}"`, 'success');
      fetchMyRequests();
    } catch (err) {
      setRequestError(err.message);
      addLog('QUEUE', `Request creation failed: ${err.message}`, 'error');
    } finally {
      setRequestSubmitting(false);
    }
  };

  const handleCancelRequest = async (requestId) => {
    if (!window.confirm('Are you sure you want to cancel this waiting request?')) return;
    try {
      const res = await fetch(`/api/requests/${requestId}/cancel`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error || 'Failed to cancel request.');
      }
      addLog('QUEUE', `Cancelled request ${requestId}`, 'info');
      fetchMyRequests();
    } catch (err) {
      alert(`Could not cancel request: ${err.message}`);
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
        throw new Error(data.message || 'Unable to claim request.');
      }
      addLog('QUEUE', `Claimed request: "${data.request.topic}"`, 'success');
      fetchQueue();
    } catch (err) {
      setQueueActionError(err.message);
      addLog('QUEUE', `Claim failed: ${err.message}`, 'error');
      fetchQueue();
    }
  };

  const handleUpdateStatus = async (requestId, targetStatus) => {
    setQueueActionError(null);
    try {
      const res = await fetch(`/api/requests/${requestId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: targetStatus }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Failed to update request status.');
      }
      addLog('QUEUE', `Request status updated to "${targetStatus}"`, 'success');
      fetchQueue();
    } catch (err) {
      setQueueActionError(err.message);
      addLog('QUEUE', `Status update error: ${err.message}`, 'error');
    }
  };

  const handlePingSocket = () => {
    if (!socketRef.current || !socketConnected) {
      addLog('SOCKET', 'Socket ping unavailable: not connected', 'warn');
      return;
    }
    const clientTimestamp = performance.now();
    socketRef.current.emit('system:ping', { clientTimestamp });
  };

  // Student partition
  const activeStudentRequest = myRequests.find((r) => ['waiting', 'claimed', 'in_progress'].includes(r.status));
  const pastStudentRequests = myRequests.filter((r) => ['resolved', 'cancelled'].includes(r.status));

  // Mentor partition
  const waitingQueue = mentorQueue.filter((r) => r.status === 'waiting');
  const myAssignedRequests = mentorQueue.filter(
    (r) =>
      ['claimed', 'in_progress'].includes(r.status) &&
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
        onOpenAuth={(mode) => {
          setAuthModalMode(mode);
          setAuthModalOpen(true);
        }}
        onLogout={handleLogout}
      />

      {activeView === 'landing' ? (
        <>
          <main>
            <LandingHero
              currentUser={currentUser}
              onOpenAuth={(mode) => {
                setAuthModalMode(mode);
                setAuthModalOpen(true);
              }}
              onEnterWorkspace={() => setActiveView('workspace')}
            />

            <div id="lifecycle" className="landing-workflows-wrapper">
              <section className="landing-section">
                <div className="section-meta-header">
                  <span className="section-index font-mono">01 // LIFECYCLE ARCHITECTURE</span>
                  <h2 className="section-headline">FROM SIGNAL EMISSION TO RESOLUTION</h2>
                  <p className="section-subtext">
                    The signature carrier wave: trace a student blocker through the 5 deterministic phases of laboratory assistance.
                  </p>
                </div>
                <SignalVisualizer />
              </section>
            </div>

            <LandingWorkflows
              onOpenAuth={(mode) => {
                setAuthModalMode(mode);
                setAuthModalOpen(true);
              }}
            />
          </main>
          <Footer onOpenDiagnostics={() => setActiveView('diagnostics')} />
        </>
      ) : (
        <>
          {/* Subnav for Switching Views */}
          <nav className="sub-nav">
            <div className="nav-tabs">
              <button
                type="button"
                className={`nav-tab-btn ${activeTab === 'workbench' ? 'active' : ''}`}
                onClick={() => setActiveTab('workbench')}
              >
                {currentUser?.role === 'mentor' ? 'Queue Desk' : 'Help Desk'}
              </button>
              <button
                type="button"
                className={`nav-tab-btn ${activeTab === 'diagnostics' ? 'active' : ''}`}
                onClick={() => setActiveTab('diagnostics')}
              >
                Diagnostics
              </button>
            </div>

            {currentUser?.role === 'student' && activeStudentRequest && (
              <div className="status-pill waiting">
                Active Request: #{activeStudentRequest.queuePosition || 1}
              </div>
            )}

            {currentUser?.role === 'mentor' && (
              <div className="status-pill waiting">
                {waitingQueue.length} Waiting in Queue
              </div>
            )}
          </nav>

          {/* Main Workspace Body */}
          <main className="page-container">
        {activeTab === 'workbench' ? (
          authLoading ? (
            <div className="empty-box" style={{ margin: '64px auto', maxWidth: '400px' }}>
              <div className="empty-box-title">Loading session...</div>
            </div>
          ) : !currentUser ? (
            /* ----------------------------------------------------------------- */
            /* UNAUTHENTICATED AUTH VIEW                                         */
            /* ----------------------------------------------------------------- */
            <div className="auth-wrapper">
              <div className="section-card">
                <div className="auth-header-toggle">
                  <button
                    type="button"
                    className={`auth-toggle-btn ${authMode === 'login' ? 'active' : ''}`}
                    onClick={() => {
                      setAuthMode('login');
                      setAuthError(null);
                    }}
                  >
                    Sign In
                  </button>
                  <button
                    type="button"
                    className={`auth-toggle-btn ${authMode === 'register' ? 'active' : ''}`}
                    onClick={() => {
                      setAuthMode('register');
                      setAuthError(null);
                    }}
                  >
                    Register Student Account
                  </button>
                </div>

                <div className="section-card-body">
                  {authError && <div className="alert-banner error">{authError}</div>}
                  {authSuccess && <div className="alert-banner success">{authSuccess}</div>}

                  <form onSubmit={handleAuthSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {authMode === 'register' && (
                      <div className="form-group">
                        <label className="form-label" htmlFor="auth-name">
                          Full Name
                        </label>
                        <input
                          id="auth-name"
                          type="text"
                          className="form-input"
                          placeholder="e.g. Ronak Yadav"
                          required
                          value={authForm.name}
                          onChange={(e) => setAuthForm({ ...authForm, name: e.target.value })}
                          disabled={authSubmitting}
                        />
                        <span className="form-hint">2 to 60 characters</span>
                      </div>
                    )}

                    <div className="form-group">
                      <label className="form-label" htmlFor="auth-email">
                        Academic Email
                      </label>
                      <input
                        id="auth-email"
                        type="email"
                        className="form-input"
                        placeholder="student@scaler.com"
                        required
                        value={authForm.email}
                        onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })}
                        disabled={authSubmitting}
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label" htmlFor="auth-password">
                        Password
                      </label>
                      <input
                        id="auth-password"
                        type="password"
                        className="form-input"
                        placeholder="Minimum 8 characters"
                        required
                        value={authForm.password}
                        onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
                        disabled={authSubmitting}
                      />
                    </div>

                    <div style={{ marginTop: '6px' }}>
                      <button
                        type="submit"
                        className="btn btn-primary"
                        style={{ width: '100%' }}
                        disabled={authSubmitting}
                      >
                        {authSubmitting
                          ? 'Processing...'
                          : authMode === 'login'
                          ? 'Sign In'
                          : 'Create Student Account'}
                      </button>
                    </div>
                  </form>

                  <div className="form-hint" style={{ marginTop: '8px', lineHeight: 1.5 }}>
                    Mentor privileges cannot be self-selected during registration. Accounts can be promoted by an administrator via the CLI utility.
                  </div>
                </div>
              </div>
            </div>
          ) : currentUser.role === 'student' ? (
            /* ----------------------------------------------------------------- */
            /* STUDENT HELP DESK                                                 */
            /* ----------------------------------------------------------------- */
            <>
              <div className="page-header">
                <h1 className="page-heading">Student Help Desk</h1>
                <p className="page-subheading">
                  Submit doubt requests to receive one-on-one assistance from lab mentors. Track your real-time position in the FIFO queue below.
                </p>
              </div>

              <div className="workspace-grid">
                {/* Left Column: Active Tracker & Submit Request Form */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  {/* Active Request Tracker */}
                  {activeStudentRequest ? (
                    <div className="active-tracker">
                      <div
                        className={`active-tracker-banner ${activeStudentRequest.status}`}
                      >
                        <span>
                          {activeStudentRequest.status === 'waiting' &&
                            `WAITING IN QUEUE — POSITION #${activeStudentRequest.queuePosition || 1}`}
                          {activeStudentRequest.status === 'claimed' && 'CLAIMED BY MENTOR'}
                          {activeStudentRequest.status === 'in_progress' && 'ACTIVE SESSION IN PROGRESS'}
                        </span>
                        {activeStudentRequest.status === 'waiting' && (
                          <button
                            type="button"
                            className="btn btn-danger"
                            onClick={() => handleCancelRequest(activeStudentRequest._id)}
                          >
                            Cancel Request
                          </button>
                        )}
                      </div>

                      <div className="active-tracker-content">
                        <div className="tracker-title">{activeStudentRequest.topic}</div>
                        <div className="tracker-desc">{activeStudentRequest.description}</div>

                        {activeStudentRequest.codeSnippet && (
                          <div>
                            <div className="form-label" style={{ marginBottom: '6px' }}>
                              Code / Error Details
                            </div>
                            <pre className="code-box">{activeStudentRequest.codeSnippet}</pre>
                          </div>
                        )}

                        <div className="tracker-meta-bar">
                          <div className="meta-item">
                            <span className="meta-label">Submitted:</span>
                            <span className="meta-value">
                              {new Date(activeStudentRequest.createdAt).toLocaleTimeString()} ({formatDuration(activeStudentRequest.createdAt)} wait)
                            </span>
                          </div>

                          {activeStudentRequest.mentor && (
                            <div className="meta-item">
                              <span className="meta-label">Assigned Mentor:</span>
                              <span className="meta-value">
                                {activeStudentRequest.mentor.name} ({activeStudentRequest.mentor.email})
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {/* Create Request Form */}
                  <div className="section-card">
                    <div className="section-card-header">
                      <span className="section-card-title">
                        {activeStudentRequest ? 'Submit Another Request' : 'Request Mentor Assistance'}
                      </span>
                    </div>

                    <div className="section-card-body">
                      {requestError && <div className="alert-banner error">{requestError}</div>}
                      {requestSuccess && <div className="alert-banner success">{requestSuccess}</div>}

                      <form onSubmit={handleCreateRequest} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                        <div className="form-group">
                          <label className="form-label" htmlFor="req-topic">
                            Topic / Category
                          </label>
                          <input
                            id="req-topic"
                            type="text"
                            className="form-input"
                            placeholder="e.g. Memory leak in Node.js event listener"
                            required
                            value={requestForm.topic}
                            onChange={(e) => setRequestForm({ ...requestForm, topic: e.target.value })}
                            disabled={requestSubmitting}
                          />
                          <span className="form-hint">Brief summary of the issue (2 to 100 characters)</span>
                        </div>

                        <div className="form-group">
                          <label className="form-label" htmlFor="req-desc">
                            Problem Description
                          </label>
                          <textarea
                            id="req-desc"
                            className="form-textarea"
                            placeholder="Explain what is failing, expected behavior, and steps you have already tried..."
                            required
                            value={requestForm.description}
                            onChange={(e) => setRequestForm({ ...requestForm, description: e.target.value })}
                            disabled={requestSubmitting}
                          />
                          <span className="form-hint">Provide enough context for the mentor to understand the blocker</span>
                        </div>

                        <div className="form-group">
                          <label className="form-label" htmlFor="req-code">
                            Code Snippet / Terminal Output (Optional)
                          </label>
                          <textarea
                            id="req-code"
                            className="form-textarea font-mono"
                            placeholder="Paste relevant snippet, error message, or stack trace here..."
                            value={requestForm.codeSnippet}
                            onChange={(e) => setRequestForm({ ...requestForm, codeSnippet: e.target.value })}
                            disabled={requestSubmitting}
                          />
                        </div>

                        <div style={{ marginTop: '4px' }}>
                          <button type="submit" className="btn btn-primary" disabled={requestSubmitting}>
                            {requestSubmitting ? 'Submitting to Queue...' : 'Submit Help Request'}
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>
                </div>

                {/* Right Column: Resolution History */}
                <div className="section-card">
                  <div className="section-card-header">
                    <span className="section-card-title">My Request History</span>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={fetchMyRequests}
                      disabled={myRequestsLoading}
                    >
                      {myRequestsLoading ? 'Updating...' : 'Refresh'}
                    </button>
                  </div>

                  <div className="section-card-body" style={{ padding: 0 }}>
                    {pastStudentRequests.length === 0 ? (
                      <div className="empty-box" style={{ border: 'none', margin: '20px' }}>
                        <div className="empty-box-title">No completed requests</div>
                        <div className="empty-box-desc">
                          Past resolved or cancelled doubt sessions will appear here for your reference.
                        </div>
                      </div>
                    ) : (
                      <div style={{ overflowX: 'auto' }}>
                        <table className="history-table">
                          <thead>
                            <tr>
                              <th>Status</th>
                              <th>Topic</th>
                              <th>Mentor</th>
                              <th>Date</th>
                            </tr>
                          </thead>
                          <tbody>
                            {pastStudentRequests.map((req) => (
                              <tr key={req._id}>
                                <td>
                                  <span className={`status-pill ${req.status}`}>{req.status}</span>
                                </td>
                                <td>
                                  <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{req.topic}</div>
                                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {req.description}
                                  </div>
                                </td>
                                <td>
                                  <span style={{ color: 'var(--text-secondary)' }}>
                                    {req.mentor?.name || '—'}
                                  </span>
                                </td>
                                <td>
                                  <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                                    {new Date(req.updatedAt).toLocaleDateString()}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          ) : (
            /* ----------------------------------------------------------------- */
            /* MENTOR QUEUE DESK                                                 */
            /* ----------------------------------------------------------------- */
            <>
              <div className="page-header">
                <h1 className="page-heading">Mentor Queue Desk</h1>
                <p className="page-subheading">
                  Students waiting for lab guidance appear in FIFO queue order. Claim a waiting ticket to open a session and mark it resolved upon completion.
                </p>
              </div>

              {queueActionError && (
                <div className="alert-banner error" style={{ marginBottom: '20px' }}>
                  {queueActionError}
                </div>
              )}

              <div className="workspace-grid equal">
                {/* Left Column: Waiting Queue (FIFO) */}
                <div className="section-card">
                  <div className="section-card-header">
                    <span className="section-card-title">
                      Waiting Queue ({waitingQueue.length})
                    </span>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={fetchQueue}
                      disabled={mentorQueueLoading}
                    >
                      {mentorQueueLoading ? 'Refreshing...' : 'Re-sync'}
                    </button>
                  </div>

                  <div className="section-card-body">
                    {waitingQueue.length === 0 ? (
                      <div className="empty-box">
                        <div className="empty-box-title">Queue is clear</div>
                        <div className="empty-box-desc">
                          No students are currently waiting for assistance. New requests will appear automatically.
                        </div>
                      </div>
                    ) : (
                      <div className="queue-list">
                        {waitingQueue.map((req, idx) => (
                          <div key={req._id} className="queue-item">
                            <div className="queue-item-header">
                              <div>
                                <span className="status-pill waiting" style={{ marginRight: '8px' }}>
                                  #{req.queuePosition || idx + 1} in queue
                                </span>
                                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                  Submitted by {req.student?.name || 'Student'} ({new Date(req.createdAt).toLocaleTimeString()}) · {formatDuration(req.createdAt)} wait
                                </span>
                              </div>
                              <button
                                type="button"
                                className="btn btn-primary"
                                onClick={() => handleClaimRequest(req._id)}
                              >
                                Claim Request
                              </button>
                            </div>

                            <div className="queue-item-title">{req.topic}</div>
                            <div className="queue-item-desc">{req.description}</div>

                            {req.codeSnippet && (
                              <pre className="code-box">{req.codeSnippet}</pre>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Column: Assigned Sessions & Colleague Activity */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  {/* My Active Sessions */}
                  <div className="section-card">
                    <div className="section-card-header">
                      <span className="section-card-title">
                        My Active Sessions ({myAssignedRequests.length})
                      </span>
                    </div>

                    <div className="section-card-body">
                      {myAssignedRequests.length === 0 ? (
                        <div className="empty-box">
                          <div className="empty-box-title">No assigned sessions</div>
                          <div className="empty-box-desc">
                            Claim a request from the waiting queue to begin assisting a student.
                          </div>
                        </div>
                      ) : (
                        <div className="queue-list">
                          {myAssignedRequests.map((req) => (
                            <div key={req._id} className="queue-item" style={{ borderColor: 'var(--border-focus)' }}>
                              <div className="queue-item-header">
                                <div>
                                  <span className={`status-pill ${req.status}`} style={{ marginRight: '8px' }}>
                                    {req.status === 'in_progress' ? 'In Session' : 'Claimed'}
                                  </span>
                                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                    {req.student?.name} ({req.student?.email}) · {formatDuration(req.updatedAt || req.createdAt)}
                                  </span>
                                </div>

                                <div>
                                  {req.status === 'claimed' && (
                                    <button
                                      type="button"
                                      className="btn btn-primary"
                                      onClick={() => handleUpdateStatus(req._id, 'in_progress')}
                                    >
                                      Start Session
                                    </button>
                                  )}
                                  {req.status === 'in_progress' && (
                                    <button
                                      type="button"
                                      className="btn btn-primary"
                                      onClick={() => handleUpdateStatus(req._id, 'resolved')}
                                    >
                                      Mark Resolved
                                    </button>
                                  )}
                                </div>
                              </div>

                              <div className="queue-item-title">{req.topic}</div>
                              <div className="queue-item-desc">{req.description}</div>

                              {req.codeSnippet && (
                                <pre className="code-box">{req.codeSnippet}</pre>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Other Mentors' Active Sessions */}
                  {otherActiveRequests.length > 0 && (
                    <div className="section-card">
                      <div className="section-card-header">
                        <span className="section-card-title" style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                          Sessions Handled by Colleagues ({otherActiveRequests.length})
                        </span>
                      </div>

                      <div className="section-card-body">
                        <div className="queue-list">
                          {otherActiveRequests.map((req) => (
                            <div key={req._id} className="queue-item" style={{ opacity: 0.85 }}>
                              <div className="queue-item-header">
                                <span className={`status-pill ${req.status}`}>
                                  {req.status === 'in_progress' ? 'In Session' : 'Claimed'}
                                </span>
                                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                                  Mentor: {req.mentor?.name || 'Colleague'}
                                </span>
                              </div>
                              <div className="queue-item-title" style={{ fontSize: '13px' }}>
                                {req.topic}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )
        ) : (
          /* ----------------------------------------------------------------- */
          /* SECONDARY SYSTEM DIAGNOSTICS VIEW                                 */
          /* ----------------------------------------------------------------- */
          <div className="diagnostics-panel">
            <div className="page-header">
              <h1 className="page-heading">System Diagnostics</h1>
              <p className="page-subheading">
                Operational verification of API endpoints, database persistence, and Socket.IO real-time channels.
              </p>
            </div>

            <div className="workspace-grid equal">
              {/* Left Column: Subsystem Status */}
              <div className="section-card">
                <div className="section-card-header">
                  <span className="section-card-title">Subsystems &amp; Connectivity</span>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      type="button"
                      className="btn"
                      onClick={fetchHealth}
                      disabled={healthLoading}
                    >
                      {healthLoading ? 'Checking...' : 'Check /api/health'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={handlePingSocket}
                      disabled={!socketConnected}
                    >
                      Ping Socket
                    </button>
                  </div>
                </div>

                <div className="section-card-body" style={{ padding: 0 }}>
                  <div style={{ overflowX: 'auto' }}>
                    <table className="diag-table">
                      <thead>
                        <tr>
                          <th>Subsystem</th>
                          <th>Endpoint / Channel</th>
                          <th>Status</th>
                          <th>Telemetry</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td style={{ fontWeight: 600 }}>HTTP Server</td>
                          <td>GET /api/health</td>
                          <td>
                            <span className={`status-pill ${healthError ? 'cancelled' : 'claimed'}`}>
                              {healthError ? 'Error' : healthData ? 'Ready' : 'Checking'}
                            </span>
                          </td>
                          <td>{healthLatency !== null ? `${healthLatency}ms` : '—'}</td>
                        </tr>

                        <tr>
                          <td style={{ fontWeight: 600 }}>Database</td>
                          <td>MongoDB Atlas</td>
                          <td>
                            <span
                              className={`status-pill ${
                                healthData?.database?.connected ? 'claimed' : 'waiting'
                              }`}
                            >
                              {healthData?.database?.connected ? 'Connected' : 'Disconnected'}
                            </span>
                          </td>
                          <td>{healthData?.database?.status || 'Unknown'}</td>
                        </tr>

                        <tr>
                          <td style={{ fontWeight: 600 }}>Socket.IO Gateway</td>
                          <td>Websocket / Polling</td>
                          <td>
                            <span className={`status-pill ${socketConnected ? 'claimed' : 'waiting'}`}>
                              {socketConnected ? 'Online' : 'Offline'}
                            </span>
                          </td>
                          <td>
                            {socketConnected
                              ? `${socketTransport || 'ws'} [${socketId?.substring(0, 6)}...] ${
                                  socketPingLatency !== null ? `(${socketPingLatency}ms)` : ''
                                }`
                              : 'Awaiting connection'}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <div style={{ padding: '14px 18px', borderTop: '1px solid var(--border-default)', fontSize: '12px', color: 'var(--text-muted)' }}>
                    Last health probe: {lastChecked || 'Not polled in this view yet'}
                  </div>
                </div>
              </div>

              {/* Right Column: Telemetry Event Stream */}
              <div className="section-card">
                <div className="section-card-header">
                  <span className="section-card-title">Live Telemetry Events</span>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setTelemetryLogs([])}
                  >
                    Clear Log
                  </button>
                </div>

                <div className="section-card-body" style={{ maxHeight: '420px', overflowY: 'auto' }}>
                  {telemetryLogs.length === 0 ? (
                    <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                      No events logged in this session.
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
                      {telemetryLogs.map((log) => (
                        <div key={log.id} style={{ display: 'flex', gap: '8px' }}>
                          <span style={{ color: 'var(--text-muted)' }}>{log.timestamp}</span>
                          <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>[{log.source}]</span>
                          <span style={{ color: log.level === 'error' ? 'var(--accent-red)' : log.level === 'success' ? 'var(--accent-green)' : 'var(--text-primary)' }}>
                            {log.message}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  )}

  {/* Accessible Authentication Modal */}
  <AuthModal
    isOpen={authModalOpen}
    initialMode={authModalMode}
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
