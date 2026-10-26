import { useState, useMemo } from 'react';

const CATEGORIES = [
  { id: 'dsa', label: 'DSA / Algorithms' },
  { id: 'frontend', label: 'Frontend / UI' },
  { id: 'backend', label: 'Backend / APIs' },
  { id: 'database', label: 'Database / SQL' },
  { id: 'environment', label: 'Environment / Setup' },
  { id: 'other', label: 'General / Other' },
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

export default function StudentWorkspace({
  currentUser,
  myRequests = [],
  myRequestsLoading = false,
  fetchMyRequests,
  onCreateRequest,
  onCancelRequest,
  onSubmitFeedback,
  requestSubmitting = false,
  requestError = null,
  requestSuccess = null,
}) {
  // Form State
  const [topic, setTopic] = useState('');
  const [description, setDescription] = useState('');
  const [codeSnippet, setCodeSnippet] = useState('');
  const [category, setCategory] = useState('frontend');

  // History Filter State
  const [historyCategory, setHistoryCategory] = useState('all');
  const [historySearch, setHistorySearch] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  // Active Feedback State for resolved requests needing feedback
  const [feedbackRating, setFeedbackRating] = useState(5);
  const [feedbackComment, setFeedbackComment] = useState('');
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [feedbackError, setFeedbackError] = useState(null);
  const [feedbackSuccess, setFeedbackSuccess] = useState(null);

  // Identify active request (waiting, claimed, in_progress)
  const activeRequest = useMemo(() => {
    return myRequests.find((r) => ['waiting', 'claimed', 'in_progress'].includes(r.status));
  }, [myRequests]);

  // Identify most recent resolved request without feedback
  const unratedResolvedRequest = useMemo(() => {
    return myRequests.find(
      (r) => r.status === 'resolved' && (!r.feedback || !r.feedback.rating)
    );
  }, [myRequests]);

  // Past completed requests
  const pastRequests = useMemo(() => {
    return myRequests.filter((r) => ['resolved', 'cancelled'].includes(r.status));
  }, [myRequests]);

  // Filtered past requests
  const filteredPastRequests = useMemo(() => {
    return pastRequests.filter((req) => {
      const matchesCategory =
        historyCategory === 'all' || req.category === historyCategory;
      const searchLower = historySearch.toLowerCase().trim();
      const matchesSearch =
        !searchLower ||
        req.topic?.toLowerCase().includes(searchLower) ||
        req.description?.toLowerCase().includes(searchLower) ||
        req.resolutionNotes?.toLowerCase().includes(searchLower) ||
        req.mentor?.name?.toLowerCase().includes(searchLower);
      return matchesCategory && matchesSearch;
    });
  }, [pastRequests, historyCategory, historySearch]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!topic.trim() || !description.trim()) return;
    const ok = await onCreateRequest({
      topic: topic.trim(),
      description: description.trim(),
      codeSnippet: codeSnippet.trim(),
      category,
    });
    if (ok) {
      setTopic('');
      setDescription('');
      setCodeSnippet('');
      setCategory('frontend');
    }
  };

  const handleFeedbackSubmit = async (e) => {
    e.preventDefault();
    if (!unratedResolvedRequest) return;
    setFeedbackSubmitting(true);
    setFeedbackError(null);
    setFeedbackSuccess(null);
    try {
      const ok = await onSubmitFeedback(unratedResolvedRequest._id, {
        rating: feedbackRating,
        comment: feedbackComment.trim(),
      });
      if (ok) {
        setFeedbackSuccess('Outcome feedback recorded. Thank you for closing the loop!');
        setFeedbackComment('');
        fetchMyRequests();
      }
    } catch (err) {
      setFeedbackError(err.message || 'Failed to submit feedback.');
    } finally {
      setFeedbackSubmitting(false);
    }
  };

  const toggleExpand = (id) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="workspace-panel">
      {/* Workspace Header & Identity */}
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h1 className="page-heading">Student Dashboard</h1>
            <p className="page-subheading">
              Submit technical doubts to lab mentors. Track FIFO queue position, live session progress, and resolution feedback.
            </p>
          </div>
          <div className="telemetry-strip">
            <div className="telemetry-metric">
              <span className="telemetry-metric-lbl">Status</span>
              <span className="telemetry-metric-val signal">
                <span className="pulse-dot active" style={{ width: 8, height: 8 }} />
                {activeRequest ? 'Active Request' : 'Idle'}
              </span>
            </div>
            <div className="telemetry-divider" />
            <div className="telemetry-metric">
              <span className="telemetry-metric-lbl">Identity</span>
              <span className="telemetry-metric-val">{currentUser?.name || 'Student'}</span>
            </div>
          </div>
        </div>
      </div>

      {requestError && <div className="alert-banner error" style={{ marginBottom: 20 }}>{requestError}</div>}
      {requestSuccess && <div className="alert-banner success" style={{ marginBottom: 20 }}>{requestSuccess}</div>}

      {/* Unrated Resolved Request Feedback Prompt */}
      {unratedResolvedRequest && (
        <div className="feedback-prompt-box" style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span className="status-pill resolved">Session Resolved</span>
                <span className="category-pill">{unratedResolvedRequest.category}</span>
              </div>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 700, color: 'var(--color-warm-white)' }}>
                {unratedResolvedRequest.topic}
              </h3>
              <p style={{ fontSize: 13, color: 'var(--color-neutral)', marginTop: 4 }}>
                Guided by <strong>{unratedResolvedRequest.mentor?.name || 'Assigned Mentor'}</strong>
              </p>
            </div>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-neutral-muted)' }}>
              Completed {new Date(unratedResolvedRequest.resolvedAt || unratedResolvedRequest.updatedAt).toLocaleTimeString()}
            </span>
          </div>

          {unratedResolvedRequest.resolutionNotes && (
            <div className="history-note-box">
              <strong style={{ fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-signal)' }}>
                Mentor Diagnostic &amp; Resolution Notes:
              </strong>
              <p style={{ marginTop: 4, lineHeight: 1.5 }}>{unratedResolvedRequest.resolutionNotes}</p>
            </div>
          )}

          <form onSubmit={handleFeedbackSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label className="form-label" style={{ marginBottom: 8, display: 'block' }}>
                Rate Session Helpfulness (1 to 5)
              </label>
              <div className="rating-stars-group">
                {[1, 2, 3, 4, 5].map((num) => (
                  <button
                    key={num}
                    type="button"
                    className={`star-btn ${feedbackRating === num ? 'selected' : ''}`}
                    onClick={() => setFeedbackRating(num)}
                    disabled={feedbackSubmitting}
                  >
                    {num}
                  </button>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="feedback-comment">
                Session Comment (Optional)
              </label>
              <textarea
                id="feedback-comment"
                className="form-textarea"
                style={{ minHeight: 65 }}
                placeholder="Share brief feedback on what helped you get unblocked..."
                value={feedbackComment}
                onChange={(e) => setFeedbackComment(e.target.value)}
                maxLength={500}
                disabled={feedbackSubmitting}
              />
              <span className="form-hint">{feedbackComment.length} / 500 characters</span>
            </div>

            {feedbackError && <div className="alert-banner error">{feedbackError}</div>}
            {feedbackSuccess && <div className="alert-banner success">{feedbackSuccess}</div>}

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="submit" className="btn btn-primary" disabled={feedbackSubmitting}>
                {feedbackSubmitting ? 'Recording Feedback...' : 'Submit Session Feedback'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Main Workspace Layout */}
      <div className="workspace-grid">
        {/* Left Column: Active Signal Tracker & Signal Composer */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Active Request Tracker */}
          {activeRequest ? (
            <div className="active-tracker">
              <div className={`active-tracker-banner ${activeRequest.status}`}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="pulse-dot active" style={{ width: 8, height: 8 }} />
                  <span>
                    {activeRequest.status === 'waiting' && `POSITION #${activeRequest.queuePosition || 1} IN FIFO QUEUE`}
                    {activeRequest.status === 'claimed' && 'SIGNAL CLAIMED — MENTOR CONNECTING'}
                    {activeRequest.status === 'in_progress' && 'ACTIVE 1:1 DEBUGGING SESSION'}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span className={`category-pill ${activeRequest.category}`}>
                    {activeRequest.category}
                  </span>
                  <span>Wait: {formatDuration(activeRequest.createdAt)}</span>
                </div>
              </div>

              <div className="active-tracker-content">
                {/* Real-Time Lifecycle Timeline */}
                <div className="lifecycle-step-bar">
                  <div className={`lifecycle-step-node completed`}>
                    <span style={{ color: 'var(--color-signal)' }}>●</span> 1. Submitted
                  </div>
                  <span className="lifecycle-step-arrow">→</span>
                  <div className={`lifecycle-step-node ${['claimed', 'in_progress', 'resolved'].includes(activeRequest.status) ? 'completed active' : ''}`}>
                    <span>●</span> 2. Claimed {activeRequest.mentor?.name ? `(${activeRequest.mentor.name})` : ''}
                  </div>
                  <span className="lifecycle-step-arrow">→</span>
                  <div className={`lifecycle-step-node ${['in_progress', 'resolved'].includes(activeRequest.status) ? 'completed active' : ''}`}>
                    <span>●</span> 3. In Session
                  </div>
                  <span className="lifecycle-step-arrow">→</span>
                  <div className={`lifecycle-step-node ${activeRequest.status === 'resolved' ? 'completed' : ''}`}>
                    <span>○</span> 4. Resolved
                  </div>
                </div>

                {/* Queue Intelligence Telemetry (For Waiting Requests) */}
                {activeRequest.status === 'waiting' && activeRequest.intelligence && (
                  <div className="telemetry-strip" style={{ padding: '8px 14px' }}>
                    <div className="telemetry-metric">
                      <span className="telemetry-metric-lbl">Estimated Wait</span>
                      <span className="telemetry-metric-val signal">
                        {activeRequest.intelligence.estimatedWaitMinutes !== null
                          ? `~${activeRequest.intelligence.estimatedWaitMinutes} minutes`
                          : 'Estimating...'}
                      </span>
                    </div>
                    <div className="telemetry-divider" />
                    <div className="telemetry-metric">
                      <span className="telemetry-metric-lbl">Active Mentors</span>
                      <span className="telemetry-metric-val">
                        {activeRequest.intelligence.availableMentors} on duty
                      </span>
                    </div>
                    <div className="telemetry-divider" />
                    <div className="telemetry-metric">
                      <span className="telemetry-metric-lbl">Calculation Mode</span>
                      <span className="telemetry-metric-val" style={{ fontSize: 11, color: 'var(--color-neutral)' }}>
                        {activeRequest.intelligence.reason || `Based on ${activeRequest.intelligence.sampleSize} recent sessions`}
                      </span>
                    </div>
                  </div>
                )}

                <div>
                  <h2 className="tracker-title">{activeRequest.topic}</h2>
                  <p className="tracker-desc" style={{ marginTop: 8 }}>{activeRequest.description}</p>
                </div>

                {activeRequest.codeSnippet && (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span className="form-label">Code / Terminal Snippet</span>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ padding: '2px 8px', fontSize: 11 }}
                        onClick={() => navigator.clipboard?.writeText(activeRequest.codeSnippet)}
                      >
                        Copy
                      </button>
                    </div>
                    <pre className="code-box">{activeRequest.codeSnippet}</pre>
                  </div>
                )}

                <div className="tracker-meta-bar">
                  <div className="meta-item">
                    <span className="meta-label">Submitted</span>
                    <span className="meta-value">{new Date(activeRequest.createdAt).toLocaleTimeString()}</span>
                  </div>
                  {activeRequest.mentor && (
                    <div className="meta-item">
                      <span className="meta-label">Assigned Mentor</span>
                      <span className="meta-value">{activeRequest.mentor.name}</span>
                    </div>
                  )}
                  {activeRequest.status === 'waiting' && (
                    <div style={{ marginLeft: 'auto' }}>
                      <button
                        type="button"
                        className="btn btn-danger"
                        onClick={() => onCancelRequest(activeRequest._id)}
                      >
                        Cancel request
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* Request Composer */
            <div className="section-card">
              <div className="section-card-header">
                <span className="section-card-title">Submit Help Request</span>
                <span style={{ fontSize: 11, color: 'var(--color-neutral-muted)', fontFamily: 'var(--font-mono)' }}>
                  FIFO QUEUE
                </span>
              </div>

              <div className="section-card-body">
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                  {/* Category Selection */}
                  <div className="form-group">
                    <label className="form-label">Category</label>
                    <div className="category-selector-row">
                      {CATEGORIES.map((cat) => (
                        <button
                          key={cat.id}
                          type="button"
                          className={`category-radio-btn ${category === cat.id ? 'active' : ''}`}
                          onClick={() => setCategory(cat.id)}
                          disabled={requestSubmitting}
                        >
                          {cat.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Topic Input */}
                  <div className="form-group">
                    <label className="form-label" htmlFor="signal-topic">
                      Specific Doubt Topic
                    </label>
                    <input
                      id="signal-topic"
                      type="text"
                      className="form-input"
                      placeholder="e.g. Redux Toolkit dispatch loop on checkout submit"
                      value={topic}
                      onChange={(e) => setTopic(e.target.value)}
                      maxLength={100}
                      required
                      disabled={requestSubmitting}
                    />
                    <span className="form-hint">Between 2 and 100 characters. Keep it technical and concise.</span>
                  </div>

                  {/* Description Input */}
                  <div className="form-group">
                    <label className="form-label" htmlFor="signal-desc">
                      Detailed Blocker Description
                    </label>
                    <textarea
                      id="signal-desc"
                      className="form-textarea"
                      placeholder="Describe what you tried, the expected behavior, and the exact error encountered..."
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      maxLength={1000}
                      required
                      disabled={requestSubmitting}
                    />
                    <span className="form-hint">{description.length} / 1000 characters (min 5 chars)</span>
                  </div>

                  {/* Code Snippet Input */}
                  <div className="form-group">
                    <label className="form-label" htmlFor="signal-code">
                      Code Snippet / Terminal Trace (Optional)
                    </label>
                    <textarea
                      id="signal-code"
                      className="form-textarea font-mono"
                      placeholder="Paste minimal reproducing code, exception stack trace, or terminal log..."
                      value={codeSnippet}
                      onChange={(e) => setCodeSnippet(e.target.value)}
                      maxLength={3000}
                      disabled={requestSubmitting}
                    />
                    <span className="form-hint">{codeSnippet.length} / 3000 characters</span>
                  </div>

                  <div>
                    <button type="submit" className="btn btn-primary" disabled={requestSubmitting}>
                      {requestSubmitting ? 'Submitting...' : 'Submit to Queue'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Request History & Outcomes */}
        <div className="section-card">
          <div className="section-card-header">
            <span className="section-card-title">
              Session History &amp; Feedback ({pastRequests.length})
            </span>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={fetchMyRequests}
              disabled={myRequestsLoading}
            >
              {myRequestsLoading ? 'Syncing...' : 'Sync'}
            </button>
          </div>

          <div className="section-card-body" style={{ padding: 18 }}>
            {/* Filter Bar */}
            <div className="filter-bar">
              <div className="filter-pills">
                <button
                  type="button"
                  className={`filter-pill ${historyCategory === 'all' ? 'active' : ''}`}
                  onClick={() => setHistoryCategory('all')}
                >
                  All
                </button>
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    className={`filter-pill ${historyCategory === cat.id ? 'active' : ''}`}
                    onClick={() => setHistoryCategory(cat.id)}
                  >
                    {cat.id.toUpperCase()}
                  </button>
                ))}
              </div>

              <div className="search-input-wrap">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="search-icon" aria-hidden="true" style={{ color: 'var(--color-neutral-muted)' }}>
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="text"
                  className="search-input"
                  placeholder="Search history..."
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                />
              </div>
            </div>

            {filteredPastRequests.length === 0 ? (
              <div className="empty-box" style={{ border: 'none', margin: '20px 0' }}>
                <div className="empty-box-title">No matching past sessions</div>
                <div className="empty-box-desc">
                  Resolved or cancelled sessions matching your filters will appear here with resolution notes and ratings.
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {filteredPastRequests.map((req) => {
                  const isExpanded = expandedId === req._id;
                  return (
                    <div
                      key={req._id}
                      style={{
                        backgroundColor: 'var(--color-ink-elevated)',
                        border: '1px solid var(--color-border)',
                        borderRadius: 'var(--radius-xs)',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        onClick={() => toggleExpand(req._id)}
                        style={{
                          padding: '12px 14px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 12,
                          cursor: 'pointer',
                          userSelect: 'none',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                          <span className={`status-pill ${req.status}`}>{req.status}</span>
                          <span className={`category-pill ${req.category}`}>{req.category}</span>
                          <span style={{ fontWeight: 600, color: 'var(--color-warm-white)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {req.topic}
                          </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                          {req.feedback?.rating && (
                            <span className="history-feedback-badge">
                              Rating: {req.feedback.rating}/5
                            </span>
                          )}
                          <span style={{ fontSize: 11, color: 'var(--color-neutral-muted)', fontFamily: 'var(--font-mono)' }}>
                            {new Date(req.updatedAt).toLocaleDateString()}
                          </span>
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                            style={{
                              color: 'var(--color-neutral-muted)',
                              transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                              transition: 'transform 0.15s ease',
                            }}
                          >
                            <polyline points="6 9 12 15 18 9" />
                          </svg>
                        </div>
                      </div>

                      {/* Expandable Details */}
                      {isExpanded && (
                        <div className="history-details-panel">
                          <div>
                            <span className="form-label" style={{ fontSize: 10 }}>Description</span>
                            <p style={{ marginTop: 2, color: 'var(--color-neutral)', lineHeight: 1.5 }}>{req.description}</p>
                          </div>

                          {req.codeSnippet && (
                            <div>
                              <span className="form-label" style={{ fontSize: 10 }}>Snippet</span>
                              <pre className="code-box" style={{ maxHeight: 120, marginTop: 2 }}>{req.codeSnippet}</pre>
                            </div>
                          )}

                          {req.mentor && (
                            <div style={{ fontSize: 12, color: 'var(--color-neutral)' }}>
                              Mentor: <strong style={{ color: 'var(--color-warm-white)' }}>{req.mentor.name}</strong>
                            </div>
                          )}

                          {req.resolutionNotes && (
                            <div className="history-note-box">
                              <strong style={{ fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-signal)' }}>
                                Mentor Resolution Summary:
                              </strong>
                              <p style={{ marginTop: 2 }}>{req.resolutionNotes}</p>
                            </div>
                          )}

                          {req.feedback?.comment && (
                            <div style={{ fontSize: 12, color: 'var(--color-neutral)' }}>
                              Student Feedback: <em>"{req.feedback.comment}"</em>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
