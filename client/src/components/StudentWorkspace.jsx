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

function formatTime(dateString) {
  if (!dateString) return '';
  const d = new Date(dateString);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function StudentWorkspace({
  currentUser,
  myRequests = [],
  myRequestsLoading = false,
  fetchMyRequests,
  onCreateRequest,
  onCancelRequest,
  onSubmitFeedback,
  onPostMessage,
  onCloseRequest,
  requestSubmitting = false,
  requestError = null,
  requestSuccess = null,
}) {
  // Submission Form State
  const [topic, setTopic] = useState('');
  const [description, setDescription] = useState('');
  const [codeSnippet, setCodeSnippet] = useState('');
  const [category, setCategory] = useState('frontend');
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState(null);

  // Conversation Follow-Up State
  const [followUpText, setFollowUpText] = useState('');
  const [followUpSubmitting, setFollowUpSubmitting] = useState(false);
  const [followUpError, setFollowUpError] = useState(null);

  // Student Closure & Rating State (Active Session)
  const [showCloseCard, setShowCloseCard] = useState(false);
  const [closeRating, setCloseRating] = useState(5);
  const [closeComment, setCloseComment] = useState('');
  const [closeSubmitting, setCloseSubmitting] = useState(false);
  const [closeError, setCloseError] = useState(null);

  // Standalone Feedback State (For legacy unrated resolved sessions)
  const [feedbackRating, setFeedbackRating] = useState(5);
  const [feedbackComment, setFeedbackComment] = useState('');
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [feedbackError, setFeedbackError] = useState(null);

  // History Filter State
  const [historyCategory, setHistoryCategory] = useState('all');
  const [historySearch, setHistorySearch] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  // Identify active request (waiting, claimed, in_progress, awaiting_mentor, awaiting_student)
  const activeRequest = useMemo(() => {
    return myRequests.find((r) =>
      ['waiting', 'claimed', 'in_progress', 'awaiting_mentor', 'awaiting_student'].includes(r.status)
    );
  }, [myRequests]);

  // Identify unrated resolved requests
  const unratedResolvedRequest = useMemo(() => {
    return myRequests.find(
      (r) => r.status === 'resolved' && (!r.feedback || !r.feedback.rating)
    );
  }, [myRequests]);

  // Completed requests partition
  const pastRequests = useMemo(() => {
    return myRequests.filter((r) => ['resolved', 'cancelled'].includes(r.status));
  }, [myRequests]);

  // Filtered completed requests
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

  const validateHelpRequest = () => {
    const errors = {};
    const trimmedTopic = topic.trim();
    const trimmedDesc = description.trim();

    if (!trimmedTopic) {
      errors.topic = 'Topic is required (minimum 2 characters).';
    } else if (trimmedTopic.length < 2) {
      errors.topic = `Topic must be at least 2 characters (currently ${trimmedTopic.length} character).`;
    } else if (trimmedTopic.length > 100) {
      errors.topic = `Topic cannot exceed 100 characters (currently ${trimmedTopic.length}).`;
    }

    if (!trimmedDesc) {
      errors.description = 'Description must be at least 5 characters (minimum 5 characters).';
    } else if (trimmedDesc.length < 5) {
      errors.description = `Description must be at least 5 characters (minimum 5 characters, currently ${trimmedDesc.length} character${trimmedDesc.length === 1 ? '' : 's'}).`;
    } else if (trimmedDesc.length > 1000) {
      errors.description = `Description cannot exceed 1000 characters (currently ${trimmedDesc.length}).`;
    }

    if (codeSnippet && codeSnippet.length > 3000) {
      errors.codeSnippet = `Code snippet cannot exceed 3000 characters (currently ${codeSnippet.length}).`;
    }

    return errors;
  };

  const handleSubmitNewRequest = async (e) => {
    e.preventDefault();
    setFormError(null);

    const clientErrors = validateHelpRequest();
    if (Object.keys(clientErrors).length > 0) {
      setFieldErrors(clientErrors);
      return;
    }
    setFieldErrors({});

    const res = await onCreateRequest({
      topic: topic.trim(),
      description: description.trim(),
      codeSnippet: codeSnippet.trim(),
      category,
    });

    if (res && (res === true || res.ok)) {
      setTopic('');
      setDescription('');
      setCodeSnippet('');
      setCategory('frontend');
      setFieldErrors({});
      setFormError(null);
    } else {
      // Map server-side validation details to inline field errors as well
      const serverDetails = (res && res.details) || [];
      if (Array.isArray(serverDetails) && serverDetails.length > 0) {
        const serverFieldErrors = {};
        serverDetails.forEach((detail) => {
          const lower = detail.toLowerCase();
          if (lower.includes('topic')) {
            serverFieldErrors.topic = detail;
          } else if (lower.includes('description')) {
            serverFieldErrors.description = detail;
          } else if (lower.includes('code snippet')) {
            serverFieldErrors.codeSnippet = detail;
          }
        });
        if (Object.keys(serverFieldErrors).length > 0) {
          setFieldErrors((prev) => ({ ...prev, ...serverFieldErrors }));
        }
      }
      if (res && (res.message || res.error)) {
        setFormError(res.message || res.error);
      }
      // Note: topic, description, codeSnippet, and category remain preserved!
    }
  };

  const handleSendFollowUp = async (e) => {
    e.preventDefault();
    if (!activeRequest || !followUpText.trim() || !onPostMessage) return;
    setFollowUpSubmitting(true);
    setFollowUpError(null);
    try {
      await onPostMessage(activeRequest._id, followUpText.trim());
      setFollowUpText('');
    } catch (err) {
      setFollowUpError(err.message || 'Failed to send follow-up message.');
    } finally {
      setFollowUpSubmitting(false);
    }
  };

  const handleConfirmClose = async (e) => {
    e.preventDefault();
    if (!activeRequest || !onCloseRequest) return;
    setCloseSubmitting(true);
    setCloseError(null);
    try {
      await onCloseRequest(activeRequest._id, {
        rating: closeRating,
        comment: closeComment.trim(),
      });
      setShowCloseCard(false);
      setCloseComment('');
      setCloseRating(5);
    } catch (err) {
      setCloseError(err.message || 'Failed to close request.');
    } finally {
      setCloseSubmitting(false);
    }
  };

  const handleFeedbackSubmit = async (e) => {
    e.preventDefault();
    if (!unratedResolvedRequest || !onSubmitFeedback) return;
    setFeedbackSubmitting(true);
    setFeedbackError(null);
    try {
      await onSubmitFeedback(unratedResolvedRequest._id, {
        rating: feedbackRating,
        comment: feedbackComment.trim(),
      });
      setFeedbackComment('');
      fetchMyRequests();
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
              Submit technical doubts to lab mentors. Track FIFO queue position, exchange interactive follow-up replies, and confirm resolution with ratings.
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

      {/* Standalone Feedback Prompt for Legacy Unrated Resolved Requests */}
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
            <div className="history-note-box" style={{ marginTop: 12 }}>
              <strong style={{ fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-signal)' }}>
                Mentor Diagnostic &amp; Resolution Notes:
              </strong>
              <p style={{ marginTop: 4, lineHeight: 1.5 }}>{unratedResolvedRequest.resolutionNotes}</p>
            </div>
          )}

          <form onSubmit={handleFeedbackSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 14 }}>
            {feedbackError && <div className="alert-box error font-mono">{feedbackError}</div>}
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
              />
            </div>

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
        {/* Left Column: Active Conversation / Queue Tracker OR Help Request Composer */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {activeRequest ? (
            <div className="active-tracker">
              {/* Tracker Banner */}
              <div className={`active-tracker-banner ${activeRequest.status}`}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span className="pulse-dot active" style={{ width: 8, height: 8 }} />
                  <span>
                    {activeRequest.status === 'waiting' && `POSITION #${activeRequest.queuePosition || 1} IN FIFO QUEUE`}
                    {activeRequest.status === 'claimed' && 'REQUEST ACCEPTED — MENTOR REVIEWING'}
                    {activeRequest.status === 'in_progress' && 'LIVE 1:1 DEBUGGING SESSION'}
                    {activeRequest.status === 'awaiting_student' && 'MENTOR REPLIED — FOLLOW-UP OR CLOSURE NEEDED'}
                    {activeRequest.status === 'awaiting_mentor' && 'FOLLOW-UP SENT — WAITING FOR MENTOR'}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span className={`category-pill ${activeRequest.category}`}>
                    {activeRequest.category}
                  </span>
                  <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)' }}>
                    Wait: {formatDuration(activeRequest.createdAt)}
                  </span>
                </div>
              </div>

              <div className="active-tracker-content">
                {/* Lifecycle Step Bar */}
                <div className="lifecycle-step-bar">
                  <div className="lifecycle-step-node completed">
                    <span style={{ color: 'var(--color-signal)' }}>●</span> 1. Submitted
                  </div>
                  <span className="lifecycle-step-arrow">→</span>
                  <div className={`lifecycle-step-node ${activeRequest.status !== 'waiting' ? 'completed active' : ''}`}>
                    <span>●</span> 2. Accepted {activeRequest.mentor?.name ? `(${activeRequest.mentor.name})` : ''}
                  </div>
                  <span className="lifecycle-step-arrow">→</span>
                  <div className={`lifecycle-step-node ${['claimed', 'in_progress', 'awaiting_mentor', 'awaiting_student'].includes(activeRequest.status) ? 'completed active' : ''}`}>
                    <span>●</span> 3. Conversation
                  </div>
                  <span className="lifecycle-step-arrow">→</span>
                  <div className="lifecycle-step-node">
                    <span>○</span> 4. Solved
                  </div>
                </div>

                {/* Queue Intelligence Telemetry (For Waiting Requests Only) */}
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

                {/* Doubt Summary */}
                <div style={{ backgroundColor: 'var(--color-ink-elevated)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-xs)', padding: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span className="form-label" style={{ fontSize: 10 }}>DOUBT TOPIC</span>
                    {activeRequest.mentor && (
                      <span style={{ fontSize: 12, color: 'var(--color-signal)', fontFamily: 'var(--font-mono)' }}>
                        Mentor: {activeRequest.mentor.name}
                      </span>
                    )}
                  </div>
                  <h2 className="tracker-title" style={{ fontSize: 17 }}>{activeRequest.topic}</h2>
                  <p className="tracker-desc" style={{ marginTop: 6, fontSize: 13 }}>{activeRequest.description}</p>

                  {activeRequest.codeSnippet && (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <span className="form-label" style={{ fontSize: 10 }}>Code / Terminal Snippet</span>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ padding: '2px 8px', fontSize: 11 }}
                          onClick={() => navigator.clipboard?.writeText(activeRequest.codeSnippet)}
                        >
                          Copy
                        </button>
                      </div>
                      <pre className="code-box" style={{ fontSize: 12, maxHeight: 160 }}>{activeRequest.codeSnippet}</pre>
                    </div>
                  )}

                  <div className="tracker-meta-bar" style={{ marginTop: 12, paddingTop: 12 }}>
                    <div className="meta-item">
                      <span className="meta-label">Submitted</span>
                      <span className="meta-value">{new Date(activeRequest.createdAt).toLocaleTimeString()}</span>
                    </div>
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

                {/* ----------------------------------------------------------- */}
                {/* INTERACTIVE CONVERSATION THREAD (When Request Accepted)     */}
                {/* ----------------------------------------------------------- */}
                {activeRequest.status !== 'waiting' && (
                  <div className="conversation-container" style={{ marginTop: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                      <span className="form-label" style={{ color: 'var(--color-warm-white)', fontWeight: 700 }}>
                        Conversation Thread ({activeRequest.messages?.length || 0})
                      </span>
                      <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-neutral-muted)' }}>
                        Live Synchronized
                      </span>
                    </div>

                    {/* Messages Area */}
                    <div className="conversation-thread" style={{
                      backgroundColor: 'var(--color-ink)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-xs)',
                      padding: 16,
                      maxHeight: 380,
                      overflowY: 'auto',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 14,
                    }}>
                      {(!activeRequest.messages || activeRequest.messages.length === 0) ? (
                        <div style={{ textAlign: 'center', padding: '28px 16px', color: 'var(--color-neutral)' }}>
                          <p style={{ fontSize: 13, marginBottom: 4 }}>
                            <strong>{activeRequest.mentor?.name || 'Mentor'}</strong> accepted your request.
                          </p>
                          <p style={{ fontSize: 12, color: 'var(--color-neutral-muted)' }}>
                            Waiting for the mentor to post an initial diagnosis or reply...
                          </p>
                        </div>
                      ) : (
                        activeRequest.messages.map((msg, idx) => {
                          const isMentor = msg.senderRole === 'mentor';
                          return (
                            <div
                              key={msg._id || idx}
                              className={`message-bubble ${isMentor ? 'mentor' : 'student'}`}
                              style={{
                                alignSelf: isMentor ? 'flex-start' : 'flex-end',
                                maxWidth: '85%',
                                backgroundColor: isMentor ? 'var(--color-ink-elevated)' : 'var(--color-charcoal)',
                                border: isMentor ? '1px solid var(--color-signal-border)' : '1px solid var(--color-border)',
                                borderRadius: 'var(--radius-xs)',
                                padding: '12px 14px',
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
                                <span style={{
                                  fontSize: 10,
                                  fontFamily: 'var(--font-mono)',
                                  fontWeight: 700,
                                  letterSpacing: '0.06em',
                                  color: isMentor ? 'var(--color-signal)' : 'var(--color-active-blue)',
                                }}>
                                  {isMentor ? `MENTOR // ${msg.senderName || activeRequest.mentor?.name || 'Mentor'}` : 'YOU (STUDENT)'}
                                </span>
                                <span style={{ fontSize: 10, color: 'var(--color-neutral-muted)', fontFamily: 'var(--font-mono)' }}>
                                  {formatTime(msg.createdAt)}
                                </span>
                              </div>
                              <p style={{ fontSize: 13, color: 'var(--color-warm-white)', lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                {msg.content}
                              </p>
                            </div>
                          );
                        })
                      )}
                    </div>

                    {/* Student Action Area: Close as Solved OR Ask Follow-Up */}
                    <div style={{ marginTop: 16 }}>
                      {showCloseCard ? (
                        /* Inline Closure Card */
                        <div style={{
                          backgroundColor: 'var(--color-ink-elevated)',
                          border: '1px solid var(--color-signal)',
                          borderRadius: 'var(--radius-xs)',
                          padding: 18,
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span className="status-pill resolved">Closing Session</span>
                              <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-warm-white)' }}>
                                Solved — confirm and rate session
                              </h3>
                            </div>
                            <button
                              type="button"
                              className="btn btn-secondary"
                              style={{ padding: '3px 8px', fontSize: 11 }}
                              onClick={() => setShowCloseCard(false)}
                            >
                              Cancel
                            </button>
                          </div>

                          <p style={{ fontSize: 12, color: 'var(--color-neutral)', marginBottom: 14 }}>
                            Only you can close this session. Rate the helpfulness of mentor <strong>{activeRequest.mentor?.name}</strong> to finalize and record your doubt as resolved.
                          </p>

                          {closeError && <div className="alert-banner error" style={{ marginBottom: 12 }}>{closeError}</div>}

                          <form onSubmit={handleConfirmClose} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <div>
                              <label className="form-label" style={{ marginBottom: 6, display: 'block' }}>
                                Rating (1 to 5)
                              </label>
                              <div className="rating-stars-group">
                                {[1, 2, 3, 4, 5].map((num) => (
                                  <button
                                    key={num}
                                    type="button"
                                    className={`star-btn ${closeRating === num ? 'selected' : ''}`}
                                    onClick={() => setCloseRating(num)}
                                    disabled={closeSubmitting}
                                  >
                                    {num}
                                  </button>
                                ))}
                              </div>
                            </div>

                            <div className="form-group">
                              <label className="form-label" htmlFor="close-comment">
                                Resolution Comment (Optional)
                              </label>
                              <textarea
                                id="close-comment"
                                className="form-textarea"
                                style={{ minHeight: 65 }}
                                placeholder="What insight or debugging step unblocked you?..."
                                value={closeComment}
                                onChange={(e) => setCloseComment(e.target.value)}
                              />
                            </div>

                            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
                              <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={() => setShowCloseCard(false)}
                                disabled={closeSubmitting}
                              >
                                Back to Discussion
                              </button>
                              <button
                                type="submit"
                                className="btn btn-primary"
                                disabled={closeSubmitting}
                              >
                                {closeSubmitting ? 'Closing Session...' : 'Confirm & Close Request'}
                              </button>
                            </div>
                          </form>
                        </div>
                      ) : (
                        /* Two Clear Choices: Solved OR Ask Follow-Up */
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            flexWrap: 'wrap',
                            gap: 12,
                            padding: '12px 16px',
                            backgroundColor: 'var(--color-ink-elevated)',
                            border: '1px solid var(--color-border)',
                            borderRadius: 'var(--radius-xs)',
                          }}>
                            <div>
                              <strong style={{ fontSize: 13, color: 'var(--color-warm-white)', display: 'block' }}>
                                Did the mentor's answer resolve your issue?
                              </strong>
                              <span style={{ fontSize: 11, color: 'var(--color-neutral-muted)' }}>
                                If you are unblocked, close this session with a verified rating.
                              </span>
                            </div>
                            <button
                              type="button"
                              className="btn btn-primary"
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px' }}
                              onClick={() => {
                                setShowCloseCard(true);
                                setCloseError(null);
                              }}
                            >
                              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                                <path d="M3 8.5L6.5 12L13 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                              <span>Solved — close request</span>
                            </button>
                          </div>

                          {/* Follow-Up Composer */}
                          <div style={{
                            backgroundColor: 'var(--color-ink-elevated)',
                            border: '1px solid var(--color-border)',
                            borderRadius: 'var(--radius-xs)',
                            padding: 16,
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                              <span className="form-label">Ask a Follow-Up</span>
                              <span className="form-hint">{followUpText.length} / 2000 characters</span>
                            </div>

                            {followUpError && <div className="alert-banner error" style={{ marginBottom: 10 }}>{followUpError}</div>}

                            <form onSubmit={handleSendFollowUp} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                              <textarea
                                className="form-textarea"
                                style={{ minHeight: 75 }}
                                placeholder="Need further clarification? Type your follow-up message, new error trace, or question..."
                                value={followUpText}
                                onChange={(e) => setFollowUpText(e.target.value)}
                                maxLength={2000}
                              />
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                                <span style={{ fontSize: 11, color: 'var(--color-neutral-muted)' }}>
                                  Posting keeps this request open with your assigned mentor.
                                </span>
                                <button
                                  type="submit"
                                  className="btn btn-secondary"
                                  disabled={followUpSubmitting || !followUpText.trim()}
                                  style={{ borderColor: 'var(--color-active-blue)', color: 'var(--color-warm-white)' }}
                                >
                                  {followUpSubmitting ? 'Sending...' : 'Ask a follow-up'}
                                </button>
                              </div>
                            </form>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Request Composer (When no active request exists) */
            <div className="section-card">
              <div className="section-card-header">
                <span className="section-card-title">Submit Help Request</span>
                <span style={{ fontSize: 11, color: 'var(--color-neutral-muted)', fontFamily: 'var(--font-mono)' }}>
                  FIFO QUEUE
                </span>
              </div>

              <div className="section-card-body">
                <form noValidate onSubmit={handleSubmitNewRequest} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                  {formError && (
                    <div className="alert-banner error" style={{ padding: '10px 14px' }}>
                      {formError}
                    </div>
                  )}

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
                        >
                          {cat.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Topic / Summary */}
                  <div className="form-group">
                    <label className="form-label" htmlFor="topic-input">
                      Topic / Blocker Summary <span style={{ color: 'var(--color-signal)' }}>*</span>
                    </label>
                    <input
                      id="topic-input"
                      type="text"
                      className={`form-input ${fieldErrors.topic ? 'has-error' : ''}`}
                      placeholder="e.g. Segmentation fault when inserting into binary search tree"
                      value={topic}
                      onChange={(e) => {
                        setTopic(e.target.value);
                        if (fieldErrors.topic) {
                          setFieldErrors((prev) => ({ ...prev, topic: null }));
                        }
                      }}
                      maxLength={100}
                      aria-invalid={!!fieldErrors.topic}
                      aria-describedby={fieldErrors.topic ? 'topic-error' : undefined}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span className="form-hint">{topic.length} / 100 characters (min 2)</span>
                    </div>
                    {fieldErrors.topic && (
                      <div className="form-field-error font-mono" id="topic-error" role="alert">
                        {fieldErrors.topic}
                      </div>
                    )}
                  </div>

                  {/* Problem Description */}
                  <div className="form-group">
                    <label className="form-label" htmlFor="description-input">
                      Detailed Problem Description <span style={{ color: 'var(--color-signal)' }}>*</span>
                    </label>
                    <textarea
                      id="description-input"
                      className={`form-textarea ${fieldErrors.description ? 'has-error' : ''}`}
                      placeholder="Describe what you tried, the observed vs expected behavior, and exact error message..."
                      value={description}
                      onChange={(e) => {
                        setDescription(e.target.value);
                        if (fieldErrors.description) {
                          setFieldErrors((prev) => ({ ...prev, description: null }));
                        }
                      }}
                      maxLength={1000}
                      aria-invalid={!!fieldErrors.description}
                      aria-describedby={fieldErrors.description ? 'description-error' : undefined}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span className="form-hint">{description.length} / 1000 characters (min 5)</span>
                    </div>
                    {fieldErrors.description && (
                      <div className="form-field-error font-mono" id="description-error" role="alert">
                        {fieldErrors.description}
                      </div>
                    )}
                  </div>

                  {/* Code Snippet */}
                  <div className="form-group">
                    <label className="form-label" htmlFor="code-snippet-input">
                      Code Snippet or Terminal Trace (Optional)
                    </label>
                    <textarea
                      id="code-snippet-input"
                      className={`form-textarea font-mono ${fieldErrors.codeSnippet ? 'has-error' : ''}`}
                      style={{ minHeight: 110 }}
                      placeholder="// Paste minimal reproducible code or terminal trace..."
                      value={codeSnippet}
                      onChange={(e) => {
                        setCodeSnippet(e.target.value);
                        if (fieldErrors.codeSnippet) {
                          setFieldErrors((prev) => ({ ...prev, codeSnippet: null }));
                        }
                      }}
                      maxLength={3000}
                      aria-invalid={!!fieldErrors.codeSnippet}
                      aria-describedby={fieldErrors.codeSnippet ? 'code-snippet-error' : undefined}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span className="form-hint">{codeSnippet.length} / 3000 characters</span>
                    </div>
                    {fieldErrors.codeSnippet && (
                      <div className="form-field-error font-mono" id="code-snippet-error" role="alert">
                        {fieldErrors.codeSnippet}
                      </div>
                    )}
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
                              <span className="form-label" style={{ fontSize: 10 }}>Code Snippet</span>
                              <pre className="code-box" style={{ marginTop: 2 }}>{req.codeSnippet}</pre>
                            </div>
                          )}

                          {req.mentor && (
                            <div style={{ fontSize: 12, color: 'var(--color-neutral)' }}>
                              Assigned Mentor: <strong>{req.mentor.name}</strong> ({req.mentor.email})
                            </div>
                          )}

                          {req.messages && req.messages.length > 0 && (
                            <div style={{ marginTop: 6 }}>
                              <span className="form-label" style={{ fontSize: 10, marginBottom: 4, display: 'block' }}>
                                Conversation Log ({req.messages.length} messages)
                              </span>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {req.messages.map((m, mIdx) => (
                                  <div key={m._id || mIdx} style={{ fontSize: 11, padding: '6px 10px', backgroundColor: 'var(--color-ink)', borderRadius: 'var(--radius-xs)', borderLeft: m.senderRole === 'mentor' ? '2px solid var(--color-signal)' : '2px solid var(--color-active-blue)' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--color-neutral-muted)', marginBottom: 2 }}>
                                      <span>{m.senderRole === 'mentor' ? `Mentor (${m.senderName || 'Mentor'})` : 'Student'}</span>
                                      <span>{formatTime(m.createdAt)}</span>
                                    </div>
                                    <div style={{ color: 'var(--color-warm-white)', whiteSpace: 'pre-wrap' }}>{m.content}</div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {req.resolutionNotes && (
                            <div className="history-note-box">
                              <strong style={{ fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-signal)' }}>
                                Mentor Resolution Notes:
                              </strong>
                              <p style={{ marginTop: 2, fontSize: 12 }}>{req.resolutionNotes}</p>
                            </div>
                          )}

                          {req.feedback?.comment && (
                            <div style={{ fontSize: 12, color: 'var(--color-neutral-muted)' }}>
                              Your Comment: <em>"{req.feedback.comment}"</em>
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
