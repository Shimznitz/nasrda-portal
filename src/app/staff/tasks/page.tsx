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

export default function TasksPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [tasks, setTasks]             = useState<any[]>([]);
  const [loading, setLoading]         = useState(true);
  const [showCreate, setShowCreate]   = useState(false);

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
    const isPrivileged = ['DG','SUPER_ADMIN','DEPT_ADMIN','DIVISION_HEAD','UNIT_HEAD'].includes(prof?.role);

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

    // Filter scope: Non-privileged users only see their own tasks
    if (!isPrivileged) {
      query = query.or(`assigned_to.eq.${userId},assigned_by.eq.${userId}`);
    }

    const { data, error: err } = await query;
    if (err) { 
      console.error('Tasks load error:', err); 
      return; 
    }
    setTasks(data || []);
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
                      {t.assignee?.name && (
                        <span className="st-meta-chip">
                          → {t.assignee.name}
                        </span>
                      )}
                      {t.assigner?.name && (
                        <span className="st-meta-chip">
                          From: {t.assigner.name}
                        </span>
                      )}
                      {t.due_date && (
                        <span className={`st-meta-chip ${overdue ? 'overdue' : ''}`}>
                          📅 {new Date(t.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                          {overdue && ' · Overdue'}
                        </span>
                      )}
                      {t.completed_at && (
                        <span className="st-meta-chip done">
                          ✓ Done {new Date(t.completed_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
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
                        <button className="st-btn-sm st-btn-action"
                          onClick={async () => {
                            await supabase.from('tasks').update({ status: 'IN_PROGRESS' }).eq('id', t.id);
                            await loadTasks(currentUser.id, currentUser);
                          }}>
                          Start
                        </button>
                      )}
                      {isAssignee && t.status === 'IN_PROGRESS' && (
                        <button className="st-btn-sm st-btn-gold"
                          onClick={async () => {
                            await supabase.from('tasks').update({ status: 'UNDER_REVIEW' }).eq('id', t.id);
                            if (t.assigned_by !== currentUser.id) {
                              await supabase.from('notifications').insert({
                                user_id: t.assigned_by, type: 'SUBMISSION_REVIEW',
                                title: `Task ready for review: ${t.title}`,
                                body: `${currentUser.name} marked the task as ready for review.`,
                                link: '/staff/tasks', read: false,
                              });
                            }
                            await loadTasks(currentUser.id, currentUser);
                          }}>
                          Submit for Review
                        </button>
                      )}
                      {/* Only allow approval/rejection actions if assigner */}
                      {isAssigner && t.status === 'UNDER_REVIEW' && (
                        <>
                          <button className="st-btn-sm st-btn-reject"
                            onClick={async () => {
                              await supabase.from('tasks').update({ status: 'PENDING' }).eq('id', t.id);
                              await supabase.from('notifications').insert({
                                user_id: t.assigned_to, type: 'TASK_REJECTED',
                                title: `Revision needed: ${t.title}`,
                                body: 'Your task was sent back for revision.',
                                link: '/staff/tasks', read: false,
                              });
                              await loadTasks(currentUser.id, currentUser);
                            }}>
                            Reject
                          </button>
                          <button className="st-btn-sm st-btn-gold"
                            onClick={async () => {
                              await supabase.from('tasks').update({
                                status: 'COMPLETED',
                                completed_at: new Date().toISOString()
                              }).eq('id', t.id);
                              await supabase.from('notifications').insert({
                                user_id: t.assigned_to, type: 'TASK_APPROVED',
                                title: `Task approved: ${t.title}`,
                                body: 'Your task has been approved.',
                                link: '/staff/tasks', read: false,
                              });
                              await loadTasks(currentUser.id, currentUser);
                            }}>
                            Approve
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}