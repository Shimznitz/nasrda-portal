// src/app/staff/projects/page.tsx
'use client';

import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import "./projects.css";

export default function AllProjects() {
  const router = useRouter();

  const [projects, setProjects] = useState<any[]>([]);
  const [filtered, setFiltered] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [profile, setProfile] = useState<any>(null);
  const [showCreate, setShowCreate] = useState(false);

  function CreateProjectModal({ profile, onClose, onCreated }: any) {
  const [form, setForm] = useState({
    title: '',
    objectives: '',
    budget: '',
    due_date: '',
    centre_id: ''
  });

  const [members, setMembers] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    setSubmitting(true);

    const { data: { user } } = await supabase.auth.getUser();

    const { data: project, error } = await supabase
      .from('projects')
      .insert({
        title: form.title,
        objectives: form.objectives,
        budget: form.budget ? Number(form.budget) : null,
        due_date: form.due_date || null,
        centre_id: profile.centre_id || form.centre_id,
        created_by: user?.id,
        status: 'IN_PROGRESS',
        progress: 0
      })
      .select()
      .single();

    if (error) {
      setSubmitting(false);
      return;
    }

    if (members.length) {
      await supabase.from('project_members').insert(
        members.map(m => ({
          project_id: project.id,
          profile_id: m.id,
          is_lead: m.is_lead
        }))
      );
    }

    if (tasks.length) {
      await supabase.from('tasks').insert(
        tasks.map(t => ({
          project_id: project.id,
          title: t.title,
          due_date: t.due_date,
          assigned_to: t.assigned_to,
          status: 'PENDING'
        }))
      );
    }

    setSubmitting(false);
    onCreated();
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Create Project</h2>

        <form onSubmit={handleSubmit}>
          <input
            className="input-field"
            placeholder="Project title"
            onChange={(e) =>
              setForm({ ...form, title: e.target.value })
            }
          />

          <textarea
            className="input-field"
            placeholder="Objectives"
            onChange={(e) =>
              setForm({ ...form, objectives: e.target.value })
            }
          />

          <button className="btn" disabled={submitting}>
            {submitting ? "Creating..." : "Create"}
          </button>
        </form>
      </div>
    </div>
  );
}

  const loadInitialData = useCallback(async () => {
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    const { data: prof } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    setProfile(prof);

    await fetchProjects(prof, user.id);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  const fetchProjects = async (prof: any, userId: string) => {
    let query = supabase
      .from('projects')
      .select('*, centres(name, location)')
      .order('created_at', { ascending: false });

    if (prof?.role === 'CENTRE_ADMIN' && prof.centre_id) {
      query = query.eq('centre_id', prof.centre_id);
    }

    if (prof?.role === 'STAFF') {
      const { data: memberships } = await supabase
        .from('project_members')
        .select('project_id')
        .eq('profile_id', userId);

      const ids = memberships?.map((m: any) => m.project_id) || [];

      if (!ids.length) {
        setProjects([]);
        setFiltered([]);
        return;
      }

      query = query.in('id', ids);
    }

    const { data } = await query;

    setProjects(data || []);
    setFiltered(data || []);
  };

  useEffect(() => {
    if (!search.trim()) {
      setFiltered(projects);
      return;
    }

    const q = search.toLowerCase();

    setFiltered(
      projects.filter((p: any) =>
        p.title?.toLowerCase().includes(q) ||
        p.centres?.name?.toLowerCase().includes(q)
      )
    );
  }, [search, projects]);



  const canCreateProject =
    ['SUPER_ADMIN', 'CENTRE_ADMIN', 'DIVISION_HEAD', 'DEPT_HEAD']
      .includes(profile?.role);



  return (
    <div className="projects-page">

      {showCreate && (
        <CreateProjectModal
          profile={profile}
          onClose={() => setShowCreate(false)}
          onCreated={() => loadInitialData()}
        />
      )}

      <div className="page-header">
        <div>
          <h1>
            {profile?.role === 'SUPER_ADMIN'
              ? 'All Projects'
              : profile?.role === 'CENTRE_ADMIN'
                ? 'Centre Projects'
                : 'My Projects'}
          </h1>
          <p className="subtitle">Projects across the agency</p>
        </div>

        {canCreateProject && (
          <button className="btn" onClick={() => setShowCreate(true)}>
            + Create Project
          </button>
        )}
      </div>

      <div className="search-bar">
        <input
          className="input-field"
          placeholder="Search projects..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <p className="loading">Loading projects...</p>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <p>No projects found.</p>
        </div>
      ) : (
        <div className="projects-list">
          {filtered.map((project: any) => (
            <div
              key={project.id}
              className="project-card"
              onClick={() => router.push(`/staff/projects/${project.id}`)}
            >
              <div className="project-header">
                <div className="project-title">{project.title}</div>
                <div className={`status-badge ${
                  project.status === 'COMPLETED'
                    ? 'status-done'
                    : project.status === 'UNDER_REVIEW'
                      ? 'status-review'
                      : 'status-progress'
                }`}>
                  {project.status}
                </div>
              </div>

              <div className="project-meta">
                {project.centres?.name && <span>🏛 {project.centres.name}</span>}
                {project.due_date && <span>📅 {project.due_date}</span>}
                {project.budget && <span>💰 ₦{project.budget}</span>}
              </div>

              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{ width: `${project.progress || 0}%` }}
                />
              </div>

              <div className="progress-text">
                {project.progress || 0}% Complete
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}