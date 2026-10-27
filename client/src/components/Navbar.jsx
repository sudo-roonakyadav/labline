export default function Navbar({
  currentUser,
  socketConnected,
  activeView,
  setActiveView,
  onOpenAuth,
  onLogout,
}) {
  return (
    <header className="site-header">
      <div className="header-inner">
        {/* Brand Group */}
        <div className="brand-group" onClick={() => setActiveView('landing')} style={{ cursor: 'pointer' }}>
          <span className="brand-mark">LABLINE</span>
          <span className="brand-divider">/</span>
          <span className="brand-sub font-mono">HELP DESK</span>
        </div>

        {/* Center Navigation Links (visible when on public landing) */}
        {activeView === 'landing' && (
          <nav className="desktop-nav" aria-label="Landing navigation">
            <a href="#problem" className="nav-anchor font-mono">01 // PROBLEM</a>
            <a href="#workflows" className="nav-anchor font-mono">02 // WORKFLOWS</a>
            <a href="#lifecycle" className="nav-anchor font-mono">03 // LIFECYCLE</a>
            <a href="#specs" className="nav-anchor font-mono">04 // SPECS</a>
          </nav>
        )}

        {/* Right Actions */}
        <div className="header-actions">
          {/* Real-time Connection Status Indicator */}
          <div className="connection-beacon" title={socketConnected ? 'Real-time WebSocket connected' : 'Connecting to server'}>
            <span className={`beacon-dot ${socketConnected ? 'active' : 'connecting'}`} />
            <span className="beacon-label font-mono">{socketConnected ? 'CONNECTED' : 'CONNECTING'}</span>
          </div>

          {currentUser ? (
            <div className="auth-identity-group">
              <button
                type="button"
                className={`btn-nav-tab ${activeView === 'workspace' ? 'active' : ''}`}
                onClick={() => setActiveView('workspace')}
              >
                {currentUser.role === 'mentor' ? 'Mentor Dashboard' : 'Student Dashboard'}
              </button>

              <div className="user-capsule">
                <span className="user-display-name">{currentUser.name}</span>
                <span className={`role-tag font-mono ${currentUser.role}`}>{currentUser.role}</span>
              </div>

              <button type="button" className="btn-secondary-sm" onClick={onLogout}>
                Sign Out
              </button>
            </div>
          ) : (
            <div className="guest-cta-group">
              <button
                type="button"
                className="btn-ghost"
                onClick={() => onOpenAuth('login')}
              >
                Sign In
              </button>
              <button
                type="button"
                className="btn-signal"
                onClick={() => onOpenAuth('register')}
              >
                Register
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
