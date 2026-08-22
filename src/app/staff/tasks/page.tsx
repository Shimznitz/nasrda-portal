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

// ── Staff search component (outside to prevent remount) ───────
function StaffSearch({ value, onChange, results, searching, onSelect, selectedItems, onRemove }: any) {
  return (
    <div style={{ position: 'relative' }}>
      <input className="st-input" placeholder="Search staff by name…"
        value={value} onChange={e => onChange(e.target.value)} autoComplete="off" />
      {value.length >= 2 && (
        <div className="st-search-drop">
          {searching && <div className="st-search-empty">Searching…</div>}
          {!searching && results.length === 0 && <div className="st-search-empty">No staff found.</div>}
          {results.map((s: any) => (
            <div key={s.id}
              className={`st-search-item ${selectedItems?.find((x: any) => x.id === s.id) ? 'selected' : ''}`}
              onClick={() => onSelect(s)}>
              <div className="st-mini-avatar">{initials(s.name)}</div>
              <div>
                <div className="st-search-name">{s.name}</div>
                <div className="st-search-role">{s.designation || '—'}</div>
              </div>
              {selectedItems?.find((x: any) => x.id === s.id) && (
                <span style={{ color: 'var(--gold)', marginLeft: 'auto' }}>✓</span>
              )}
            </div>
          ))}
        </div>
      )}
      {selectedItems && selectedItems.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          {selectedItems.map((s: any) => (
            <span key={s.id} className="st-selected-pill">
              {s.name} <button onClick={() => onRemove(s)}>✕</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TasksPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [profile, setProfile]         = useState<any>(null);
  const [tasks, setTasks]             = useState<any[]>([]);
  const [loading, setLoading]         = useState(true);
  const [showCreate, setShowCreate]   = useState(false);

  // Filters
  const [search, setSearch]           = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterView, setFilterView]   = useState<'mine' | 'assigned_by_me' | 'all'>('mine');
  const [filterSource, setFilterSource] = useState<'all' | 'standalone' | 'project'>('all');

  // Create form
  const [form, setForm] = useState({
    title: '', description: '', due_date: '', priority: 'NORMAL'
  });
  const [assignSearch, setAssignSearch]   = useState('');
  const [assignResults, setAssignResults] = useState<any[]>([]);
  const [assignedTo, setAssignedTo]       = useState<any>(null);
  const [assignSearching, setAssignSearching] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [formError, setFormError] = useState('');

  // Modals
  const [activeTask, setActiveTask]             = useState<any>(null);
  const [showSubmitModal, setShowSubmitModal]   = useState(false);
  const [showReviewModal, setShowReviewModal]   = useState(false);
  const [showRouteModal, setShowRouteModal]     = useState(false);
  const [showLogModal, setShowLogModal]         = useState(false);

  useEffect(() => { loadPage(); }, []);

  const loadPage = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setCurrentUser({ id: user.id });
    const { data: prof } = await supabase
      .from('profiles')
      .select('*, department:departments!profiles_department_id_fkey(id,name), division:divisions!profiles_division_id_fkey(id,name), unit:units!profiles_unit_id_fkey(id,name)')
      .eq('id', user.id).single();
    setProfile(prof);
    await loadTasks(user.id, prof);
    setLoading(false);
  };

  const loadTasks = async (userId: string, prof: any) => {
    // Fetch both standalone and project tasks visible to this user
    const { data, error } = await supabase
      .from('tasks')
      .select(`
        id, title, description, status, due_date, priority,
        assigned_to, assigned_by, completed_at, created_at,
        project_id, dept_id, division_id, unit_id, deleted_at,
        assignee:profiles!assigned_to(id, name, designation, avatar_url),
        assigner:profiles!assigned_by(id, name, designation, avatar_url),
        projects(id, title),
        dept:departments!tasks_dept_id_fkey(name),
        division:divisions!tasks_division_id_fkey(name),
        unit:units!tasks_unit_id_fkey(name)
      `)
      .is('deleted_at', null)
      .or(`assigned_to.eq.${userId},assigned_by.eq.${userId}`)
      .order('created_at', { ascending: false });

    if (error) { console.error(error); return; }

    // Get latest submission per task
    const taskIds = (data || []).map(t => t.id);
    let subMap: Record<string, any[]> = {};
    if (taskIds.length > 0) {
      const { data: subs } = await supabase
        .from('submissions').select('*')
        .in('task_id', taskIds)
        .order('created_at', { ascending: true });
      (subs || []).forEach((s: any) => {
        if (!subMap[s.task_id]) subMap[s.task_id] = [];
        subMap[s.task_id].push(s);
      });
    }

    const enriched = (data || []).map(t => ({
      ...t,
      submissions: subMap[t.id] || [],
      latest_submission: subMap[t.id]?.[subMap[t.id].length - 1] || null,
    }));

    setTasks(enriched);
  };

  // Assignee search
  useEffect(() => {
    if (assignSearch.length < 2) { setAssignResults([]); return; }
    const t = setTimeout(async () => {
      setAssignSearching(true);
      const { data } = await supabase.from('profiles')
        .select('id, name, designation, avatar_url')
        .ilike('name', `%${assignSearch}%`).limit(10);
      setAssignResults(data || []);
      setAssignSearching(false);
    }, 300);
    return () => clearTimeout(t);
  }, [assignSearch]);

  const createTask = async () => {
    if (!form.title.trim()) { setFormError('Title is required.'); return; }
    if (!assignedTo) { setFormError('Please assign this task to someone.'); return; }
    setSaving(true); setFormError('');

    const { data: task, error: err } = await supabase.from('tasks').insert({
      title: form.title.trim(),
      description: form.description.trim() || null,
      due_date: form.due_date || null,
      priority: form.priority,
      assigned_to: assignedTo.id,
      assigned_by: currentUser.id,
      status: 'PENDING',
      project_id: null,
      // Inherit org scope from creator
      dept_id:     profile?.department_id || null,
      division_id: profile?.division_id   || null,
      unit_id:     profile?.unit_id       || null,
    }).select().single();

    if (err || !task) { setFormError(err?.message || 'Failed.'); setSaving(false); return; }

    await supabase.from('activity_logs').insert({
      actor_id: currentUser.id, entity_type: 'TASK',
      entity_id: task.id, action: 'CREATED',
      note: `Standalone task "${form.title}" created`,
    });

    if (assignedTo.id !== currentUser.id) {
      await supabase.from('notifications').insert({
        user_id: assignedTo.id, type: 'TASK_ASSIGNED',
        title: `New task: ${form.title}`,
        body: `${profile?.name} assigned you a task.`,
        link: '/staff/tasks', read: false,
      });
    }

    setForm({ title: '', description: '', due_date: '', priority: 'NORMAL' });
    setAssignedTo(null); setAssignSearch('');
    setShowCreate(false);
    await loadTasks(currentUser.id, profile);
    setSaving(false);
  };

  const softDeleteTask = async (task: any) => {
    if (!confirm(`Delete task "${task.title}"? The activity log will be preserved.`)) return;
    await supabase.from('tasks').update({ deleted_at: new Date().toISOString() }).eq('id', task.id);
    await supabase.from('activity_logs').insert({
      actor_id: currentUser.id, entity_type: 'TASK',
      entity_id: task.id, action: 'DELETED',
      note: `Task "${task.title}" deleted by ${profile?.name}`,
    });
    await loadTasks(currentUser.id, profile);
  };

  const filtered = tasks.filter(t => {
    const matchSearch = !search ||
      t.title?.toLowerCase().includes(search.toLowerCase()) ||
      t.description?.toLowerCase().includes(search.toLowerCase()) ||
      t.assignee?.name?.toLowerCase().includes(search.toLowerCase()) ||
      t.projects?.title?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = !filterStatus || t.status === filterStatus;
    const matchView = filterView === 'all' ? true
      : filterView === 'mine' ? t.assigned_to === currentUser?.id
      : t.assigned_by === currentUser?.id;
    const matchSource = filterSource === 'all' ? true
      : filterSource === 'standalone' ? !t.project_id
      : !!t.project_id;
    return matchSearch && matchStatus && matchView && matchSource;
  });

  const myOpen       = tasks.filter(t => t.assigned_to === currentUser?.id && t.status !== 'COMPLETED').length;
  const assignedByMe = tasks.filter(t => t.assigned_by === currentUser?.id).length;
  const urgent       = tasks.filter(t => t.priority === 'URGENT' && t.status !== 'COMPLETED').length;

  if (loading) return (
    <div className="st-loading"><div className="st-loading-bar" /><span>Loading tasks…</span></div>
  );

  return (
    <div className="st-page">
      <div className="st-header">
        <div>
          <h1 className="st-title">Tasks</h1>
          <p className="st-sub">All tasks assigned to or from you</p>
        </div>
        <button className="st-btn-gold" onClick={() => setShowCreate(!showCreate)}>
          {showCreate ? '✕ Cancel' : '+ New Task'}
        </button>
      </div>

      {/* Metrics */}
      <div className="st-metrics">
        <div className="st-metric">
          <div className="st-metric-value">{myOpen}</div>
          <div className="st-metric-label">Open tasks</div>
        </div>
        <div className="st-metric">
          <div className="st-metric-value">{assignedByMe}</div>
          <div className="st-metric-label">I assigned</div>
        </div>
        <div className="st-metric st-metric-accent">
          <div className="st-metric-value">{urgent}</div>
          <div className="st-metric-label">Urgent</div>
        </div>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="st-create-panel">
          <div className="st-create-header">New Task</div>
          {formError && <div className="st-error">{formError}</div>}
          <div className="st-form-row">
            <div className="st-form-group" style={{ flex: 2 }}>
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
          <div className="st-form-group">
            <label>Assign To *</label>
            {assignedTo ? (
              <div className="st-selected-assignee">
                <div className="st-mini-avatar">{initials(assignedTo.name)}</div>
                <span>{assignedTo.name}</span>
                <button onClick={() => { setAssignedTo(null); setAssignSearch(''); }}>✕</button>
              </div>
            ) : (
              <StaffSearch
                value={assignSearch} onChange={setAssignSearch}
                results={assignResults} searching={assignSearching}
                onSelect={(s: any) => { setAssignedTo(s); setAssignSearch(''); setAssignResults([]); }}
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
        <input className="st-search" placeholder="Search tasks, assignees, projects…"
          value={search} onChange={e => setSearch(e.target.value)} />
        <div className="st-filter-tabs">
          {(['mine', 'assigned_by_me', 'all'] as const).map(v => (
            <button key={v} className={filterView === v ? 'active' : ''}
              onClick={() => setFilterView(v)}>
              {v === 'mine' ? 'My Tasks' : v === 'assigned_by_me' ? 'I Assigned' : 'All'}
            </button>
          ))}
        </div>
        <div className="st-filter-tabs">
          {(['all', 'standalone', 'project'] as const).map(v => (
            <button key={v} className={filterSource === v ? 'active' : ''}
              onClick={() => setFilterSource(v)}>
              {v === 'all' ? 'All' : v === 'standalone' ? 'Standalone' : 'Project'}
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
        <div className="st-empty"><p>No tasks found.</p></div>
      ) : (
        <div className="st-list">
          {filtered.map(t => {
            const isAssignee = t.assigned_to === currentUser?.id;
            const isAssigner = t.assigned_by === currentUser?.id;
            const overdue = t.due_date && new Date(t.due_date) < new Date() && t.status !== 'COMPLETED';
            const latestSub = t.latest_submission;
            const subCount = t.submissions?.length || 0;

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

                    {/* Org breadcrumb */}
                    <div className="st-task-breadcrumb">
                      {t.projects?.title ? (
                        <span className="st-breadcrumb-chip project"
                          onClick={() => router.push(`/staff/projects/${t.project_id}`)}>
                          ◈ {t.projects.title}
                        </span>
                      ) : (
                        <span className="st-breadcrumb-chip standalone">⚡ Standalone</span>
                      )}
                      {t.dept?.name && <span className="st-breadcrumb-chip">🏛 {t.dept.name}</span>}
                      {t.division?.name && <span className="st-breadcrumb-chip">▧ {t.division.name}</span>}
                      {t.unit?.name && <span className="st-breadcrumb-chip">▨ {t.unit.name}</span>}
                    </div>

                    <div className="st-task-meta">
                      {t.assignee?.name && (
                        <span className="st-meta-chip">→ {t.assignee.name}</span>
                      )}
                      {t.assigner?.name && t.assigned_by !== currentUser?.id && (
                        <span className="st-meta-chip">From: {t.assigner.name}</span>
                      )}
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
                      {isAssignee && t.status === 'PENDING' && (
                        <button className="st-btn-sm st-btn-action" onClick={async () => {
                          await supabase.from('tasks').update({ status: 'IN_PROGRESS' }).eq('id', t.id);
                          loadTasks(currentUser.id, profile);
                        }}>Start</button>
                      )}
                      {isAssignee && (t.status === 'IN_PROGRESS' || t.status === 'PENDING' || t.status === 'REJECTED') && (
                        <button className="st-btn-sm st-btn-gold"
                          onClick={() => { setActiveTask(t); setShowSubmitModal(true); }}>
                          {latestSub ? 'Resubmit' : 'Submit Work'}
                        </button>
                      )}
                      {isAssigner && t.status === 'UNDER_REVIEW' && (
                        <button className="st-btn-sm st-btn-review"
                          onClick={() => { setActiveTask(t); setShowReviewModal(true); }}>
                          Review
                        </button>
                      )}
                      {(isAssignee || isAssigner) && t.status !== 'COMPLETED' && (
                        <button className="st-btn-sm st-btn-route"
                          onClick={() => { setActiveTask(t); setShowRouteModal(true); }}>
                          📎 Route File
                        </button>
                      )}
                      {subCount > 0 && (
                        <button className="st-btn-sm st-btn-log"
                          onClick={() => { setActiveTask(t); setShowLogModal(true); }}>
                          📋 Log ({subCount})
                        </button>
                      )}
                      {t.projects?.id && (
                        <button className="st-btn-sm st-btn-action"
                          onClick={() => router.push(`/staff/projects/${t.project_id}`)}>
                          View Project →
                        </button>
                      )}
                      {isAssigner && (
                        <button className="st-btn-sm st-btn-delete"
                          onClick={() => softDeleteTask(t)}>
                          🗑
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Latest submission preview */}
                {latestSub && (isAssignee || isAssigner) && (
                  <div className="st-submission-preview">
                    <div className="st-sub-label">
                      Submission #{subCount} ·{' '}
                      <span className={`st-sub-status ${
                        latestSub.status === 'COMPLETED' ? 'green' :
                        latestSub.status === 'REJECTED' ? 'red' : 'gold'
                      }`}>{latestSub.status}</span>
                      <span className="st-sub-date">
                        {' '}· {new Date(latestSub.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                    </div>
                    {latestSub.description && (
                      <div className="st-sub-text">{latestSub.description}</div>
                    )}
                    {latestSub.file_urls?.length > 0 && (
                      <div className="st-sub-files">
                        {latestSub.file_urls.map((url: string, i: number) => (
                          <a key={i} href={url} target="_blank" rel="noreferrer" className="st-sub-file">
                            📎 File {i + 1}
                          </a>
                        ))}
                      </div>
                    )}
                    {latestSub.admin_feedback && (
                      <div className="st-sub-feedback">
                        <strong>Feedback:</strong> {latestSub.admin_feedback}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modals */}
      {showSubmitModal && activeTask && (
        <div className="st-overlay" onClick={() => setShowSubmitModal(false)}>
          <StandaloneSubmitModal
            task={activeTask} currentUser={currentUser} profile={profile}
            onClose={() => { setShowSubmitModal(false); setActiveTask(null); }}
            onSuccess={() => { setShowSubmitModal(false); setActiveTask(null); loadTasks(currentUser.id, profile); }}
          />
        </div>
      )}
      {showReviewModal && activeTask && (
        <div className="st-overlay" onClick={() => setShowReviewModal(false)}>
          <StandaloneReviewModal
            task={activeTask} currentUser={currentUser} profile={profile}
            onClose={() => { setShowReviewModal(false); setActiveTask(null); }}
            onSuccess={() => { setShowReviewModal(false); setActiveTask(null); loadTasks(currentUser.id, profile); }}
          />
        </div>
      )}
      {showRouteModal && activeTask && (
        <div className="st-overlay" onClick={() => setShowRouteModal(false)}>
          <StandaloneRouteModal
            task={activeTask} currentUser={currentUser} profile={profile}
            onClose={() => { setShowRouteModal(false); setActiveTask(null); }}
            onSuccess={() => { setShowRouteModal(false); setActiveTask(null); }}
          />
        </div>
      )}
      {showLogModal && activeTask && (
        <div className="st-overlay" onClick={() => setShowLogModal(false)}>
          <TaskLogModal
            task={activeTask}
            onClose={() => { setShowLogModal(false); setActiveTask(null); }}
          />
        </div>
      )}
    </div>
  );
}

// ── SUBMIT MODAL ──────────────────────────────────────────────
function StandaloneSubmitModal({ task, currentUser, profile, onClose, onSuccess }: any) {
  const [comment, setComment]   = useState('');
  const [files, setFiles]       = useState<File[]>([]);
  const [driveUrl, setDriveUrl] = useState('');
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');
  const subCount = task.submissions?.length || 0;

  const submit = async () => {
    setSaving(true); setError('');
    let uploadedUrls: string[] = [];

    // Upload files to Supabase storage
    for (const file of files) {
      const path = `tasks/${task.id}/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from('task-files').upload(path, file);
      if (!upErr) {
        const { data: urlData } = supabase.storage.from('task-files').getPublicUrl(path);
        uploadedUrls.push(urlData.publicUrl);
      }
    }

    // Add drive link if provided
    if (driveUrl.trim()) uploadedUrls.push(driveUrl.trim());

    const iteration = subCount + 1;
    const { error: subErr } = await supabase.from('submissions').insert({
      task_id: task.id,
      project_id: task.project_id || null,
      submitted_by: currentUser.id,
      description: comment.trim() || null,
      file_urls: uploadedUrls,
      status: 'PENDING',
      iteration,
    });

    if (subErr) { setError(subErr.message); setSaving(false); return; }

    await supabase.from('tasks').update({ status: 'UNDER_REVIEW' }).eq('id', task.id);

    await supabase.from('activity_logs').insert({
      actor_id: currentUser.id, entity_type: 'SUBMISSION',
      entity_id: task.id, action: 'SUBMITTED',
      note: `Submission #${iteration} for task "${task.title}"`,
    });

    // Notify assigner
    const notifyId = task.assigned_by !== currentUser.id ? task.assigned_by : null;
    if (notifyId) {
      await supabase.from('notifications').insert({
        user_id: notifyId, type: 'SUBMISSION_REVIEW',
        title: `Work submitted: ${task.title}`,
        body: `${profile?.name} submitted work for review (attempt #${iteration}).`,
        link: '/staff/tasks', read: false,
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
      {subCount > 0 && (
        <div className="st-sub-count-note">
          This will be submission #{subCount + 1}. All previous submissions are preserved in the log.
        </div>
      )}
      {error && <div className="st-error">{error}</div>}
      <div className="st-form-group">
        <label>Notes / Description</label>
        <textarea className="st-input" rows={4} value={comment}
          onChange={e => setComment(e.target.value)}
          placeholder="Describe what you completed…" />
      </div>
      <div className="st-form-group">
        <label>Attach Files (from your computer)</label>
        <input type="file" multiple className="st-file-input"
          onChange={e => setFiles(Array.from(e.target.files || []))} />
        {files.length > 0 && (
          <div className="st-file-hint">{files.length} file{files.length > 1 ? 's' : ''} selected</div>
        )}
      </div>
      <div className="st-form-group">
        <label>Or paste a Drive / Docs link</label>
        <input className="st-input" value={driveUrl}
          onChange={e => setDriveUrl(e.target.value)}
          placeholder="https://docs.google.com/…" />
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

// ── REVIEW MODAL ──────────────────────────────────────────────
function StandaloneReviewModal({ task, currentUser, profile, onClose, onSuccess }: any) {
  const [submission, setSubmission] = useState<any>(null);
  const [allSubs, setAllSubs]       = useState<any[]>([]);
  const [feedback, setFeedback]     = useState('');
  const [saving, setSaving]         = useState(false);
  const [loading, setLoading]       = useState(true);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('submissions').select('*')
        .eq('task_id', task.id)
        .order('created_at', { ascending: false });
      const subs = data || [];
      setAllSubs(subs);
      setSubmission(subs.find((s: any) => s.status === 'PENDING') || subs[0] || null);
      setLoading(false);
    };
    load();
  }, [task.id]);

  const handle = async (approved: boolean) => {
  if (!submission) return;
  setSaving(true);

  const newSubStatus  = approved ? 'COMPLETED' : 'REJECTED';
  const newTaskStatus = approved ? 'COMPLETED'  : 'PENDING';

  // Update submission
  const { error: subErr } = await supabase
    .from('submissions')
    .update({
      status: newSubStatus,
      admin_feedback: feedback.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', submission.id);

  if (subErr) {
    console.error('Submission update error:', subErr);
    setSaving(false);
    return;
  }

  // Update task
  const { error: taskErr } = await supabase
    .from('tasks')
    .update({
      status: newTaskStatus,
      ...(approved ? { completed_at: new Date().toISOString() } : {}),
    })
    .eq('id', task.id);

  if (taskErr) {
    console.error('Task update error:', taskErr);
    setSaving(false);
    return;
  }

  // Log
  await supabase.from('activity_logs').insert({
    actor_id: currentUser.id,
    entity_type: 'SUBMISSION',
    entity_id: submission.id,
    action: approved ? 'APPROVED' : 'REJECTED',
    note: feedback.trim() || (approved ? 'Submission approved' : 'Submission rejected'),
    meta: { task_id: task.id, task_title: task.title },
  });

  // Notify assignee
  await supabase.from('notifications').insert({
    user_id: task.assigned_to,
    type: approved ? 'TASK_APPROVED' : 'TASK_REJECTED',
    title: approved ? `✓ Task approved: ${task.title}` : `↩ Revision needed: ${task.title}`,
    body: feedback.trim() || (approved ? 'Your work has been approved.' : 'Please revise and resubmit.'),
    link: '/staff/tasks',
    read: false,
  });

  // Update local state of allSubs so modal reflects immediately
  setAllSubs(prev => prev.map(s =>
    s.id === submission.id
      ? { ...s, status: newSubStatus, admin_feedback: feedback.trim() || null }
      : s
  ));

  // Update submission directly
  setSubmission({
    ...submission,
    status: newSubStatus,
    admin_feedback: feedback.trim() || null,
  });

  onSuccess();
};

  if (loading) return (
    <div className="st-modal" onClick={e => e.stopPropagation()}>
      <div className="st-modal-loading">Loading…</div>
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
          <div className="st-review-meta">
            Submission #{allSubs.findIndex(s => s.id === submission.id) + 1} of {allSubs.length}
            {allSubs.length > 1 && (
              <button className="st-history-toggle" onClick={() => setShowHistory(!showHistory)}>
                {showHistory ? 'Hide history' : 'View history'}
              </button>
            )}
          </div>

          {/* Submission history */}
          {showHistory && (
            <div className="st-sub-history">
              {allSubs.map((s: any, i: number) => (
                <div key={s.id} className={`st-history-entry ${s.id === submission.id ? 'current' : ''}`}>
                  <div className="st-history-header">
                    <span className="st-history-num">#{allSubs.length - i}</span>
                    <span className={`st-sub-status ${s.status === 'COMPLETED' ? 'green' : s.status === 'REJECTED' ? 'red' : 'gold'}`}>
                      {s.status}
                    </span>
                    <span className="st-history-date">
                      {new Date(s.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                    </span>
                  </div>
                  {s.description && <div className="st-history-text">{s.description}</div>}
                  {s.admin_feedback && (
                    <div className="st-history-feedback">Feedback: {s.admin_feedback}</div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Current submission */}
          {submission.description && (
            <div className="st-review-section">
              <div className="st-review-label">Staff Notes</div>
              <div className="st-review-text">{submission.description}</div>
            </div>
          )}
          {submission.file_urls?.length > 0 && (
            <div className="st-review-section">
              <div className="st-review-label">Attachments & Links</div>
              <div className="st-sub-files">
                {submission.file_urls.map((url: string, i: number) => (
                  <a key={i} href={url} target="_blank" rel="noreferrer" className="st-sub-file">
                    {url.includes('google.com') || url.includes('docs.') ? '🔗' : '📎'} {
                      url.includes('google.com') ? 'Drive Link' : `File ${i + 1}`
                    }
                  </a>
                ))}
              </div>
            </div>
          )}

          <div className="st-form-group">
            <label>Feedback</label>
            <textarea className="st-input" rows={3} value={feedback}
              onChange={e => setFeedback(e.target.value)}
              placeholder="Leave feedback for the staff member…" />
          </div>
          <div className="st-modal-actions">
            <button className="st-btn-outline" onClick={onClose}>Cancel</button>
            <button className="st-btn-reject" onClick={() => handle(false)} disabled={saving}>
              ↩ Request Revision
            </button>
            <button className="st-btn-gold" onClick={() => handle(true)} disabled={saving}>
              {saving ? 'Approving…' : '✓ Approve'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ── ROUTE MODAL ───────────────────────────────────────────────
function StandaloneRouteModal({ task, currentUser, profile, onClose, onSuccess }: any) {
  const [fileName, setFileName]   = useState('');
  const [fileUrl, setFileUrl]     = useState('');
  const [note, setNote]           = useState('');
  const [staffSearch, setStaffSearch] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selected, setSelected]   = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState('');
  const [success, setSuccess]     = useState(false);
  const [orgDrives, setOrgDrives] = useState<any[]>([]);

  useEffect(() => {
    // Load org drives for this task's scope
    const loadDrives = async () => {
      const conditions: any[] = [];
      if (task.dept_id)     conditions.push({ entity_type: 'DEPARTMENT', entity_id: task.dept_id });
      if (task.division_id) conditions.push({ entity_type: 'DIVISION',   entity_id: task.division_id });
      if (task.unit_id)     conditions.push({ entity_type: 'UNIT',       entity_id: task.unit_id });

      if (conditions.length === 0) return;

      const entityIds = conditions.map(c => c.entity_id);
      const { data } = await supabase
        .from('org_drives').select('*').in('entity_id', entityIds);
      setOrgDrives(data || []);
    };
    loadDrives();
  }, [task]);

  useEffect(() => {
    if (staffSearch.length < 2) { setSearchResults([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      const { data } = await supabase.from('profiles')
        .select('id, name, designation, avatar_url')
        .ilike('name', `%${staffSearch}%`)
        .neq('id', currentUser.id).limit(12);
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

    const { data: route, error: routeErr } = await supabase
      .from('file_routes').insert({
        task_id: task.id,
        file_name: fileName.trim(),
        file_url: fileUrl.trim(),
        file_type: 'link',
        created_by: currentUser.id,
        status: 'ACTIVE',
      }).select().single();

    if (routeErr || !route) {
      setError(routeErr?.message || 'Failed to create route.');
      setSaving(false); return;
    }

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

    await supabase.from('activity_logs').insert({
      actor_id: currentUser.id, entity_type: 'FILE_ROUTE',
      entity_id: route.id, action: 'CREATED',
      note: `File "${fileName}" routed to ${selected.length} recipient(s) for task "${task.title}"`,
    });

    for (const s of selected) {
      await supabase.from('notifications').insert({
        user_id: s.id, type: 'FILE_ROUTED',
        title: `File routed to you: ${fileName}`,
        body: `${profile?.name} sent you a file to review.`,
        link: `/staff/documents`,
        read: false,
      });
    }

    setSuccess(true);
    setSaving(false);
    onSuccess();
    setTimeout(onClose, 2000);
  };

  if (success) return (
    <div className="st-modal" onClick={e => e.stopPropagation()}>
      <div className="st-route-success">
        <div className="st-route-success-icon">✓</div>
        <div className="st-route-success-text">
          File routed to {selected.length} person{selected.length !== 1 ? 's' : ''} successfully.
        </div>
        <div className="st-route-success-sub">Notifications sent. Closing…</div>
      </div>
    </div>
  );

  return (
    <div className="st-modal" onClick={e => e.stopPropagation()}>
      <div className="st-modal-header">
        <h2>📎 Route File</h2>
        <button className="st-modal-close" onClick={onClose}>✕</button>
      </div>
      <div className="st-modal-task-name">{task.title}</div>
      {error && <div className="st-error">{error}</div>}

      <div className="st-form-group">
        <label>File / Document Name *</label>
        <input className="st-input" value={fileName}
          onChange={e => setFileName(e.target.value)}
          placeholder="e.g. Budget Report Q3.xlsx" />
      </div>

      {/* Org drives quick-select */}
      {orgDrives.length > 0 && (
        <div className="st-form-group">
          <label>Quick-select from org drives</label>
          <div className="st-drive-pills">
            {orgDrives.map((d: any) => (
              <button key={d.id} className="st-drive-pill"
                onClick={() => setFileUrl(d.drive_url)}>
                🗂 {d.name}
              </button>
            ))}
          </div>
        </div>
      )}

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
        <label>Route To * — search any staff member</label>
        <StaffSearch
          value={staffSearch} onChange={setStaffSearch}
          results={searchResults} searching={searching}
          onSelect={toggle} selectedItems={selected}
          onRemove={toggle}
        />
      </div>

      <div className="st-modal-actions">
        <button className="st-btn-outline" onClick={onClose}>Cancel</button>
        <button className="st-btn-gold" onClick={save}
          disabled={saving || selected.length === 0 || !fileName.trim() || !fileUrl.trim()}>
          {saving ? 'Routing…' : `Route to ${selected.length} person${selected.length !== 1 ? 's' : ''}`}
        </button>
      </div>
    </div>
  );
}

// ── TASK LOG MODAL ────────────────────────────────────────────
function TaskLogModal({ task, onClose }: any) {
  const submissions: any[] = task.submissions || [];

  return (
    <div className="st-modal st-modal-wide" onClick={e => e.stopPropagation()}>
      <div className="st-modal-header">
        <h2>📋 Task Log</h2>
        <button className="st-modal-close" onClick={onClose}>✕</button>
      </div>
      <div className="st-modal-task-name">{task.title}</div>

      {submissions.length === 0 ? (
        <div className="st-modal-empty">No submissions yet.</div>
      ) : (
        <div className="st-log-timeline">
          {[...submissions].reverse().map((sub: any, i: number) => (
            <div key={sub.id} className="st-log-entry">
              <div className="st-log-dot-col">
                <div className={`st-log-dot ${
                  sub.status === 'COMPLETED' ? 'done' :
                  sub.status === 'REJECTED' ? 'rejected' :
                  sub.status === 'PENDING' ? 'pending' : 'draft'
                }`} />
                {i < submissions.length - 1 && <div className="st-log-line" />}
              </div>
              <div className="st-log-body">
                <div className="st-log-header">
                  <span className="st-log-num">Submission #{submissions.length - i}</span>
                  <span className={`st-sub-status ${
                    sub.status === 'COMPLETED' ? 'green' :
                    sub.status === 'REJECTED' ? 'red' : 'gold'
                  }`}>{sub.status}</span>
                  <span className="st-log-date">
                    {new Date(sub.created_at).toLocaleDateString('en-GB', {
                      day: 'numeric', month: 'short', year: 'numeric'
                    })} {new Date(sub.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                {sub.description && <div className="st-log-text">{sub.description}</div>}
                {sub.file_urls?.length > 0 && (
                  <div className="st-sub-files">
                    {sub.file_urls.map((url: string, fi: number) => (
                      <a key={fi} href={url} target="_blank" rel="noreferrer" className="st-sub-file">
                        {url.includes('google') ? '🔗 Drive Link' : `📎 File ${fi + 1}`}
                      </a>
                    ))}
                  </div>
                )}
                {sub.admin_feedback && (
                  <div className="st-log-feedback">
                    <span className={sub.status === 'COMPLETED' ? 'approved-label' : 'rejected-label'}>
                      {sub.status === 'COMPLETED' ? '✓ Approved' : '↩ Feedback'}:
                    </span>{' '}
                    {sub.admin_feedback}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}