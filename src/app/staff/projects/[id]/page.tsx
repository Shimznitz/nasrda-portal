// src/app/staff/projects/[id]/page.tsx

'use client';

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useParams, useRouter } from "next/navigation";
import "./[id].css";

// ── Helpers ──────────────────────────────────────────────────
const initials = (name: string) =>
  name?.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase() || '??';

const notify = async (userId: string, type: string, title: string, body: string, link: string) => {
  await supabase.from('notifications').insert({ user_id: userId, type, title, body, link, read: false });
};

const STATUS_CLASS: Record<string, string> = {
  COMPLETED: 'badge-done',
  UNDER_REVIEW: 'badge-review',
  IN_PROGRESS: 'badge-active',
  PENDING: 'badge-pending',
  REJECTED: 'badge-rejected',
};

// ── Main Page ─────────────────────────────────────────────────
export default function ProjectDetail() {
  const { id } = useParams();
  const router = useRouter();

  const [project, setProject] = useState<any>(null);
  const [tasks, setTasks] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [isCreator, setIsCreator] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Modal visibility
  const [modal, setModal] = useState<
    'none' | 'createTask' | 'submitWork' | 'review' | 'editProject'
  >('none'); 

  const [activeTask, setActiveTask] = useState<any>(null);

  useEffect(() => { if (id) loadAll(); }, [id]);

  const loadAll = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: prof } = await supabase
        .from('profiles').select('id, name, designation').eq('id', user.id).single();
      setCurrentUser(prof);

      // Project
      const { data: proj } = await supabase
        .from('projects')
        .select('*')
        .eq('id', id)
        .single();

      if (!proj) return;
      setProject(proj);
      const creator = proj.created_by === user.id;
      setIsCreator(creator);

      // Members
      const { data: memberRows } = await supabase
        .from('project_members')
        .select('profile_id, is_lead, profiles(id, name, designation)')
        .eq('project_id', id);
      setMembers(memberRows || []);

      // Tasks with submissions
      const { data: taskRows } = await supabase
        .from('tasks')
        .select('*, submissions(*), assignee:profiles!assigned_to(id, name, designation)')
        .eq('project_id', id)
        .order('created_at', { ascending: true });

      // Regular staff only see their own tasks
      if (creator) {
        setTasks(taskRows || []);
      } else {
        setTasks((taskRows || []).filter((t: any) => t.assigned_to === user.id));
      }
    } finally {
      setLoading(false);
    }
  };

  const closeModal = () => { setModal('none'); setActiveTask(null); };

  if (loading) return <div className="pd-loading"><div className="pd-loading-bar" /></div>;
  if (!project) return <div className="pd-not-found">Project not found.</div>;

  const completedCount = tasks.filter((t) => t.status === 'COMPLETED').length;

  return (
    <div className="pd-page">
      {/* ── Back ── */}
      <button className="pd-back" onClick={() => router.push('/staff/projects')}>
        ← Projects
      </button>

      {/* ── Header card ── */}
      <div className="pd-header-card">
        <div className="pd-header-left">
          <div className="pd-header-eyebrow">Project</div>
          <h1 className="pd-title">{project.title}</h1>
          {project.objectives && (
            <p className="pd-objectives">{project.objectives}</p>
          )}
          <div className="pd-meta-row">
            {project.due_date && (
              <span className="pd-meta-chip">
                📅 Due {new Date(project.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
            )}
            <span className={`pd-meta-chip badge ${STATUS_CLASS[project.status] || 'badge-active'}`}>
              {project.status?.replace(/_/g, ' ') || 'IN PROGRESS'}
            </span>
          </div>
        </div>

        <div className="pd-header-right">
          <div className="pd-progress-ring-wrap">
            <svg viewBox="0 0 80 80" className="pd-progress-ring">
              <circle cx="40" cy="40" r="34" fill="none" stroke="var(--border)" strokeWidth="6" />
              <circle
                cx="40" cy="40" r="34" fill="none"
                stroke="var(--gold)" strokeWidth="6"
                strokeDasharray={`${2 * Math.PI * 34}`}
                strokeDashoffset={`${2 * Math.PI * 34 * (1 - (project.progress || 0) / 100)}`}
                strokeLinecap="round"
                transform="rotate(-90 40 40)"
              />
            </svg>
            <div className="pd-progress-label">{project.progress || 0}%</div>
          </div>
          <div className="pd-progress-sub">{completedCount}/{tasks.length} tasks</div>
        </div>
      </div>

      {/* ── Creator actions ── */}
      {isCreator && (
        <div className="pd-actions-row">
          <button className="pd-btn-outline" onClick={() => setModal('editProject')}>
            ✏️ Edit Project
          </button>
          <button className="pd-btn-gold" onClick={() => setModal('createTask')}>
            + Assign Task
          </button>
        </div>
      )}

      {/* ── Members strip ── */}
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
        <div className="pd-section-label">Tasks</div>
        {tasks.length === 0 ? (
          <div className="pd-empty-box">
            {isCreator ? 'No tasks yet. Use "Assign Task" to create one.' : 'No tasks assigned to you yet.'}
          </div>
        ) : (
          <div className="pd-task-list">
            {tasks.map((task: any) => {
              const mySubmission = task.submissions?.[0];
              const isAssignee = task.assigned_to === currentUser?.id;
              const canSubmit = isAssignee && task.status !== 'COMPLETED';
              const canReview = isCreator && mySubmission && task.status === 'UNDER_REVIEW';

              return (
                <div key={task.id} className="pd-task-card">
                  <div className="pd-task-top">
                    <div className="pd-task-left">
                      <div className="pd-task-title">{task.title}</div>
                      {task.description && (
                        <div className="pd-task-desc">{task.description}</div>
                      )}
                      <div className="pd-task-meta">
                        {task.assignee?.name && (
                          <span className="pd-task-assignee">
                            <div className="pd-mini-avatar">{initials(task.assignee.name)}</div>
                            {task.assignee.name}
                          </span>
                        )}
                        {task.due_date && (
                          <span className={`pd-task-due ${new Date(task.due_date) < new Date() && task.status !== 'COMPLETED' ? 'overdue' : ''}`}>
                            📅 {new Date(task.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
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
                          <button className="pd-btn-gold sm" onClick={() => {
                            setActiveTask(task);
                            setModal('submitWork');
                          }}>
                            {mySubmission ? 'Update Work' : 'Submit Work'}
                          </button>
                        )}
                        {canReview && (
                          <button className="pd-btn-outline sm" onClick={() => {
                            setActiveTask(task);
                            setModal('review');
                          }}>
                            Review
                          </button>
                        )}
                        {isCreator && task.status === 'COMPLETED' && (
                          <span className="pd-done-chip">✓ Done</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Submission preview */}
                  {mySubmission && (isCreator || isAssignee) && (
                    <div className="pd-submission-preview">
                      <div className="pd-submission-label">
                        Last submission · <span className={`pd-sub-status ${mySubmission.status === 'COMPLETED' ? 'green' : mySubmission.status === 'REJECTED' ? 'red' : 'gold'}`}>
                          {mySubmission.status}
                        </span>
                      </div>
                      {mySubmission.description && (
                        <div className="pd-submission-text">{mySubmission.description}</div>
                      )}
                      {mySubmission.file_urls?.length > 0 && (
                        <div className="pd-file-chips">
                          {mySubmission.file_urls.map((url: string, i: number) => (
                            <a key={i} href={url} target="_blank" rel="noreferrer" className="pd-file-chip">
                              📎 Attachment {i + 1}
                            </a>
                          ))}
                        </div>
                      )}
                      {mySubmission.admin_feedback && (
                        <div className="pd-feedback-box">
                          <span className="pd-feedback-label">Feedback:</span> {mySubmission.admin_feedback}
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

      {/* ── Modals ── */}
      {modal === 'createTask' && (
        <CreateTaskModal
          projectId={id as string}
          members={members}
          currentUser={currentUser}
          onClose={closeModal}
          onSuccess={loadAll}
          projectLink={`/staff/projects/${id}`}
        />
      )}
      {modal === 'submitWork' && activeTask && (
        <SubmitWorkModal
          task={activeTask}
          projectId={id as string}
          currentUser={currentUser}
          onClose={closeModal}
          onSuccess={loadAll}
          projectCreatedBy={project.created_by}
          projectLink={`/staff/projects/${id}`}
        />
      )}
      {modal === 'review' && activeTask && (
        <ReviewModal
          task={activeTask}
          onClose={closeModal}
          onSuccess={loadAll}
          projectLink={`/staff/projects/${id}`}
        />
      )}
      {modal === 'editProject' && (
        <EditProjectModal
          project={project}
          members={members}
          currentUser={currentUser}
          onClose={closeModal}
          onSuccess={() => { closeModal(); loadAll(); }}
          onDelete={() => router.push('/staff/projects')}
        />
      )}
    </div>
  );
}

// ── CREATE TASK MODAL ─────────────────────────────────────────
function CreateTaskModal({ projectId, members, currentUser, onClose, onSuccess, projectLink }: any) {
  const [form, setForm] = useState({ title: '', description: '', due_date: '' });
  const [assignedTo, setAssignedTo] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    if (!form.title.trim()) { setError('Title is required.'); return; }
    if (!assignedTo) { setError('Please assign this task to a team member.'); return; }
    setSaving(true);
    setError('');

    const { data: task, error: err } = await supabase.from('tasks').insert({
      project_id: projectId,
      title: form.title.trim(),
      description: form.description.trim() || null,
      due_date: form.due_date || null,
      assigned_to: assignedTo,
      assigned_by: currentUser.id,
      status: 'PENDING',
    }).select().single();

    if (err || !task) { setError(err?.message || 'Failed to create task.'); setSaving(false); return; }

    // Notify assignee
    const member = members.find((m: any) => m.profile_id === assignedTo);
    if (member && assignedTo !== currentUser.id) {
      await notify(
        assignedTo,
        'TASK_ASSIGNED',
        `New task assigned: ${form.title}`,
        `You have been assigned a task by ${currentUser.name}.`,
        projectLink
      );
    }

    onSuccess();
    onClose();
  };

  return (
    <div className="pd-overlay" onClick={onClose}>
      <div className="pd-modal" onClick={(e) => e.stopPropagation()}>
        <div className="pd-modal-header">
          <h2>Assign Task</h2>
          <button className="pd-modal-close" onClick={onClose}>✕</button>
        </div>

        {error && <div className="pd-error">{error}</div>}

        <div className="pd-form-group">
          <label>Task Title *</label>
          <input className="pd-input" value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="e.g. Prepare quarterly report" />
        </div>

        <div className="pd-form-group">
          <label>Description</label>
          <textarea className="pd-input" rows={3} value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="What needs to be done?" />
        </div>

        <div className="pd-form-group">
          <label>Assign To *</label>
          <select className="pd-input" value={assignedTo}
            onChange={(e) => setAssignedTo(e.target.value)}>
            <option value="">Select team member…</option>
            {members.map((m: any) => (
              <option key={m.profile_id} value={m.profile_id}>
                {m.profiles?.name}{m.is_lead ? ' (Lead)' : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="pd-form-group">
          <label>Due Date</label>
          <input type="date" className="pd-input" value={form.due_date}
            onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
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

// ── SUBMIT WORK MODAL ─────────────────────────────────────────
function SubmitWorkModal({ task, projectId, currentUser, onClose, onSuccess, projectCreatedBy, projectLink }: any) {
  const existing = task.submissions?.[0];
  const [comment, setComment] = useState(existing?.description || '');
  const [existingFiles, setExistingFiles] = useState<string[]>(existing?.file_urls || []);
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async (isFinal: boolean) => {
    setSaving(true);
    setError('');

    let uploadedUrls = [...existingFiles];
    for (const file of newFiles) {
      const path = `${projectId}/submissions/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from('submissions').upload(path, file);
      if (!upErr) {
        const { data: urlData } = supabase.storage.from('submissions').getPublicUrl(path);
        uploadedUrls.push(urlData.publicUrl);
      }
    }

    const payload = {
      project_id: projectId,
      task_id: task.id,
      submitted_by: currentUser.id,
      description: comment,
      file_urls: uploadedUrls,
      status: isFinal ? 'PENDING' : 'DRAFT',
    };

    if (existing?.id) {
      await supabase.from('submissions').update(payload).eq('id', existing.id);
    } else {
      await supabase.from('submissions').insert(payload);
    }

    if (isFinal) {
      await supabase.from('tasks').update({ status: 'UNDER_REVIEW' }).eq('id', task.id);
      // Notify project creator
      if (projectCreatedBy !== currentUser.id) {
        await notify(
          projectCreatedBy,
          'SUBMISSION_REVIEW',
          `Submission ready: ${task.title}`,
          `${currentUser.name} submitted work for review.`,
          projectLink
        );
      }
    }

    onSuccess();
    onClose();
  };

  return (
    <div className="pd-overlay" onClick={onClose}>
      <div className="pd-modal" onClick={(e) => e.stopPropagation()}>
        <div className="pd-modal-header">
          <h2>Submit Work</h2>
          <button className="pd-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="pd-modal-task-name">{task.title}</div>

        {error && <div className="pd-error">{error}</div>}

        <div className="pd-form-group">
          <label>Comments / Notes</label>
          <textarea className="pd-input" rows={4} value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Describe what you completed…" />
        </div>

        {existingFiles.length > 0 && (
          <div className="pd-form-group">
            <label>Current Attachments</label>
            <div className="pd-file-chips">
              {existingFiles.map((url, i) => (
                <div key={i} className="pd-file-chip removable">
                  <a href={url} target="_blank" rel="noreferrer">📎 Attachment {i + 1}</a>
                  <button onClick={() => setExistingFiles(existingFiles.filter((_, idx) => idx !== i))}>✕</button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="pd-form-group">
          <label>Add Attachments</label>
          <input type="file" multiple className="pd-file-input"
            onChange={(e) => setNewFiles(Array.from(e.target.files || []))} />
          {newFiles.length > 0 && (
            <div className="pd-new-files-hint">{newFiles.length} file{newFiles.length > 1 ? 's' : ''} selected</div>
          )}
        </div>

        <div className="pd-modal-actions">
          <button className="pd-btn-outline" onClick={onClose}>Cancel</button>
          <button className="pd-btn-outline" onClick={() => save(false)} disabled={saving}>
            Save Draft
          </button>
          <button className="pd-btn-gold" onClick={() => save(true)} disabled={saving}>
            {saving ? 'Submitting…' : 'Submit for Review'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── REVIEW MODAL ──────────────────────────────────────────────
function ReviewModal({ task, onClose, onSuccess, projectLink }: any) {
  const submission = task.submissions?.[0];
  const [feedback, setFeedback] = useState('');
  const [saving, setSaving] = useState(false);

  const handle = async (approved: boolean) => {
    setSaving(true);
    const newStatus = approved ? 'COMPLETED' : 'REJECTED';

    await supabase.from('submissions').update({
      admin_feedback: feedback,
      status: newStatus,
    }).eq('id', submission.id);

    await supabase.from('tasks').update({
      status: approved ? 'COMPLETED' : 'PENDING',
      ...(approved ? { completed_at: new Date().toISOString() } : {}),
    }).eq('id', task.id);

    // Notify assignee
    await notify(
      task.assigned_to,
      approved ? 'TASK_APPROVED' : 'TASK_REJECTED',
      approved ? `Task approved: ${task.title}` : `Revision requested: ${task.title}`,
      feedback || (approved ? 'Your submission has been approved.' : 'Your submission needs revision.'),
      projectLink
    );

    onSuccess();
    onClose();
  };

  return (
    <div className="pd-overlay" onClick={onClose}>
      <div className="pd-modal" onClick={(e) => e.stopPropagation()}>
        <div className="pd-modal-header">
          <h2>Review Submission</h2>
          <button className="pd-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="pd-modal-task-name">{task.title}</div>

        {submission?.description && (
          <div className="pd-review-section">
            <div className="pd-review-label">Staff Notes</div>
            <div className="pd-review-text">{submission.description}</div>
          </div>
        )}

        {submission?.file_urls?.length > 0 && (
          <div className="pd-review-section">
            <div className="pd-review-label">Attachments</div>
            <div className="pd-file-chips">
              {submission.file_urls.map((url: string, i: number) => (
                <a key={i} href={url} target="_blank" rel="noreferrer" className="pd-file-chip">
                  📎 Attachment {i + 1}
                </a>
              ))}
            </div>
          </div>
        )}

        <div className="pd-form-group">
          <label>Feedback (optional)</label>
          <textarea className="pd-input" rows={3} value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
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

// ── EDIT PROJECT MODAL ────────────────────────────────────────
function EditProjectModal({ project, members, currentUser, onClose, onSuccess, onDelete }: any) {
  const [form, setForm] = useState({
    title: project.title || '',
    objectives: project.objectives || '',
    due_date: project.due_date || '',
  });
  const [currentMembers, setCurrentMembers] = useState<any[]>(members);
  const [memberSearch, setMemberSearch] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const search = async () => {
      if (memberSearch.length < 2) { setSearchResults([]); return; }
      const { data } = await supabase
        .from('profiles')
        .select('id, name, designation')
        .ilike('name', `%${memberSearch}%`)
        .limit(8);
      setSearchResults(data || []);
    };
    const t = setTimeout(search, 300);
    return () => clearTimeout(t);
  }, [memberSearch]);

  const addMember = async (staff: any) => {
    if (currentMembers.some((m) => m.profile_id === staff.id)) return;
    await supabase.from('project_members').insert({
      project_id: project.id,
      profile_id: staff.id,
      is_lead: false,
    });
    await notify(
      staff.id,
      'PROJECT_ADDED',
      `Added to project: ${project.title}`,
      `${currentUser.name} added you to a project.`,
      `/staff/projects/${project.id}`
    );
    setCurrentMembers(prev => [...prev, {
      profile_id: staff.id,
      is_lead: false,
      profiles: { id: staff.id, name: staff.name, designation: staff.designation },
    }]);
    setMemberSearch('');
    setSearchResults([]);
  };

  const removeMember = async (profileId: string) => {
    await supabase.from('project_members')
      .delete()
      .eq('project_id', project.id)
      .eq('profile_id', profileId);
    setCurrentMembers(prev => prev.filter((m) => m.profile_id !== profileId));
  };

  const toggleLead = async (profileId: string, current: boolean) => {
    await supabase.from('project_members')
      .update({ is_lead: !current })
      .eq('project_id', project.id)
      .eq('profile_id', profileId);
    setCurrentMembers(prev => prev.map((m) =>
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
      <div className="pd-modal pd-modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="pd-modal-header">
          <h2>Edit Project</h2>
          <button className="pd-modal-close" onClick={onClose}>✕</button>
        </div>

        {error && <div className="pd-error">{error}</div>}

        <div className="pd-form-group">
          <label>Project Title *</label>
          <input className="pd-input" value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </div>

        <div className="pd-form-group">
          <label>Objectives</label>
          <textarea className="pd-input" rows={3} value={form.objectives}
            onChange={(e) => setForm({ ...form, objectives: e.target.value })} />
        </div>

        <div className="pd-form-group">
          <label>Due Date</label>
          <input type="date" className="pd-input" value={form.due_date}
            onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
        </div>

        {/* Members management */}
        <div className="pd-form-group" style={{ position: 'relative' }}>
          <label>Add Team Members</label>
          <input className="pd-input" placeholder="Search by name…"
            value={memberSearch}
            onChange={(e) => setMemberSearch(e.target.value)}
            autoComplete="off" />
          {searchResults.length > 0 && (
            <div className="pd-search-drop">
              {searchResults.map((s) => (
                <div key={s.id} className="pd-search-item" onClick={() => addMember(s)}>
                  <div className="pd-mini-avatar">{initials(s.name)}</div>
                  <div>
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
                <button
                  className={`pd-lead-btn ${m.is_lead ? 'active' : ''}`}
                  onClick={() => toggleLead(m.profile_id, m.is_lead)}
                >
                  {m.is_lead ? '★ Lead' : 'Set Lead'}
                </button>
                {m.profile_id !== project.created_by && (
                  <button className="pd-remove-btn"
                    onClick={() => removeMember(m.profile_id)}>✕</button>
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
                <button className="pd-btn-outline sm" onClick={() => setConfirmDelete(false)}>
                  Cancel
                </button>
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