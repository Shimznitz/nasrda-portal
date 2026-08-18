// src/app/staff/tasks/page.tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import './tasks.css';

const initials = (name: string) =>
  name?.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase() || '??';

const STATUS_CLASS: Record<string, string> = {
  COMPLETED:    'st-badge-done',
  UNDER_REVIEW: 'st-badge-review',
  PENDING:      'st-badge-pending',
  IN_PROGRESS:  'st-badge-active',
  REJECTED:     'st-badge-rejected',
};

const PRIORITY_CLASS: Record<string, string> = {
  LOW:    'st-pri-low',
  NORMAL: 'st-pri-normal',
  HIGH:   'st-pri-high',
  URGENT: 'st-pri-urgent',
};

function StaffSearchDropdown({ value, onChange, onSelect, results, searching }: any) {
  return (
    <>
      <input 
        className="st-input" 
        placeholder="Search staff by name…"
        value={value} 
        onChange={e => onChange(e.target.value)} 
        autoComplete="off" 
      />
      {value.length >= 2 && (
        <div className="st-search-drop">
          {searching && <div className="st-search-empty">Searching…</div>}
          {!searching && results.length === 0 && <div className="st-search-empty">No staff found.</div>}
          {results.map((s: any) => (
            <div key={s.id} className="st-search-item" onClick={() => onSelect(s)}>
              <div className="st-mini-avatar">{initials(s.name)}</div>
              <div>
                <div className="st-search-name">{s.name}</div>
                <div className="st-search-role">{s.designation || '—'}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ── STANDALONE SUBMIT MODAL ───────────────────────────────────
function StandaloneSubmitModal({ task, currentUser, onClose, onSuccess }: any) {
  const [comment, setComment] = useState('');
  const [files, setFiles]     = useState<File[]>([]);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState('');

  const submit = async () => {
    setSaving(true); setError('');
    let uploadedUrls: string[] = [];

    for (const file of files) {
      const path = `standalone/${task.id}/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from('submissions').upload(path, file);
      if (!upErr) {
        const { data: urlData } = supabase.storage.from('submissions').getPublicUrl(path);
        uploadedUrls.push(urlData.publicUrl);
      }
    }

    const { error: subErr } = await supabase.from('submissions').insert({
      task_id: task.id,
      project_id: null,
      submitted_by: currentUser.id,
      description: comment.trim() || null,
      file_urls: uploadedUrls,
      status: 'PENDING',
    });

    if (subErr) { setError(subErr.message); setSaving(false); return; }

    await supabase.from('tasks').update({ status: 'UNDER_REVIEW' }).eq('id', task.id);

    // Notify assigner
    if (task.assigned_by !== currentUser.id) {
      await supabase.from('notifications').insert({
        user_id: task.assigned_by,
        type: 'SUBMISSION_REVIEW',
        title: `Work submitted: ${task.title}`,
        body: `${currentUser.name} submitted work for review.`,
        link: '/staff/tasks',
        read: false,
      });
    }

    onSuccess();
  };

  return (
    <div className="st-modal" onClick={e => e.stopPropagation()}>
      <div className="st-modal-header">
        <h2>Submit Work</h2>
        <button className="st-modal-close" onClick={onClose}>✕</button>
      </div>
      <div className="st-modal-task-name">{task.title}</div>
      {error && <div className="st-error">{error}</div>}
      <div className="st-form-group">
        <label>Notes / Description</label>
        <textarea className="st-input" rows={4} value={comment}
          onChange={e => setComment(e.target.value)}
          placeholder="Describe what you completed…" />
      </div>
      <div className="st-form-group">
        <label>Attachments (optional)</label>
        <input type="file" multiple className="st-file-input"
          onChange={e => setFiles(Array.from(e.target.files || []))} />
        {files.length > 0 && (
          <div className="st-file-hint">{files.length} file{files.length > 1 ? 's' : ''} selected</div>
        )}
      </div>
      <div className="st-modal-actions">
        <button className="st-btn-outline" onClick={onClose}>Cancel</button>
        <button className="st-btn-gold" onClick={submit} disabled={saving}>
          {saving ? 'Submitting…' : 'Submit for Review'}
        </button>
      </div>
    </div>
  );
}

// ── STANDALONE REVIEW MODAL ───────────────────────────────────
function StandaloneReviewModal({ task, currentUser, onClose, onSuccess }: any) {
  const [submission, setSubmission] = useState<any>(null);
  const [feedback, setFeedback]     = useState('');
  const [saving, setSaving]         = useState(false);
  const [loading, setLoading]       = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('submissions')
        .select('*')
        .eq('task_id', task.id)
        .eq('status', 'PENDING')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      setSubmission(data);
      setLoading(false);
    };
    load();
  }, [task.id]);

  const handle = async (approved: boolean) => {
    if (!submission) return;
    setSaving(true);

    await supabase.from('submissions').update({
      status: approved ? 'COMPLETED' : 'REJECTED',
      admin_feedback: feedback.trim() || null,
    }).eq('id', submission.id);

    await supabase.from('tasks').update({
      status: approved ? 'COMPLETED' : 'PENDING',
      ...(approved ? { completed_at: new Date().toISOString() } : {}),
    }).eq('id', task.id);

    await supabase.from('notifications').insert({
      user_id: task.assigned_to,
      type: approved ? 'TASK_APPROVED' : 'TASK_REJECTED',
      title: approved ? `Task approved: ${task.title}` : `Revision needed: ${task.title}`,
      body: feedback || (approved ? 'Your work has been approved.' : 'Please revise and resubmit.'),
      link: '/staff/tasks',
      read: false,
    });

    onSuccess();
  };

  if (loading) return (
    <div className="st-modal" onClick={e => e.stopPropagation()}>
      <div className="st-modal-loading">Loading submission…</div>
    </div>
  );

  return (
    <div className="st-modal" onClick={e => e.stopPropagation()}>
      <div className="st-modal-header">
        <h2>Review Submission</h2>
        <button className="st-modal-close" onClick={onClose}>✕</button>
      </div>
      <div className="st-modal-task-name">{task.title}</div>

      {!submission ? (
        <div className="st-modal-empty">No pending submission found.</div>
      ) : (
        <>
          {submission.description && (
            <div className="st-review-section">
              <div className="st-review-label">Staff Notes</div>
              <div className="st-review-text">{submission.description}</div>
            </div>
          )}
          {submission.file_urls?.length > 0 && (
            <div className="st-review-section">
              <div className="st-review-label">Attachments</div>
              <div className="st-sub-files">
                {submission.file_urls.map((url: string, i: number) => (
                  <a key={i} href={url} target="_blank" rel="noreferrer" className="st-sub-file">
                    📎 File {i + 1}
                  </a>
                ))}
              </div>
            </div>
          )}
          <div className="st-review-section">
            <div className="st-review-label">Submitted</div>
            <div className="st-review-date">
              {new Date(submission.created_at).toLocaleDateString('en-GB', {
                day: 'numeric', month: 'long', year: 'numeric'
              })} at {new Date(submission.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
          <div className="st-form-group">
            <label>Feedback (optional)</label>
            <textarea className="st-input" rows={3} value={feedback}
              onChange={e => setFeedback(e.target.value)}
              placeholder="Leave feedback for the staff member…" />
          </div>
          <div className="st-modal-actions">
            <button className="st-btn-outline" onClick={onClose}>Cancel</button>
            <button className="st-btn-reject" onClick={() => handle(false)} disabled={saving}>
              Request Revision
            </button>
            <button className="st-btn-gold" onClick={() => handle(true)} disabled={saving}>
              {saving ? 'Approving…' : 'Approve'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ── STANDALONE ROUTE MODAL ────────────────────────────────────
function StandaloneRouteModal({ task, currentUser, onClose, onSuccess }: any) {
  const [fileName, setFileName]         = useState('');
  const [fileUrl, setFileUrl]           = useState('');
  const [note, setNote]                 = useState('');
  const [staffSearch, setStaffSearch]   = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selected, setSelected]         = useState<any[]>([]);
  const [searching, setSearching]       = useState(false);
  const [saving, setSaving]             = useState(false);
  const [error, setError]               = useState('');

  useEffect(() => {
    if (staffSearch.length < 2) { setSearchResults([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      const { data } = await supabase.from('profiles')
        .select('id, name, designation')
        .ilike('name', `%${staffSearch}%`)
        .neq('id', currentUser.id)
        .limit(12);
      setSearchResults(data || []);
      setSearching(false);
    }, 300);
    return () => clearTimeout(t);
  }, [staffSearch]);

  const toggle = (staff: any) => {
    const exists = selected.find(s => s.id === staff.id);
    if (exists) setSelected(prev => prev.filter(s => s.id !== staff.id));
    else setSelected(prev => [...prev, staff]);
  };

  const save = async () => {
    if (!fileName.trim()) { setError('File name required.'); return; }
    if (!fileUrl.trim()) { setError('File link required.'); return; }
    if (selected.length === 0) { setError('Select at least one recipient.'); return; }
    setSaving(true); setError('');

    const { data: route, error: routeErr } = await supabase.from('file_routes').insert({
      task_id: task.id,
      file_name: fileName.trim(),
      file_url: fileUrl.trim(),
      file_type: 'link',
      created_by: currentUser.id,
      status: 'ACTIVE',
    }).select().single();

    if (routeErr || !route) { setError(routeErr?.message || 'Failed.'); setSaving(false); return; }

    await supabase.from('file_route_recipients').insert(
      selected.map(s => ({
        route_id: route.id, profile_id: s.id,
        added_by: currentUser.id, status: 'PENDING',
      }))
    );

    await supabase.from('file_route_events').insert({
      route_id: route.id, actor_id: currentUser.id,
      action: 'CREATED', note: note.trim() || null,
    });

    for (const s of selected) {
      await supabase.from('notifications').insert({
        user_id: s.id, type: 'FILE_ROUTED',
        title: `File routed to you: ${fileName}`,
        body: `${currentUser.name} sent you a file to review.`,
        link: '/staff/documents', read: false,
      });
    }

    onSuccess();
    onClose();
  };

  const initials = (name: string) =>
    name?.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase() || '??';

  return (
    <div className="st-modal" onClick={e => e.stopPropagation()}>
      <div className="st-modal-header">
        <h2>📎 Route File</h2>
        <button className="st-modal-close" onClick={onClose}>✕</button>
      </div>
      <div className="st-modal-task-name">{task.title}</div>
      {error && <div className="st-error">{error}</div>}
      <div className="st-form-group">
        <label>File Name *</label>
        <input className="st-input" value={fileName}
          onChange={e => setFileName(e.target.value)}
          placeholder="e.g. Budget Report Q3.xlsx" />
      </div>
      <div className="st-form-group">
        <label>Google Drive / Docs Link *</label>
        <input className="st-input" value={fileUrl}
          onChange={e => setFileUrl(e.target.value)}
          placeholder="https://docs.google.com/…" />
      </div>
      <div className="st-form-group">
        <label>Note (optional)</label>
        <textarea className="st-input" rows={2} value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="Instructions for recipients…" />
      </div>
      <div className="st-form-group" style={{ position: 'relative' }}>
        <label>Route To *</label>
        <input className="st-input" value={staffSearch}
          onChange={e => setStaffSearch(e.target.value)}
          placeholder="Search staff by name…" autoComplete="off" />
        {staffSearch.length >= 2 && (
          <div className="st-search-drop">
            {searching && <div className="st-search-empty">Searching…</div>}
            {!searching && searchResults.length === 0 && <div className="st-search-empty">No staff found.</div>}
            {searchResults.map((s: any) => (
              <div key={s.id} className={`st-search-item ${selected.find(r => r.id === s.id) ? 'selected' : ''}`}
                onClick={() => toggle(s)}>
                <div className="st-mini-avatar">{initials(s.name)}</div>
                <div>
                  <div className="st-search-name">{s.name}</div>
                  <div className="st-search-role">{s.designation}</div>
                </div>
                {selected.find(r => r.id === s.id) && <span style={{ color: 'var(--gold)', marginLeft: 'auto' }}>✓</span>}
              </div>
            ))}
          </div>
        )}
      </div>
      {selected.length > 0 && (
        <div className="st-form-group">
          <label>Selected ({selected.length})</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {selected.map(s => (
              <span key={s.id} className="st-selected-pill">
                {s.name} <button onClick={() => toggle(s)}>✕</button>
              </span>
            ))}
          </div>
        </div>
      )}
      <div className="st-modal-actions">
        <button className="st-btn-outline" onClick={onClose}>Cancel</button>
        <button className="st-btn-gold" onClick={save} disabled={saving || selected.length === 0}>
          {saving ? 'Routing…' : `Route to ${selected.length} person${selected.length !== 1 ? 's' : ''}`}
        </button>
      </div>
    </div>
  );
}

export default function TasksPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [tasks, setTasks]             = useState<any[]>([]);
  const [loading, setLoading]         = useState(true);
  const [showCreate, setShowCreate]   = useState(false);
  const [activeTask, setActiveTask]         = useState<any>(null);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [showRouteModal, setShowRouteModal]  = useState(false);

  // Filters
  const [search, setSearch]             = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterView, setFilterView]     = useState<'mine' | 'assigned_by_me' | 'all'>('mine');

  // Create form
  const [form, setForm] = useState({
    title: '', description: '', due_date: '', priority: 'NORMAL'
  });
  const [assignSearch, setAssignSearch]       = useState('');
  const [assignResults, setAssignResults]     = useState<any[]>([]);
  const [assignedTo, setAssignedTo]           = useState<any>(null);
  const [assignSearching, setAssignSearching] = useState(false);
  const [saving, setSaving]                   = useState(false);
  const [error, setError]                     = useState('');

  const loadTasks = useCallback(async (userId: string, prof: any) => {
  const isPrivileged = ['DG', 'SUPER_ADMIN', 'DEPT_ADMIN', 'DIVISION_HEAD', 'UNIT_HEAD'].includes(prof?.role);

  let query = supabase
    .from('tasks')
    .select(`
      id, title, description, status, due_date, priority,
      assigned_to, assigned_by, completed_at, created_at, project_id,
      assignee:profiles!assigned_to(id, name, designation),
      assigner:profiles!assigned_by(id, name, designation)
    `)
    .is('project_id', null)
    .order('created_at', { ascending: false });

  // Filter scope: Non-privileged users only see tasks assigned to/by them
  if (!isPrivileged) {
    query = query.or(`assigned_to.eq.${userId},assigned_by.eq.${userId}`);
  }

  const { data, error: err } = await query;
  if (err) {
    console.error('Tasks load error:', err);
    return;
  }

  // Fetch latest submission per task
  const taskIds = (data || []).map((t) => t.id);
  let subMap: Record<string, any> = {};

  if (taskIds.length > 0) {
    const { data: subs } = await supabase
      .from('submissions')
      .select('*')
      .in('task_id', taskIds)
      .order('created_at', { ascending: false });

    // Keep only latest submission per task
    (subs || []).forEach((s: any) => {
      if (!subMap[s.task_id]) subMap[s.task_id] = s;
    });
  }

  // Attach latest submission object to task
  const enriched = (data || []).map((t) => ({
    ...t,
    latest_submission: subMap[t.id] || null,
  }));

  setTasks(enriched);
}, []);

  const loadPage = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: prof } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    setCurrentUser(prof);
    await loadTasks(user.id, prof);
    setLoading(false);
  }, [loadTasks]);

  useEffect(() => { 
    loadPage(); 
  }, [loadPage]);

  // Assignee search with debounce
  useEffect(() => {
    if (assignSearch.length < 2) { setAssignResults([]); return; }
    const t = setTimeout(async () => {
      setAssignSearching(true);
      const { data } = await supabase.from('profiles')
        .select('id, name, designation')
        .ilike('name', `%${assignSearch}%`)
        .limit(10);
      setAssignResults(data || []);
      setAssignSearching(false);
    }, 300);
    return () => clearTimeout(t);
  }, [assignSearch]);

  const createTask = async () => {
    if (!form.title.trim()) { setError('Title is required.'); return; }
    if (!assignedTo) { setError('Please assign this task to someone.'); return; }
    setSaving(true); setError('');

    const { data: task, error: err } = await supabase.from('tasks').insert({
      title: form.title.trim(),
      description: form.description.trim() || null,
      due_date: form.due_date || null,
      priority: form.priority,
      assigned_to: assignedTo.id,
      assigned_by: currentUser.id,
      status: 'PENDING',
      project_id: null,
    }).select().single();

    if (err || !task) { 
      setError(err?.message || 'Failed to create task.'); 
      setSaving(false); 
      return; 
    }

    await supabase.from('notifications').insert({
      user_id: assignedTo.id,
      type: 'TASK_ASSIGNED',
      title: `New task: ${form.title}`,
      body: `${currentUser.name} assigned you a standalone task.`,
      link: '/staff/tasks',
      read: false,
    });

    await supabase.from('activity_logs').insert({
      actor_id: currentUser.id,
      entity_type: 'TASK',
      entity_id: task.id,
      action: 'CREATED',
      note: `Standalone task "${form.title}" created`,
    });

    setForm({ title: '', description: '', due_date: '', priority: 'NORMAL' });
    setAssignedTo(null);
    setAssignSearch('');
    setShowCreate(false);
    await loadTasks(currentUser.id, currentUser);
    setSaving(false);
  };

  const filtered = tasks.filter(t => {
    const matchSearch = !search ||
      t.title?.toLowerCase().includes(search.toLowerCase()) ||
      t.description?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = !filterStatus || t.status === filterStatus;
    const matchView = filterView === 'all' ? true
      : filterView === 'mine' ? t.assigned_to === currentUser?.id
      : t.assigned_by === currentUser?.id;
    return matchSearch && matchStatus && matchView;
  });

  const myCount       = tasks.filter(t => t.assigned_to === currentUser?.id).length;
  const assignedCount = tasks.filter(t => t.assigned_by === currentUser?.id).length;
  const urgentCount   = tasks.filter(t => t.priority === 'URGENT' && t.status !== 'COMPLETED').length;

  if (loading) return (
    <div className="st-loading"><div className="st-loading-bar" /><span>Loading tasks…</span></div>
  );

  return (
    <div className="st-page">
      <div className="st-header">
        <div>
          <h1 className="st-title">Tasks</h1>
          <p className="st-sub">Standalone tasks not tied to a project</p>
        </div>
        <button className="st-btn-gold" onClick={() => setShowCreate(!showCreate)}>
          {showCreate ? '✕ Cancel' : '+ New Task'}
        </button>
      </div>

      {/* Metrics */}
      <div className="st-metrics">
        <div className="st-metric">
          <div className="st-metric-value">{myCount}</div>
          <div className="st-metric-label">Assigned to me</div>
        </div>
        <div className="st-metric">
          <div className="st-metric-value">{assignedCount}</div>
          <div className="st-metric-label">I assigned</div>
        </div>
        <div className="st-metric st-metric-accent">
          <div className="st-metric-value">{urgentCount}</div>
          <div className="st-metric-label">Urgent open</div>
        </div>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="st-create-panel">
          <div className="st-create-header">New Standalone Task</div>
          {error && <div className="st-error">{error}</div>}
          <div className="st-form-row">
            <div className="st-form-group">
              <label>Title *</label>
              <input className="st-input" placeholder="Task title…"
                value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
            </div>
            <div className="st-form-group">
              <label>Priority</label>
              <select className="st-input" value={form.priority}
                onChange={e => setForm({ ...form, priority: e.target.value })}>
                <option value="LOW">Low</option>
                <option value="NORMAL">Normal</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent</option>
              </select>
            </div>
            <div className="st-form-group">
              <label>Due Date</label>
              <input type="date" className="st-input" value={form.due_date}
                onChange={e => setForm({ ...form, due_date: e.target.value })} />
            </div>
          </div>
          <div className="st-form-group">
            <label>Description</label>
            <textarea className="st-input" rows={2} value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="st-form-group" style={{ position: 'relative' }}>
            <label>Assign To *</label>
            {assignedTo ? (
              <div className="st-selected-assignee">
                <div className="st-mini-avatar">{initials(assignedTo.name)}</div>
                <span>{assignedTo.name}</span>
                <button onClick={() => { setAssignedTo(null); setAssignSearch(''); }}>✕</button>
              </div>
            ) : (
              <StaffSearchDropdown
                value={assignSearch} onChange={setAssignSearch}
                onSelect={(s: any) => { setAssignedTo(s); setAssignSearch(''); setAssignResults([]); }}
                results={assignResults} searching={assignSearching}
              />
            )}
          </div>
          <div className="st-create-actions">
            <button className="st-btn-outline" onClick={() => setShowCreate(false)}>Cancel</button>
            <button className="st-btn-gold" onClick={createTask} disabled={saving}>
              {saving ? 'Creating…' : 'Create Task'}
            </button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="st-controls">
        <input className="st-search" placeholder="Search tasks…"
          value={search} onChange={e => setSearch(e.target.value)} />
        <div className="st-filter-tabs">
          {(['mine', 'assigned_by_me', 'all'] as const).map(v => (
            <button key={v} className={filterView === v ? 'active' : ''}
              onClick={() => setFilterView(v)}>
              {v === 'mine' ? 'My Tasks' : v === 'assigned_by_me' ? 'I Assigned' : 'All'}
            </button>
          ))}
        </div>
        <select className="st-status-filter" value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="PENDING">Pending</option>
          <option value="IN_PROGRESS">In Progress</option>
          <option value="UNDER_REVIEW">Under Review</option>
          <option value="COMPLETED">Completed</option>
          <option value="REJECTED">Rejected</option>
        </select>
      </div>

      {/* Task list */}
      {filtered.length === 0 ? (
        <div className="st-empty">
          <p>{search || filterStatus ? 'No tasks match your filters.' : 'No standalone tasks yet.'}</p>
        </div>
      ) : (
        <div className="st-list">
          {filtered.map(t => {
  const isAssignee = t.assigned_to === currentUser?.id;
  const isAssigner = t.assigned_by === currentUser?.id;
  const overdue = t.due_date && new Date(t.due_date) < new Date() && t.status !== 'COMPLETED';

  return (
    <div key={t.id} className="st-task-card">
      <div className="st-task-top">
        <div className="st-task-left">
          <div className="st-task-title-row">
            <span className="st-task-title">{t.title}</span>
            {t.priority && t.priority !== 'NORMAL' && (
              <span className={`st-priority ${PRIORITY_CLASS[t.priority]}`}>{t.priority}</span>
            )}
          </div>
          {t.description && <div className="st-task-desc">{t.description}</div>}
          <div className="st-task-meta">
            {t.assignee?.name && <span className="st-meta-chip">→ {t.assignee.name}</span>}
            {t.assigner?.name && <span className="st-meta-chip">From: {t.assigner.name}</span>}
            {t.due_date && (
              <span className={`st-meta-chip ${overdue ? 'overdue' : ''}`}>
                📅 {new Date(t.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                {overdue && ' · Overdue'}
              </span>
            )}
            {t.completed_at && (
              <span className="st-meta-chip done">
                ✓ {new Date(t.completed_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
              </span>
            )}
          </div>
        </div>
        <div className="st-task-right">
          <span className={`st-badge ${STATUS_CLASS[t.status] || 'st-badge-pending'}`}>
            {t.status?.replace(/_/g, ' ')}
          </span>
          <div className="st-task-btns">
            {/* Assignee: start task */}
            {isAssignee && t.status === 'PENDING' && (
              <button className="st-btn-sm st-btn-action" onClick={async () => {
                await supabase.from('tasks').update({ status: 'IN_PROGRESS' }).eq('id', t.id);
                loadTasks(currentUser.id, currentUser);
              }}>Start</button>
            )}

            {/* Assignee: submit work for review */}
            {isAssignee && (t.status === 'IN_PROGRESS' || t.status === 'PENDING') && (
              <button className="st-btn-sm st-btn-gold"
                onClick={() => { setActiveTask(t); setShowSubmitModal(true); }}>
                Submit Work
              </button>
            )}

            {/* Assignee: route a file */}
            {(isAssignee || isAssigner) && t.status !== 'COMPLETED' && (
              <button className="st-btn-sm st-btn-route"
                onClick={() => { setActiveTask(t); setShowRouteModal(true); }}>
                📎 Route File
              </button>
            )}

            {/* Assigner: review submission */}
            {isAssigner && t.status === 'UNDER_REVIEW' && (
              <button className="st-btn-sm st-btn-review"
                onClick={() => { setActiveTask(t); setShowReviewModal(true); }}>
                Review
              </button>
            )}
          </div>
        </div>
      </div>

      

      {/* Latest submission preview */}
      {t.latest_submission && (isAssignee || isAssigner) && (
        <div className="st-submission-preview">
          <div className="st-sub-label">
            Latest submission ·{' '}
            <span className={`st-sub-status ${
              t.latest_submission.status === 'COMPLETED' ? 'green' :
              t.latest_submission.status === 'REJECTED' ? 'red' : 'gold'
            }`}>{t.latest_submission.status}</span>
            <span className="st-sub-date">
              · {new Date(t.latest_submission.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
            </span>
          </div>
          {t.latest_submission.description && (
            <div className="st-sub-text">{t.latest_submission.description}</div>
          )}
          {t.latest_submission.file_urls?.length > 0 && (
            <div className="st-sub-files">
              {t.latest_submission.file_urls.map((url: string, i: number) => (
                <a key={i} href={url} target="_blank" rel="noreferrer" className="st-sub-file">
                  📎 File {i + 1}
                </a>
              ))}
            </div>
          )}
          {t.latest_submission.admin_feedback && (
            <div className="st-sub-feedback">
              <strong>Feedback:</strong> {t.latest_submission.admin_feedback}
            </div>
          )}
        </div>
      )}
    </div>
  );
})}
        </div>
      )}

      {/* Submit work modal */}
      {showSubmitModal && activeTask && (
        <div className="st-overlay" onClick={() => setShowSubmitModal(false)}>
          <StandaloneSubmitModal
            task={activeTask}
            currentUser={currentUser}
            onClose={() => { setShowSubmitModal(false); setActiveTask(null); }}
            onSuccess={() => { setShowSubmitModal(false); setActiveTask(null); loadTasks(currentUser.id, currentUser); }}
          />
        </div>
      )}

      {/* Review modal */}
      {showReviewModal && activeTask && (
        <div className="st-overlay" onClick={() => setShowReviewModal(false)}>
          <StandaloneReviewModal
            task={activeTask}
            currentUser={currentUser}
            onClose={() => { setShowReviewModal(false); setActiveTask(null); }}
            onSuccess={() => { setShowReviewModal(false); setActiveTask(null); loadTasks(currentUser.id, currentUser); }}
          />
        </div>
      )}

      {/* Route file modal */}
      {showRouteModal && activeTask && (
        <div className="st-overlay" onClick={() => setShowRouteModal(false)}>
          <StandaloneRouteModal
            task={activeTask}
            currentUser={currentUser}
            onClose={() => { setShowRouteModal(false); setActiveTask(null); }} // Fixed state setter here
            onSuccess={() => { setShowRouteModal(false); setActiveTask(null); }}
          />
        </div>
      )}

    </div>
  );
}