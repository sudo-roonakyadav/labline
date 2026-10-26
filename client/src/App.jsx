import { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import Navbar from './components/Navbar.jsx';
import LandingHero from './components/LandingHero.jsx';
import SignalVisualizer from './components/SignalVisualizer.jsx';
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
  // Primary View Mode: 'landing' | 'workspace' | 'diagnostics'
  const [activeView, setActiveView] = useState('landing');
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState('login');
  const [authModalAccountType, setAuthModalAccountType] = useState(null);

  const handleOpenAuth = (mode = 'login', accountType = null) => {
    setAuthModalMode(mode);
    setAuthModalAccountType(accountType);
    setAuthModalOpen(true);
  };

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
  const [requestSubmitting, setRequestSubmitting] = useState(false);
  const [requestError, setRequestError] = useState(null);
  const [requestSuccess, setRequestSuccess] = useState(null);

  // Mentor Queue State
  const [mentorQueue, setMentorQueue] = useState([]);
  const [mentorQueueLoading, setMentorQueueLoading] = useState(false);
  const [queueActionError, setQueueActionError] = useState(null);
  const [queueIntelligence, setQueueIntelligence] = useState(null);

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
      fetchQueueIntelligence();
    } else {
      setMyRequests([]);
      setMentorQueue([]);
    }
  }, [userKey, fetchMyRequests, fetchQueue, fetchQueueIntelligence]);

  // If user opens diagnostics tab and healthData is missing, fetch once
  useEffect(() => {
    if (activeView === 'diagnostics' && !healthData && !healthLoading) {
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

      setRequestSuccess(`Signal transmitted. Position in pipeline: #${data.request.queuePosition}`);
      addLog('QUEUE', `Created help request: "${data.request.topic}" [${category}]`, 'success');
      fetchMyRequests();
      return true;
    } catch (err) {
      setRequestError(err.message);
      addLog('QUEUE', `Request creation failed: ${err.message}`, 'error');
      return false;
    } finally {
      setRequestSubmitting(false);
    }
  };

  const handleCancelRequest = async (requestId) => {
    if (!window.confirm('Are you sure you want to cancel this waiting signal?')) return;
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
      addLog('FEEDBACK', `Recorded session outcome feedback: ★ ${rating}/5`, 'success');
      fetchMyRequests();
      return true;
    } catch (err) {
      addLog('FEEDBACK', `Feedback failed: ${err.message}`, 'error');
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
        throw new Error(data.message || 'Unable to claim signal.');
      }
      addLog('QUEUE', `Claimed signal: "${data.request.topic}"`, 'success');
      fetchQueue();
    } catch (err) {
      setQueueActionError(err.message);
      addLog('QUEUE', `Claim failed: ${err.message}`, 'error');
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
      addLog('QUEUE', `Signal status updated to "${targetStatus}"`, 'success');
      fetchQueue();
      return true;
    } catch (err) {
      setQueueActionError(err.message);
      addLog('QUEUE', `Status update error: ${err.message}`, 'error');
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
      addLog('MENTOR', `Availability set to ${isAvailable ? 'available' : 'away'}`, 'info');
      fetchQueue();
    } catch (err) {
      setQueueActionError(err.message);
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

            <LandingWorkflows onOpenAuth={handleOpenAuth} />
          </main>
          <Footer onOpenDiagnostics={() => setActiveView('diagnostics')} />
        </>
      ) : activeView === 'diagnostics' ? (
        <main className="page-container">
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
        </main>
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
                  <span>00 // OPERATIONAL GATEWAY</span>
                </div>
                <div className="section-card-body" style={{ padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center' }}>
                  <div style={{ fontSize: '28px' }}>⚡</div>
                  <h2 className="font-display" style={{ fontSize: '20px', color: 'var(--color-warm-white)' }}>
                    Authentication Required
                  </h2>
                  <p style={{ fontSize: '13px', color: 'var(--color-neutral)', lineHeight: 1.5 }}>
                    Please sign in or register to access your personal Signal Desk or Mentor Radar Desk.
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
                      Register →
                    </button>
                  </div>
                  <button
                    type="button"
                    className="font-mono"
                    style={{ background: 'transparent', border: 'none', color: 'var(--color-neutral-muted)', fontSize: '11px', cursor: 'pointer', marginTop: '6px' }}
                    onClick={() => setActiveView('landing')}
                  >
                    ← Return to Landing Overview
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
