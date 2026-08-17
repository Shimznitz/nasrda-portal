// src/app/staff/projects/[id]/page.tsx
'use client';

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useParams, useRouter } from "next/navigation";
import "./project-detail.css";

const initials = (name: string) =>
  name?.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase() || '??';

const notify = async (userId: string, type: string, title: string, body: string, link: string) => {
  await supabase.from('notifications').insert({ user_id: userId, type, title, body, link, read: false });
};

const logActivity = async (
  actorId: string,
  entityType: 'PROJECT' | 'TASK' | 'SUBMISSION' | 'FILE_ROUTE',
  entityId: string,
  action: string,
  note?: string,
  meta?: any
) => {
  await supabase.from('activity_logs').insert({
    actor_id: actorId,
    entity_type: entityType,
    entity_id: entityId,
    action,
    note: note || null,
    meta: meta || null,
  });
};

const STATUS_CLASS: Record<string, string> = {
  COMPLETED:    'badge-done',
  UNDER_REVIEW: 'badge-review',
  IN_PROGRESS:  'badge-active',
  ACTIVE:       'badge-active',
  PENDING:      'badge-pending',
  REJECTED:     'badge-rejected',
};

const PRIORITY_CLASS: Record<string, string> = {
  LOW:    'priority-low',
  NORMAL: 'priority-normal',
  HIGH:   'priority-high',
  URGENT: 'priority-urgent',
};

