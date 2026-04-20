// src/app/staff/projects/page.tsx
'use client';

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import "./projects.css";

export default function AllProjects() {
  const [projects, setProjects] = useState<any[]>([]);
  const [filtered, setFiltered] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: prof } = await supabase
        .from('profiles').select('*').eq('id', user.id).single();
      setProfile(prof);
      await fetchProjects(prof, user.id);
    };
    load();
  }, []);

  const fetchProjects = async (prof: any, userId: string) => {
    let query = supabase
      .from('projects')
      .select('*, centres(name, location), profiles(name)')
      .order('created_at', { ascending: false });

    if (prof?.role === 'CENTRE_ADMIN') {
      query = query.eq('centre_id', prof.centre_id);
    } else if (prof?.role === 'STAFF') {
      const { data: memberships } = await supabase
        .from('project_members').select('project_id').eq('profile_id', userId);
      const ids = memberships?.map((m: any) => m.project_id) || [];
      query = query.in('id', ids.length ? ids : ['none']);
    }

    const { data } = await query;
    setProjects(data || []);
    setFiltered(data || []);
    setLoading(false);
  };

  useEffect(() => {
    if (!search) { setFiltered(projects); return; }
    const q = search.toLowerCase();
    setFiltered(projects.filter((p: any) => p.title?.toLowerCase().includes(q)));
  }, [search, projects]);

  const getStatusClass = (status: string) => {
    if (status === 'COMPLETED') return 'status-done';
    if (status === 'UNDER_REVIEW') return 'status-review';
    return 'status-progress';
  };

  const getStatusLabel = (status: string) => {
    if (status === 'COMPLETED') return 'Completed';
    if (status === 'UNDER_REVIEW') return 'Under Review';
    return 'In Progress';
  };

  const canCreateProject = ['SUPER_ADMIN', 'CENTRE_ADMIN', 'DIVISION_HEAD', 'DEPT_HEAD'].includes(profile?.role);

  return (
    <div className="projects-page">
      {showCreate && (
        <CreateProjectModal
          profile={profile}
          onClose={() => setShowCreate(false)}
          onCreated={async () => {
            setShowCreate(false);
            const { data: { user } } = await supabase.auth.getUser();
            if (user) await fetchProjects(profile, user.id);
          }}
        />
      )}

      <div className="page-header">
        <div>
          <h1>{profile?.role === 'SUPER_ADMIN' ? 'All Projects' : profile?.role === 'CENTRE_ADMIN' ? 'Centre Projects' : 'My Projects'}</h1>
          <p className="subtitle">Projects across the agency</p>
        </div>
        {canCreateProject && (
          <button className="btn" onClick={() => setShowCreate(true)}>+ Create Project</button>
        )}
      </div>

      <div className="search-bar">
        <input type="text" className="input-field" placeholder="Search projects by name..."
          value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {loading ? <p className="loading">Loading projects...</p> :
        filtered.length === 0 ? (
          <div className="empty-state"><p>No projects found.</p></div>
        ) : (
          <div className="projects-list">
            {filtered.map((project: any) => (
              <div key={project.id} className="project-card" onClick={() => setSelected(project)}>
                <div className="project-header">
                  <div className="project-title">{project.title}</div>
                  <div className={`status-badge ${getStatusClass(project.status)}`}>
                    {getStatusLabel(project.status)}
                  </div>
                </div>
                <div className="project-meta">
                  {project.centres?.name && <span>🏛 {project.centres.name}</span>}
                  {project.centres?.location && <span>📍 {project.centres.location}</span>}
                  {project.due_date && <span>📅 Due {new Date(project.due_date).toLocaleDateString()}</span>}
                  {project.budget && <span>💰 ₦{Number(project.budget).toLocaleString()}</span>}
                </div>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${project.progress}%` }}></div>
                </div>
                <div className="progress-text">{project.progress}% Complete</div>
              </div>
            ))}
          </div>
        )}

      {selected && (
        <ProjectDetailModal
          project={selected}
          onClose={() => setSelected(null)}
          getStatusClass={getStatusClass}
          getStatusLabel={getStatusLabel}
        />
      )}
    </div>
  );
}

// ─── Create Project Modal ─────────────────────────────────────────────────────
function CreateProjectModal({ profile, onClose, onCreated }: any) {
  const [form, setForm] = useState({
    title: '', objectives: '', budget: '', due_date: '', centre_id: ''
  });
  const [memberSearch, setMemberSearch] = useState('');
  const [memberResults, setMemberResults] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [newTask, setNewTask] = useState({ title: '', due_date: '', assigned_to: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [centres, setCentres] = useState<any[]>([]);

  useEffect(() => {
    if (profile?.role === 'SUPER_ADMIN') {
      supabase.from('centres').select('id, name').then(({ data }) => setCentres(data || []));
    }
  }, [profile]);

  useEffect(() => {
    const search = async () => {
      if (memberSearch.length < 2) { setMemberResults([]); return; }
      const { data } = await supabase
        .from('profiles')
        .select('id, name, designation, role')
        .ilike('name', `%${memberSearch}%`)
        .limit(8);
      setMemberResults((data || []).filter((d: any) => !members.find((m: any) => m.id === d.id)));
    };
    const t = setTimeout(search, 300);
    return () => clearTimeout(t);
  }, [memberSearch, members]);

  const addMember = (staff: any) => {
    setMembers([...members, { ...staff, is_lead: false }]);
    setMemberSearch('');
    setMemberResults([]);
  };

  const removeMember = (id: string) => {
    setMembers(members.filter((m: any) => m.id !== id));
    setTasks(tasks.filter((t: any) => t.assigned_to !== id));
  };

  const toggleLead = (id: string) => {
    setMembers(members.map((m: any) => ({ ...m, is_lead: m.id === id })));
  };

  const addTask = () => {
    if (!newTask.title) return;
    setTasks([...tasks, { ...newTask, id: crypto.randomUUID() }]);
    setNewTask({ title: '', due_date: '', assigned_to: '' });
  };

  const removeTask = (id: string) => setTasks(tasks.filter((t: any) => t.id !== id));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    const centreId = profile?.role === 'SUPER_ADMIN' ? form.centre_id : profile?.centre_id;

    const { data: project, error: projError } = await supabase
      .from('projects')
      .insert({
        title: form.title,
        objectives: form.objectives,
        budget: form.budget ? Number(form.budget) : null,
        due_date: form.due_date || null,
        centre_id: centreId || null,
        created_by: (await supabase.auth.getUser()).data.user?.id,
        status: 'IN_PROGRESS',
        progress: 0,
      })
      .select().single();

    if (projError) { setError(projError.message); setSubmitting(false); return; }

    // Add members
    if (members.length > 0) {
      await supabase.from('project_members').insert(
        members.map((m: any) => ({ project_id: project.id, profile_id: m.id, is_lead: m.is_lead }))
      );
    }

    // Add tasks
    const userId = (await supabase.auth.getUser()).data.user?.id;
    if (tasks.length > 0) {
      const taskRows = tasks.map((t: any) => ({
        project_id: project.id,
        title: t.title,
        due_date: t.due_date || null,
        assigned_to: t.assigned_to || null,
        assigned_by: userId,
        status: 'PENDING',
      }));
      await supabase.from('tasks').insert(taskRows);

      // Notify assigned members
      for (const t of taskRows) {
        if (t.assigned_to) {
          await supabase.from('notifications').insert({
            user_id: t.assigned_to,
            title: 'New Task Assigned',
            body: `You have been assigned a task: "${t.title}" in project "${form.title}"`,
            type: 'TASK',
          });
        }
      }
    }

    // Notify all members about project
    for (const m of members) {
      await supabase.from('notifications').insert({
        user_id: m.id,
        title: 'Added to Project',
        body: `You have been added to the project "${form.title}"`,
        type: 'PROJECT',
      });
    }

    onCreated();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-large" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Create New Project</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-section">
            <h3 className="section-title">Project Details</h3>
            <div className="form-group">
              <label>Project Name *</label>
              <input type="text" className="input-field" placeholder="Enter project name"
                value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
            </div>
            <div className="form-group">
              <label>Objectives</label>
              <textarea className="input-field" rows={3} placeholder="Project objectives and goals..."
                value={form.objectives} onChange={(e) => setForm({ ...form, objectives: e.target.value })} />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Budget (₦)</label>
                <input type="number" className="input-field" placeholder="e.g. 5000000"
                  value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Overall Deadline</label>
                <input type="date" className="input-field"
                  value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
              </div>
            </div>
            {profile?.role === 'SUPER_ADMIN' && (
              <div className="form-group">
                <label>Assign to Centre</label>
                <select className="input-field" value={form.centre_id}
                  onChange={(e) => setForm({ ...form, centre_id: e.target.value })}>
                  <option value="">— Select Centre —</option>
                  {centres.map((c: any) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="form-section">
            <h3 className="section-title">Team Members</h3>
            <div className="search-wrapper">
              <input type="text" className="input-field" placeholder="Search staff by name..."
                value={memberSearch} onChange={(e) => setMemberSearch(e.target.value)} />
              {memberResults.length > 0 && (
                <div className="search-results">
                  {memberResults.map((s: any) => (
                    <div key={s.id} className="search-item" onClick={() => addMember(s)}>
                      <div className="search-avatar">{s.name.slice(0, 2).toUpperCase()}</div>
                      <div>
                        <div className="search-name">{s.name}</div>
                        <div className="search-designation">{s.designation || s.role}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {members.length > 0 && (
              <div className="members-list">
                {members.map((m: any) => (
                  <div key={m.id} className="member-row">
                    <div className="search-avatar">{m.name.slice(0, 2).toUpperCase()}</div>
                    <div className="member-info">
                      <div className="search-name">{m.name}</div>
                      <div className="search-designation">{m.designation}</div>
                    </div>
                    <button type="button"
                      className={`lead-btn ${m.is_lead ? 'active' : ''}`}
                      onClick={() => toggleLead(m.id)}>
                      {m.is_lead ? '★ Lead' : '☆ Set Lead'}
                    </button>
                    <button type="button" className="remove-btn" onClick={() => removeMember(m.id)}>✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="form-section">
            <h3 className="section-title">Tasks</h3>
            <div className="task-form-row">
              <input type="text" className="input-field" placeholder="Task title"
                value={newTask.title} onChange={(e) => setNewTask({ ...newTask, title: e.target.value })} />
              <input type="date" className="input-field"
                value={newTask.due_date} onChange={(e) => setNewTask({ ...newTask, due_date: e.target.value })} />
              <select className="input-field" value={newTask.assigned_to}
                onChange={(e) => setNewTask({ ...newTask, assigned_to: e.target.value })}>
                <option value="">Assign to...</option>
                {members.map((m: any) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
              <button type="button" className="add-task-btn" onClick={addTask}>+ Add</button>
            </div>

            {tasks.length > 0 && (
              <div className="tasks-list">
                {tasks.map((t: any) => (
                  <div key={t.id} className="task-row">
                    <div className="task-dot"></div>
                    <div className="task-info">
                      <div className="task-title">{t.title}</div>
                      <div className="task-meta">
                        {t.assigned_to && members.find((m: any) => m.id === t.assigned_to)?.name}
                        {t.due_date && ` · Due ${new Date(t.due_date).toLocaleDateString()}`}
                      </div>
                    </div>
                    <button type="button" className="remove-btn" onClick={() => removeTask(t.id)}>✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {error && <p className="error">{error}</p>}
          <button type="submit" className="btn" disabled={submitting} style={{ width: '100%' }}>
            {submitting ? 'Creating...' : 'Create Project'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Project Detail Modal ─────────────────────────────────────────────────────
function ProjectDetailModal({ project, onClose, getStatusClass, getStatusLabel }: any) {
  const [tasks, setTasks] = useState<any[]>([]);

  useEffect(() => {
    supabase.from('tasks')
      .select('*, profiles(name)')
      .eq('project_id', project.id)
      .then(({ data }) => setTasks(data || []));
  }, [project.id]);

  const toggleTask = async (task: any) => {
    const newStatus = task.status === 'COMPLETED' ? 'PENDING' : 'COMPLETED';
    await supabase.from('tasks').update({
      status: newStatus,
      completed_at: newStatus === 'COMPLETED' ? new Date().toISOString() : null,
    }).eq('id', task.id);
    setTasks(tasks.map((t: any) => t.id === task.id ? { ...t, status: newStatus } : t));

    // Update project progress
    const total = tasks.length;
    const completed = tasks.filter((t: any) =>
      t.id === task.id ? newStatus === 'COMPLETED' : t.status === 'COMPLETED'
    ).length;
    const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
    await supabase.from('projects').update({ progress }).eq('id', project.id);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-large" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{project.title}</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className={`status-badge ${getStatusClass(project.status)}`} style={{ display: 'inline-block', marginBottom: 16 }}>
          {getStatusLabel(project.status)}
        </div>

        {project.objectives && (
          <div className="form-group">
            <div className="modal-label">Objectives</div>
            <p className="modal-description">{project.objectives}</p>
          </div>
        )}

        <div className="modal-fields">
          {project.centres?.name && (
            <div className="modal-field">
              <span className="modal-label">Centre</span>
              <span className="modal-value">{project.centres.name}</span>
            </div>
          )}
          {project.due_date && (
            <div className="modal-field">
              <span className="modal-label">Deadline</span>
              <span className="modal-value">{new Date(project.due_date).toLocaleDateString()}</span>
            </div>
          )}
          {project.budget && (
            <div className="modal-field">
              <span className="modal-label">Budget</span>
              <span className="modal-value">₦{Number(project.budget).toLocaleString()}</span>
            </div>
          )}
          <div className="modal-field">
            <span className="modal-label">Progress</span>
            <span className="modal-value">{project.progress}%</span>
          </div>
        </div>

        {tasks.length > 0 && (
          <div style={{ marginTop: 24 }}>
            <div className="modal-label" style={{ marginBottom: 12 }}>Tasks</div>
            <div className="tasks-list">
              {tasks.map((t: any) => (
                <div key={t.id} className="task-row clickable" onClick={() => toggleTask(t)}>
                  <div className={`task-check ${t.status === 'COMPLETED' ? 'checked' : ''}`}>
                    {t.status === 'COMPLETED' ? '✓' : ''}
                  </div>
                  <div className="task-info">
                    <div className={`task-title ${t.status === 'COMPLETED' ? 'done' : ''}`}>{t.title}</div>
                    <div className="task-meta">
                      {t.profiles?.name && `Assigned to ${t.profiles.name}`}
                      {t.due_date && ` · Due ${new Date(t.due_date).toLocaleDateString()}`}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}