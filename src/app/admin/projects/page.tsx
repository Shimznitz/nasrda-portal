// src/app/admin/projects/page.tsx
'use client';

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import "./admin.css";

export default function AdminProjects() {
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingProject, setEditingProject] = useState<any>(null);
  
  // Form State
  const [title, setTitle] = useState("");
  const [objectives, setObjectives] = useState("");
  const [budget, setBudget] = useState("");
  const [dueDate, setDueDate] = useState("");

  const router = useRouter();

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) setProjects(data);
    setLoading(false);
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    const { data: { user } } = await supabase.auth.getUser();

    const { error } = await supabase
      .from('projects')
      .insert({
        title,
        objectives,
        budget: budget ? Number(budget) : null,
        due_date: dueDate || null,
        created_by: user?.id,
        status: 'IN_PROGRESS',
        progress: 0
      });

    if (!error) {
      resetForm();
      loadProjects();
    }
  };

  const handleUpdateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProject) return;

    const { error } = await supabase
      .from('projects')
      .update({
        title,
        objectives,
        budget: budget ? Number(budget) : null,
        due_date: dueDate || null
      })
      .eq('id', editingProject.id);

    if (!error) {
      resetForm();
      loadProjects();
    }
  };

  const handleDeleteProject = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("Are you sure you want to delete this project and all related data?")) return;

    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', id);

    if (!error) loadProjects();
  };

  const resetForm = () => {
    setTitle("");
    setObjectives("");
    setBudget("");
    setDueDate("");
    setShowCreateModal(false);
    setEditingProject(null);
  };

  const openEditModal = (project: any, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingProject(project);
    setTitle(project.title);
    setObjectives(project.objectives || "");
    setBudget(project.budget || "");
    setDueDate(project.due_date || "");
  };

  if (loading) return <div className="loading">Loading projects dashboard...</div>;

  return (
    <div className="admin-review">
      <div className="page-header">
        <div>
          <h1>Project Administration Portal</h1>
          <p className="subtitle">Create, monitor, modify, and delete workspace modules</p>
        </div>
        <button className="btn primary-btn" onClick={() => setShowCreateModal(true)}>
          + Create New Project
        </button>
      </div>

      <div className="project-grid">
        {projects.map(p => (
          <div
            key={p.id}
            className="project-card clickable"
            onClick={() => router.push(`/admin/projects/${p.id}`)}
          >
            <div className="project-card-header">
              <h3>{p.title}</h3>
              <div className="management-actions">
                <button className="edit-btn" onClick={(e) => openEditModal(p, e)}>Modify</button>
                <button className="delete-btn" onClick={(e) => handleDeleteProject(p.id, e)}>Delete</button>
              </div>
            </div>
            <p className="project-objectives">{p.objectives || "No objectives declared."}</p>
            <div className="project-footer">
              <span>Status: <strong>{p.status}</strong></span>
              <span>Progress: <strong>{p.progress || 0}%</strong></span>
            </div>
          </div>
        ))}
      </div>

      {/* CREATE / EDIT MODAL */}
      {(showCreateModal || editingProject) && (
        <div className="modal-overlay" onClick={resetForm}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>{editingProject ? "Modify Project Parameters" : "Initiate Corporate Project"}</h2>
            <form onSubmit={editingProject ? handleUpdateProject : handleCreateProject} className="admin-form">
              <label>Project Title</label>
              <input 
                type="text" 
                className="input-field" 
                value={title} 
                onChange={e => setTitle(e.target.value)} 
                required 
              />

              <label>Core Objectives</label>
              <textarea 
                className="input-field" 
                value={objectives} 
                onChange={e => setObjectives(e.target.value)} 
                required
              />

              <label>Allocated Budget (₦)</label>
              <input 
                type="number" 
                className="input-field" 
                value={budget} 
                onChange={e => setBudget(e.target.value)} 
              />

              <label>Target Execution Deadline</label>
              <input 
                type="date" 
                className="input-field" 
                value={dueDate} 
                onChange={e => setDueDate(e.target.value)} 
              />

              <div className="form-actions">
                <button type="button" className="btn secondary-btn" onClick={resetForm}>Cancel</button>
                <button type="submit" className="btn primary-btn">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}