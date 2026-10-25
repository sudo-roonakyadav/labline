import { useState, useMemo, useEffect } from 'react';

const CATEGORIES = [
  { id: 'dsa', label: 'DSA' },
  { id: 'frontend', label: 'Frontend' },
  { id: 'backend', label: 'Backend' },
  { id: 'database', label: 'Database' },
  { id: 'environment', label: 'Environment' },
  { id: 'other', label: 'Other' },
];

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

export default function MentorWorkspace({
  currentUser,
  mentorQueue = [],
  mentorQueueLoading = false,
  fetchQueue,
  onClaimRequest,
  onUpdateStatus,
  onToggleAvailability,
  queueActionError = null,
  queueIntelligence = null,
}) {
  // Navigation View: 'live_desk' | 'session_history'
  const [viewTab, setViewTab] = useState('live_desk');

  // Filter State
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Resolution Modal State
  const [resolvingRequest, setResolvingRequest] = useState(null);
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [isSubmittingResolution, setIsSubmittingResolution] = useState(false);
  const [resolutionError, setResolutionError] = useState(null);

  // History State
  const [historyList, setHistoryList] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState(null);

  const fetchHistory = async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch('/api/queue/history', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setHistoryList(data.history || []);
        setHistoryError(null);
      } else {
        throw new Error('Failed to load history');
      }
    } catch (err) {
      setHistoryError(err.message);
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    if (viewTab === 'session_history') {
      fetchHistory();
    }
  }, [viewTab]);

  // Segregate Queue Elements
  const waitingRequests = useMemo(() => {
    return mentorQueue.filter((r) => r.status === 'waiting');
  }, [mentorQueue]);

  const currentUserId = currentUser?._id || currentUser?.id;

  const myAssignedRequests = useMemo(() => {
    return mentorQueue.filter((r) => {
      const mentorId = r.mentor?._id || r.mentor?.id || r.mentor;
      return (
        mentorId &&
        currentUserId &&
        mentorId.toString() === currentUserId.toString() &&
        ['claimed', 'in_progress'].includes(r.status)
      );
    });
  }, [mentorQueue, currentUserId]);

  const otherActiveRequests = useMemo(() => {
    return mentorQueue.filter((r) => {
      const mentorId = r.mentor?._id || r.mentor?.id || r.mentor;
      return (
        mentorId &&
        currentUserId &&
        mentorId.toString() !== currentUserId.toString() &&
        ['claimed', 'in_progress'].includes(r.status)
      );
    });
  }, [mentorQueue, currentUserId]);

  // Filtered Waiting Queue (FIFO is strictly maintained)
  const filteredWaitingQueue = useMemo(() => {
    return waitingRequests.filter((req) => {
      const matchesCategory =
        selectedCategory === 'all' || req.category === selectedCategory;
      const searchLower = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !searchLower ||
        req.topic?.toLowerCase().includes(searchLower) ||
        req.description?.toLowerCase().includes(searchLower) ||
        req.student?.name?.toLowerCase().includes(searchLower);
      return matchesCategory && matchesSearch;
    });
  }, [waitingRequests, selectedCategory, searchQuery]);

  const handleOpenResolutionModal = (req) => {
    setResolvingRequest(req);
    setResolutionNotes('');
    setResolutionError(null);
  };

  const handleCloseResolutionModal = () => {
    setResolvingRequest(null);
    setResolutionNotes('');
    setResolutionError(null);
  };

  const handleConfirmResolution = async (e) => {
    e.preventDefault();
    if (!resolvingRequest) return;
    setIsSubmittingResolution(true);
    setResolutionError(null);

    try {
      const ok = await onUpdateStatus(
        resolvingRequest._id,
        'resolved',
        resolutionNotes.trim()
      );
      if (ok) {
        handleCloseResolutionModal();
        fetchQueue();
      }
    } catch (err) {
      setResolutionError(err.message || 'Failed to resolve request.');
    } finally {
      setIsSubmittingResolution(false);
    }
  };

  const isMentorAvailable = currentUser?.isAvailable !== false;

  return (
    <div className="workspace-panel">
      {/* Mentor Header & Availability Controls */}
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <h1 className="page-heading">Mentor Signal Console</h1>
            <p className="page-subheading">
              Real-time engineering doubt triage. Claim signals from the FIFO queue, conduct 1:1 sessions, and record diagnostic resolution summaries.
            </p>
          </div>

          {/* Availability Toggle */}
          <div className="availability-bar">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className={`pulse-dot ${isMentorAvailable ? 'active' : ''}`} style={{ width: 8, height: 8 }} />
              <span className="availability-label">
                {isMentorAvailable ? 'AVAILABLE FOR SIGNALS' : 'AWAY / IN DEEP WORK'}
              </span>
            </div>
            <button
              type="button"
              className={`toggle-switch-btn ${isMentorAvailable ? 'active' : ''}`}
              onClick={() => onToggleAvailability(!isMentorAvailable)}
            >
              {isMentorAvailable ? 'Go Away' : 'Go Online'}
            </button>
          </div>
        </div>
      </div>

      {/* Subnavigation Tabs */}
      <div className="workspace-subnav">
        <div className="subnav-tabs">
          <button
            type="button"
            className={`subnav-tab-btn ${viewTab === 'live_desk' ? 'active' : ''}`}
            onClick={() => setViewTab('live_desk')}
          >
            Live Signal Desk ({waitingRequests.length + myAssignedRequests.length})
          </button>
          <button
            type="button"
            className={`subnav-tab-btn ${viewTab === 'session_history' ? 'active' : ''}`}
            onClick={() => setViewTab('session_history')}
          >
            Resolved Sessions &amp; Feedback
          </button>
        </div>

        {/* Telemetry Strip */}
        <div className="telemetry-strip" style={{ padding: '6px 14px' }}>
          <div className="telemetry-metric">
            <span className="telemetry-metric-lbl">Waiting</span>
            <span className="telemetry-metric-val amber">{waitingRequests.length}</span>
          </div>
          <div className="telemetry-divider" />
          <div className="telemetry-metric">
            <span className="telemetry-metric-lbl">Active Mentors</span>
            <span className="telemetry-metric-val signal">
              {queueIntelligence?.availableMentors !== undefined ? queueIntelligence.availableMentors : 1}
            </span>
          </div>
          <div className="telemetry-divider" />
          <div className="telemetry-metric">
            <span className="telemetry-metric-lbl">Avg Resolution</span>
            <span className="telemetry-metric-val">
              {queueIntelligence?.averageResolutionMinutes
                ? `~${queueIntelligence.averageResolutionMinutes}m`
                : 'Calibrating'}
            </span>
          </div>
        </div>
      </div>

      {queueActionError && (
        <div className="alert-banner error" style={{ marginBottom: 20 }}>
          {queueActionError}
        </div>
      )}

      {viewTab === 'live_desk' ? (
        <div className="workspace-grid equal">
          {/* Left Column: Waiting Queue (FIFO) with Category Filtering */}
          <div className="section-card">
            <div className="section-card-header">
              <span className="section-card-title">
                Waiting Signals ({filteredWaitingQueue.length} / {waitingRequests.length})
              </span>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={fetchQueue}
                disabled={mentorQueueLoading}
              >
                {mentorQueueLoading ? 'Syncing...' : 'Sync'}
              </button>
            </div>

            <div className="section-card-body">
              {/* Category Filter & Search */}
              <div className="filter-bar">
                <div className="filter-pills">
                  <button
                    type="button"
                    className={`filter-pill ${selectedCategory === 'all' ? 'active' : ''}`}
                    onClick={() => setSelectedCategory('all')}
                  >
                    All ({waitingRequests.length})
                  </button>
                  {CATEGORIES.map((cat) => {
                    const count = waitingRequests.filter((r) => r.category === cat.id).length;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        className={`filter-pill ${selectedCategory === cat.id ? 'active' : ''}`}
                        onClick={() => setSelectedCategory(cat.id)}
                      >
                        {cat.label} {count > 0 ? `(${count})` : ''}
                      </button>
                    );
                  })}
                </div>

                <div className="search-input-wrap">
                  <span className="search-icon">🔍</span>
                  <input
                    type="text"
                    className="search-input"
                    placeholder="Search signals..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>

              {filteredWaitingQueue.length === 0 ? (
                <div className="empty-box">
                  <div className="empty-box-title">Queue is clear</div>
                  <div className="empty-box-desc">
                    {selectedCategory !== 'all'
                      ? `No waiting signals in category "${selectedCategory}".`
                      : 'No students are currently waiting for assistance. Incoming signals will appear automatically in real-time.'}
                  </div>
                </div>
              ) : (
                <div className="queue-list">
                  {filteredWaitingQueue.map((req, idx) => (
                    <div key={req._id} className="queue-item">
                      <div className="queue-item-header">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span className="status-pill waiting">
                            #{req.queuePosition || idx + 1} IN FIFO
                          </span>
                          <span className={`category-pill ${req.category}`}>
                            {req.category}
                          </span>
                          <span style={{ fontSize: 12, color: 'var(--color-neutral-muted)' }}>
                            {req.student?.name || 'Student'} · {formatDuration(req.createdAt)} wait
                          </span>
                        </div>
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={() => onClaimRequest(req._id)}
                        >
                          Claim Signal
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

          {/* Right Column: Assigned Sessions & Floor Activity */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
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
                      Claim a signal from the waiting queue to begin assisting a student with 1:1 guidance.
                    </div>
                  </div>
                ) : (
                  <div className="queue-list">
                    {myAssignedRequests.map((req) => (
                      <div
                        key={req._id}
                        className="queue-item"
                        style={{ borderColor: 'var(--color-signal-border)' }}
                      >
                        <div className="queue-item-header">
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span className={`status-pill ${req.status}`}>
                              {req.status === 'in_progress' ? 'In Session' : 'Claimed'}
                            </span>
                            <span className={`category-pill ${req.category}`}>
                              {req.category}
                            </span>
                            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-warm-white)' }}>
                              {req.student?.name} ({req.student?.email})
                            </span>
                          </div>

                          <div>
                            {req.status === 'claimed' && (
                              <button
                                type="button"
                                className="btn btn-primary"
                                onClick={() => onUpdateStatus(req._id, 'in_progress')}
                              >
                                Start 1:1 Session
                              </button>
                            )}
                            {req.status === 'in_progress' && (
                              <button
                                type="button"
                                className="btn btn-primary"
                                onClick={() => handleOpenResolutionModal(req)}
                              >
                                Resolve Session
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="queue-item-title">{req.topic}</div>
                        <div className="queue-item-desc">{req.description}</div>

                        {req.codeSnippet && (
                          <pre className="code-box">{req.codeSnippet}</pre>
                        )}

                        <div style={{ fontSize: 11, color: 'var(--color-neutral-muted)', fontFamily: 'var(--font-mono)' }}>
                          Elapsed: {formatDuration(req.inProgressAt || req.claimedAt || req.createdAt)}
                        </div>
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
                  <span className="section-card-title" style={{ fontSize: 13, color: 'var(--color-neutral)' }}>
                    Colleague Sessions ({otherActiveRequests.length})
                  </span>
                </div>

                <div className="section-card-body">
                  <div className="queue-list">
                    {otherActiveRequests.map((req) => (
                      <div key={req._id} className="queue-item" style={{ opacity: 0.85 }}>
                        <div className="queue-item-header">
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span className={`status-pill ${req.status}`}>
                              {req.status === 'in_progress' ? 'In Session' : 'Claimed'}
                            </span>
                            <span className={`category-pill ${req.category}`}>
                              {req.category}
                            </span>
                            <span style={{ fontSize: 12, color: 'var(--color-neutral-muted)' }}>
                              Mentor: {req.mentor?.name || 'Colleague'}
                            </span>
                          </div>
                          <span style={{ fontSize: 11, color: 'var(--color-neutral-muted)' }}>
                            {formatDuration(req.inProgressAt || req.claimedAt)}
                          </span>
                        </div>
                        <div className="queue-item-title" style={{ fontSize: 14 }}>
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
      ) : (
        /* Resolved Sessions & Student Feedback View */
        <div className="section-card">
          <div className="section-card-header">
            <span className="section-card-title">Resolved Sessions &amp; Student Feedback</span>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={fetchHistory}
              disabled={historyLoading}
            >
              {historyLoading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>

          <div className="section-card-body">
            {historyError && <div className="alert-banner error">{historyError}</div>}

            {historyList.length === 0 ? (
              <div className="empty-box">
                <div className="empty-box-title">No completed sessions recorded</div>
                <div className="empty-box-desc">
                  Resolved tickets with diagnostic notes and verified student ratings will appear here.
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {historyList.map((item) => (
                  <div
                    key={item._id}
                    style={{
                      backgroundColor: 'var(--color-ink-elevated)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-xs)',
                      padding: 16,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 10,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span className="status-pill resolved">Resolved</span>
                        <span className={`category-pill ${item.category}`}>{item.category}</span>
                        <span style={{ fontWeight: 700, color: 'var(--color-warm-white)' }}>
                          {item.topic}
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        {item.feedback?.rating ? (
                          <span className="history-feedback-badge">
                            ★ {item.feedback.rating}/5
                          </span>
                        ) : (
                          <span style={{ fontSize: 11, color: 'var(--color-neutral-muted)' }}>
                            No feedback submitted
                          </span>
                        )}
                        <span style={{ fontSize: 11, color: 'var(--color-neutral-muted)', fontFamily: 'var(--font-mono)' }}>
                          {new Date(item.resolvedAt || item.updatedAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>

                    <p style={{ fontSize: 13, color: 'var(--color-neutral)', lineHeight: 1.5 }}>
                      Student: <strong>{item.student?.name}</strong> · Mentor: <strong>{item.mentor?.name}</strong>
                    </p>

                    {item.resolutionNotes && (
                      <div className="history-note-box">
                        <strong style={{ fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-signal)' }}>
                          Resolution Summary:
                        </strong>
                        <p style={{ marginTop: 2, fontSize: 13 }}>{item.resolutionNotes}</p>
                      </div>
                    )}

                    {item.feedback?.comment && (
                      <div style={{ fontSize: 12, color: 'var(--color-neutral-muted)' }}>
                        Student Reflection: <em>"{item.feedback.comment}"</em>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Resolution Summary Modal */}
      {resolvingRequest && (
        <div className="modal-overlay" onClick={handleCloseResolutionModal}>
          <div className="modal-container" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Complete &amp; Resolve Session</span>
              <button
                type="button"
                className="modal-close-btn"
                onClick={handleCloseResolutionModal}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleConfirmResolution}>
              <div className="modal-body">
                <div>
                  <div style={{ fontSize: 12, color: 'var(--color-neutral-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'var(--font-mono)' }}>
                    Session Target
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-warm-white)', marginTop: 2 }}>
                    {resolvingRequest.topic}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--color-neutral)', marginTop: 2 }}>
                    Student: {resolvingRequest.student?.name} ({resolvingRequest.student?.email})
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="resolution-notes">
                    Diagnostic &amp; Resolution Summary (Recommended)
                  </label>
                  <textarea
                    id="resolution-notes"
                    className="form-textarea"
                    style={{ minHeight: 110 }}
                    placeholder="Document root cause (e.g. incorrect Vite websocket proxy configuration), the applied solution, and key takeaways..."
                    value={resolutionNotes}
                    onChange={(e) => setResolutionNotes(e.target.value)}
                    maxLength={1000}
                    disabled={isSubmittingResolution}
                  />
                  <span className="form-hint">
                    {resolutionNotes.length} / 1000 characters. Visible to the student upon session completion.
                  </span>
                </div>

                {resolutionError && (
                  <div className="alert-banner error">{resolutionError}</div>
                )}
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleCloseResolutionModal}
                  disabled={isSubmittingResolution}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isSubmittingResolution}
                >
                  {isSubmittingResolution ? 'Saving Resolution...' : 'Confirm & Mark Resolved'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
