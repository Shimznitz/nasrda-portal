/* src/app/staff/dashboard/page.tsx */
'use client';

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import "./dashboard.css";

export default function StaffDashboard() {
  const [userProfile, setUserProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  // Dynamic Operational States
  const [deptInfo, setDeptInfo] = useState<any>(null);
  const [analytics, setAnalytics] = useState({ staffCount: 0, activeProjects: 0, pendingTasks: 0 });
  const [departmentProjects, setDepartmentProjects] = useState<any[]>([]);
  const [dispatchedTasks, setDispatchedTasks] = useState<any[]>([]);

  // Triage States for DG
  const [unassignedStaff, setUnassignedStaff] = useState<any[]>([]);
  const [allDepartments, setAllDepartments] = useState<any[]>([]);

  useEffect(() => {
    const loadDashboardSession = async () => {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      setUserProfile(profile);

      // If DG/ADMIN, fetch Triage Data
      if (profile?.role === 'DG' || profile?.role === 'ADMIN') {
        const { data: unassigned } = await supabase.from('profiles').select('id, name, email, designation').is('department_id', null);
        const { data: depts } = await supabase.from('departments').select('id, name');
        setUnassignedStaff(unassigned || []);
        setAllDepartments(depts || []);
      }

      // If DEPT_ADMIN, fetch existing telemetry
      if (profile?.role === 'DEPT_ADMIN') {
        const { data: dept } = await supabase.from('departments').select('*').eq('head_id', profile.id).single();
        if (dept) {
          setDeptInfo(dept);
          // ... (Your existing telemetry queries remain here)
        }
      }
      setLoading(false);
    };
    loadDashboardSession();
  }, []);

  const handleAssign = async (profileId: string, deptId: string) => {
    const { error } = await supabase.from('profiles').update({ department_id: deptId, role: 'DEPT_ADMIN' }).eq('id', profileId);
    if (!error) {
      setUnassignedStaff(prev => prev.filter(s => s.id !== profileId));
      alert("Staff allocated to department.");
    }
  };

  if (loading) return <div className="loading">Synchronizing...</div>;

  // VIEW 1: DG VIEW (Now includes Triage)
  if (userProfile?.role === 'DG' || userProfile?.role === 'ADMIN') {
    return (
      <div className="dashboard-page">
        <div className="greeting">
          <h1>Welcome back, Director General.</h1>
          <p>National Space Research and Development Agency Executive Command Center</p>
        </div>
        
        {/* Triage Section Added to your existing DG View */}
        <div className="chart-card">
          <div className="chart-title" style={{ marginBottom: '20px' }}>Global Staff Triage Queue</div>
          {unassignedStaff.length === 0 ? <p>No unassigned personnel.</p> : (
            <table style={{ width: '100%' }}>
              <tbody>
                {unassignedStaff.map(staff => (
                  <tr key={staff.id}>
                    <td>{staff.name}</td>
                    <td>
                      <select onChange={(e) => handleAssign(staff.id, e.target.value)}>
                        <option value="">Assign Dept...</option>
                        {allDepartments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    );
  }
  // VIEW 2: DEPARTMENT HEAD VIEW (Director1 View - Fully Live Data)
  if (userProfile?.role === 'DEPT_ADMIN') {
    return (
      <div className="dashboard-page">
        
        {/* Dynamic Structural Unit Context Banner */}
        <div className="centre-banner">
          <div className="centre-banner-label">Operational Management Node Active</div>
          <div className="centre-banner-name">Department of {deptInfo?.name || 'Unassigned Sector Node'}</div>
          <div className="centre-banner-location">📍 Core Node Location: {deptInfo?.location || 'HQ, Abuja'}</div>
        </div>

        <div className="greeting">
          <h1>Good evening, {userProfile.name}.</h1>
          <p>Managerial control scope for divisional personnel and asset pipelines.</p>
        </div>

        {/* Dynamic Numerical Metrics Metrics */}
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-value">{analytics.staffCount}</div>
            <div className="stat-label">Staff Strength</div>
            <div className="stat-hint">Active Personnel Assigned</div>
          </div>
          <div className="stat-card highlight">
            <div className="stat-value">{analytics.activeProjects}</div>
            <div className="stat-label">Sector Pipelines</div>
            <div className="stat-hint">Active Run Schemes</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{analytics.pendingTasks}</div>
            <div className="stat-label">Dispatched Tasks</div>
            <div className="stat-hint">Pending Subordinate Action</div>
          </div>
        </div>

        {/* Operational Split Matrices */}
        <div className="charts-grid">
          
          {/* Active Structural Project Monitor */}
          <div className="chart-card">
            <div className="chart-title">Active Divisional Blueprints</div>
            <div className="mini-project-list">
              {departmentProjects.length === 0 ? (
                <div className="empty-state" style={{ padding: '40px 20px', fontSize: '0.9rem' }}>
                  No active project blueprints currently logged in this sector.
                </div>
              ) : (
                departmentProjects.map((project) => (
                  <div key={project.id} className="mini-project-card">
                    <div className="mini-project-header">
                      <div className="mini-project-title">{project.title || project.name}</div>
                      <span className={`status-badge ${
                        project.status === 'COMPLETED' || project.status === 'DONE' ? 'status-done' : 
                        project.status === 'REVIEW' ? 'status-review' : 'status-progress'
                      }`}>
                        {project.status || 'Active'}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text3)', fontFamily: 'monospace' }}>
                      UUID Trace: {project.id.slice(0, 8)}...
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Real-time Subordinate Task Monitor */}
          <div className="chart-card">
            <div className="chart-title">Delegated Tasks & Subordinate Status</div>
            <div className="tasks-list-dash">
              {dispatchedTasks.length === 0 ? (
                <div className="empty-state" style={{ padding: '40px 20px', fontSize: '0.9rem' }}>
                  No delegated tasks dispatched from this command node yet.
                </div>
              ) : (
                dispatchedTasks.map((task) => (
                  <div key={task.id} className="task-row-dash">
                    <div className={`task-check ${task.status === 'COMPLETED' ? 'checked' : ''}`}>
                      {task.status === 'COMPLETED' ? '✓' : '!'}
                    </div>
                    <div className="task-info-dash">
                      <div className={`task-title-dash ${task.status === 'COMPLETED' ? 'done' : ''}`}>
                        {task.title}
                      </div>
                      <div className="task-project">
                        Assigned to: <strong style={{ color: 'var(--text2)' }}>
                          {task.profiles?.name || 'Unassigned Staff'}
                        </strong> · Context: {task.projects?.title || 'General Operations'}
                      </div>
                      {task.due_date && (
                        <div className="task-due">
                          Due Date: {new Date(task.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>
      </div>
    );
  }

  // VIEW 3: FALLBACK RUN FOR BASIC EMPLOYEES
  return (
    <div className="dashboard-page">
      <div className="greeting">
        <h1>Good evening, {userProfile?.name || 'Staff Member'}.</h1>
        <p>Personal profile operational environment logs.</p>
      </div>
      <div className="empty-state">
        Your assignment vectors are fully secure. Check your personal assigned lists under the <strong>My Projects</strong> control view.
      </div>
    </div>
  );
}