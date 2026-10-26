export default function LandingWorkflows({ onOpenAuth }) {
  return (
    <div className="landing-workflows-wrapper">
      {/* SECTION 01: THE REAL PROBLEM */}
      <section id="problem" className="landing-section">
        <div className="section-meta-header">
          <span className="section-index font-mono">02 // PROBLEM SPACE</span>
          <h2 className="section-headline">WHY PHYSICAL HAND-RAISING FAILS AT SCALE</h2>
          <p className="section-subtext">
            In an 80-student laboratory running complex systems and compiler workflows, informal verbal queues collapse under concurrency.
          </p>
        </div>

        <div className="problem-card-grid">
          <div className="problem-card">
            <span className="problem-num font-mono">01 // THE NOISE DILEMMA</span>
            <h3 className="problem-title">Loudness Trumps Fairness</h3>
            <p className="problem-body">
              Physical hand-raising rewards aggression. Mentors gravitate toward the students who wave frantically or call out, while quiet or hesitant students sit unassisted for an entire lab block.
            </p>
          </div>

          <div className="problem-card">
            <span className="problem-num font-mono">02 // CONTEXT AMNESIA</span>
            <h3 className="problem-title">Ten Minutes of Context Rebuilding</h3>
            <p className="problem-body">
              When a mentor finally arrives, the student struggles to explain what failed. Without pre-captured logs, category tagging, or stack traces, precious guidance time is wasted repeating the failure.
            </p>
          </div>

          <div className="problem-card">
            <span className="problem-num font-mono">03 // QUEUE CORRUPTION</span>
            <h3 className="problem-title">Dual Allocation &amp; Collision</h3>
            <p className="problem-body">
              Multiple mentors roam the aisles without coordination, often walking to the same student simultaneously while a critical blocker on the opposite side of the lab remains untouched.
            </p>
          </div>
        </div>
      </section>

      {/* SECTION 02: DUAL WORKFLOWS */}
      <section id="workflows" className="landing-section">
        <div className="section-meta-header">
          <span className="section-index font-mono">03 // WORKFLOW ARCHITECTURE</span>
          <h2 className="section-headline">TWO SPECIALIZED WORKSPACES, ONE REAL-TIME PROTOCOL</h2>
          <p className="section-subtext">
            Designed to match the cognitive models of both participants: the student in distress and the mentor orchestrating triage.
          </p>
        </div>

        <div className="workflows-split-grid">
          {/* Student Pathway Card */}
          <div className="workflow-card student-workflow">
            <div className="workflow-card-header">
              <span className="workflow-badge font-mono">STUDENT TRANSMISSION DESK</span>
              <span className="workflow-status-dot" />
            </div>

            <h3 className="workflow-title">Focused, Context-Rich Doubt Emission</h3>
            <p className="workflow-desc">
              Students compose their question with category classification (DSA, Frontend, Backend, Database, Env) and optional code snippets, ensuring the mentor arrives already understanding the technical landscape.
            </p>

            <ul className="workflow-feature-list font-mono">
              <li>
                <span className="feature-marker">+</span>
                <span>Real-time queue coordinate (#1, #2...) calculated on actual pending signals.</span>
              </li>
              <li>
                <span className="feature-marker">+</span>
                <span>Deterministic wait estimation derived from real recent resolution rates.</span>
              </li>
              <li>
                <span className="feature-marker">+</span>
                <span>Signal lifecycle tracker: Created → Claimed → In-Session → Resolved.</span>
              </li>
              <li>
                <span className="feature-marker">+</span>
                <span>Permanent resolution notes archive and 5-star verified feedback rating.</span>
              </li>
            </ul>

            <div className="workflow-action-box">
              <button
                type="button"
                className="btn-signal-outline"
                onClick={() => onOpenAuth('register', 'student')}
              >
                CREATE STUDENT ACCOUNT →
              </button>
            </div>
          </div>

          {/* Mentor Radar Desk Card */}
          <div className="workflow-card mentor-workflow">
            <div className="workflow-card-header">
              <span className="workflow-badge font-mono">MENTOR RADAR &amp; TRIAGE DESK</span>
              <span className="workflow-status-dot mentor" />
            </div>

            <h3 className="workflow-title">High-Throughput Operational Triage</h3>
            <p className="workflow-desc">
              A high-density operational desk built for lab instructors. Filter incoming doubts by domain expertise, claim signals with atomic concurrency locking, and track live peer allocations.
            </p>

            <ul className="workflow-feature-list font-mono">
              <li>
                <span className="feature-marker">+</span>
                <span>Strict FIFO queue view with live waiting duration tickers for every signal.</span>
              </li>
              <li>
                <span className="feature-marker">+</span>
                <span>Atomic claim locking: Guaranteed single-mentor assignment with 409 protection.</span>
              </li>
              <li>
                <span className="feature-marker">+</span>
                <span>Persistent mentor availability toggle (Available vs Away / Engaged).</span>
              </li>
              <li>
                <span className="feature-marker">+</span>
                <span>Structured session closing: Record permanent resolution summary and learning outcome.</span>
              </li>
            </ul>

            <div className="workflow-action-box">
              <button
                type="button"
                className="btn-ghost"
                onClick={() => onOpenAuth('register', 'teacher')}
              >
                REGISTER AS TEACHER →
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 03: SYSTEM SPECIFICATIONS & INTEGRITY */}
      <section id="specs" className="landing-section">
        <div className="section-meta-header">
          <span className="section-index font-mono">04 // SYSTEM SPECIFICATIONS</span>
          <h2 className="section-headline">BUILT FOR RELIABILITY UNDER LAB CONCURRENCY</h2>
          <p className="section-subtext">
            Zero mock data. Zero invented queue stats. Production-grade full-stack architecture running in Singapore.
          </p>
        </div>

        <div className="specs-table-wrapper">
          <table className="specs-table">
            <thead>
              <tr>
                <th>SUBSYSTEM</th>
                <th>IMPLEMENTATION</th>
                <th>BEHAVIORAL GUARANTEE</th>
                <th>SECURITY PROFILE</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="font-mono">Signal Carrier</td>
                <td>Socket.IO Duplex Engine</td>
                <td>Sub-50ms queue-change event broadcasts with 200ms debounced refresh coalescing</td>
                <td>Origin-restricted, memory-safe event handlers</td>
              </tr>
              <tr>
                <td className="font-mono">Persistence</td>
                <td>MongoDB Atlas (Singapore)</td>
                <td>Compound indexed FIFO queries `{'{ status: 1, createdAt: 1 }'}`</td>
                <td>Explicit CIDR allowlist, parameterized Mongoose models</td>
              </tr>
              <tr>
                <td className="font-mono">Session Protocol</td>
                <td>JSON Web Tokens (JWT)</td>
                <td>HttpOnly, SameSite=Lax signed cookies with strict server validation</td>
                <td>XSS-immune cookie storage, no localStorage token leaks</td>
              </tr>
              <tr>
                <td className="font-mono">Concurrency Lock</td>
                <td>Atomic `findOneAndUpdate`</td>
                <td>Guarantees exactly one mentor successfully claims any waiting doubt</td>
                <td>409 Conflict rejection for competing claims</td>
              </tr>
              <tr>
                <td className="font-mono">Queue Intelligence</td>
                <td>Moving Average TVF</td>
                <td>Wait times computed from recent real sessions; falls back to 'Insufficient Data'</td>
                <td>Zero fake placeholder metrics or simulated numbers</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
