export default function LandingHero({ currentUser, onOpenAuth, onEnterWorkspace }) {
  return (
    <section className="landing-hero-section">
      <div className="hero-kicker-bar">
        <span className="hero-kicker-tag font-mono">[ PROTOCOL // REAL-TIME LABORATORY ASSISTANCE ]</span>
        <span className="hero-version-tag font-mono">SPEC V1.2.0-SIGNAL</span>
      </div>

      <div className="hero-headline-wrap">
        <h1 className="hero-headline">
          <span className="hero-line">WHEN CODE STALLS,</span>
          <span className="hero-line highlight-signal">SIGNAL THE LAB.</span>
        </h1>
      </div>

      <div className="hero-content-grid">
        <div className="hero-lead-col">
          <p className="hero-lead-text">
            Every lab doubt is a distress signal. Without structured queuing, hands stay raised in silence while loud voices jump the queue. LabLine delivers a deterministic, verified FIFO pipeline that pairs stuck students with available mentors in seconds.
          </p>

          <div className="hero-action-row">
            {currentUser ? (
              <button
                type="button"
                className="btn-primary-large"
                onClick={onEnterWorkspace}
              >
                ENTER {currentUser.role === 'mentor' ? 'RADAR DESK' : 'SIGNAL DESK'} →
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="btn-primary-large"
                  onClick={() => onOpenAuth('register')}
                >
                  INITIALIZE SIGNAL →
                </button>
                <button
                  type="button"
                  className="btn-outline-large"
                  onClick={() => {
                    const el = document.getElementById('lifecycle');
                    if (el) el.scrollIntoView({ behavior: 'smooth' });
                  }}
                >
                  EXPLORE LIFECYCLE ↓
                </button>
              </>
            )}
          </div>
        </div>

        <div className="hero-metrics-col">
          <div className="hero-stat-box">
            <span className="hero-stat-label font-mono">ORDERING GUARANTEE</span>
            <span className="hero-stat-val">Strict FIFO</span>
            <span className="hero-stat-desc">Zero queue-jumping; verified by MongoDB creation timestamps.</span>
          </div>
          <div className="hero-stat-box">
            <span className="hero-stat-label font-mono">CONCURRENCY SAFETY</span>
            <span className="hero-stat-val">Atomic Lock</span>
            <span className="hero-stat-desc">Single-mentor claiming prevents race conditions and duplicate triage.</span>
          </div>
          <div className="hero-stat-box">
            <span className="hero-stat-label font-mono">SIGNAL TELEMETRY</span>
            <span className="hero-stat-val">6 Categories</span>
            <span className="hero-stat-desc">DSA, Frontend, Backend, Database, Environment, and General.</span>
          </div>
        </div>
      </div>

      {/* Real-time Technical Telemetry Ribbon */}
      <div className="telemetry-ribbon font-mono">
        <div className="telemetry-chip">
          <span className="chip-key">CARRIER:</span>
          <span className="chip-val">WEBSOCKET DUPLEX</span>
        </div>
        <div className="telemetry-divider">/</div>
        <div className="telemetry-chip">
          <span className="chip-key">STORAGE:</span>
          <span className="chip-val">MONGODB ATLAS SINGAPORE</span>
        </div>
        <div className="telemetry-divider">/</div>
        <div className="telemetry-chip">
          <span className="chip-key">DISPATCH:</span>
          <span className="chip-val">SUB-SECOND REACTIVE</span>
        </div>
        <div className="telemetry-divider">/</div>
        <div className="telemetry-chip">
          <span className="chip-key">AUTH:</span>
          <span className="chip-val">HTTPONLY SIGNED JWT</span>
        </div>
      </div>
    </section>
  );
}
