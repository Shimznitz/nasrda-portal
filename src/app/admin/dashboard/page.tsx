/*src/app/admin/dashboard/page.tsx*/
'use client';

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import "./dashboard.css";

export default function UnifiedAdministrativeDashboard() {
  const [profile, setProfile] = useState<any>(null);
  const [stats, setStats] = useState({ projectsCount: 0, staffCount: 0, actionsPending: 0 });
  const [loading, setLoading] = useState(true);

  // Structural Framework State
  const [departments, setDepartments] = useState<any[]>([]);
  const [allStaff, setAllStaff] = useState<any[]>([]);
  
  // Creation Form Modals Context
  const [newDeptName, setNewDeptName] = useState("");
  const [isEssFlag, setIsEssFlag] = useState(false);

  useEffect(() => {
    fetchContextData();
  }, []);

  const fetchContextData = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Fetch Profile details alongside explicit structural contexts
    const { data: prof } = await supabase
      .from('profiles')
      .select('*, departments(name)')
      .eq('id', user.id)
      .single();

    setProfile(prof);

    if (prof) {
      await loadRoleSpecificMetrics(prof);
    }
    setLoading(false);
  };

  const loadRoleSpecificMetrics = async (userProfile: any) => {
    let projectQuery = supabase.from('projects').select('*', { count: 'exact' });
    let staffQuery = supabase.from('profiles').select('*', { count: 'exact' });

    // ENFORCE RIGID ACCESS BOUNDARIES BASED ON SECURITY MATRIX
    if (userProfile.role === 'DG') {
      // DG views everything transparently
      const { data: depts } = await supabase.from('departments').select('*, profiles:director_id(name)');
      const { data: staff } = await supabase.from('profiles').select('*');
      setDepartments(depts || []);
      setAllStaff(staff || []);
    } else if (userProfile.role === 'DIRECTOR') {
      // Boundary locked strictly to assigned department scope
      projectQuery = projectQuery.eq('dept_scope_id', userProfile.department_id);
      staffQuery = staffQuery.eq('department_id', userProfile.department_id);
    } else if (userProfile.role === 'HEAD_CENTRE_LAB') {
      projectQuery = projectQuery.eq('centre_lab_scope_id', userProfile.centre_lab_id);
      staffQuery = staffQuery.eq('centre_lab_id', userProfile.centre_lab_id);
    }

    const { count: projCount } = await projectQuery;
    const { count: stfCount } = await staffQuery;

    setStats({
      projectsCount: projCount || 0,
      staffCount: stfCount || 0,
      actionsPending: 0 // Incremented dynamically based on incoming file review structures
    });
  };

  const handleCreateDepartment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (profile.role !== 'DG') return;

    const { error } = await supabase
      .from('departments')
      .insert({ name: newDeptName, is_ess_department: isEssFlag });

    if (!error) {
      setNewDeptName("");
      setIsEssFlag(false);
      fetchContextData();
    }
  };

  const handleAssignDirector = async (deptId: string, directorId: string) => {
    if (profile.role !== 'DG') return;

    // Transaction Block: Bind user to department head role parameters
    await supabase.from('departments').update({ director_id: directorId }).eq('id', deptId);
    await supabase.from('profiles').update({ role: 'DIRECTOR', department_id: deptId }).eq('id', directorId);
    
    fetchContextData();
  };

  if (loading) return <div className="loader">Processing Organogram Nodes...</div>;

  return (
    <div className="unified-dashboard">
      {/* LANDING HEADER MATRIX */}
      <div className="dashboard-banner">
        <div>
          <h1>Welcome Back, {profile?.name}</h1>
          <p className="clearance-pill">Clearance Level: {profile?.role} {profile?.departments?.name ? `— ${profile.departments.name}` : ''}</p>
        </div>
        <div className="time-signature">Operational Environment Online</div>
      </div>

      {/* METRIC VISUALIZERS */}
      <div className="metrics-row">
        <div className="metric-card">
          <h4>Monitored Operations Modules</h4>
          <span className="metric-num">{stats.projectsCount}</span>
        </div>
        <div className="metric-card">
          <h4>Active Component Personnel</h4>
          <span className="metric-num">{stats.staffCount}</span>
        </div>
        <div className="metric-card">
          <h4>Required Action Vector Reviews</h4>
          <span className="metric-num">{stats.actionsPending}</span>
        </div>
      </div>

      {/* RENDER SYSTEM CONTROLS CONDITIONALLY BASED ON ROLE LEVEL */}
      {profile?.role === 'DG' && (
        <div className="organogram-management-block">
          <h2>Agency Organogram Configuration Panel</h2>
          
          <form onSubmit={handleCreateDepartment} className="inline-generation-form">
            <input 
              type="text" 
              placeholder="Enter Department Name (e.g., Engineering & Space Systems)..." 
              value={newDeptName}
              onChange={e => setNewDeptName(e.target.value)}
              required 
            />
            <label className="checkbox-container">
              <input type="checkbox" checked={isEssFlag} onChange={e => setIsEssFlag(e.target.checked)} />
              Flag as ESS Department Vector
            </label>
            <button type="submit" className="action-commit-btn">Deploy Department</button>
          </form>

          <div className="entity-table-wrapper">
            <h3>Registered Core Departments</h3>
            <table className="organogram-table">
              <thead>
                <tr>
                  <th>Department Identity Label</th>
                  <th>Current Serving Director</th>
                  <th>Reassign Executive Command</th>
                </tr>
              </thead>
              <tbody>
                {departments.map(dept => (
                  <tr key={dept.id}>
                    <td><strong>{dept.name}</strong> {dept.is_ess_department && <span className="ess-tag">ESS System Vector</span>}</td>
                    <td>{dept.profiles?.name || <span className="vacant">Command Position Vacant</span>}</td>
                    <td>
                      <select 
                        defaultValue="" 
                        onChange={(e) => handleAssignDirector(dept.id, e.target.value)}
                        className="table-selector"
                      >
                        <option value="" disabled>Select officer to commission...</option>
                        {allStaff.map(s => (
                          <option key={s.id} value={s.id}>{s.name} ({s.role})</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VIEW EXTENSION LABELS FOR OPERATIONAL INTERFACES */}
      <div className="routing-shortcuts-grid">
        <div className="shortcut-card">
          <h3>Task Matrix Core</h3>
          <p>Access active regional projects, file repositories, and check real-time pipeline progress updates.</p>
          <a href="/admin/projects" className="shortcut-link">Open Project Registries →</a>
        </div>
        <div className="shortcut-card">
          <h3>Central Communications Queue</h3>
          <p>Review documents, process file payloads, and issue feedback assessments directly to assigned units.</p>
          <a href="/admin/submissions" className="shortcut-link">Open Evaluation Queue →</a>
        </div>
      </div>
    </div>
  );
}