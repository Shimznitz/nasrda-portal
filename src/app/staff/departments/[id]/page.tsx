/* src/app/staff/departments/[id]/page.tsx */
'use client';

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import "./department-details.css";

export default function DepartmentDetailedView() {
  const { id } = useParams();
  const [dept, setDept] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  // Dynamic Real-time Metrics
  const [metrics, setMetrics] = useState({
    staffStrength: 0,
    activeProjectsCount: 0,
    completedProjectsCount: 0,
  });
  const [projects, setProjects] = useState<any[]>([]);

  useEffect(() => {
    const fetchDepartmentTelemetry = async () => {
      setLoading(true);
      if (!id) return;

      // 1. Fetch core department profile information
      const { data: deptData, error: deptError } = await supabase
        .from('departments')
        .select(`*, profiles:head_id(name, designation)`)
        .eq('id', id)
        .single();

      if (deptError || !deptData) {
        console.error("Error retrieving department profile:", deptError);
        setLoading(false);
        return;
      }
      setDept(deptData);

      // 2. Compute dynamic staff strength count from matching profile assignments
      const { count: staffCount } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('department_id', id);

      // 3. Fetch operational projects cleanly across the platform as a baseline
      let projectData: any[] = [];
      try {
        const { data, error: projectError } = await supabase
          .from('projects')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(15);

        if (!projectError) {
          projectData = data || [];
        } else {
          console.error("Project database query error:", projectError.message);
        }
      } catch (err) {
        console.error("Network runtime fault tracing:", err);
      }

      const activeProjects = projectData?.filter(p => p.status !== 'COMPLETED') || [];
      const completedProjects = projectData?.filter(p => p.status === 'COMPLETED') || [];

      setMetrics({
        staffStrength: staffCount || 0,
        activeProjectsCount: activeProjects.length,
        completedProjectsCount: completedProjects.length,
      });
      setProjects(projectData || []);
      setLoading(false);
    };

    fetchDepartmentTelemetry();
  }, [id]);

  if (loading) return <div className="telemetry-loading">Analyzing agency matrix layers...</div>;
  if (!dept) return <div className="telemetry-error">Structural unit target offline or missing.</div>;

  return (
    <div className="dept-details-container">
      {/* Structural Header Banner */}
      <div className="insight-header-banner">
        <span className="accent-pill">🔬 Department Overview</span>
        <h1>{dept.name}</h1>
        <p className="location-tag">📍 Location: {dept.location || 'HQ, Abuja'}</p>
      </div>

      {/* Dynamic Data Analytical Widgets */}
      <div className="analytics-dashboard-grid">
        {/* Metric Node 1: Personnel */}
        <div className="metric-box">
          <span className="metric-label">Staff Strength</span>
          <div className="metric-row">
            <span className="metric-num">{metrics.staffStrength}</span>
            <span className="trend-indicator upward">Personnel Assigned</span>
          </div>
          <div className="mini-progress-track">
            <div className="fill-bar" style={{ width: `${Math.min(metrics.staffStrength * 5, 100)}%` }}></div>
          </div>
        </div>

        {/* Metric Node 2: Active Pipelines */}
        <div className="metric-box">
          <span className="metric-label">Active Deployments</span>
          <div className="metric-row">
            <span className="metric-num">{metrics.activeProjectsCount}</span>
            <span className={`status-pill ${metrics.activeProjectsCount > 0 ? 'active' : 'idle'}`}>
              {metrics.activeProjectsCount > 0 ? 'Operational' : 'No Active Runs'}
            </span>
          </div>
          <div className="mini-progress-track">
            <div className="fill-bar gold-fill" style={{ width: `${Math.min(metrics.activeProjectsCount * 15, 100)}%` }}></div>
          </div>
        </div>

        {/* Metric Node 3: Deliverables */}
        <div className="metric-box">
          <span className="metric-label">Completed Projects/Activities</span>
          <div className="metric-row">
            <span className="metric-num">{metrics.completedProjectsCount}</span>
            <span className="trend-indicator textual">Archived Assets</span>
          </div>
          <div className="mini-progress-track">
            <div className="fill-bar success-fill" style={{ width: `${metrics.completedProjectsCount > 0 ? '100%' : '0%'}` }}></div>
          </div>
        </div>
      </div>

      {/* Main Breakdown Split Layout */}
      <div className="insight-sections-split">
        <div className="section-main-card">
          <h3>Active Operational Projects/Activities</h3>
          <div className="telemetry-table">
            <div className="table-row table-header">
              <div>Project Title</div>
              <div>Status Flag</div>
              <div>Progress Bar</div>
            </div>
            
            {projects.length === 0 ? (
              <div className="empty-table-state">No documented project records found under this sector.</div>
            ) : (
              projects.map((project) => (
                <div key={project.id} className="table-row">
                  <div className="proj-title-cell">🚀 {project.title || project.name}</div>
                  <div>
                    <span className={`status-pill ${project.status?.toLowerCase() || 'progress'}`}>
                      {project.status || 'In Progress'}
                    </span>
                  </div>
                  <div className="health-bar-container">
                    <div 
                      className={`health-fill ${project.status === 'COMPLETED' ? 'green' : 'yellow'}`} 
                      style={{ width: `${project.progress || 50}%` }}
                    ></div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Assets & Documentation Side Card */}
        <div className="section-side-card">
          <h3>Leadership</h3>
          <div className="meta-profile-capsule">
            <div className="meta-avatar">
              {dept.profiles?.name ? dept.profiles.name.slice(0, 2).toUpperCase() : '??'}
            </div>
            <div>
              <div className="meta-name">{dept.profiles?.name || 'No Head Appointed'}</div>
              <div className="meta-title">{dept.profiles?.designation || 'Director of Operations'}</div>
            </div>
          </div>
          <p className="structural-narrative">{dept.description || 'No strategic description mapped to this functional tier yet.'}</p>
        </div>
      </div>
    </div>
  );
}