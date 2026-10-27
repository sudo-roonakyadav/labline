import SignalVisualizer from './SignalVisualizer.jsx';

export default function LandingWorkflows({ onOpenAuth }) {
  return (
    <div className="landing-workflows-wrapper">
      {/* SECTION 01: THE PROBLEM */}
      <section id="problem" className="landing-section">
        <div className="section-meta-header">
          <span className="section-index font-mono">01 // PROBLEM</span>
          <h2 className="section-headline">WHY INFORMAL LAB QUEUES FAIL AT SCALE</h2>
          <p className="section-subtext">
            In an 80-student laboratory running complex systems and compiler workflows, informal verbal queues collapse under concurrency.
          </p>
        </div>

        <div className="problem-card-grid">
          <div className="problem-card">
            <span className="problem-num font-mono">01 // UNORGANIZED HELP REQUESTS</span>
            <h3 className="problem-title">Loudness Trumps Fairness</h3>
            <p className="problem-body">
              Physical hand-raising and room call-outs reward aggression. Mentors gravitate toward the students who wave frantically, while quiet or hesitant students wait unassisted for an entire lab block without knowing their position.
            </p>
          </div>

          <div className="problem-card">
            <span className="problem-num font-mono">02 // COMPETING DEMANDS &amp; COLLISIONS</span>
            <h3 className="problem-title">Uncoordinated Mentor Allocation</h3>
            <p className="problem-body">
              Multiple mentors roam the aisles without synchronized queue state. Two mentors frequently walk to the same desk simultaneously, while critical compiler and segmentation-fault blockers across the lab sit completely unattended.
            </p>
          </div>

          <div className="problem-card">
            <span className="problem-num font-mono">03 // CONTEXT LOSS &amp; FOLLOW-UP NEED</span>
            <h3 className="problem-title">Ten Minutes of Context Rebuilding</h3>
            <p className="problem-body">
              When a mentor finally arrives, students struggle to explain what failed from memory. Without code snippets, logs, and ongoing follow-up clarification, students hit secondary errors as soon as the mentor walks away and must restart the queue from zero.
            </p>
          </div>
        </div>
      </section>

      {/* SECTION 02: DUAL WORKFLOWS */}
      <section id="workflows" className="landing-section">
        <div className="section-meta-header">
          <span className="section-index font-mono">02 // WORKFLOWS</span>
          <h2 className="section-headline">TWO SPECIALIZED WORKSPACES, ONE REAL-TIME QUEUE</h2>
          <p className="section-subtext">
            Designed to match the practical needs of both students asking questions and mentors providing structured help.
          </p>
        </div>

        <div className="workflows-split-grid">
          {/* Student Pathway Card */}
          <div className="workflow-card student-workflow">
            <div className="workflow-card-header">
              <span className="workflow-badge font-mono">STUDENT WORKSPACE</span>
              <span className="workflow-status-dot" />
            </div>

            <h3 className="workflow-title">Clear, Context-Rich Doubt Submission</h3>
            <p className="workflow-desc">
              Students formulate their doubt with category classification (DSA, Frontend, Backend, Database, Environment) and formatted code snippets, ensuring the mentor understands the problem before replying.
            </p>

            <ul className="workflow-feature-list font-mono">
              <li>
                <span className="feature-marker">+</span>
                <span>Real-time queue position (#1, #2...) based on verified FIFO arrival order.</span>
              </li>
              <li>
                <span className="feature-marker">+</span>
                <span>Interactive conversation thread with assigned mentor until solved.</span>
              </li>
              <li>
                <span className="feature-marker">+</span>
                <span>Follow-up support: continue the discussion if you need more clarification.</span>
              </li>
              <li>
                <span className="feature-marker">+</span>
                <span>Student-controlled closure with 1-5 rating and optional feedback.</span>
              </li>
            </ul>

            <div className="workflow-action-box">
              <button
                type="button"
                className="btn-signal-outline"
                onClick={() => onOpenAuth('register', 'student')}
              >
                CREATE STUDENT ACCOUNT
              </button>
            </div>
          </div>

          {/* Mentor Workspace Card */}
          <div className="workflow-card mentor-workflow">
            <div className="workflow-card-header">
              <span className="workflow-badge font-mono">MENTOR DASHBOARD</span>
              <span className="workflow-status-dot mentor" />
            </div>

            <h3 className="workflow-title">Orderly Triage &amp; Live Conversations</h3>
            <p className="workflow-desc">
              A clear dashboard for lab instructors. Filter incoming doubts by topic, accept requests with atomic concurrency locking, and conduct interactive troubleshooting sessions.
            </p>

            <ul className="workflow-feature-list font-mono">
              <li>
                <span className="feature-marker">+</span>
                <span>Strict FIFO queue view with live waiting duration tickers for every request.</span>
              </li>
              <li>
                <span className="feature-marker">+</span>
                <span>Atomic claim locking: Guaranteed single-mentor assignment with conflict protection.</span>
              </li>
              <li>
                <span className="feature-marker">+</span>
                <span>Dedicated Live Sessions section highlighting requests that need your reply.</span>
              </li>
              <li>
                <span className="feature-marker">+</span>
                <span>Session history with verified student ratings and complete discussion records.</span>
              </li>
            </ul>

            <div className="workflow-action-box">
              <button
                type="button"
                className="btn-ghost"
                onClick={() => onOpenAuth('register', 'teacher')}
              >
                REGISTER AS TEACHER
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 03: REQUEST LIFECYCLE */}
      <section id="lifecycle" className="landing-section">
        <div className="section-meta-header">
          <span className="section-index font-mono">03 // LIFECYCLE</span>
          <h2 className="section-headline">HOW A DOUBT MOVES FROM SUBMISSION TO CLOSURE</h2>
          <p className="section-subtext">
            Every help request follows an explicit five-stage sequence: Submission &rarr; FIFO queue &rarr; Mentor acceptance &rarr; Ongoing conversation &rarr; Student closure and rating.
          </p>
        </div>
        <SignalVisualizer />
      </section>

      {/* SECTION 04: SYSTEM SPECIFICATIONS & INTEGRITY */}
      <section id="specs" className="landing-section">
        <div className="section-meta-header">
          <span className="section-index font-mono">04 // SPECS</span>
          <h2 className="section-headline">BUILT FOR RELIABILITY UNDER LAB CONCURRENCY</h2>
          <p className="section-subtext">
            Zero mock data. Zero invented queue stats. Production-grade full-stack architecture running in Singapore with verified persistence, secure session cookies, real-time WebSockets, and atomic concurrency control.
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
