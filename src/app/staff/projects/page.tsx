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
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    const { data: prof } = await supabase
      .from('profiles')
      .select('id, role, division_id, department_id, unit_id, name')
      .eq('id', user.id)
      .single();

     if (!prof) {
      setLoading(false);
      return;
    }  

    setProfile(prof);

    let query = supabase
      .from('projects')
      .select('*, creator:profiles!created_by(name)')
      .order('created_at', { ascending: false });

    if (prof.role === 'DEPT_ADMIN' || 
        prof.role?.includes('ADMIN') || 
        prof.role === 'DIVISION_HEAD' || 
        prof.role === 'UNIT_HEAD' || 
        prof.role === 'CENTRE_HEAD') {

      // Build OR condition safely (skip null values)
    const conditions: string[] = [`created_by.eq.${prof.id}`];

    if (prof.division_id) conditions.push(`div_scope_id.eq.${prof.division_id}`);
    if (prof.department_id) conditions.push(`dept_scope_id.eq.${prof.department_id}`);
    if (prof.unit_id) conditions.push(`unit_scope_id.${prof.unit_id}`);
    if (prof.division_id) conditions.push(`division_id.eq.${prof.division_id}`);
      
      query = query.or(conditions.join(','));
    } else {
      // Regular staff - only see projects they are members of
      const { data: memberships } = await supabase
        .from('project_members')
        .select('project_id')
        .eq('profile_id', prof.id);   // ← Correct column

      const projectIds = memberships?.map(m => m.project_id) || [];
      console.log("User's Project IDs:", projectIds); // ← Helpful for debugging
      
      if (projectIds.length > 0) {
        query = query.in('id', projectIds);
      } else {
        setProjects([]);
        setLoading(false);
        return;
      }
    }

    const { data } = await query;
    setProjects(data || []);
    setLoading(false);
  };

  // Better role check for "Can Create Project"
  const canCreateProject = 
    profile?.role === 'SUPER_ADMIN' ||
    profile?.role?.includes('ADMIN') ||
    profile?.role === 'DIVISION_HEAD' ||
    profile?.role === 'UNIT_HEAD' ||
    profile?.role === 'CENTRE_HEAD';

  return (
    <div className="projects-page">
      <div className="page-header">
        <div>
          <h1>Projects & Activities</h1>
          <p className="subtitle">Operational workspaces in your scope</p>
        </div>
        {canCreateProject && (
          <button className="btn" onClick={() => setShowCreateModal(true)}>
            + Create New Project
          </button>
        )}
      </div>

      {loading ? (
        <div className="loading">Loading projects...</div>
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
                <div className="status-badge">{project.status || 'ACTIVE'}</div>
              </div>
              <p className="project-brief-desc">{project.objectives}</p>

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
          onSuccess={() => {
            setShowCreateModal(false);
            loadData();
          }}
          profile={profile}
        />
      )}
    </div>
  );
}

/* ===================== CREATE PROJECT MODAL ===================== */
function CreateProjectModal({ onClose, onSuccess, profile }: any) {
  const [form, setForm] = useState({
    title: '',
    objectives: '',
    start_date: '',
    end_date: '',
  });

  const [headSearch, setHeadSearch] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedHead, setSelectedHead] = useState<any>(null);
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Search logic (same as your working divisions page)
  useEffect(() => {
    const search = async () => {
      if (headSearch.length < 2) {
        setSearchResults([]);
        return;
      }

      setSearching(true);

      let query = supabase
        .from('profiles')
        .select('id, name, designation')
        .ilike('name', `%${headSearch}%`)
        .limit(10);

      // Scope search based on creator's role
      if (profile.division_id) {
        query = query.eq('division_id', profile.division_id);
      } else if (profile.department_id) {
        query = query.eq('department_id', profile.department_id);
      } else if (profile.unit_id) {
        query = query.eq('unit_id', profile.unit_id);
      }

      const { data, error } = await query;
      if (error) console.error("Search error:", error);
      else setSearchResults(data || []);

      setSearching(false);
    };

    const timeout = setTimeout(search, 300);
    return () => clearTimeout(timeout);
  }, [headSearch, profile]);

  const handleSelectHead = (staff: any) => {
    setSelectedHead(staff);
    setHeadSearch('');
    setSearchResults([]);
  };

  const createProject = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    setError('');

    const { data: newProject, error: projError } = await supabase
      .from('projects')
      .insert({
        title: form.title,
        objectives: form.objectives,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        created_by: profile.id,
        division_id: profile.division_id,
        department_id: profile.department_id,
        unit_id: profile.unit_id,
        status: 'ACTIVE',
      })
      .select()
      .single();

    if (projError || !newProject) {
      setError(projError?.message || 'Failed to create project');
      setSaving(false);
      return;
    }

    // Add team members
    if (teamMembers.length > 0) {
      const payload = teamMembers.map(m => ({
        project_id: newProject.id,
        profile_id: m.id,
      }));
      await supabase.from('project_members').insert(payload);
    }

    onSuccess();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-large modal" onClick={e => e.stopPropagation()}>
        <h2>Create New Project</h2>

        {error && <p className="error">{error}</p>}

        <div className="form-group">
  <label>Project Title</label>
  <input 
    className="input-field" 
    value={form.title} 
    onChange={e => setForm({...form, title: e.target.value})} 
    required 
  />
</div>

        <div className="form-group">
  <label>Objectives</label>
  <textarea 
    className="input-field" 
    rows={4} 
    value={form.objectives} 
    onChange={e => setForm({...form, objectives: e.target.value})} 
  />
</div>

<div className="form-row">
  <div className="form-group">
    <label>Start Date</label>
    <input 
      type="date" 
      className="input-field" 
      value={form.start_date} 
      onChange={e => setForm({...form, start_date: e.target.value})} 
    />
  </div>
  <div className="form-group">
    <label>End Date</label>
    <input 
      type="date" 
      className="input-field" 
      value={form.end_date} 
      onChange={e => setForm({...form, end_date: e.target.value})} 
    />
  </div>
</div>

        <div className="form-group">
          <label>Search & Add Team Members</label>
          <input
            type="text"
            className="input-field"
            placeholder="Search by name..."
            value={headSearch}
            onChange={(e) => setHeadSearch(e.target.value)}
          />

          {headSearch.length >= 2 && (
            <div className="search-results">
              {searching && <div className="search-item muted">Searching...</div>}
              {searchResults.map((staff) => (
                <div
                  key={staff.id}
                  className="search-item"
                  onClick={() => {
                    if (!teamMembers.some(m => m.id === staff.id)) {
                      setTeamMembers([...teamMembers, staff]);
                    }
                  }}
                >
                  <div className="search-item-info">
                    <div className="search-name">{staff.name}</div>
                    <div className="search-designation">{staff.designation}</div>
                  </div>
                  <button type="button">Add</button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="selected-members">
          <strong>Team Members ({teamMembers.length})</strong>
          <div className="pill-list">
            {teamMembers.map((m) => (
              <div key={m.id} className="pill">
                {m.name}
                <button onClick={() => setTeamMembers(teamMembers.filter(tm => tm.id !== m.id))}>×</button>
              </div>
            ))}
          </div>
        </div>

        <div className="modal-actions">
          <button onClick={onClose}>Cancel</button>
          <button onClick={createProject} disabled={saving || !form.title}>
            {saving ? 'Creating...' : 'Create Project'}
          </button>
        </div>
      </div>
    </div>
  );
}