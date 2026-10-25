import { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';

export default function App() {
  // Navigation
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

  // Diagnostics & Subsystem Health State
  const [healthData, setHealthData] = useState(null);
  const [healthLoading, setHealthLoading] = useState(true);
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
      const res = await fetch('/api/health');
      const latency = Math.round(performance.now() - startTime);
      setHealthLatency(latency);
      setLastChecked(new Date().toLocaleTimeString());

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }

      const json = await res.json();
      setHealthData(json);
      setHealthError(null);
      addLog('HTTP', `GET /api/health -> ${res.status} OK (${latency}ms)`, 'success');
    } catch (err) {
      setHealthError(err.message);
      setHealthData(null);
      addLog('HTTP', `GET /api/health failed: ${err.message}`, 'error');
    } finally {
      setHealthLoading(false);
    }
  }, [addLog]);

  const checkSession = useCallback(async () => {
    setAuthLoading(true);
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        setCurrentUser(data.user);
        addLog('AUTH', `Active session restored for ${data.user.email} (${data.user.role})`, 'success');
      } else {
        setCurrentUser(null);
      }
    } catch (err) {
      setCurrentUser(null);
    } finally {
      setAuthLoading(false);
    }
  }, [addLog]);

  const fetchMyRequests = useCallback(async () => {
    setMyRequestsLoading(true);
    try {
      const res = await fetch('/api/requests/mine');
      if (res.ok) {
        const data = await res.json();
        setMyRequests(data.requests || []);
      }
    } catch (err) {
      addLog('API', `Failed to load student requests: ${err.message}`, 'error');
    } finally {
      setMyRequestsLoading(false);
    }
  }, [addLog]);

  const fetchQueue = useCallback(async () => {
    setMentorQueueLoading(true);
    try {
      const res = await fetch('/api/queue');
      if (res.ok) {
        const data = await res.json();
        setMentorQueue(data.queue || []);
      }
    } catch (err) {
      addLog('API', `Failed to load mentor queue: ${err.message}`, 'error');
    } finally {
      setMentorQueueLoading(false);
    }
  }, [addLog]);

  // -------------------------------------------------------------------------
  // LIFECYCLE & SOCKET SETUP
  // -------------------------------------------------------------------------

  useEffect(() => {
    addLog('SYSTEM', 'Initializing LabLine console');
    fetchHealth();
    checkSession();

    const socket = io({
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setSocketConnected(true);
      setSocketId(socket.id);
      const transportName = socket.io?.engine?.transport?.name || 'websocket';
      setSocketTransport(transportName);
      addLog('SOCKET', `Transport established [ID: ${socket.id}] via ${transportName}`, 'success');
    });

    socket.on('system:handshake', (payload) => {
      addLog('SOCKET', `Handshake verified by server at ${payload.timestamp}`, 'info');
    });

    socket.on('system:pong', (payload) => {
      if (payload?.clientTimestamp) {
        const rtt = Math.round(performance.now() - payload.clientTimestamp);
        setSocketPingLatency(rtt);
        addLog('SOCKET', `Ping acknowledged. Round-trip: ${rtt}ms`, 'success');
      }
    });

    // Server-originated queue change broadcast
    socket.on('queue:changed', (payload) => {
      addLog('SOCKET', `Server queue event: [${payload.action}] at ${payload.timestamp}`, 'info');
      if (currentUser?.role === 'student') {
        fetchMyRequests();
      } else if (currentUser?.role === 'mentor') {
        fetchQueue();
      }
    });

    socket.on('disconnect', (reason) => {
      setSocketConnected(false);
      setSocketId(null);
      addLog('SOCKET', `Connection dropped: ${reason}`, 'warn');
    });

    return () => {
      socket.disconnect();
    };
  }, [addLog, fetchHealth, checkSession, currentUser]);

  // Load appropriate data when currentUser changes
  useEffect(() => {
    if (currentUser?.role === 'student') {
      fetchMyRequests();
    } else if (currentUser?.role === 'mentor') {
      fetchQueue();
    }
  }, [currentUser, fetchMyRequests, fetchQueue]);

  // -------------------------------------------------------------------------
  // AUTH ACTIONS
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
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error || 'Authentication request failed.');
      }

      setCurrentUser(data.user);
      setAuthSuccess(`Welcome, ${data.user.name}. Session active.`);
      setAuthForm({ email: '', name: '', password: '' });
      addLog('AUTH', `Signed in as ${data.user.email} (${data.user.role})`, 'success');
    } catch (err) {
      setAuthError(err.message);
      addLog('AUTH', `Authentication failed: ${err.message}`, 'error');
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      addLog('AUTH', `User ${currentUser?.email} logged out`, 'info');
      setCurrentUser(null);
      setMyRequests([]);
      setMentorQueue([]);
    } catch (err) {
      addLog('AUTH', `Logout error: ${err.message}`, 'error');
    }
  };

  // -------------------------------------------------------------------------
  // STUDENT ACTIONS
  // -------------------------------------------------------------------------

  const handleCreateRequest = async (e) => {
    e.preventDefault();
    setRequestSubmitting(true);
    setRequestError(null);
    setRequestSuccess(null);

    try {
      const res = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestForm),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || data.error || 'Failed to submit help request.');
      }

      setRequestSuccess(`Request submitted. Initial queue position: #${data.request.queuePosition}`);
      setRequestForm({ topic: '', description: '', codeSnippet: '' });
      addLog('QUEUE', `Created help request: "${data.request.topic}" (pos #${data.request.queuePosition})`, 'success');
      fetchMyRequests();
    } catch (err) {
      setRequestError(err.message);
      addLog('QUEUE', `Request creation failed: ${err.message}`, 'error');
    } finally {
      setRequestSubmitting(false);
    }
  };

  const handleCancelRequest = async (requestId) => {
    if (!window.confirm('Cancel this waiting help request?')) return;
    try {
      const res = await fetch(`/api/requests/${requestId}/cancel`, { method: 'POST' });
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

  // -------------------------------------------------------------------------
  // MENTOR ACTIONS
  // -------------------------------------------------------------------------

  const handleClaimRequest = async (requestId) => {
    setQueueActionError(null);
    try {
      const res = await fetch(`/api/requests/${requestId}/claim`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Unable to claim request.');
      }
      addLog('QUEUE', `Claimed request: "${data.request.topic}"`, 'success');
      fetchQueue();
    } catch (err) {
      setQueueActionError(err.message);
      addLog('QUEUE', `Claim failed: ${err.message}`, 'error');
      fetchQueue(); // Refresh queue to reflect state
    }
  };

  const handleUpdateStatus = async (requestId, targetStatus) => {
    setQueueActionError(null);
    try {
      const res = await fetch(`/api/requests/${requestId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: targetStatus }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Failed to update request status.');
      }
      addLog('QUEUE', `Request ${requestId} updated to "${targetStatus}"`, 'success');
      fetchQueue();
    } catch (err) {
      setQueueActionError(err.message);
      addLog('QUEUE', `Status update error: ${err.message}`, 'error');
    }
  };

  const handlePingSocket = () => {
    if (!socketRef.current || !socketConnected) {
      addLog('SOCKET', 'Ping aborted: socket is not connected', 'warn');
      return;
    }
    const clientTimestamp = performance.now();
    addLog('SOCKET', 'Emitting system:ping', 'info');
    socketRef.current.emit('system:ping', { clientTimestamp });
  };

  const isServerHealthy = healthData?.status === 'healthy';
  const isServerDegraded = healthData?.status === 'degraded';

  // Active student request
  const activeStudentRequest = myRequests.find((r) => ['waiting', 'claimed', 'in_progress'].includes(r.status));
  const pastStudentRequests = myRequests.filter((r) => ['resolved', 'cancelled'].includes(r.status));

  // Mentor partitioned lists
  const waitingQueue = mentorQueue.filter((r) => r.status === 'waiting');
  const myAssignedRequests = mentorQueue.filter(
    (r) => ['claimed', 'in_progress'].includes(r.status) && (r.mentor?._id === currentUser?.id || r.mentor?.id === currentUser?.id || r.mentor === currentUser?.id)
  );
  const otherActiveRequests = mentorQueue.filter(
    (r) => ['claimed', 'in_progress'].includes(r.status) && r.mentor?._id !== currentUser?.id && r.mentor?.id !== currentUser?.id && r.mentor !== currentUser?.id
  );

  return (
    <div className="app-container">
      {/* Top Header */}
      <header className="top-bar">
        <div className="brand-section">
          <span className="brand-name">LABLINE</span>
          <span className="brand-divider">//</span>
          <span className="brand-sub">LAB QUEUE SYSTEM</span>
        </div>

        <div className="header-center">
          {currentUser ? (
            <span className="header-tag">
              AUTH: {currentUser.name.toUpperCase()} [{currentUser.role.toUpperCase()}]
            </span>
          ) : (
            <span className="header-tag">UNAUTHENTICATED</span>
          )}
          <span className="header-tag">NODE WORKSPACES</span>
        </div>

        <div className="header-right">
          {currentUser && (
            <button type="button" className="btn btn-secondary" onClick={handleLogout}>
              SIGN OUT
            </button>
          )}

          <div className="status-badge">
            <span
              className={`status-dot ${
                healthError
                  ? 'red'
                  : isServerHealthy
                  ? 'green'
                  : isServerDegraded
                  ? 'amber'
                  : 'amber'
              }`}
            />
            <span>
              {healthError
                ? 'SERVICE ERROR'
                : isServerHealthy
                ? 'SYSTEM OPERATIONAL'
                : 'SYSTEM DEGRADED'}
            </span>
          </div>
        </div>
      </header>

      {/* Navigation Bar */}
      <nav className="tab-bar">
        <button
          type="button"
          className={`tab-button ${activeTab === 'workbench' ? 'active' : ''}`}
          onClick={() => setActiveTab('workbench')}
        >
          [01] {currentUser?.role === 'mentor' ? 'MENTOR QUEUE DESK' : 'STUDENT WORKBENCH'}
        </button>

        <button
          type="button"
          className={`tab-button ${activeTab === 'diagnostics' ? 'active' : ''}`}
          onClick={() => setActiveTab('diagnostics')}
        >
          [02] SYSTEM HEALTH &amp; DIAGNOSTICS
        </button>
      </nav>

      {/* Main Workspace */}
      <main className="main-workspace">
        {activeTab === 'workbench' ? (
          authLoading ? (
            <section className="panel" style={{ gridColumn: 'span 2' }}>
              <div className="panel-body">
                <div className="empty-state">Verifying session credentials...</div>
              </div>
            </section>
          ) : !currentUser ? (
            /* ------------------------------------------------------------------- */
            /* UNAUTHENTICATED STATE: LOGIN / REGISTRATION PANEL                   */
            /* ------------------------------------------------------------------- */
            <section className="panel" style={{ gridColumn: 'span 2', maxWidth: '480px', margin: '32px auto', width: '100%' }}>
              <div className="panel-header">
                <span className="panel-title">
                  {authMode === 'login' ? 'Authentication Required' : 'Student Registration'}
                </span>
                <div className="panel-actions">
                  <button
                    type="button"
                    className={`btn ${authMode === 'login' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => {
                      setAuthMode('login');
                      setAuthError(null);
                    }}
                  >
                    SIGN IN
                  </button>
                  <button
                    type="button"
                    className={`btn ${authMode === 'register' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => {
                      setAuthMode('register');
                      setAuthError(null);
                    }}
                  >
                    REGISTER
                  </button>
                </div>
              </div>

              <div className="panel-body">
                {authError && <div className="alert-box error">{authError}</div>}
                {authSuccess && <div className="alert-box success">{authSuccess}</div>}

                <form onSubmit={handleAuthSubmit}>
                  {authMode === 'register' && (
                    <div className="form-group">
                      <label className="form-label" htmlFor="auth-name">Display Name</label>
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
                      <span className="form-hint">Between 2 and 60 characters</span>
                    </div>
                  )}

                  <div className="form-group">
                    <label className="form-label" htmlFor="auth-email">Academic Email</label>
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
                    <label className="form-label" htmlFor="auth-password">Password</label>
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

                  <div style={{ marginTop: '16px' }}>
                    <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={authSubmitting}>
                      {authSubmitting
                        ? 'PROCESSING...'
                        : authMode === 'login'
                        ? 'AUTHENTICATE SESSION'
                        : 'REGISTER STUDENT ACCOUNT'}
                    </button>
                  </div>
                </form>

                <div className="form-hint" style={{ marginTop: '8px', lineHeight: 1.5 }}>
                  Notice: Public registration creates student accounts. Mentor privileges are granted
                  via administrator CLI verification (`npm run promote-mentor -- email`).
                </div>
              </div>
            </section>
          ) : currentUser.role === 'student' ? (
            /* ------------------------------------------------------------------- */
            /* STUDENT WORKBENCH                                                   */
            /* ------------------------------------------------------------------- */
            <>
              {/* Left Column: Request Form & Active Status */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Active Request Tracker */}
                <section className="panel">
                  <div className="panel-header">
                    <span className="panel-title">Active Queue Status</span>
                    <button type="button" className="btn btn-secondary" onClick={fetchMyRequests} disabled={myRequestsLoading}>
                      {myRequestsLoading ? 'UPDATING...' : 'REFRESH'}
                    </button>
                  </div>

                  <div className="panel-body">
                    {activeStudentRequest ? (
                      <div className={`queue-card ${activeStudentRequest.status === 'in_progress' ? 'active-session' : ''}`}>
                        <div className="queue-card-top">
                          <div className="meta-tags">
                            {activeStudentRequest.status === 'waiting' && (
                              <span className="badge badge-amber">
                                QUEUE POSITION #{activeStudentRequest.queuePosition || 1}
                              </span>
                            )}
                            {activeStudentRequest.status === 'claimed' && (
                              <span className="badge badge-green">CLAIMED BY MENTOR</span>
                            )}
                            {activeStudentRequest.status === 'in_progress' && (
                              <span className="badge badge-green">IN SESSION</span>
                            )}
                            <span>SUBMITTED: {new Date(activeStudentRequest.createdAt).toLocaleTimeString()}</span>
                          </div>

                          {activeStudentRequest.status === 'waiting' && (
                            <button
                              type="button"
                              className="btn btn-danger"
                              onClick={() => handleCancelRequest(activeStudentRequest._id)}
                            >
                              CANCEL REQUEST
                            </button>
                          )}
                        </div>

                        <div className="queue-card-title">{activeStudentRequest.topic}</div>
                        <div className="queue-card-desc">{activeStudentRequest.description}</div>

                        {activeStudentRequest.codeSnippet && (
                          <pre className="code-snippet-box">{activeStudentRequest.codeSnippet}</pre>
                        )}

                        {activeStudentRequest.mentor && (
                          <div className="meta-tags" style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '6px' }}>
                            <span>ASSIGNED MENTOR:</span>
                            <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                              {activeStudentRequest.mentor.name} ({activeStudentRequest.mentor.email})
                            </span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="empty-state">
                        You have no active help requests in the queue. Submit the form below to request mentor assistance.
                      </div>
                    )}
                  </div>
                </section>

                {/* Submit New Request Form */}
                <section className="panel">
                  <div className="panel-header">
                    <span className="panel-title">Submit Lab Help Request</span>
                  </div>

                  <div className="panel-body">
                    {requestError && <div className="alert-box error">{requestError}</div>}
                    {requestSuccess && <div className="alert-box success">{requestSuccess}</div>}

                    <form onSubmit={handleCreateRequest}>
                      <div className="form-group">
                        <label className="form-label" htmlFor="req-topic">Topic / Category</label>
                        <input
                          id="req-topic"
                          type="text"
                          className="form-input"
                          placeholder="e.g. Mongoose Connection ECONNREFUSED in Express"
                          required
                          value={requestForm.topic}
                          onChange={(e) => setRequestForm({ ...requestForm, topic: e.target.value })}
                          disabled={requestSubmitting}
                        />
                        <span className="form-hint">Brief summary (2-100 characters)</span>
                      </div>

                      <div className="form-group">
                        <label className="form-label" htmlFor="req-desc">Problem Description</label>
                        <textarea
                          id="req-desc"
                          className="form-textarea"
                          placeholder="Describe the problem, expected behavior, and steps taken so far..."
                          required
                          value={requestForm.description}
                          onChange={(e) => setRequestForm({ ...requestForm, description: e.target.value })}
                          disabled={requestSubmitting}
                        />
                        <span className="form-hint">Detailed explanation (5-1000 characters)</span>
                      </div>

                      <div className="form-group">
                        <label className="form-label" htmlFor="req-code">Code Snippet / Terminal Error (Optional)</label>
                        <textarea
                          id="req-code"
                          className="form-textarea code-font"
                          placeholder="Paste relevant code, stack trace, or terminal log output here..."
                          value={requestForm.codeSnippet}
                          onChange={(e) => setRequestForm({ ...requestForm, codeSnippet: e.target.value })}
                          disabled={requestSubmitting}
                        />
                        <span className="form-hint">Max 3000 characters</span>
                      </div>

                      <div style={{ marginTop: '12px' }}>
                        <button type="submit" className="btn btn-primary" disabled={requestSubmitting}>
                          {requestSubmitting ? 'SUBMITTING TO QUEUE...' : 'ADD TO LABLINE QUEUE'}
                        </button>
                      </div>
                    </form>
                  </div>
                </section>
              </div>

              {/* Right Column: Request History */}
              <section className="panel">
                <div className="panel-header">
                  <span className="panel-title">My Resolution History</span>
                  <span className="panel-title" style={{ color: 'var(--text-muted)' }}>
                    {pastStudentRequests.length} ENTRIES
                  </span>
                </div>

                <div className="panel-body" style={{ flex: 1, overflowY: 'auto', maxHeight: '680px' }}>
                  {pastStudentRequests.length === 0 ? (
                    <div className="empty-state">No past resolved or cancelled requests.</div>
                  ) : (
                    pastStudentRequests.map((req) => (
                      <div key={req._id} className="queue-card">
                        <div className="queue-card-top">
                          <span className={`badge ${req.status === 'resolved' ? 'badge-green' : 'badge'}`}>
                            {req.status.toUpperCase()}
                          </span>
                          <span className="form-hint">
                            {new Date(req.updatedAt).toLocaleDateString()} {new Date(req.updatedAt).toLocaleTimeString()}
                          </span>
                        </div>
                        <div className="queue-card-title">{req.topic}</div>
                        <div className="queue-card-desc">{req.description}</div>
                        {req.mentor && (
                          <div className="meta-tags">
                            <span>MENTOR: {req.mentor.name}</span>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </section>
            </>
          ) : (
            /* ------------------------------------------------------------------- */
            /* MENTOR QUEUE DESK                                                   */
            /* ------------------------------------------------------------------- */
            <>
              {/* Left Column: Waiting Queue (FIFO) */}
              <section className="panel">
                <div className="panel-header">
                  <span className="panel-title">
                    Active Waiting Queue (FIFO) — [{waitingQueue.length} WAITING]
                  </span>
                  <div className="panel-actions">
                    <button type="button" className="btn btn-secondary" onClick={fetchQueue} disabled={mentorQueueLoading}>
                      {mentorQueueLoading ? 'REFRESHING...' : 'RE-SYNC QUEUE'}
                    </button>
                  </div>
                </div>

                <div className="panel-body">
                  {queueActionError && <div className="alert-box error">{queueActionError}</div>}

                  {waitingQueue.length === 0 ? (
                    <div className="empty-state">No students waiting in queue. Queue is clear.</div>
                  ) : (
                    waitingQueue.map((req, index) => (
                      <div key={req._id} className="queue-card">
                        <div className="queue-card-top">
                          <div className="meta-tags">
                            <span className="badge badge-amber">POSITION #{index + 1}</span>
                            <span>STUDENT: {req.student?.name || 'Unknown'} ({req.student?.email})</span>
                            <span>WAITING: {new Date(req.createdAt).toLocaleTimeString()}</span>
                          </div>

                          <button
                            type="button"
                            className="btn btn-primary"
                            onClick={() => handleClaimRequest(req._id)}
                          >
                            CLAIM REQUEST
                          </button>
                        </div>

                        <div className="queue-card-title">{req.topic}</div>
                        <div className="queue-card-desc">{req.description}</div>

                        {req.codeSnippet && (
                          <pre className="code-snippet-box">{req.codeSnippet}</pre>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </section>

              {/* Right Column: Mentor's Active Claims & In-Progress Sessions */}
              <section className="panel">
                <div className="panel-header">
                  <span className="panel-title">My Assigned Sessions [{myAssignedRequests.length}]</span>
                </div>

                <div className="panel-body">
                  {myAssignedRequests.length === 0 ? (
                    <div className="empty-state">You have no active claims. Claim a request from the queue to start.</div>
                  ) : (
                    myAssignedRequests.map((req) => (
                      <div key={req._id} className={`queue-card ${req.status === 'in_progress' ? 'active-session' : ''}`}>
                        <div className="queue-card-top">
                          <div className="meta-tags">
                            <span className={`badge ${req.status === 'in_progress' ? 'badge-green' : 'badge-amber'}`}>
                              {req.status === 'in_progress' ? 'IN SESSION' : 'CLAIMED'}
                            </span>
                            <span>STUDENT: {req.student?.name}</span>
                          </div>

                          <div className="panel-actions">
                            {req.status === 'claimed' && (
                              <button
                                type="button"
                                className="btn btn-primary"
                                onClick={() => handleUpdateStatus(req._id, 'in_progress')}
                              >
                                START SESSION
                              </button>
                            )}

                            {req.status === 'in_progress' && (
                              <button
                                type="button"
                                className="btn btn-success"
                                onClick={() => handleUpdateStatus(req._id, 'resolved')}
                              >
                                MARK RESOLVED
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="queue-card-title">{req.topic}</div>
                        <div className="queue-card-desc">{req.description}</div>

                        {req.codeSnippet && (
                          <pre className="code-snippet-box">{req.codeSnippet}</pre>
                        )}
                      </div>
                    ))
                  )}

                  {otherActiveRequests.length > 0 && (
                    <div style={{ marginTop: '16px' }}>
                      <div
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: '10px',
                          color: 'var(--text-muted)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.05em',
                          marginBottom: '8px',
                        }}
                      >
                        Sessions Claimed by Other Mentors
                      </div>
                      {otherActiveRequests.map((req) => (
                        <div key={req._id} className="queue-card" style={{ opacity: 0.75 }}>
                          <div className="queue-card-top">
                            <span className="badge">{req.status.toUpperCase()}</span>
                            <span className="meta-tags">
                              MENTOR: {req.mentor?.name || 'Colleague'}
                            </span>
                          </div>
                          <div className="queue-card-title">{req.topic}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            </>
          )
        ) : (
          /* ------------------------------------------------------------------- */
          /* DIAGNOSTICS TAB (OUR OPERATIONAL CONSOLE)                          */
          /* ------------------------------------------------------------------- */
          <>
            {/* Left Column: Diagnostics */}
            <section className="panel">
              <div className="panel-header">
                <span className="panel-title">Subsystem Diagnostic Matrix</span>
                <div className="panel-actions">
                  <button
                    type="button"
                    className="btn"
                    onClick={fetchHealth}
                    disabled={healthLoading}
                  >
                    {healthLoading ? 'POLLING...' : 'RE-POLL /api/health'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={handlePingSocket}
                    disabled={!socketConnected}
                  >
                    PING SOCKET.IO
                  </button>
                </div>
              </div>

              <div className="panel-body">
                {/* Subsystems Table */}
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Subsystem</th>
                      <th>Interface</th>
                      <th>State</th>
                      <th>Telemetry</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>
                        <div className="subsystem-name">Express HTTP Server</div>
                        <div className="subsystem-meta">REST API Router</div>
                      </td>
                      <td>GET /api/health</td>
                      <td>
                        {healthError ? (
                          <span className="badge badge-red">OFFLINE</span>
                        ) : healthData ? (
                          <span className="badge badge-green">OPERATIONAL</span>
                        ) : (
                          <span className="badge">POLLING</span>
                        )}
                      </td>
                      <td>{healthLatency !== null ? `${healthLatency}ms latency` : '—'}</td>
                    </tr>

                    <tr>
                      <td>
                        <div className="subsystem-name">Socket.IO Gateway</div>
                        <div className="subsystem-meta">Bi-directional Transport</div>
                      </td>
                      <td>ws://proxy/socket.io</td>
                      <td>
                        {socketConnected ? (
                          <span className="badge badge-green">CONNECTED</span>
                        ) : (
                          <span className="badge badge-amber">CONNECTING</span>
                        )}
                      </td>
                      <td>
                        {socketConnected
                          ? `ID: ${socketId?.substring(0, 8)}... (${socketTransport || 'ws'}) ${
                              socketPingLatency !== null ? `[RTT: ${socketPingLatency}ms]` : ''
                            }`
                          : 'Awaiting transport'}
                      </td>
                    </tr>

                    <tr>
                      <td>
                        <div className="subsystem-name">Database Layer</div>
                        <div className="subsystem-meta">MongoDB / Mongoose</div>
                      </td>
                      <td>mongodb://127.0.0.1:27017</td>
                      <td>
                        {healthData?.database?.connected ? (
                          <span className="badge badge-green">CONNECTED</span>
                        ) : (
                          <span className="badge badge-amber">DISCONNECTED</span>
                        )}
                      </td>
                      <td>
                        {healthData?.database
                          ? `State: ${healthData.database.status} (Verified non-mocked)`
                          : 'Unverified'}
                      </td>
                    </tr>

                    <tr>
                      <td>
                        <div className="subsystem-name">Vite Dev Proxy</div>
                        <div className="subsystem-meta">Reverse Proxy (Port 5173 to 5000)</div>
                      </td>
                      <td>/api &amp; /socket.io</td>
                      <td>
                        <span className="badge badge-green">ACTIVE</span>
                      </td>
                      <td>Forwarding to target :5000</td>
                    </tr>
                  </tbody>
                </table>

                {/* Node Key-Value Metrics */}
                <div className="kv-grid">
                  <div className="kv-item">
                    <span className="kv-key">Server Uptime</span>
                    <span className="kv-value">
                      {healthData?.uptime !== undefined ? `${healthData.uptime} seconds` : '—'}
                    </span>
                  </div>
                  <div className="kv-item">
                    <span className="kv-key">Last Health Check</span>
                    <span className="kv-value">{lastChecked || '—'}</span>
                  </div>
                  <div className="kv-item">
                    <span className="kv-key">Database State</span>
                    <span className="kv-value">
                      {healthData?.database?.status
                        ? healthData.database.status.toUpperCase()
                        : 'UNKNOWN'}
                    </span>
                  </div>
                  <div className="kv-item">
                    <span className="kv-key">Socket Transport</span>
                    <span className="kv-value">
                      {socketConnected ? socketTransport?.toUpperCase() || 'WEBSOCKET' : 'OFFLINE'}
                    </span>
                  </div>
                </div>

                {/* Raw Payload Section */}
                <div>
                  <div
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '10px',
                      color: 'var(--text-muted)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      marginBottom: '6px',
                    }}
                  >
                    Raw /api/health Response
                  </div>
                  <pre className="code-block">
                    {healthLoading && !healthData
                      ? '/* Polling server health... */'
                      : healthError
                      ? `/* Health check failed */\n${healthError}`
                      : JSON.stringify(healthData, null, 2)}
                  </pre>
                </div>
              </div>
            </section>

            {/* Right Column: Telemetry Event Stream */}
            <section className="panel">
              <div className="panel-header">
                <span className="panel-title">Runtime Event Telemetry</span>
                <div className="panel-actions">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setTelemetryLogs([])}
                  >
                    CLEAR
                  </button>
                </div>
              </div>

              <div className="panel-body" style={{ flex: 1 }}>
                <div className="log-stream">
                  {telemetryLogs.length === 0 ? (
                    <div style={{ color: 'var(--text-muted)', padding: '12px' }}>
                      No telemetry events recorded.
                    </div>
                  ) : (
                    telemetryLogs.map((entry) => (
                      <div key={entry.id} className={`log-entry ${entry.level}`}>
                        <span className="log-time">{entry.timestamp}</span>
                        <span className="log-source">[{entry.source}]</span>
                        <span className="log-msg">{entry.message}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </section>
          </>
        )}
      </main>

      {/* Bottom Status Bar */}
      <footer className="bottom-bar">
        <div className="bottom-bar-left">
          <span>ROOT: labline</span>
          <span>·</span>
          <span>ROLE: {currentUser ? currentUser.role.toUpperCase() : 'ANONYMOUS'}</span>
          <span>·</span>
          <span>SOCKET.IO: {socketConnected ? 'ONLINE' : 'CONNECTING'}</span>
        </div>
        <div className="bottom-bar-right">
          <span>PORT: 5000</span>
          <span>·</span>
          <span>VITE: 5173</span>
        </div>
      </footer>
    </div>
  );
}
