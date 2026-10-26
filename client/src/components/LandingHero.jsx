export default function LandingHero({ currentUser, onOpenAuth, onEnterWorkspace }) {
  return (
    <section className="landing-hero-section">
      <div className="hero-kicker-bar">
        <span className="hero-kicker-tag font-mono">[ REAL-TIME LABORATORY ASSISTANCE ]</span>
        <span className="hero-version-tag font-mono">COLLEGE LAB QUEUE</span>
      </div>

      <div className="hero-headline-wrap">
        <h1 className="hero-headline">
          <span className="hero-line">WHEN CODE STALLS,</span>
          <span className="hero-line highlight-signal">GET UNBLOCKED FASTER.</span>
        </h1>
      </div>

      <div className="hero-content-grid">
        <div className="hero-lead-col">
          <p className="hero-lead-text">
            Every lab doubt matters. Without structured queuing, hands stay raised in silence while loud voices jump ahead. LabLine provides an orderly, verified FIFO help desk that pairs stuck students with available mentors in an active conversation.
          </p>

          <div className="hero-action-row">
            {currentUser ? (
              <button
                type="button"
                className="btn-primary-large"
                onClick={onEnterWorkspace}
              >
                ENTER {currentUser.role === 'mentor' ? 'MENTOR DASHBOARD' : 'STUDENT DASHBOARD'}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="btn-primary-large"
                  onClick={() => onOpenAuth('register')}
                >
                  GET STARTED
                </button>
                <button
                  type="button"
                  className="btn-outline-large"
                  onClick={() => {
                    const el = document.getElementById('lifecycle');
                    if (el) el.scrollIntoView({ behavior: 'smooth' });
                  }}
                >
                  HOW IT WORKS
                </button>
              </>
            )}
          </div>
        </div>

        <div className="hero-metrics-col">
          <div className="hero-stat-box">
            <span className="hero-stat-label font-mono">ORDERING GUARANTEE</span>
            <span className="hero-stat-val">Strict FIFO</span>
            <span className="hero-stat-desc">Zero queue-jumping; verified by request creation timestamps.</span>
          </div>
          <div className="hero-stat-box">
            <span className="hero-stat-label font-mono">CONCURRENCY SAFETY</span>
            <span className="hero-stat-val">Atomic Lock</span>
            <span className="hero-stat-desc">Single-mentor claiming prevents race conditions and duplicate triage.</span>
          </div>
          <div className="hero-stat-box">
            <span className="hero-stat-label font-mono">DOUBT CATEGORIES</span>
            <span className="hero-stat-val">6 Categories</span>
            <span className="hero-stat-desc">DSA, Frontend, Backend, Database, Environment, and General.</span>
          </div>
        </div>
      </div>

      {/* Real-time Technical Status Ribbon */}
      <div className="telemetry-ribbon font-mono">
        <div className="telemetry-chip">
          <span className="chip-key">UPDATES:</span>
          <span className="chip-val">REAL-TIME SOCKET</span>
        </div>
        <div className="telemetry-divider">/</div>
        <div className="telemetry-chip">
          <span className="chip-key">DATABASE:</span>
          <span className="chip-val">MONGODB PERSISTENCE</span>
        </div>
        <div className="telemetry-divider">/</div>
        <div className="telemetry-chip">
          <span className="chip-key">WORKFLOW:</span>
          <span className="chip-val">CONTINUOUS CONVERSATION</span>
        </div>
        <div className="telemetry-divider">/</div>
        <div className="telemetry-chip">
          <span className="chip-key">AUTH:</span>
          <span className="chip-val">SECURE SESSION COOKIES</span>
        </div>
      </div>
    </section>
  );
}
