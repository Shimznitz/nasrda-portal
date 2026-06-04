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

  useEffect(() => {
    loadStaffAssignedWorkspace();
  }, []);

  const loadStaffAssignedWorkspace = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Discover project environments where the logged-in staff member has active tasks
    const { data: linkedTasks } = await supabase
      .from('tasks')
      .select('project_id')
      .eq('assigned_to', user.id);

    const projectIds = Array.from(new Set(linkedTasks?.map(t => t.project_id) || []));

    if (projectIds.length === 0) {
      setProjects([]);
      setLoading(false);
      return;
    }

    const { data: workspaceProjects } = await supabase
      .from('projects')
      .select('*')
      .in('id', projectIds)
      .order('created_at', { ascending: false });

    setProjects(workspaceProjects || []);
    setLoading(false);
  };

  if (loading) return <div className="loading">Synchronizing regional matrix metrics...</div>;

  return (
    <div className="projects-page">
      <div className="page-header">
        <div>
          <h1>Your Active Workspaces</h1>
          <p className="subtitle">Select a module below to process tasks, view engineering criteria, and track feedback updates.</p>
        </div>
      </div>

      {projects.length === 0 ? (
        <div className="empty-state">
          <p>You have not been explicitly assigned to any project modules at this time.</p>
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
                <div className="status-badge status-progress">{project.status}</div>
              </div>
              
              <p className="project-brief-desc">{project.objectives}</p>

              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{ width: `${project.progress || 0}%` }}
                />
              </div>
              <div className="progress-text">{project.progress || 0}% Pipeline Clearance Completed</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}