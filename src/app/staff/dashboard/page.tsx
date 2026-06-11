// src/app/staff/dashboard/page.tsx
'use client';

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import "./dashboard.css";

export default function StaffDashboard() {
  const router = useRouter();
  const [userProfile, setUserProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Global Search
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  // DG Global Overview Stats
  const [globalStats, setGlobalStats] = useState({
    totalStaff: 0,
    totalProjects: 0,
    activeProjects: 0,
    pendingTasks: 0,
  });

  const [recentProjects, setRecentProjects] = useState<any[]>([]);
  const [unassignedStaff, setUnassignedStaff] = useState<any[]>([]);

  useEffect(() => {
    loadDGDashboard();
  }, []);

  const loadDGDashboard = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    setUserProfile(profile);

    if (profile?.role === 'DG' || profile?.role === 'SUPER_ADMIN') {
      // Global Stats
      const { count: totalStaff } = await supabase.from('profiles').select('*', { count: 'exact', head: true });
      const { count: totalProjects } = await supabase.from('projects').select('*', { count: 'exact', head: true });
      const { count: activeProjects } = await supabase.from('projects').select('*', { count: 'exact', head: true }).eq('status', 'ACTIVE');
      
      setGlobalStats({
        totalStaff: totalStaff || 0,
        totalProjects: totalProjects || 0,
        activeProjects: activeProjects || 0,
        pendingTasks: 0, // You can expand this later
      });

      // Recent Projects
      const { data: projects } = await supabase
        .from('projects')
        .select('id, title, status, created_at, creator:profiles!created_by(name)')
        .order('created_at', { ascending: false })
        .limit(8);

      setRecentProjects(projects || []);

      // Unassigned Staff for Triage
      const { data: unassigned } = await supabase
        .from('profiles')
        .select('id, name, designation, email')
        .is('department_id', null)
        .limit(10);

      setUnassignedStaff(unassigned || []);
    }

    setLoading(false);
  };

  // Global Search (Staff + Projects)
  const performGlobalSearch = async () => {
    if (searchTerm.length < 2) {
      setSearchResults([]);
      return;
    }

    setSearching(true);

    const { data: staffResults } = await supabase
      .from('profiles')
      .select('id, name, designation, role, department_id')
      .ilike('name', `%${searchTerm}%`)
      .limit(10);

    const { data: projectResults } = await supabase
      .from('projects')
      .select('id, title, objectives, status')
      .ilike('title', `%${searchTerm}%`)
      .limit(10);

    setSearchResults([
      ...(staffResults?.map(s => ({ ...s, type: 'staff' })) || []),
      ...(projectResults?.map(p => ({ ...p, type: 'project' })) || [])
    ]);

    setSearching(false);
  };

  if (loading) return <div className="loading">Loading Executive Command Center...</div>;

  // DG / SUPER_ADMIN VIEW
  if (userProfile?.role === 'DG' || userProfile?.role === 'SUPER_ADMIN') {
    return (
      <div className="dashboard-page dg-dashboard">
        <div className="greeting">
          <h1>Welcome back, Director General.</h1>
          <p>National Space Research and Development Agency — Executive Overview</p>
        </div>

        {/* FIXED GLOBAL SEARCH BAR */}
        <div className="global-search-bar">
          <input
            type="text"
            className="global-search-input"
            placeholder="Search staff, projects, divisions, or anything..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onKeyUp={performGlobalSearch}
          />
          {searching && <span className="searching">Searching...</span>}
        </div>

        {searchResults.length > 0 && (
          <div className="search-results-container">
            {searchResults.map((item: any) => (
              <div key={item.id} className="search-result-item">
                {item.type === 'staff' ? (
                  <div>👤 {item.name} — {item.designation || item.role}</div>
                ) : (
                  <div>📋 {item.title}</div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Global Stats */}
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-value">{globalStats.totalStaff}</div>
            <div className="stat-label">Total Personnel</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{globalStats.totalProjects}</div>
            <div className="stat-label">Total Projects</div>
          </div>
          <div className="stat-card highlight">
            <div className="stat-value">{globalStats.activeProjects}</div>
            <div className="stat-label">Active Projects</div>
          </div>
        </div>

        {/* Recent Projects */}
        <div className="chart-card">
          <div className="chart-title">Recent Projects Across Agency</div>
          <div className="mini-project-list">
            {recentProjects.map(p => (
              <div key={p.id} className="mini-project-card" onClick={() => router.push(`/staff/projects/${p.id}`)}>
                <div className="mini-project-title">{p.title}</div>
                <div className="mini-project-meta">By {p.creator?.name || 'Unknown'}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Triage Queue */}
        <div className="chart-card">
          <div className="chart-title">Unassigned Staff Triage</div>
          {unassignedStaff.length === 0 ? (
            <p>All personnel are assigned.</p>
          ) : (
            <table className="triage-table">
              <tbody>
                {unassignedStaff.map(staff => (
                  <tr key={staff.id}>
                    <td>{staff.name}</td>
                    <td>{staff.designation}</td>
                    <td>
                      <button onClick={() => alert(`Assign ${staff.name} to department`)}>
                        Assign
                      </button>
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

  // Fallback for other roles
  return (
    <div className="dashboard-page">
      <div className="greeting">
        <h1>Good evening, {userProfile?.name}.</h1>
      </div>
    </div>
  );
}