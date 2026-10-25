import { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';

export default function App() {
  const [activeTab, setActiveTab] = useState('diagnostics');
  const [healthData, setHealthData] = useState(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const [healthError, setHealthError] = useState(null);
  const [healthLatency, setHealthLatency] = useState(null);
  const [lastChecked, setLastChecked] = useState(null);

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

  useEffect(() => {
    addLog('SYSTEM', 'Initializing LabLine operational console');
    fetchHealth();

    // Establish Socket.IO connection via Vite reverse proxy
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
      addLog('SOCKET', `Established session [ID: ${socket.id}] via ${transportName}`, 'success');
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

    socket.on('disconnect', (reason) => {
      setSocketConnected(false);
      setSocketId(null);
      addLog('SOCKET', `Connection dropped: ${reason}`, 'warn');
    });

    socket.on('connect_error', (err) => {
      addLog('SOCKET', `Connection error: ${err.message}`, 'error');
    });

    return () => {
      socket.disconnect();
    };
  }, [addLog, fetchHealth]);

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
  const dbConnected = healthData?.database?.connected === true;

  return (
    <div className="app-container">
      {/* Top Bar */}
      <header className="top-bar">
        <div className="brand-section">
          <span className="brand-name">LABLINE</span>
          <span className="brand-divider">//</span>
          <span className="brand-sub">OPERATIONAL CONSOLE</span>
        </div>

        <div className="header-center">
          <span className="header-tag">NODE WORKSPACES</span>
          <span className="header-tag">VITE PROXY: ACTIVE</span>
        </div>

        <div className="header-right">
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
                : 'SYSTEM DEGRADED (DB OFFLINE)'}
            </span>
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <nav className="tab-bar">
        <button
          type="button"
          className={`tab-button ${activeTab === 'diagnostics' ? 'active' : ''}`}
          onClick={() => setActiveTab('diagnostics')}
        >
          [01] SYSTEM HEALTH & DIAGNOSTICS
        </button>

        <button
          type="button"
          className={`tab-button ${activeTab === 'queue' ? 'active' : ''}`}
          onClick={() => setActiveTab('queue')}
        >
          [02] ASSISTANCE QUEUE
          <span className="tab-pill">STANDBY</span>
        </button>

        <button
          type="button"
          className={`tab-button ${activeTab === 'roster' ? 'active' : ''}`}
          onClick={() => setActiveTab('roster')}
        >
          [03] MENTOR ROSTER
          <span className="tab-pill">STANDBY</span>
        </button>
      </nav>

      {/* Main Content Area */}
      {activeTab === 'diagnostics' ? (
        <main className="main-workspace">
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
                  {/* Express Server */}
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
                    <td>
                      {healthLatency !== null ? `${healthLatency}ms latency` : '—'}
                    </td>
                  </tr>

                  {/* Socket.IO */}
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

                  {/* MongoDB */}
                  <tr>
                    <td>
                      <div className="subsystem-name">Database Layer</div>
                      <div className="subsystem-meta">Mongoose Driver</div>
                    </td>
                    <td>mongodb://localhost:27017</td>
                    <td>
                      {dbConnected ? (
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

                  {/* Vite Proxy */}
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
                  <span className="kv-key">Database Status</span>
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
        </main>
      ) : (
        /* Standby Tab View for Queue / Roster */
        <main className="main-workspace" style={{ gridTemplateColumns: '1fr' }}>
          <section className="panel">
            <div className="panel-header">
              <span className="panel-title">
                {activeTab === 'queue' ? 'Queue Management' : 'Mentor Workbench'} // Scaffolding Phase
              </span>
            </div>
            <div className="panel-body" style={{ padding: '32px 24px' }}>
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '12px',
                  color: 'var(--text-secondary)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  maxWidth: '560px',
                }}
              >
                <div style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                  [SUBSYSTEM STANDBY]
                </div>
                <div>
                  This module is preserved for the queue implementation milestone. The foundational
                  full-stack architecture (npm workspaces, Vite proxy, Express HTTP API, and Socket.IO
                  real-time channel) is initialized and verified.
                </div>
                <div style={{ marginTop: '12px' }}>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setActiveTab('diagnostics')}
                  >
                    RETURN TO HEALTH & DIAGNOSTICS
                  </button>
                </div>
              </div>
            </div>
          </section>
        </main>
      )}

      {/* Bottom Bar */}
      <footer className="bottom-bar">
        <div className="bottom-bar-left">
          <span>ROOT: labline</span>
          <span>·</span>
          <span>WORKSPACES: client, server</span>
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
