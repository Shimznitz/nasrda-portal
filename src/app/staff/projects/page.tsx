// src/app/staff/projects/page.tsx

'use client';

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import "./projects.css";

export default function StaffProjectsDashboard() {
  const router = useRouter();
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: prof } = await supabase
        .from('profiles')
        .select('id, role, centre_id, division_id, department_id, unit_id, name')
        .eq('id', user.id)
        .single();

      if (!prof) return;
      setProfile(prof);

      const isPrivileged =
        prof.role === 'SUPER_ADMIN' ||
        prof.role?.includes('ADMIN') ||
        prof.role === 'DIVISION_HEAD' ||
        prof.role === 'UNIT_HEAD' ||
        prof.role === 'CENTRE_HEAD';

      let query = supabase
        .from('projects')
        .select('*, creator:profiles!created_by(name)')
        .order('created_at', { ascending: false });

      if (isPrivileged) {
        const conditions: string[] = [`created_by.eq.${prof.id}`];
        if (prof.centre_id)     conditions.push(`centre_id.eq.${prof.centre_id}`);
        if (prof.division_id)   conditions.push(`div_scope_id.eq.${prof.division_id}`, `division_id.eq.${prof.division_id}`);
        if (prof.department_id) conditions.push(`dept_scope_id.eq.${prof.department_id}`);
        if (prof.unit_id)       conditions.push(`unit_scope_id.eq.${prof.unit_id}`);
        query = query.or(conditions.join(','));
      } else {
        const { data: memberships } = await supabase
          .from('project_members')
          .select('project_id')
          .eq('profile_id', prof.id);

        const projectIds = memberships?.map((m: any) => m.project_id) || [];
        if (projectIds.length === 0) {
          setProjects([]);
          return;
        }
        query = query.in('id', projectIds);
      }

      const { data } = await query;
      setProjects(data || []);
    } finally {
      setLoading(false);
    }
  };

  const canCreateProject =
    profile?.role === 'SUPER_ADMIN' ||
    profile?.role?.includes('ADMIN') ||
    profile?.role === 'DIVISION_HEAD' ||
    profile?.role === 'UNIT_HEAD' ||
    profile?.role === 'CENTRE_HEAD';

  const getStatusClass = (status: string) => {
    switch (status?.toUpperCase()) {
      case 'COMPLETED': return 'status-done';
      case 'UNDER_REVIEW':
      case 'REVIEW': return 'status-review';
      default: return 'status-progress';
    }
  };

  return (
    <div className="projects-page">
      <div className="page-header">
        <div>
          <h1>Projects & Activities</h1>
          <p className="subtitle">Operational workspaces in your scope</p>
        </div>
        {canCreateProject && (
          <button className="btn" onClick={() => setShowCreateModal(true)}>
            + New Project
          </button>
        )}
      </div>

      {loading ? (
        <div className="loading">Loading projects…</div>
      ) : projects.length === 0 ? (
        <div className="empty-state">
          <p>No projects found in your scope.</p>
        </div>
      ) : (
        <div className="projects-list">
          {projects.map((project) => (
            <div
              key={project.id}
              className="project-card"
              onClick={() => router.push(`/staff/projects/${project.id}`)}
            >
              <div className="project-header">
                <div className="project-title">{project.title}</div>
                <div className={`status-badge ${getStatusClass(project.status)}`}>
                  {project.status || 'ACTIVE'}
                </div>
              </div>

              {project.objectives && (
                <p className="project-brief-desc">{project.objectives}</p>
              )}

              <div className="project-meta">
                {project.due_date && (
                  <span>Due {new Date(project.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                )}
                {project.creator?.name && (
                  <span>By {project.creator.name}</span>
                )}
              </div>

              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${project.progress || 0}%` }} />
              </div>
              <div className="progress-text">{project.progress || 0}% Complete</div>
            </div>
          ))}
        </div>
      )}

      {showCreateModal && (
        <CreateProjectModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => { setShowCreateModal(false); loadData(); }}
          profile={profile}
        />
      )}
    </div>
  );
}

/* ── CREATE PROJECT MODAL ─────────────────────────────────── */
function CreateProjectModal({ onClose, onSuccess, profile }: any) {
  const [form, setForm] = useState({
    title: '',
    objectives: '',
    due_date: '',
  });

  const [memberSearch, setMemberSearch] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [leadId, setLeadId] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const search = async () => {
      if (memberSearch.length < 2) { setSearchResults([]); return; }
      setSearching(true);

      let query = supabase
        .from('profiles')
        .select('id, name, designation')
        .ilike('name', `%${memberSearch}%`)
        .neq('id', profile.id)
        .limit(10);

      if (profile.centre_id)     query = query.eq('centre_id', profile.centre_id);
      else if (profile.division_id)   query = query.eq('division_id', profile.division_id);
      else if (profile.department_id) query = query.eq('department_id', profile.department_id);
      else if (profile.unit_id)       query = query.eq('unit_id', profile.unit_id);

      const { data } = await query;
      setSearchResults(data || []);
      setSearching(false);
    };

    const timeout = setTimeout(search, 300);
    return () => clearTimeout(timeout);
  }, [memberSearch, profile]);

  const addMember = (staff: any) => {
    if (!teamMembers.some((m) => m.id === staff.id)) {
      setTeamMembers((prev) => [...prev, staff]);
    }
    setMemberSearch('');
    setSearchResults([]);
  };

  const removeMember = (id: string) => {
    setTeamMembers((prev) => prev.filter((m) => m.id !== id));
    if (leadId === id) setLeadId(null);
  };

  const createProject = async () => {
    if (!form.title.trim()) { setError('Project title is required.'); return; }
    setSaving(true);
    setError('');

    const { data: newProject, error: projError } = await supabase
      .from('projects')
      .insert({
        title: form.title.trim(),
        objectives: form.objectives.trim() || null,
        due_date: form.due_date || null,
        created_by: profile.id,
        lead_id: leadId || profile.id,
        centre_id: profile.centre_id || null,
        division_id: profile.division_id || null,
        dept_scope_id: profile.department_id || null,
        div_scope_id: profile.division_id || null,
        unit_scope_id: profile.unit_id || null,
        status: 'ACTIVE',
        progress: 0,
      })
      .select()
      .single();

    if (projError || !newProject) {
      setError(projError?.message || 'Failed to create project.');
      setSaving(false);
      return;
    }

    // Insert members (creator is always added)
    const memberRows = [
      { project_id: newProject.id, profile_id: profile.id, is_lead: !leadId || leadId === profile.id },
      ...teamMembers.map((m) => ({
        project_id: newProject.id,
        profile_id: m.id,
        is_lead: m.id === leadId,
      })),
    ];

    await supabase.from('project_members').insert(memberRows);
    onSuccess();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-large" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Create New Project</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {error && <p className="error">{error}</p>}

        <div className="form-group">
          <label>Project Title *</label>
          <input
            className="input-field"
            placeholder="e.g. Q3 Research Initiative"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
        </div>

        <div className="form-group">
          <label>Objectives</label>
          <textarea
            className="input-field"
            rows={4}
            placeholder="Describe the goals and deliverables of this project…"
            value={form.objectives}
            onChange={(e) => setForm({ ...form, objectives: e.target.value })}
          />
        </div>

        <div className="form-group">
          <label>Due Date</label>
          <input
            type="date"
            className="input-field"
            value={form.due_date}
            onChange={(e) => setForm({ ...form, due_date: e.target.value })}
          />
        </div>

        <div className="form-group" style={{ position: 'relative' }}>
          <label>Add Team Members</label>
          <input
            type="text"
            className="input-field"
            placeholder="Search by name…"
            value={memberSearch}
            onChange={(e) => setMemberSearch(e.target.value)}
            autoComplete="off"
          />
          {memberSearch.length >= 2 && (
            <div className="search-results">
              {searching && <div className="search-item muted">Searching…</div>}
              {!searching && searchResults.length === 0 && (
                <div className="search-item muted">No results found.</div>
              )}
              {searchResults.map((staff) => (
                <div key={staff.id} className="search-item" onClick={() => addMember(staff)}>
                  <div className="search-avatar">
                    {staff.name?.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()}
                  </div>
                  <div className="search-item-info">
                    <div className="search-name">{staff.name}</div>
                    <div className="search-designation">{staff.designation}</div>
                  </div>
                  <span className="add-label">+ Add</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {teamMembers.length > 0 && (
          <div className="form-group">
            <label>Team Members — click a name to set as lead</label>
            <div className="members-list">
              {teamMembers.map((m) => (
                <div key={m.id} className="member-row">
                  <div className="search-avatar">
                    {m.name?.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()}
                  </div>
                  <div className="member-info">
                    <div className="search-name">{m.name}</div>
                    <div className="search-designation">{m.designation}</div>
                  </div>
                  <button
                    type="button"
                    className={`lead-btn ${leadId === m.id ? 'active' : ''}`}
                    onClick={() => setLeadId(leadId === m.id ? null : m.id)}
                  >
                    {leadId === m.id ? '★ Lead' : 'Set Lead'}
                  </button>
                  <button type="button" className="remove-btn" onClick={() => removeMember(m.id)}>✕</button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="modal-actions">
          <button onClick={onClose}>Cancel</button>
          <button className="btn" onClick={createProject} disabled={saving || !form.title.trim()}>
            {saving ? 'Creating…' : 'Create Project'}
          </button>
        </div>
      </div>
    </div>
  );
}