export default function ProjectDetail() {
  const { id } = useParams();
  const router = useRouter();

  const [project, setProject]       = useState<any>(null);
  const [tasks, setTasks]           = useState<any[]>([]);
  const [members, setMembers]       = useState<any[]>([]);
  const [isCreator, setIsCreator]   = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [loading, setLoading]       = useState(true);

  const [modal, setModal] = useState<
    'none' | 'createTask' | 'submitWork' | 'review' | 'editProject' | 'fileRoute' | 'routeDetail' | 'taskLog'
  >('none');
  const [activeTask, setActiveTask]   = useState<any>(null);
  const [activeRoute, setActiveRoute] = useState<any>(null);

  useEffect(() => { if (id) loadAll(); }, [id]);

  const loadAll = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: prof } = await supabase
        .from('profiles').select('id, name, designation, role').eq('id', user.id).single();
      setCurrentUser(prof);

      const { data: proj } = await supabase
        .from('projects').select('*').eq('id', id).single();
      if (!proj) return;
      setProject(proj);
      const creator = proj.created_by === user.id;
      setIsCreator(creator);

      const { data: memberRows } = await supabase
        .from('project_members')
        .select('profile_id, is_lead, profiles(id, name, designation)')
        .eq('project_id', id);
      setMembers(memberRows || []);

      // Tasks — fetch without nested joins to avoid silent failures
      let taskQuery = supabase
        .from('tasks')
        .select(`
          id, title, description, status, due_date, priority,
          assigned_to, assigned_by, completed_at, created_at,
          assignee:profiles!assigned_to(id, name, designation)
        `)
        .eq('project_id', id)
        .order('created_at', { ascending: true });

      if (!creator) taskQuery = taskQuery.eq('assigned_to', user.id);

      const { data: taskRows, error: taskErr } = await taskQuery;
      if (taskErr) { console.error('Tasks error:', taskErr); setTasks([]); setLoading(false); return; }

      // Enrich each task with submissions + file routes separately
      const enriched = await Promise.all((taskRows || []).map(async (task: any) => {
        const [{ data: subs }, { data: routes }] = await Promise.all([
          supabase.from('submissions')
            .select('*')
            .eq('task_id', task.id)
            .order('created_at', { ascending: true }),
          supabase.from('file_routes')
            .select(`
              id, file_name, file_url, status, created_at,
              file_route_recipients(
                id, profile_id, status, opened_at,
                profile:profiles(name, designation)
              )
            `)
            .eq('task_id', task.id),
        ]);
        return { ...task, submissions: subs || [], file_routes: routes || [] };
      }));

      setTasks(enriched);
    } finally {
      setLoading(false);
    }
  };

  const closeModal = () => { setModal('none'); setActiveTask(null); setActiveRoute(null); };

  if (loading) return <div className="pd-loading"><div className="pd-loading-bar" /></div>;
  if (!project) return <div className="pd-not-found">Project not found.</div>;

  const completedCount = tasks.filter(t => t.status === 'COMPLETED').length;

  return (
    <div className="pd-page">
      <button className="pd-back" onClick={() => router.push('/staff/projects')}>← Projects</button>

      {/* ── Header ── */}
      <div className="pd-header-card">
        <div className="pd-header-left">
          <div className="pd-header-eyebrow">Project</div>
          <h1 className="pd-title">{project.title}</h1>
          {project.objectives && <p className="pd-objectives">{project.objectives}</p>}
          <div className="pd-meta-row">
            {project.due_date && (
              <span className="pd-meta-chip">
                📅 Due {new Date(project.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
            )}
            <span className={`pd-meta-chip badge ${STATUS_CLASS[project.status] || 'badge-active'}`}>
              {project.status?.replace(/_/g, ' ') || 'ACTIVE'}
            </span>
          </div>
        </div>
        <div className="pd-header-right">
          <div className="pd-progress-ring-wrap">
            <svg viewBox="0 0 80 80" className="pd-progress-ring">
              <circle cx="40" cy="40" r="34" fill="none" stroke="var(--border)" strokeWidth="6" />
              <circle cx="40" cy="40" r="34" fill="none" stroke="var(--gold)" strokeWidth="6"
                strokeDasharray={`${2 * Math.PI * 34}`}
                strokeDashoffset={`${2 * Math.PI * 34 * (1 - (project.progress || 0) / 100)}`}
                strokeLinecap="round" transform="rotate(-90 40 40)" />
            </svg>
            <div className="pd-progress-label">{project.progress || 0}%</div>
          </div>
          <div className="pd-progress-sub">{completedCount}/{tasks.length} tasks</div>
        </div>
      </div>

      {/* ── Creator actions ── */}
      {isCreator && (
        <div className="pd-actions-row">
          <button className="pd-btn-outline" onClick={() => setModal('editProject')}>✏️ Edit Project</button>
          <button className="pd-btn-gold" onClick={() => setModal('createTask')}>+ Assign Task</button>
        </div>
      )}

      {/* ── Members ── */}
      <div className="pd-section">
        <div className="pd-section-label">Team Members</div>
        <div className="pd-members-strip">
          {members.map((m: any) => (
            <div key={m.profile_id} className="pd-member-chip">
              <div className="pd-member-avatar">{initials(m.profiles?.name || '')}</div>
              <div className="pd-member-info">
                <div className="pd-member-name">{m.profiles?.name}</div>
                {m.is_lead && <div className="pd-member-lead">Lead</div>}
              </div>
            </div>
          ))}
          {members.length === 0 && <p className="pd-empty-hint">No members added yet.</p>}
        </div>
      </div>

      {/* ── Tasks ── */}
      <div className="pd-section">
        <div className="pd-section-label">Tasks ({tasks.length})</div>
        {tasks.length === 0 ? (
          <div className="pd-empty-box">
            {isCreator ? 'No tasks yet. Use "Assign Task" to create one.' : 'No tasks assigned to you yet.'}
          </div>
        ) : (
          <div className="pd-task-list">
            {tasks.map((task: any) => {
              const submissions: any[] = task.submissions || [];
              const latestSub = submissions[submissions.length - 1];
              const isAssignee = task.assigned_to === currentUser?.id;
              const canSubmit = isAssignee && task.status !== 'COMPLETED';
              const canReview = isCreator && latestSub && task.status === 'UNDER_REVIEW';
              const isMember = members.some((m: any) => m.profile_id === currentUser?.id);
              const canRoute = isCreator || isAssignee || isMember;
              const routes: any[] = task.file_routes || [];

              return (
                <div key={task.id} className="pd-task-card">
                  <div className="pd-task-top">
                    <div className="pd-task-left">
                      <div className="pd-task-title-row">
                        <div className="pd-task-title">{task.title}</div>
                        {task.priority && task.priority !== 'NORMAL' && (
                          <span className={`pd-priority-badge ${PRIORITY_CLASS[task.priority]}`}>
                            {task.priority}
                          </span>
                        )}
                      </div>
                      {task.description && <div className="pd-task-desc">{task.description}</div>}
                      <div className="pd-task-meta">
                        {task.assignee?.name && (
                          <span className="pd-task-assignee">
                            <div className="pd-mini-avatar">{initials(task.assignee.name)}</div>
                            {task.assignee.name}
                          </span>
                        )}
                        {task.due_date && (
                          <span className={`pd-task-due ${
                            new Date(task.due_date) < new Date() && task.status !== 'COMPLETED' ? 'overdue' : ''
                          }`}>
                            📅 {new Date(task.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                          </span>
                        )}
                        {task.completed_at && (
                          <span className="pd-task-done-date">
                            ✓ Completed {new Date(task.completed_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="pd-task-right">
                      <span className={`pd-badge ${STATUS_CLASS[task.status] || 'badge-pending'}`}>
                        {task.status?.replace(/_/g, ' ')}
                      </span>
                      <div className="pd-task-btns">
                        {canSubmit && (
                          <button className="pd-btn-gold sm"
                            onClick={() => { setActiveTask(task); setModal('submitWork'); }}>
                            {latestSub ? 'Update Work' : 'Submit Work'}
                          </button>
                        )}
                        {canReview && (
                          <button className="pd-btn-outline sm"
                            onClick={() => { setActiveTask(task); setModal('review'); }}>
                            Review
                          </button>
                        )}
                        {canRoute && task.status !== 'COMPLETED' && (
                          <button className="pd-btn-route sm"
                            onClick={() => { setActiveTask(task); setModal('fileRoute'); }}>
                            📎 Route File
                          </button>
                        )}
                        {submissions.length > 0 && (
                          <button className="pd-btn-log sm"
                            onClick={() => { setActiveTask(task); setModal('taskLog'); }}>
                            📋 Log ({submissions.length})
                          </button>
                        )}
                        {task.status === 'COMPLETED' && (
                          <span className="pd-done-chip">✓ Done</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Latest submission preview */}
                  {latestSub && (isCreator || isAssignee) && (
                    <div className="pd-submission-preview">
                      <div className="pd-submission-label">
                        Latest submission ·{' '}
                        <span className={`pd-sub-status ${
                          latestSub.status === 'COMPLETED' ? 'green' :
                          latestSub.status === 'REJECTED' ? 'red' : 'gold'
                        }`}>{latestSub.status}</span>
                        <span className="pd-sub-date">
                          {' '}· {new Date(latestSub.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                      </div>
                      {latestSub.description && (
                        <div className="pd-submission-text">{latestSub.description}</div>
                      )}
                      {latestSub.file_urls?.length > 0 && (
                        <div className="pd-file-chips">
                          {latestSub.file_urls.map((url: string, i: number) => (
                            <a key={i} href={url} target="_blank" rel="noreferrer" className="pd-file-chip">
                              📎 Attachment {i + 1}
                            </a>
                          ))}
                        </div>
                      )}
                      {latestSub.admin_feedback && (
                        <div className="pd-feedback-box">
                          <span className="pd-feedback-label">Feedback: </span>
                          {latestSub.admin_feedback}
                        </div>
                      )}
                    </div>
                  )}

                  {/* File routes */}
                  {routes.length > 0 && (
                    <div className="pd-routes-preview">
                      <div className="pd-routes-label">📂 Routed Files ({routes.length})</div>
                      <div className="pd-routes-list">
                        {routes.map((r: any) => {
                          const opened = r.file_route_recipients?.filter((rc: any) => rc.opened_at).length || 0;
                          const total = r.file_route_recipients?.length || 0;
                          return (
                            <div key={r.id} className="pd-route-chip"
                              onClick={() => { setActiveRoute(r); setActiveTask(task); setModal('routeDetail'); }}>
                              <span className="pd-route-icon">📄</span>
                              <span className="pd-route-name">{r.file_name}</span>
                              <span className="pd-route-stat">{opened}/{total} opened</span>
                              <span className={`pd-route-status ${r.status === 'COMPLETED' ? 'done' : ''}`}>
                                {r.status}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      {modal === 'createTask' && (
        <CreateTaskModal projectId={id as string} members={members} currentUser={currentUser}
          onClose={closeModal} onSuccess={loadAll} projectLink={`/staff/projects/${id}`} />
      )}
      {modal === 'submitWork' && activeTask && (
        <SubmitWorkModal task={activeTask} projectId={id as string} currentUser={currentUser}
          onClose={closeModal} onSuccess={loadAll}
          projectCreatedBy={project.created_by} projectLink={`/staff/projects/${id}`} />
      )}
      {modal === 'review' && activeTask && (
        <ReviewModal task={activeTask} onClose={closeModal} onSuccess={loadAll}
          currentUser={currentUser} projectLink={`/staff/projects/${id}`} />
      )}
      {modal === 'editProject' && (
        <EditProjectModal project={project} members={members} currentUser={currentUser}
          onClose={closeModal} onSuccess={() => { closeModal(); loadAll(); }}
          onDelete={() => router.push('/staff/projects')} />
      )}
      {modal === 'fileRoute' && activeTask && (
        <FileRouteModal task={activeTask} currentUser={currentUser}
          onClose={closeModal} onSuccess={loadAll} projectLink={`/staff/projects/${id}`} />
      )}
      {modal === 'routeDetail' && activeRoute && activeTask && (
        <RouteDetailModal route={activeRoute} task={activeTask} currentUser={currentUser}
          onClose={closeModal} onSuccess={loadAll} projectLink={`/staff/projects/${id}`} />
      )}
      {modal === 'taskLog' && activeTask && (
        <TaskLogModal task={activeTask} onClose={closeModal} />
      )}
    </div>
  );
}

// ── CREATE TASK ───────────────────────────────────────────────
function CreateTaskModal({ projectId, members, currentUser, onClose, onSuccess, projectLink }: any) {
  const [form, setForm] = useState({ title: '', description: '', due_date: '', priority: 'NORMAL' });
  const [assignedTo, setAssignedTo] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    if (!form.title.trim()) { setError('Title is required.'); return; }
    if (!assignedTo) { setError('Please assign this task to a team member.'); return; }
    setSaving(true); setError('');

    const { data: task, error: err } = await supabase.from('tasks').insert({
      project_id: projectId,
      title: form.title.trim(),
      description: form.description.trim() || null,
      due_date: form.due_date || null,
      priority: form.priority,
      assigned_to: assignedTo,
      assigned_by: currentUser.id,
      status: 'PENDING',
    }).select().single();

    if (err || !task) { setError(err?.message || 'Failed to create task.'); setSaving(false); return; }

    await logActivity(currentUser.id, 'TASK', task.id, 'CREATED', `Task "${form.title}" created`);

    const member = members.find((m: any) => m.profile_id === assignedTo);
    if (member && assignedTo !== currentUser.id) {
      await notify(assignedTo, 'TASK_ASSIGNED',
        `New task: ${form.title}`,
        `${currentUser.name} assigned you a task.`, projectLink);
    }
    onSuccess(); onClose();
  };

  return (
    <div className="pd-overlay" onClick={onClose}>
      <div className="pd-modal" onClick={e => e.stopPropagation()}>
        <div className="pd-modal-header">
          <h2>Assign Task</h2>
          <button className="pd-modal-close" onClick={onClose}>✕</button>
        </div>
        {error && <div className="pd-error">{error}</div>}
        <div className="pd-form-group">
          <label>Task Title *</label>
          <input className="pd-input" value={form.title}
            onChange={e => setForm({ ...form, title: e.target.value })}
            placeholder="e.g. Prepare quarterly report" />
        </div>
        <div className="pd-form-group">
          <label>Description</label>
          <textarea className="pd-input" rows={3} value={form.description}
            onChange={e => setForm({ ...form, description: e.target.value })} />
        </div>
        <div className="pd-form-row">
          <div className="pd-form-group">
            <label>Due Date</label>
            <input type="date" className="pd-input" value={form.due_date}
              onChange={e => setForm({ ...form, due_date: e.target.value })} />
          </div>
          <div className="pd-form-group">
            <label>Priority</label>
            <select className="pd-input" value={form.priority}
              onChange={e => setForm({ ...form, priority: e.target.value })}>
              <option value="LOW">Low</option>
              <option value="NORMAL">Normal</option>
              <option value="HIGH">High</option>
              <option value="URGENT">Urgent</option>
            </select>
          </div>
        </div>
        <div className="pd-form-group">
          <label>Assign To *</label>
          <select className="pd-input" value={assignedTo}
            onChange={e => setAssignedTo(e.target.value)}>
            <option value="">Select team member…</option>
            {members.map((m: any) => (
              <option key={m.profile_id} value={m.profile_id}>
                {m.profiles?.name}{m.is_lead ? ' (Lead)' : ''}
              </option>
            ))}
          </select>
        </div>
        <div className="pd-modal-actions">
          <button className="pd-btn-outline" onClick={onClose}>Cancel</button>
          <button className="pd-btn-gold" onClick={save} disabled={saving}>
            {saving ? 'Assigning…' : 'Assign Task'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── SUBMIT WORK ───────────────────────────────────────────────
function SubmitWorkModal({ task, projectId, currentUser, onClose, onSuccess, projectCreatedBy, projectLink }: any) {
  const submissions: any[] = task.submissions || [];
  const latest = submissions[submissions.length - 1];
  const [comment, setComment] = useState('');
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async (isFinal: boolean) => {
    setSaving(true); setError('');
    let uploadedUrls: string[] = [];

    for (const file of newFiles) {
      const path = `${projectId || 'standalone'}/submissions/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from('submissions').upload(path, file);
      if (!upErr) {
        const { data: urlData } = supabase.storage.from('submissions').getPublicUrl(path);
        uploadedUrls.push(urlData.publicUrl);
      }
    }

    // Always insert a new submission (history)
    const { data: sub, error: subErr } = await supabase.from('submissions').insert({
      project_id: projectId || null,
      task_id: task.id,
      submitted_by: currentUser.id,
      description: comment.trim() || null,
      file_urls: uploadedUrls,
      status: isFinal ? 'PENDING' : 'DRAFT',
    }).select().single();

    if (subErr || !sub) { setError(subErr?.message || 'Failed to submit.'); setSaving(false); return; }

    if (isFinal) {
      await supabase.from('tasks').update({ status: 'UNDER_REVIEW' }).eq('id', task.id);
      await logActivity(currentUser.id, 'SUBMISSION', sub.id, 'SUBMITTED',
        comment.trim() || 'Work submitted for review', { task_id: task.id });

      if (projectCreatedBy && projectCreatedBy !== currentUser.id) {
        await notify(projectCreatedBy, 'SUBMISSION_REVIEW',
          `Submission ready: ${task.title}`,
          `${currentUser.name} submitted work for review.`, projectLink);
      }
      // Also notify assigner if different
      if (task.assigned_by && task.assigned_by !== currentUser.id && task.assigned_by !== projectCreatedBy) {
        await notify(task.assigned_by, 'SUBMISSION_REVIEW',
          `Submission ready: ${task.title}`,
          `${currentUser.name} submitted work for review.`, projectLink);
      }
    } else {
      await logActivity(currentUser.id, 'SUBMISSION', sub.id, 'DRAFT_SAVED', 'Draft saved');
    }

    onSuccess(); onClose();
  };

  return (
    <div className="pd-overlay" onClick={onClose}>
      <div className="pd-modal" onClick={e => e.stopPropagation()}>
        <div className="pd-modal-header">
          <h2>Submit Work</h2>
          <button className="pd-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="pd-modal-task-name">{task.title}</div>

        {/* Submission count indicator */}
        {submissions.length > 0 && (
          <div className="pd-sub-count-note">
            ℹ️ This is submission #{submissions.length + 1}. Previous submissions are preserved in the log.
          </div>
        )}

        {error && <div className="pd-error">{error}</div>}

        <div className="pd-form-group">
          <label>Notes / Comments</label>
          <textarea className="pd-input" rows={4} value={comment}
            onChange={e => setComment(e.target.value)}
            placeholder="Describe what you completed…" />
        </div>
        <div className="pd-form-group">
          <label>Attachments</label>
          <input type="file" multiple className="pd-file-input"
            onChange={e => setNewFiles(Array.from(e.target.files || []))} />
          {newFiles.length > 0 && (
            <div className="pd-new-files-hint">{newFiles.length} file{newFiles.length > 1 ? 's' : ''} selected</div>
          )}
        </div>
        <div className="pd-modal-actions">
          <button className="pd-btn-outline" onClick={onClose}>Cancel</button>
          <button className="pd-btn-outline" onClick={() => save(false)} disabled={saving}>Save Draft</button>
          <button className="pd-btn-gold" onClick={() => save(true)} disabled={saving}>
            {saving ? 'Submitting…' : 'Submit for Review'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── REVIEW ────────────────────────────────────────────────────
function ReviewModal({ task, onClose, onSuccess, currentUser, projectLink }: any) {
  const submissions: any[] = task.submissions || [];
  const pendingSub = submissions.find((s: any) => s.status === 'PENDING') ||
    submissions[submissions.length - 1];
  const [feedback, setFeedback] = useState('');
  const [saving, setSaving] = useState(false);

  const handle = async (approved: boolean) => {
    if (!pendingSub) return;
    setSaving(true);
    const newStatus = approved ? 'COMPLETED' : 'REJECTED';

    await supabase.from('submissions').update({
      admin_feedback: feedback.trim() || null,
      status: newStatus,
    }).eq('id', pendingSub.id);

    await supabase.from('tasks').update({
      status: approved ? 'COMPLETED' : 'PENDING',
      ...(approved ? { completed_at: new Date().toISOString() } : {}),
    }).eq('id', task.id);

    await logActivity(currentUser.id, 'SUBMISSION', pendingSub.id,
      approved ? 'APPROVED' : 'REJECTED',
      feedback.trim() || (approved ? 'Submission approved' : 'Submission rejected'),
      { task_id: task.id });

    await notify(task.assigned_to,
      approved ? 'TASK_APPROVED' : 'TASK_REJECTED',
      approved ? `Task approved: ${task.title}` : `Revision needed: ${task.title}`,
      feedback || (approved ? 'Your work has been approved.' : 'Please revise and resubmit.'),
      projectLink);

    onSuccess(); onClose();
  };

  return (
    <div className="pd-overlay" onClick={onClose}>
      <div className="pd-modal" onClick={e => e.stopPropagation()}>
        <div className="pd-modal-header">
          <h2>Review Submission</h2>
          <button className="pd-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="pd-modal-task-name">{task.title}</div>

        {pendingSub?.description && (
          <div className="pd-review-section">
            <div className="pd-review-label">Staff Notes</div>
            <div className="pd-review-text">{pendingSub.description}</div>
          </div>
        )}
        {pendingSub?.file_urls?.length > 0 && (
          <div className="pd-review-section">
            <div className="pd-review-label">Attachments</div>
            <div className="pd-file-chips">
              {pendingSub.file_urls.map((url: string, i: number) => (
                <a key={i} href={url} target="_blank" rel="noreferrer" className="pd-file-chip">
                  📎 Attachment {i + 1}
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Submission history count */}
        {submissions.length > 1 && (
          <div className="pd-sub-count-note">
            📋 {submissions.length} total submissions — click "Log" on the task to view full history.
          </div>
        )}

        <div className="pd-form-group">
          <label>Feedback (optional)</label>
          <textarea className="pd-input" rows={3} value={feedback}
            onChange={e => setFeedback(e.target.value)}
            placeholder="Leave feedback for the staff member…" />
        </div>
        <div className="pd-modal-actions">
          <button className="pd-btn-outline" onClick={onClose}>Cancel</button>
          <button className="pd-btn-reject" onClick={() => handle(false)} disabled={saving}>
            Request Revision
          </button>
          <button className="pd-btn-gold" onClick={() => handle(true)} disabled={saving}>
            {saving ? 'Approving…' : 'Approve Task'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── TASK LOG MODAL ────────────────────────────────────────────
function TaskLogModal({ task, onClose }: any) {
  const submissions: any[] = task.submissions || [];

  return (
    <div className="pd-overlay" onClick={onClose}>
      <div className="pd-modal pd-modal-wide" onClick={e => e.stopPropagation()}>
        <div className="pd-modal-header">
          <h2>📋 Task Log</h2>
          <button className="pd-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="pd-modal-task-name">{task.title}</div>

        {submissions.length === 0 ? (
          <div className="pd-empty-box">No submissions yet.</div>
        ) : (
          <div className="tl-timeline">
            {submissions.map((sub: any, i: number) => (
              <div key={sub.id} className="tl-entry">
                <div className="tl-entry-header">
                  <div className={`tl-status-dot ${
                    sub.status === 'COMPLETED' ? 'done' :
                    sub.status === 'REJECTED' ? 'rejected' :
                    sub.status === 'PENDING' ? 'pending' : 'draft'
                  }`} />
                  <div className="tl-entry-meta">
                    <span className="tl-entry-num">Submission #{i + 1}</span>
                    <span className={`tl-entry-status ${
                      sub.status === 'COMPLETED' ? 'done' :
                      sub.status === 'REJECTED' ? 'rejected' : 'pending'
                    }`}>{sub.status}</span>
                    <span className="tl-entry-date">
                      {new Date(sub.created_at).toLocaleDateString('en-GB', {
                        day: 'numeric', month: 'short', year: 'numeric'
                      })} at {new Date(sub.created_at).toLocaleTimeString([], {
                        hour: '2-digit', minute: '2-digit'
                      })}
                    </span>
                  </div>
                </div>

                {sub.description && (
                  <div className="tl-entry-body">
                    <div className="tl-entry-label">Staff notes</div>
                    <div className="tl-entry-text">{sub.description}</div>
                  </div>
                )}

                {sub.file_urls?.length > 0 && (
                  <div className="tl-entry-body">
                    <div className="tl-entry-label">Attachments</div>
                    <div className="pd-file-chips">
                      {sub.file_urls.map((url: string, fi: number) => (
                        <a key={fi} href={url} target="_blank" rel="noreferrer"
                          className="pd-file-chip">📎 File {fi + 1}</a>
                      ))}
                    </div>
                  </div>
                )}

                {sub.admin_feedback && (
                  <div className="tl-entry-feedback">
                    <div className="tl-entry-label">
                      {sub.status === 'COMPLETED' ? '✓ Approval note' : '↩ Rejection feedback'}
                    </div>
                    <div className="tl-feedback-text">{sub.admin_feedback}</div>
                  </div>
                )}

                {i < submissions.length - 1 && <div className="tl-connector" />}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── FILE ROUTE MODAL ──────────────────────────────────────────
function FileRouteModal({ task, currentUser, onClose, onSuccess, projectLink }: any) {
  const [fileName, setFileName] = useState('');
  const [fileUrl, setFileUrl] = useState('');
  const [note, setNote] = useState('');
  const [staffSearch, setStaffSearch] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedRecipients, setSelectedRecipients] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const search = async () => {
      if (staffSearch.length < 2) { setSearchResults([]); return; }
      setSearching(true);
      // Search ALL staff — routing is open to anyone
      const { data } = await supabase
        .from('profiles')
        .select('id, name, designation, department:departments!profiles_department_id_fkey(name)')
        .ilike('name', `%${staffSearch}%`)
        .neq('id', currentUser.id)
        .limit(12);
      setSearchResults(data || []);
      setSearching(false);
    };
    const t = setTimeout(search, 300);
    return () => clearTimeout(t);
  }, [staffSearch, currentUser.id]);

  const toggleRecipient = (staff: any) => {
    const exists = selectedRecipients.find(r => r.id === staff.id);
    if (exists) setSelectedRecipients(prev => prev.filter(r => r.id !== staff.id));
    else setSelectedRecipients(prev => [...prev, staff]);
  };

  const save = async () => {
    if (!fileName.trim()) { setError('File name is required.'); return; }
    if (!fileUrl.trim()) { setError('File link is required.'); return; }
    if (selectedRecipients.length === 0) { setError('Select at least one recipient.'); return; }
    setSaving(true); setError('');

    const { data: route, error: routeErr } = await supabase
      .from('file_routes')
      .insert({
        task_id: task.id,
        file_name: fileName.trim(),
        file_url: fileUrl.trim(),
        file_type: 'link',
        created_by: currentUser.id,
        status: 'ACTIVE',
      })
      .select()
      .single();

    if (routeErr || !route) {
      setError(routeErr?.message || 'Failed to create file route. Check console.');
      console.error('File route error:', routeErr);
      setSaving(false);
      return;
    }

    // Add recipients
    const recipientRows = selectedRecipients.map(r => ({
      route_id: route.id,
      profile_id: r.id,
      added_by: currentUser.id,
      status: 'PENDING',
    }));

    const { error: recipErr } = await supabase
      .from('file_route_recipients')
      .insert(recipientRows);

    if (recipErr) {
      console.error('Recipients error:', recipErr);
      setError('File created but failed to add recipients: ' + recipErr.message);
      setSaving(false);
      return;
    }

    // Log creation event
    await supabase.from('file_route_events').insert({
      route_id: route.id,
      actor_id: currentUser.id,
      action: 'CREATED',
      note: note.trim() || null,
    });

    await logActivity(currentUser.id, 'FILE_ROUTE', route.id, 'CREATED',
      `File "${fileName}" routed to ${selectedRecipients.length} recipient(s)`);

    // Notify recipients
    for (const r of selectedRecipients) {
      await notify(r.id, 'FILE_ROUTED',
        `File routed to you: ${fileName}`,
        `${currentUser.name} sent you a file to review: "${task.title}"`,
        projectLink);
    }

    onSuccess(); onClose();
  };

  return (
    <div className="pd-overlay" onClick={onClose}>
      <div className="pd-modal" onClick={e => e.stopPropagation()}>
        <div className="pd-modal-header">
          <h2>📎 Route File</h2>
          <button className="pd-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="pd-modal-task-name">Task: {task.title}</div>

        {error && <div className="pd-error">{error}</div>}

        <div className="pd-form-group">
          <label>File / Document Name *</label>
          <input className="pd-input" placeholder="e.g. Q3 Budget Review.xlsx"
            value={fileName} onChange={e => setFileName(e.target.value)} />
        </div>

        <div className="pd-form-group">
          <label>Google Drive / Docs Link *</label>
          <input className="pd-input" placeholder="https://docs.google.com/…"
            value={fileUrl} onChange={e => setFileUrl(e.target.value)} />
          <div className="pd-field-hint">Paste any shareable link — Google Docs, Sheets, Drive, etc.</div>
        </div>

        <div className="pd-form-group">
          <label>Routing Note (optional)</label>
          <textarea className="pd-input" rows={2}
            placeholder="Instructions or context for the recipients…"
            value={note} onChange={e => setNote(e.target.value)} />
        </div>

        <div className="pd-form-group" style={{ position: 'relative' }}>
          <label>Route To * — search any staff member</label>
          <input className="pd-input" placeholder="Search by name…"
            value={staffSearch} onChange={e => setStaffSearch(e.target.value)}
            autoComplete="off" />

          {staffSearch.length >= 2 && (
            <div className="pd-search-drop">
              {searching && <div className="pd-search-empty">Searching…</div>}
              {!searching && searchResults.length === 0 && (
                <div className="pd-search-empty">No staff found.</div>
              )}
              {searchResults.map((s: any) => {
                const selected = selectedRecipients.find(r => r.id === s.id);
                return (
                  <div key={s.id} className={`pd-search-item ${selected ? 'selected' : ''}`}
                    onClick={() => toggleRecipient(s)}>
                    <div className="pd-mini-avatar">{initials(s.name)}</div>
                    <div className="pd-search-info">
                      <div className="pd-search-name">{s.name}</div>
                      <div className="pd-search-role">
                        {s.designation || '—'}
                        {s.department?.name && ` · ${s.department.name}`}
                      </div>
                    </div>
                    <div className={`pd-recipient-check ${selected ? 'checked' : ''}`}>
                      {selected ? '✓' : '+'}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Selected recipients */}
        {selectedRecipients.length > 0 && (
          <div className="pd-form-group">
            <label>Selected Recipients ({selectedRecipients.length})</label>
            <div className="pd-selected-recipients">
              {selectedRecipients.map((r: any) => (
                <div key={r.id} className="pd-selected-recipient-pill">
                  <div className="pd-mini-avatar">{initials(r.name)}</div>
                  <span>{r.name}</span>
                  <button onClick={() => toggleRecipient(r)}>✕</button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="pd-modal-actions">
          <button className="pd-btn-outline" onClick={onClose}>Cancel</button>
          <button className="pd-btn-gold" onClick={save} disabled={saving || selectedRecipients.length === 0}>
            {saving ? 'Routing…' : `Route to ${selectedRecipients.length} person${selectedRecipients.length !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── ROUTE DETAIL MODAL ────────────────────────────────────────
function RouteDetailModal({ route, task, currentUser, onClose, onSuccess, projectLink }: any) {
  const [fullRoute, setFullRoute] = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [forwardSearch, setForwardSearch] = useState('');
  const [forwardResults, setForwardResults] = useState<any[]>([]);
  const [selectedForward, setSelectedForward] = useState<any[]>([]);
  const [forwardNote, setForwardNote] = useState('');
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [showForward, setShowForward] = useState(false);

  useEffect(() => { loadRoute(); }, [route.id]);

  const loadRoute = async () => {
    setLoading(true);
    const [{ data: r }, { data: ev }] = await Promise.all([
      supabase.from('file_routes').select(`
        *,
        creator:profiles!created_by(id, name, designation),
        file_route_recipients(
          id, profile_id, status, opened_at, completed_at,
          profile:profiles(id, name, designation),
          adder:profiles!added_by(name)
        )
      `).eq('id', route.id).single(),
      supabase.from('file_route_events').select(`
        *, actor:profiles!actor_id(name, designation),
        forwarded_to_profile:profiles!forwarded_to(name)
      `).eq('route_id', route.id).order('created_at', { ascending: true }),
    ]);

    setFullRoute(r);
    setEvents(ev || []);
    setLoading(false);

    // Auto-log OPENED
    if (r) {
      const myRec = r.file_route_recipients?.find(
        (rc: any) => rc.profile_id === currentUser.id && !rc.opened_at
      );
      if (myRec) {
        await supabase.from('file_route_recipients').update({
          status: 'OPENED', opened_at: new Date().toISOString()
        }).eq('id', myRec.id);

        await supabase.from('file_route_events').insert({
          route_id: route.id, recipient_id: myRec.id,
          actor_id: currentUser.id, action: 'OPENED',
        });

        if (r.created_by !== currentUser.id) {
          await notify(r.created_by, 'FILE_OPENED',
            `File opened: ${r.file_name}`,
            `${currentUser.name} opened the file you routed.`, projectLink);
        }
        loadRoute();
      }
    }
  };

  useEffect(() => {
    const search = async () => {
      if (forwardSearch.length < 2) { setForwardResults([]); return; }
      const { data } = await supabase.from('profiles')
        .select('id, name, designation')
        .ilike('name', `%${forwardSearch}%`)
        .neq('id', currentUser.id)
        .limit(10);
      setForwardResults(data || []);
    };
    const t = setTimeout(search, 300);
    return () => clearTimeout(t);
  }, [forwardSearch]);

  const toggleForward = (staff: any) => {
    const exists = selectedForward.find(s => s.id === staff.id);
    if (exists) setSelectedForward(prev => prev.filter(s => s.id !== staff.id));
    else setSelectedForward(prev => [...prev, staff]);
  };

  const handleForward = async () => {
    if (selectedForward.length === 0) return;
    setSaving(true);

    const myRec = fullRoute?.file_route_recipients?.find(
      (rc: any) => rc.profile_id === currentUser.id
    );

    for (const staff of selectedForward) {
      const exists = fullRoute?.file_route_recipients?.find(
        (rc: any) => rc.profile_id === staff.id
      );
      if (!exists) {
        await supabase.from('file_route_recipients').insert({
          route_id: route.id, profile_id: staff.id,
          added_by: currentUser.id, status: 'PENDING',
        });
      }

      await supabase.from('file_route_events').insert({
        route_id: route.id, recipient_id: myRec?.id || null,
        actor_id: currentUser.id, action: 'FORWARDED',
        forwarded_to: staff.id, note: forwardNote.trim() || null,
      });

      if (myRec) {
        await supabase.from('file_route_recipients')
          .update({ status: 'FORWARDED' }).eq('id', myRec.id);
      }

      await notify(staff.id, 'FILE_ROUTED',
        `File forwarded to you: ${fullRoute.file_name}`,
        `${currentUser.name} forwarded a file to you.`, projectLink);

      if (fullRoute.created_by !== currentUser.id) {
        await notify(fullRoute.created_by, 'FILE_FORWARDED',
          `File forwarded: ${fullRoute.file_name}`,
          `${currentUser.name} forwarded to ${staff.name}.`, projectLink);
      }
    }

    setShowForward(false);
    setSelectedForward([]);
    setForwardSearch('');
    setForwardNote('');
    loadRoute();
    setSaving(false);
  };

  const handleComment = async () => {
    if (!comment.trim()) return;
    setSaving(true);
    const myRec = fullRoute?.file_route_recipients?.find(
      (rc: any) => rc.profile_id === currentUser.id
    );
    await supabase.from('file_route_events').insert({
      route_id: route.id, recipient_id: myRec?.id || null,
      actor_id: currentUser.id, action: 'COMMENTED', note: comment.trim(),
    });
    if (fullRoute.created_by !== currentUser.id) {
      await notify(fullRoute.created_by, 'FILE_COMMENTED',
        `Comment on: ${fullRoute.file_name}`,
        `${currentUser.name} left a comment.`, projectLink);
    }
    setComment('');
    loadRoute();
    setSaving(false);
  };

  const handleReturn = async () => {
    setSaving(true);
    const myRec = fullRoute?.file_route_recipients?.find(
      (rc: any) => rc.profile_id === currentUser.id
    );
    if (myRec) {
      await supabase.from('file_route_recipients').update({
        status: 'DONE', completed_at: new Date().toISOString()
      }).eq('id', myRec.id);
    }
    await supabase.from('file_route_events').insert({
      route_id: route.id, recipient_id: myRec?.id || null,
      actor_id: currentUser.id, action: 'RETURNED',
      note: comment.trim() || null,
    });
    await notify(fullRoute.created_by, 'FILE_RETURNED',
      `File returned: ${fullRoute.file_name}`,
      `${currentUser.name} finished with the file.`, projectLink);
    setComment('');
    loadRoute();
    onSuccess();
    setSaving(false);
  };

  const handleComplete = async () => {
    setSaving(true);
    await supabase.from('file_routes').update({ status: 'COMPLETED' }).eq('id', route.id);
    await supabase.from('file_route_events').insert({
      route_id: route.id, actor_id: currentUser.id, action: 'COMPLETED',
    });
    loadRoute();
    onSuccess();
    setSaving(false);
  };

  const ACTION_LABELS: Record<string, { label: string; color: string }> = {
    CREATED:   { label: 'Created & routed', color: 'var(--gold)' },
    OPENED:    { label: 'Opened file',       color: '#64dcb4' },
    FORWARDED: { label: 'Forwarded to',      color: '#a78bfa' },
    RETURNED:  { label: 'Returned file',     color: '#64c864' },
    COMMENTED: { label: 'Commented',         color: 'var(--text2)' },
    COMPLETED: { label: 'Marked complete',   color: '#64c864' },
    RECALLED:  { label: 'Recalled',          color: '#e05c5c' },
  };

  const isCreator = fullRoute?.created_by === currentUser.id;
  const myRecipient = fullRoute?.file_route_recipients?.find(
    (rc: any) => rc.profile_id === currentUser.id
  );
  const alreadyDone = myRecipient?.status === 'DONE';

  if (loading) return (
    <div className="pd-overlay">
      <div className="pd-modal">
        <div className="pd-loading-bar" style={{ margin: '40px auto', width: '120px' }} />
      </div>
    </div>
  );

  return (
    <div className="pd-overlay" onClick={onClose}>
      <div className="pd-modal pd-modal-wide" onClick={e => e.stopPropagation()}>
        <div className="pd-modal-header">
          <h2>📄 {fullRoute?.file_name}</h2>
          <button className="pd-modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="fr-file-link-row">
          <a href={fullRoute?.file_url} target="_blank" rel="noreferrer" className="fr-open-btn">
            🔗 Open File
          </a>
          <span className={`pd-badge ${fullRoute?.status === 'COMPLETED' ? 'badge-done' : 'badge-active'}`}>
            {fullRoute?.status}
          </span>
        </div>

        {/* Chain of custody */}
        <div className="fr-section">
          <div className="fr-section-label">Chain of Custody</div>
          <div className="fr-recipients">
            <div className="fr-recipient-row creator">
              <div className="pd-mini-avatar">{initials(fullRoute?.creator?.name || '')}</div>
              <div className="fr-recipient-info">
                <div className="fr-recipient-name">
                  {fullRoute?.creator?.name}
                  <span className="fr-origin-tag">Originator</span>
                </div>
                <div className="fr-recipient-role">{fullRoute?.creator?.designation}</div>
              </div>
              <div className="fr-recipient-status done">Created</div>
            </div>

            {fullRoute?.file_route_recipients?.map((rc: any) => (
              <div key={rc.id} className="fr-recipient-row">
                <div className="pd-mini-avatar">{initials(rc.profile?.name || '')}</div>
                <div className="fr-recipient-info">
                  <div className="fr-recipient-name">{rc.profile?.name}</div>
                  <div className="fr-recipient-role">
                    {rc.profile?.designation}
                    {rc.adder?.name && rc.added_by !== fullRoute.created_by && (
                      <span className="fr-added-by"> · Added by {rc.adder.name}</span>
                    )}
                  </div>
                </div>
                <div className="fr-recipient-right">
                  <span className={`fr-recipient-status ${rc.status.toLowerCase()}`}>
                    {rc.status}
                  </span>
                  {rc.opened_at && (
                    <div className="fr-timestamp">
                      Opened {new Date(rc.opened_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} {new Date(rc.opened_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  )}
                  {rc.completed_at && (
                    <div className="fr-timestamp done">
                      Done {new Date(rc.completed_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} {new Date(rc.completed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Timeline */}
        <div className="fr-section">
          <div className="fr-section-label">Activity Timeline</div>
          <div className="fr-timeline">
            {events.map((ev: any, i: number) => {
              const meta = ACTION_LABELS[ev.action] || { label: ev.action, color: 'var(--text3)' };
              return (
                <div key={ev.id} className="fr-event">
                  <div className="fr-event-dot" style={{ background: meta.color }} />
                  <div className="fr-event-body">
                    <div className="fr-event-title">
                      <strong>{ev.actor?.name}</strong> {meta.label}
                      {ev.forwarded_to_profile?.name && (
                        <span> → <strong>{ev.forwarded_to_profile.name}</strong></span>
                      )}
                    </div>
                    {ev.note && <div className="fr-event-note">"{ev.note}"</div>}
                    <div className="fr-event-time">
                      {new Date(ev.created_at).toLocaleDateString('en-GB', {
                        day: 'numeric', month: 'short', year: 'numeric'
                      })} at {new Date(ev.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                  {i < events.length - 1 && <div className="fr-event-line" />}
                </div>
              );
            })}
          </div>
        </div>

        {/* Recipient actions */}
        {myRecipient && !alreadyDone && fullRoute?.status !== 'COMPLETED' && (
          <div className="fr-section">
            <div className="fr-section-label">Your Actions</div>
            <div className="fr-action-group">
              <textarea className="pd-input" rows={2} value={comment}
                onChange={e => setComment(e.target.value)}
                placeholder="Add a comment before returning…" />
              <div className="fr-action-btns">
                <button className="pd-btn-outline sm" onClick={handleComment}
                  disabled={saving || !comment.trim()}>💬 Comment</button>
                <button className="pd-btn-outline sm" onClick={() => setShowForward(!showForward)}>
                  ↗ Forward
                </button>
                <button className="pd-btn-gold sm" onClick={handleReturn} disabled={saving}>
                  ↩ Return to Originator
                </button>
              </div>
            </div>

            {showForward && (
              <div className="fr-forward-panel">
                <div className="fr-section-label" style={{ marginBottom: 8 }}>Forward to</div>
                <div style={{ position: 'relative', marginBottom: 10 }}>
                  <input className="pd-input" placeholder="Search any staff member…"
                    value={forwardSearch} onChange={e => setForwardSearch(e.target.value)} />
                  {forwardResults.length > 0 && (
                    <div className="pd-search-drop">
                      {forwardResults.map((s: any) => (
                        <div key={s.id} className="pd-search-item"
                          onClick={() => toggleForward(s)}>
                          <div className="pd-mini-avatar">{initials(s.name)}</div>
                          <div className="pd-search-info">
                            <div className="pd-search-name">{s.name}</div>
                            <div className="pd-search-role">{s.designation}</div>
                          </div>
                          {selectedForward.find(f => f.id === s.id) && (
                            <span style={{ color: 'var(--gold)' }}>✓</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {selectedForward.length > 0 && (
                  <div className="fr-selected-forwards">
                    {selectedForward.map((s: any) => (
                      <span key={s.id} className="fr-forward-pill">
                        {s.name} <button onClick={() => toggleForward(s)}>✕</button>
                      </span>
                    ))}
                  </div>
                )}
                <textarea className="pd-input" rows={2} value={forwardNote}
                  onChange={e => setForwardNote(e.target.value)}
                  placeholder="Instructions for the people you're forwarding to…" />
                <button className="pd-btn-gold" style={{ marginTop: 10 }}
                  onClick={handleForward}
                  disabled={saving || selectedForward.length === 0}>
                  {saving ? 'Forwarding…' : `Forward to ${selectedForward.length} person${selectedForward.length !== 1 ? 's' : ''}`}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Creator mark complete */}
        {isCreator && fullRoute?.status !== 'COMPLETED' && (
          <div className="fr-section">
            <div className="fr-section-label">Creator Actions</div>
            <button className="pd-btn-gold" onClick={handleComplete} disabled={saving}>
              {saving ? 'Completing…' : '✓ Mark Route Complete'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── EDIT PROJECT ──────────────────────────────────────────────
function EditProjectModal({ project, members, currentUser, onClose, onSuccess, onDelete }: any) {
  const [form, setForm] = useState({
    title: project.title || '',
    objectives: project.objectives || '',
    due_date: project.due_date || '',
  });
  const [currentMembers, setCurrentMembers] = useState<any[]>(members);
  const [memberSearch, setMemberSearch]     = useState('');
  const [searchResults, setSearchResults]   = useState<any[]>([]);
  const [saving, setSaving]       = useState(false);
  const [deleting, setDeleting]   = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError]         = useState('');

  useEffect(() => {
    const search = async () => {
      if (memberSearch.length < 2) { setSearchResults([]); return; }
      const { data } = await supabase.from('profiles')
        .select('id, name, designation')
        .ilike('name', `%${memberSearch}%`).limit(8);
      setSearchResults(data || []);
    };
    const t = setTimeout(search, 300);
    return () => clearTimeout(t);
  }, [memberSearch]);

  const addMember = async (staff: any) => {
    if (currentMembers.some(m => m.profile_id === staff.id)) return;
    await supabase.from('project_members').insert({
      project_id: project.id, profile_id: staff.id, is_lead: false
    });
    await notify(staff.id, 'PROJECT_ADDED', `Added to project: ${project.title}`,
      `${currentUser.name} added you to a project.`, `/staff/projects/${project.id}`);
    setCurrentMembers(prev => [...prev, {
      profile_id: staff.id, is_lead: false,
      profiles: { id: staff.id, name: staff.name, designation: staff.designation },
    }]);
    setMemberSearch(''); setSearchResults([]);
  };

  const removeMember = async (profileId: string) => {
    await supabase.from('project_members').delete()
      .eq('project_id', project.id).eq('profile_id', profileId);
    setCurrentMembers(prev => prev.filter(m => m.profile_id !== profileId));
  };

  const toggleLead = async (profileId: string, current: boolean) => {
    await supabase.from('project_members').update({ is_lead: !current })
      .eq('project_id', project.id).eq('profile_id', profileId);
    setCurrentMembers(prev => prev.map(m =>
      m.profile_id === profileId ? { ...m, is_lead: !current } : m
    ));
  };

  const save = async () => {
    if (!form.title.trim()) { setError('Title is required.'); return; }
    setSaving(true);
    const { error: err } = await supabase.from('projects').update({
      title: form.title.trim(),
      objectives: form.objectives.trim() || null,
      due_date: form.due_date || null,
    }).eq('id', project.id);
    if (err) { setError(err.message); setSaving(false); return; }
    await logActivity(currentUser.id, 'PROJECT', project.id, 'UPDATED', 'Project details updated');
    onSuccess();
  };

  const deleteProject = async () => {
    setDeleting(true);
    await supabase.from('tasks').delete().eq('project_id', project.id);
    await supabase.from('project_members').delete().eq('project_id', project.id);
    await supabase.from('projects').delete().eq('id', project.id);
    onDelete();
  };

  return (
    <div className="pd-overlay" onClick={onClose}>
      <div className="pd-modal pd-modal-wide" onClick={e => e.stopPropagation()}>
        <div className="pd-modal-header">
          <h2>Edit Project</h2>
          <button className="pd-modal-close" onClick={onClose}>✕</button>
        </div>
        {error && <div className="pd-error">{error}</div>}
        <div className="pd-form-group">
          <label>Project Title *</label>
          <input className="pd-input" value={form.title}
            onChange={e => setForm({ ...form, title: e.target.value })} />
        </div>
        <div className="pd-form-group">
          <label>Objectives</label>
          <textarea className="pd-input" rows={3} value={form.objectives}
            onChange={e => setForm({ ...form, objectives: e.target.value })} />
        </div>
        <div className="pd-form-group">
          <label>Due Date</label>
          <input type="date" className="pd-input" value={form.due_date}
            onChange={e => setForm({ ...form, due_date: e.target.value })} />
        </div>
        <div className="pd-form-group" style={{ position: 'relative' }}>
          <label>Add Team Members</label>
          <input className="pd-input" placeholder="Search by name…" value={memberSearch}
            onChange={e => setMemberSearch(e.target.value)} autoComplete="off" />
          {searchResults.length > 0 && (
            <div className="pd-search-drop">
              {searchResults.map(s => (
                <div key={s.id} className="pd-search-item" onClick={() => addMember(s)}>
                  <div className="pd-mini-avatar">{initials(s.name)}</div>
                  <div className="pd-search-info">
                    <div className="pd-search-name">{s.name}</div>
                    <div className="pd-search-role">{s.designation}</div>
                  </div>
                  <span className="pd-add-label">+ Add</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="pd-form-group">
          <label>Current Members</label>
          <div className="pd-member-edit-list">
            {currentMembers.map((m: any) => (
              <div key={m.profile_id} className="pd-member-edit-row">
                <div className="pd-mini-avatar">{initials(m.profiles?.name || '')}</div>
                <div className="pd-member-edit-info">
                  <div className="pd-member-name">{m.profiles?.name}</div>
                  <div className="pd-search-role">{m.profiles?.designation}</div>
                </div>
                <button className={`pd-lead-btn ${m.is_lead ? 'active' : ''}`}
                  onClick={() => toggleLead(m.profile_id, m.is_lead)}>
                  {m.is_lead ? '★ Lead' : 'Set Lead'}
                </button>
                {m.profile_id !== project.created_by && (
                  <button className="pd-remove-btn" onClick={() => removeMember(m.profile_id)}>✕</button>
                )}
              </div>
            ))}
          </div>
        </div>
        <div className="pd-modal-actions pd-modal-actions-split">
          <div>
            {!confirmDelete ? (
              <button className="pd-btn-danger-outline" onClick={() => setConfirmDelete(true)}>
                🗑 Delete Project
              </button>
            ) : (
              <div className="pd-confirm-delete">
                <span>Are you sure?</span>
                <button className="pd-btn-danger" onClick={deleteProject} disabled={deleting}>
                  {deleting ? 'Deleting…' : 'Yes, Delete'}
                </button>
                <button className="pd-btn-outline sm" onClick={() => setConfirmDelete(false)}>Cancel</button>
              </div>
            )}
          </div>
          <div className="pd-modal-actions-right">
            <button className="pd-btn-outline" onClick={onClose}>Cancel</button>
            <button className="pd-btn-gold" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}