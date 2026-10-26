import { useState, useEffect } from 'react';

const STAGES = [
  {
    id: 'submission',
    index: '01',
    label: 'SUBMISSION',
    sub: 'Student Submits Doubt',
    coords: { x: 80, y: 130 },
    color: '#D6FF55',
    detail: 'Student constructs a structured request (category, topic, description, code/terminal snippet). The request is validated on the server and placed into the queue.',
    protocol: 'POST /api/requests',
    payload: {
      category: 'dsa',
      topic: 'Deadlock in Dijkstra heap',
      status: 'waiting',
      codeSnippet: '// snippet attached',
    },
    guarantee: 'Input validated on server for length and type safety; sanitized against injection.',
  },
  {
    id: 'queue',
    index: '02',
    label: 'FIFO QUEUE',
    sub: 'Timestamped Queue Placement',
    coords: { x: 260, y: 70 },
    color: '#E5B842',
    detail: 'The request takes an immutable timestamped position in the FIFO queue. Live queue coordinates (#N) are computed dynamically against all pending requests.',
    protocol: 'GET /api/requests/mine · WebSocket: queue:changed',
    payload: {
      queuePosition: '#1 in queue',
      ordering: 'Strict FIFO by createdAt',
      realtime: 'Coalesced socket updates',
    },
    guarantee: 'Queue integrity: No queue-jumping, no reordering, real-time sync across connected users.',
  },
  {
    id: 'acceptance',
    index: '03',
    label: 'ACCEPTANCE',
    sub: 'Atomic Mentor Assignment',
    coords: { x: 440, y: 140 },
    color: '#D6FF55',
    detail: 'An on-duty mentor accepts the request. MongoDB atomically validates status == "waiting" before assigning mentor ID, returning 409 Conflict to competing claimers.',
    protocol: 'POST /api/requests/:id/claim',
    payload: {
      status: 'claimed',
      mentor: 'Priya Nair (Mentor)',
      atomicity: 'findOneAndUpdate({ _id, status: "waiting" })',
    },
    guarantee: 'Zero race conditions: exactly one mentor accepts the request; student cancellation is locked out.',
  },
  {
    id: 'conversation',
    index: '04',
    label: 'CONVERSATION',
    sub: 'Discussion & Follow-up',
    coords: { x: 620, y: 80 },
    color: '#55D6FF',
    detail: 'Mentor and student communicate in an interactive conversation thread. Mentor posts replies, student can ask follow-ups, and the request stays open until fully resolved.',
    protocol: 'POST /api/requests/:id/messages',
    payload: {
      status: 'awaiting_student',
      messagesCount: 3,
      latestSender: 'mentor',
    },
    guarantee: 'Persistent conversation history survives refreshes and restarts; updates synchronize in real time.',
  },
  {
    id: 'completion',
    index: '05',
    label: 'COMPLETION',
    sub: 'Student Closure & Rating',
    coords: { x: 800, y: 130 },
    color: '#D6FF55',
    detail: 'Student confirms the blocker is solved, closes the request, and rates the mentor 1 to 5 with optional feedback. The complete thread is preserved in history.',
    protocol: 'POST /api/requests/:id/close',
    payload: {
      status: 'resolved',
      rating: 5,
      comment: 'Clear explanation of pointer arithmetic.',
    },
    guarantee: 'Only the student who owns the request can close it and submit a verified rating.',
  },
];

