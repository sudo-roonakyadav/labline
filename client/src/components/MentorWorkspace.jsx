import { useState, useMemo, useEffect } from 'react';
import ImageAttachmentPicker from './ImageAttachmentPicker.jsx';
import ImageLightboxModal from './ImageLightboxModal.jsx';
import AttachmentThumbnailGrid from './AttachmentThumbnailGrid.jsx';

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

function formatTime(dateString) {
  if (!dateString) return '';
  const d = new Date(dateString);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function MentorWorkspace({
  currentUser,
  mentorQueue = [],
  mentorQueueLoading = false,
  fetchQueue,
  onClaimRequest,
  onUpdateStatus,
  onToggleAvailability,
  onPostMessage,
  queueActionError = null,
  queueIntelligence = null,
}) {
  // Navigation Tabs: 'waiting_requests' | 'live_sessions' | 'session_history'
  const [viewTab, setViewTab] = useState('waiting_requests');

  // Filter & Search for Waiting Requests
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Active Live Session Selection & Reply Composer
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [replyImages, setReplyImages] = useState([]);
  const [replyImageError, setReplyImageError] = useState(null);
  const [replySubmitting, setReplySubmitting] = useState(false);
  const [replyError, setReplyError] = useState(null);

  // Lightbox Modal State
  const [activeLightboxImage, setActiveLightboxImage] = useState(null);

  // History State
  const [historyList, setHistoryList] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState(null);
  const [historyCategory, setHistoryCategory] = useState('all');
  const [historySearch, setHistorySearch] = useState('');

  const currentUserId = currentUser?._id || currentUser?.id;

  // 1. Segregate Waiting Requests (strict FIFO)
  const waitingRequests = useMemo(() => {
    return mentorQueue.filter((r) => r.status === 'waiting');
  }, [mentorQueue]);

  // 2. Segregate My Assigned Live Sessions
  const myAssignedRequests = useMemo(() => {
    return mentorQueue.filter((r) => {
      const mentorId = r.mentor?._id || r.mentor?.id || r.mentor;
      return (
        mentorId &&
        currentUserId &&
        mentorId.toString() === currentUserId.toString() &&
        ['claimed', 'in_progress', 'awaiting_mentor', 'awaiting_student'].includes(r.status)
      );
    });
  }, [mentorQueue, currentUserId]);

  // Count of assigned requests where student sent follow-up needing mentor action
  const actionNeededCount = useMemo(() => {
    return myAssignedRequests.filter((r) => r.status === 'awaiting_mentor').length;
  }, [myAssignedRequests]);

  // 3. Colleague Sessions for Floor Awareness
  const otherActiveRequests = useMemo(() => {
    return mentorQueue.filter((r) => {
      const mentorId = r.mentor?._id || r.mentor?.id || r.mentor;
      return (
        mentorId &&
        currentUserId &&
        mentorId.toString() !== currentUserId.toString() &&
        ['claimed', 'in_progress', 'awaiting_mentor', 'awaiting_student'].includes(r.status)
      );
    });
  }, [mentorQueue, currentUserId]);

  // Active Session Selected for Chat
  const activeSession = useMemo(() => {
    if (myAssignedRequests.length === 0) return null;
    if (selectedSessionId) {
      const found = myAssignedRequests.find((r) => r._id === selectedSessionId);
      if (found) return found;
    }
    // Default to the first request needing action, or first assigned
    const urgent = myAssignedRequests.find((r) => r.status === 'awaiting_mentor');
    return urgent || myAssignedRequests[0];
  }, [myAssignedRequests, selectedSessionId]);

  // Filtered Waiting Queue
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

  // Filtered History
  const filteredHistory = useMemo(() => {
    return historyList.filter((item) => {
      const matchesCategory =
        historyCategory === 'all' || item.category === historyCategory;
      const searchLower = historySearch.toLowerCase().trim();
      const matchesSearch =
        !searchLower ||
        item.topic?.toLowerCase().includes(searchLower) ||
        item.description?.toLowerCase().includes(searchLower) ||
        item.student?.name?.toLowerCase().includes(searchLower) ||
        item.resolutionNotes?.toLowerCase().includes(searchLower) ||
        item.feedback?.comment?.toLowerCase().includes(searchLower);
      return matchesCategory && matchesSearch;
    });
  }, [historyList, historyCategory, historySearch]);

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

  const handleClaimAndOpen = async (requestId) => {
    try {
      const ok = await onClaimRequest(requestId);
      if (ok) {
        setSelectedSessionId(requestId);
        setViewTab('live_sessions');
      }
    } catch (err) {
      // Handled in parent
    }
  };

  const handlePostReply = async (e) => {
    e.preventDefault();
    if (!activeSession || (!replyText.trim() && replyImages.length === 0) || !onPostMessage) return;
    setReplySubmitting(true);
    setReplyError(null);
    setReplyImageError(null);

    try {
      await onPostMessage(activeSession._id, replyText.trim(), replyImages);
      setReplyText('');
      setReplyImages([]);
      setReplyImageError(null);
    } catch (err) {
      setReplyError(err.message || 'Failed to post reply.');
    } finally {
      setReplySubmitting(false);
    }
  };

  const isMentorAvailable = currentUser?.isAvailable !== false;

  return (
    <div className="workspace-panel">
      {/* Mentor Header & Availability Controls */}
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <h1 className="page-heading">Mentor Dashboard</h1>
            <p className="page-subheading">
              Real-time engineering doubt triage. Accept requests from the FIFO queue, conduct interactive sessions, and review student feedback.
            </p>
          </div>

          {/* Availability Toggle */}
          <div className="availability-bar">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className={`pulse-dot ${isMentorAvailable ? 'active' : ''}`} style={{ width: 8, height: 8 }} />
              <span className="availability-label">
                {isMentorAvailable ? 'AVAILABLE FOR REQUESTS' : 'AWAY / BUSY'}
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
            className={`subnav-tab-btn ${viewTab === 'waiting_requests' ? 'active' : ''}`}
            onClick={() => setViewTab('waiting_requests')}
          >
            Waiting Requests ({waitingRequests.length})
          </button>
          <button
            type="button"
            className={`subnav-tab-btn ${viewTab === 'live_sessions' ? 'active' : ''}`}
            onClick={() => setViewTab('live_sessions')}
          >
            Live Sessions ({myAssignedRequests.length})
            {actionNeededCount > 0 && (
              <span className="attention-pill" style={{ marginLeft: 8 }}>
                {actionNeededCount} Action Needed
              </span>
            )}
          </button>
          <button
            type="button"
            className={`subnav-tab-btn ${viewTab === 'session_history' ? 'active' : ''}`}
            onClick={() => setViewTab('session_history')}
          >
            Session History &amp; Feedback
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
            <span className="telemetry-metric-lbl">In Session</span>
            <span className="telemetry-metric-val signal">{myAssignedRequests.length}</span>
          </div>
          <div className="telemetry-divider" />
          <div className="telemetry-metric">
            <span className="telemetry-metric-lbl">Active Mentors</span>
            <span className="telemetry-metric-val">
              {queueIntelligence?.availableMentors !== undefined ? queueIntelligence.availableMentors : 1}
            </span>
          </div>
          <div className="telemetry-divider" />
          <div className="telemetry-metric">
            <span className="telemetry-metric-lbl">Avg Resolution</span>
            <span className="telemetry-metric-val">
              {queueIntelligence?.averageResolutionMinutes
                ? `~${queueIntelligence.averageResolutionMinutes}m`
                : 'Calculating...'}
            </span>
          </div>
        </div>
      </div>

      {queueActionError && (
        <div className="alert-banner error" style={{ marginBottom: 20 }}>
          {queueActionError}
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* SECTION 1: WAITING REQUESTS (FIFO QUEUE)                          */}
      {/* ----------------------------------------------------------------- */}
      {viewTab === 'waiting_requests' && (
        <div className="section-card">
          <div className="section-card-header">
            <span className="section-card-title">
              Waiting Requests ({filteredWaitingQueue.length} / {waitingRequests.length})
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
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="search-icon"
                  aria-hidden="true"
                  style={{ color: 'var(--color-neutral-muted)' }}
                >
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="text"
                  className="search-input"
                  placeholder="Search requests..."
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
                    ? `No waiting requests in category "${selectedCategory}".`
                    : 'No students are currently waiting for assistance. Incoming requests will appear automatically in real-time.'}
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
                        onClick={() => handleClaimAndOpen(req._id)}
                      >
                        Accept request
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
      )}

      {/* ----------------------------------------------------------------- */}
      {/* SECTION 2: LIVE SESSIONS (ACTIVE CONVERSATIONS)                   */}
      {/* ----------------------------------------------------------------- */}
      {viewTab === 'live_sessions' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {myAssignedRequests.length === 0 ? (
            <div className="section-card">
              <div className="section-card-header">
                <span className="section-card-title">Live Sessions</span>
              </div>
              <div className="section-card-body">
                <div className="empty-box">
                  <div className="empty-box-title">No active sessions</div>
                  <div className="empty-box-desc">
                    You do not have any claimed requests in progress. Accept an incoming doubt from Waiting Requests to begin assisting a student.
                  </div>
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ marginTop: 12 }}
                    onClick={() => setViewTab('waiting_requests')}
                  >
                    View Waiting Requests ({waitingRequests.length})
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="live-sessions-layout">
              {/* Left Column: Assigned Sessions Selector List */}
              <div className="section-card">
                <div className="section-card-header">
                  <span className="section-card-title">
                    My Active Sessions ({myAssignedRequests.length})
                  </span>
                </div>
                <div className="section-card-body" style={{ padding: 14 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {myAssignedRequests.map((req) => {
                      const isSelected = activeSession?._id === req._id;
                      const isAwaitingMentor = req.status === 'awaiting_mentor';
                      return (
                        <button
                          key={req._id}
                          type="button"
                          className={`session-item-card ${isSelected ? 'selected' : ''} ${isAwaitingMentor ? 'action-needed' : ''}`}
                          onClick={() => {
                            setSelectedSessionId(req._id);
                            setReplyError(null);
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, width: '100%' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                              <span className={`category-pill ${req.category}`}>{req.category}</span>
                              {isAwaitingMentor ? (
                                <span className="attention-pill urgent">Follow-Up</span>
                              ) : (
                                <span className={`status-pill ${req.status}`}>
                                  {req.status === 'awaiting_student'
                                    ? 'Awaiting Student'
                                    : req.status === 'in_progress'
                                    ? 'In Session'
                                    : 'Claimed'}
                                </span>
                              )}
                            </div>
                            <span style={{ fontSize: 11, color: 'var(--color-neutral-muted)', fontFamily: 'var(--font-mono)' }}>
                              {formatDuration(req.claimedAt || req.createdAt)}
                            </span>
                          </div>

                          <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--color-warm-white)', textAlign: 'left', lineHeight: 1.3 }}>
                            {req.topic}
                          </div>

                          <div style={{ fontSize: 12, color: 'var(--color-neutral)', textAlign: 'left' }}>
                            Student: {req.student?.name}
                          </div>

                          {isAwaitingMentor && (
                            <div
                              className="font-mono"
                              style={{
                                fontSize: 10,
                                color: 'var(--color-amber)',
                                letterSpacing: '0.04em',
                                marginTop: 2,
                                textAlign: 'left',
                              }}
                            >
                              [ACTION NEEDED] Student sent follow-up
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Right Column: Active Conversation & Detail Panel */}
              {activeSession && (
                <div className="section-card">
                  <div className="section-card-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <span className="section-card-title">{activeSession.topic}</span>
                      <span className={`category-pill ${activeSession.category}`}>{activeSession.category}</span>
                      {activeSession.status === 'awaiting_mentor' && (
                        <span className="attention-pill urgent">
                          [ACTION NEEDED] Student sent follow-up
                        </span>
                      )}
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--color-neutral-muted)', fontFamily: 'var(--font-mono)' }}>
                      Elapsed: {formatDuration(activeSession.claimedAt || activeSession.createdAt)}
                    </span>
                  </div>

                  <div className="section-card-body">
                    {/* Guidance Notice Banner */}
                    <div
                      style={{
                        backgroundColor: 'var(--color-ink-elevated)',
                        border: '1px solid var(--color-border)',
                        borderRadius: 'var(--radius-xs)',
                        padding: '10px 14px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        fontSize: 12,
                        color: 'var(--color-neutral)',
                      }}
                    >
                      <span>
                        Student: <strong style={{ color: 'var(--color-warm-white)' }}>{activeSession.student?.name}</strong> ({activeSession.student?.email})
                      </span>
                      <span className="font-mono" style={{ fontSize: 11, color: 'var(--color-signal)' }}>
                        Sessions are closed and rated directly by the student once solved.
                      </span>
                    </div>

                    {/* Original Problem Description & Code */}
                    <div style={{ backgroundColor: 'var(--color-charcoal-light)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-xs)', padding: 14 }}>
                      <div className="form-label" style={{ fontSize: 10, marginBottom: 4 }}>
                        STUDENT DOUBT DESCRIPTION
                      </div>
                      <p style={{ fontSize: 13, color: 'var(--color-warm-white)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                        {activeSession.description}
                      </p>

                      {activeSession.codeSnippet && (
                        <div style={{ marginTop: 10 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                            <span className="form-label" style={{ fontSize: 10 }}>STUDENT CODE / TERMINAL SNIPPET</span>
                            <button
                              type="button"
                              className="btn btn-secondary"
                              style={{ padding: '2px 8px', fontSize: 11 }}
                              onClick={() => navigator.clipboard?.writeText(activeSession.codeSnippet)}
                            >
                              Copy
                            </button>
                          </div>
                          <pre className="code-box" style={{ fontSize: 12, maxHeight: 160 }}>{activeSession.codeSnippet}</pre>
                        </div>
                      )}

                      {activeSession.attachments && activeSession.attachments.length > 0 && (
                        <div style={{ marginTop: 12 }}>
                          <div className="form-label" style={{ fontSize: 10, marginBottom: 6 }}>
                            STUDENT ATTACHMENTS ({activeSession.attachments.length})
                          </div>
                          <AttachmentThumbnailGrid
                            attachments={activeSession.attachments}
                            requestId={activeSession._id}
                            onOpenLightbox={(img) => setActiveLightboxImage(img)}
                            layout="row"
                          />
                        </div>
                      )}
                    </div>

                    {/* Conversation History Area */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span className="form-label" style={{ color: 'var(--color-warm-white)', fontWeight: 700 }}>
                          Conversation History ({activeSession.messages?.length || 0})
                        </span>
                        <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-neutral-muted)' }}>
                          Live Synchronized
                        </span>
                      </div>

                      <div className="conversation-thread">
                        {(!activeSession.messages || activeSession.messages.length === 0) ? (
                          <div style={{ textAlign: 'center', padding: '28px 16px', color: 'var(--color-neutral)' }}>
                            <p style={{ fontSize: 13, marginBottom: 4 }}>
                              You accepted this request.
                            </p>
                            <p style={{ fontSize: 12, color: 'var(--color-neutral-muted)' }}>
                              Post an initial reply below with your diagnosis, guidance, or questions to help the student.
                            </p>
                          </div>
                        ) : (
                          activeSession.messages.map((msg, idx) => {
                            const isMentor = msg.senderRole === 'mentor';
                            return (
                              <div
                                key={msg._id || idx}
                                className={`message-bubble ${isMentor ? 'mentor' : 'student'}`}
                                style={{
                                  alignSelf: isMentor ? 'flex-end' : 'flex-start',
                                  maxWidth: '85%',
                                  backgroundColor: isMentor ? 'var(--color-charcoal)' : 'var(--color-ink-elevated)',
                                  border: isMentor ? '1px solid var(--color-signal-border)' : '1px solid var(--color-border)',
                                  borderRadius: 'var(--radius-xs)',
                                  padding: '12px 14px',
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
                                  <span
                                    style={{
                                      fontSize: 10,
                                      fontFamily: 'var(--font-mono)',
                                      fontWeight: 700,
                                      letterSpacing: '0.06em',
                                      color: isMentor ? 'var(--color-signal)' : 'var(--color-active-blue)',
                                    }}
                                  >
                                    {isMentor ? `YOU (MENTOR) // ${msg.senderName || currentUser?.name || 'Mentor'}` : `STUDENT // ${msg.senderName || activeSession.student?.name || 'Student'}`}
                                  </span>
                                  <span style={{ fontSize: 10, color: 'var(--color-neutral-muted)', fontFamily: 'var(--font-mono)' }}>
                                    {formatTime(msg.createdAt)}
                                  </span>
                                </div>
                                {msg.content ? (
                                  <p style={{ fontSize: 13, color: 'var(--color-warm-white)', lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                    {msg.content}
                                  </p>
                                ) : null}
                                {msg.attachments && msg.attachments.length > 0 && (
                                  <div style={{ marginTop: 8 }}>
                                    <AttachmentThumbnailGrid
                                      attachments={msg.attachments}
                                      requestId={activeSession._id}
                                      onOpenLightbox={setActiveLightboxImage}
                                      layout="row"
                                    />
                                  </div>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>

                    {/* Post Reply Composer */}
                    <form onSubmit={handlePostReply} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div className="form-group">
                        <label className="form-label" htmlFor="mentor-reply-input">
                          Post Reply to Student
                        </label>
                        <textarea
                          id="mentor-reply-input"
                          className="form-textarea"
                          style={{ minHeight: 90 }}
                          placeholder="Type your explanation, diagnostic hints, or solution here to guide the student..."
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                          maxLength={2000}
                          disabled={replySubmitting}
                        />
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span className="form-hint">
                            {replyText.length} / 2000 characters. Posting keeps the session active for student testing.
                          </span>
                          <span style={{ fontSize: 11, color: 'var(--color-neutral-muted)' }}>
                            Press Post reply to update student in real time.
                          </span>
                        </div>
                      </div>

                      {/* Image Attachment Picker */}
                      <div style={{ marginTop: -2 }}>
                        <ImageAttachmentPicker
                          selectedFiles={replyImages}
                          onFilesChange={setReplyImages}
                          maxFiles={3}
                          disabled={replySubmitting}
                          error={replyImageError}
                          onError={setReplyImageError}
                        />
                      </div>

                      {replyError && <div className="alert-banner error">{replyError}</div>}

                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                        <button
                          type="submit"
                          className="btn btn-primary"
                          disabled={replySubmitting || (!replyText.trim() && replyImages.length === 0)}
                        >
                          {replySubmitting ? 'Posting reply...' : 'Post reply'}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Other Mentors' Active Sessions (Floor Activity) */}
          {otherActiveRequests.length > 0 && (
            <div className="section-card">
              <div className="section-card-header">
                <span className="section-card-title" style={{ fontSize: 13, color: 'var(--color-neutral)' }}>
                  Colleague Sessions on Floor ({otherActiveRequests.length})
                </span>
              </div>
              <div className="section-card-body">
                <div className="queue-list">
                  {otherActiveRequests.map((req) => (
                    <div key={req._id} className="queue-item" style={{ opacity: 0.85, padding: 14 }}>
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
                        <span style={{ fontSize: 11, color: 'var(--color-neutral-muted)', fontFamily: 'var(--font-mono)' }}>
                          {formatDuration(req.inProgressAt || req.claimedAt)}
                        </span>
                      </div>
                      <div className="queue-item-title" style={{ fontSize: 13 }}>
                        {req.topic}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ----------------------------------------------------------------- */}
      {/* SECTION 3: SESSION HISTORY & FEEDBACK                             */}
      {/* ----------------------------------------------------------------- */}
      {viewTab === 'session_history' && (
        <div className="section-card">
          <div className="section-card-header">
            <span className="section-card-title">
              Session History &amp; Feedback ({filteredHistory.length} / {historyList.length})
            </span>
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
            {/* History Filter Bar */}
            <div className="filter-bar">
              <div className="filter-pills">
                <button
                  type="button"
                  className={`filter-pill ${historyCategory === 'all' ? 'active' : ''}`}
                  onClick={() => setHistoryCategory('all')}
                >
                  All ({historyList.length})
                </button>
                {CATEGORIES.map((cat) => {
                  const count = historyList.filter((item) => item.category === cat.id).length;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      className={`filter-pill ${historyCategory === cat.id ? 'active' : ''}`}
                      onClick={() => setHistoryCategory(cat.id)}
                    >
                      {cat.label} {count > 0 ? `(${count})` : ''}
                    </button>
                  );
                })}
              </div>

              <div className="search-input-wrap">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="search-icon"
                  aria-hidden="true"
                  style={{ color: 'var(--color-neutral-muted)' }}
                >
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="text"
                  className="search-input"
                  placeholder="Search history & feedback..."
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                />
              </div>
            </div>

            {historyError && <div className="alert-banner error">{historyError}</div>}

            {filteredHistory.length === 0 ? (
              <div className="empty-box">
                <div className="empty-box-title">No completed sessions recorded</div>
                <div className="empty-box-desc">
                  Resolved tickets with verified student ratings and reflections will appear here.
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {filteredHistory.map((item) => (
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
                            Rating: {item.feedback.rating}/5
                          </span>
                        ) : (
                          <span style={{ fontSize: 11, color: 'var(--color-neutral-muted)' }}>
                            No rating recorded
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
                          Diagnostic Notes:
                        </strong>
                        <p style={{ marginTop: 2, fontSize: 13 }}>{item.resolutionNotes}</p>
                      </div>
                    )}

                    {item.feedback?.comment && (
                      <div style={{ fontSize: 12, color: 'var(--color-neutral-muted)' }}>
                        Student Reflection: <em>"{item.feedback.comment}"</em>
                      </div>
                    )}

                    {item.attachments && item.attachments.length > 0 && (
                      <div style={{ marginTop: 4 }}>
                        <AttachmentThumbnailGrid
                          attachments={item.attachments}
                          requestId={item._id}
                          onOpenLightbox={setActiveLightboxImage}
                          layout="row"
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Lightbox Modal */}
      {activeLightboxImage && (
        <ImageLightboxModal
          attachment={activeLightboxImage}
          onClose={() => setActiveLightboxImage(null)}
        />
      )}
    </div>
  );
}