export default function SignalVisualizer() {
  const [activeStageIndex, setActiveStageIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  // Auto-cycle through stages if not paused
  useEffect(() => {
    if (isPaused) return;
    const interval = setInterval(() => {
      setActiveStageIndex((prev) => (prev + 1) % STAGES.length);
    }, 4500);
    return () => clearInterval(interval);
  }, [isPaused]);

  const activeStage = STAGES[activeStageIndex];

  return (
    <div className="signal-visualizer-container">
      {/* Visualizer Top Bar */}
      <div className="visualizer-header">
        <div className="visualizer-badge">
          <span className="signal-pulse-dot" />
          <span>LIFECYCLE FLOW // 5-STAGE DOUBT RESOLUTION</span>
        </div>
        <div className="visualizer-controls">
          <button
            type="button"
            className="btn-tiny"
            onClick={() => setIsPaused((prev) => !prev)}
            aria-label={isPaused ? 'Resume flow animation' : 'Pause flow animation'}
          >
            {isPaused ? 'PLAY' : 'PAUSE'}
          </button>
        </div>
      </div>

      {/* SVG Canvas */}
      <div className="svg-frame" role="region" aria-label="Doubt lifecycle interactive diagram">
        <svg
          viewBox="0 0 880 200"
          className="signal-svg"
          preserveAspectRatio="xMidYMid meet"
          aria-hidden="true"
        >
          <defs>
            {/* Fine Technical Grid Pattern */}
            <pattern id="tech-grid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#161D18" strokeWidth="0.75" />
            </pattern>

            {/* Signal Gradient */}
            <linearGradient id="signal-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#D6FF55" stopOpacity="0.8" />
              <stop offset="35%" stopColor="#E5B842" stopOpacity="0.8" />
              <stop offset="70%" stopColor="#55D6FF" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#D6FF55" stopOpacity="0.9" />
            </linearGradient>

            {/* Glow Filter */}
            <filter id="soft-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Grid Background */}
          <rect width="880" height="200" fill="url(#tech-grid)" />

          {/* Reference baseline */}
          <line x1="40" y1="130" x2="840" y2="130" stroke="#1A221C" strokeWidth="1" strokeDasharray="4 4" />

          {/* The Carrier Wave Path */}
          <path
            id="carrier-line"
            d="M 80 130 C 170 130, 170 70, 260 70 C 350 70, 350 140, 440 140 C 530 140, 530 80, 620 80 C 710 80, 710 130, 800 130"
            fill="none"
            stroke="url(#signal-gradient)"
            strokeWidth="2.5"
            strokeLinecap="round"
          />

          {/* Subtle Carrier Echo */}
          <path
            d="M 80 130 C 170 130, 170 70, 260 70 C 350 70, 350 140, 440 140 C 530 140, 530 80, 620 80 C 710 80, 710 130, 800 130"
            fill="none"
            stroke="#D6FF55"
            strokeWidth="1"
            strokeOpacity="0.2"
            strokeDasharray="6 6"
          />

          {/* Moving Signal Pulse */}
          {!isPaused && (
            <circle r="4.5" fill="#D6FF55" className="signal-traveling-dot">
              <animateMotion
                dur="7s"
                repeatCount="indefinite"
                path="M 80 130 C 170 130, 170 70, 260 70 C 350 70, 350 140, 440 140 C 530 140, 530 80, 620 80 C 710 80, 710 130, 800 130"
              />
            </circle>
          )}

          {/* Stage Nodes */}
          {STAGES.map((stage, idx) => {
            const isActive = idx === activeStageIndex;
            return (
              <g
                key={stage.id}
                className={`svg-stage-node ${isActive ? 'active' : ''}`}
                onClick={() => {
                  setActiveStageIndex(idx);
                  setIsPaused(true);
                }}
                style={{ cursor: 'pointer' }}
                tabIndex={0}
                role="button"
                aria-label={`Select stage ${stage.index}: ${stage.label}`}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    setActiveStageIndex(idx);
                    setIsPaused(true);
                  }
                }}
              >
                {/* Outer ring */}
                <circle
                  cx={stage.coords.x}
                  cy={stage.coords.y}
                  r={isActive ? 16 : 10}
                  fill="#0B0D0C"
                  stroke={isActive ? stage.color : '#2A342D'}
                  strokeWidth={isActive ? 2 : 1.5}
                />
                {/* Inner dot */}
                <circle
                  cx={stage.coords.x}
                  cy={stage.coords.y}
                  r={isActive ? 5 : 3}
                  fill={isActive ? stage.color : '#969D94'}
                />

                {/* Node Label Top/Bottom */}
                <text
                  x={stage.coords.x}
                  y={stage.coords.y + (stage.coords.y > 100 ? 32 : -18)}
                  textAnchor="middle"
                  fill={isActive ? '#F3F1E8' : '#737C72'}
                  fontSize="11"
                  fontFamily="ui-monospace, monospace"
                  fontWeight={isActive ? '700' : '500'}
                  letterSpacing="0.06em"
                >
                  {stage.index} {stage.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Stage Detail Card */}
      <div className="stage-detail-panel">
        <div className="stage-detail-header">
          <div className="stage-detail-title-group">
            <span className="stage-index-tag" style={{ color: activeStage.color }}>
              STAGE {activeStage.index} //
            </span>
            <h3 className="stage-title">{activeStage.label} — {activeStage.sub}</h3>
          </div>
          <span className="stage-protocol-tag font-mono">{activeStage.protocol}</span>
        </div>

        <p className="stage-desc">{activeStage.detail}</p>

        <div className="stage-telemetry-grid">
          <div className="stage-telemetry-block">
            <span className="telemetry-label font-mono">REQUEST / RESPONSE PAYLOAD</span>
            <pre className="telemetry-code font-mono">
              {JSON.stringify(activeStage.payload, null, 2)}
            </pre>
          </div>
          <div className="stage-telemetry-block">
            <span className="telemetry-label font-mono">ARCHITECTURAL GUARANTEE</span>
            <div className="stage-guarantee-box">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true" style={{ color: activeStage.color, flexShrink: 0, marginTop: '2px' }}>
                <path d="M3 8.5L6.5 12L13 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>{activeStage.guarantee}</span>
            </div>
          </div>
        </div>

        {/* Step Buttons for Mobile or Direct Clicking */}
        <div className="stage-stepper-bar">
          {STAGES.map((s, idx) => (
            <button
              key={s.id}
              type="button"
              className={`stage-step-btn ${idx === activeStageIndex ? 'active' : ''}`}
              onClick={() => {
                setActiveStageIndex(idx);
                setIsPaused(true);
              }}
            >
              <span className="step-btn-num">{s.index}</span>
              <span className="step-btn-text">{s.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
