// src/app/staff/dashboard/page.tsx
'use client';

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import "./dashboard.css";

const COLORS = ['#c9a84c', '#64dcb4', '#64a0ff', '#e05c5c', '#c864ff'];

export default function Dashboard() {
  const [profile, setProfile] = useState<any>(null);
  const [centre, setCentre] = useState<any>(null);
  const [stats, setStats] = useState<any>({});
  const [chartData, setChartData] = useState<any[]>([]);
  const [statusData, setStatusData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [popup, setPopup] = useState<any>(null);
  const [popupData, setPopupData] = useState<any[]>([]);
  const [popupLoading, setPopupLoading] = useState(false);
  const [myTasks, setMyTasks] = useState<any[]>([]);
  const [myProjects, setMyProjects] = useState<any[]>([]);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: prof } = await supabase
        .from('profiles').select('*').eq('id', user.id).single();
      setProfile(prof);

      if (prof?.centre_id) {
        const { data: c } = await supabase
          .from('centres').select('name, location').eq('id', prof.centre_id).single();
        setCentre(c);
      }

      if (prof?.role === 'SUPER_ADMIN') {
        const [
          { count: centresCount },
          { count: projectsCount },
          { count: staffCount },
          { data: projects },
        ] = await Promise.all([
          supabase.from('centres').select('*', { count: 'exact', head: true }),
          supabase.from('projects').select('*', { count: 'exact', head: true }),
          supabase.from('profiles').select('*', { count: 'exact', head: true }),
          supabase.from('projects').select('title, status, progress, created_at'),
        ]);

        setStats({ totalCentres: centresCount || 0, totalProjects: projectsCount || 0, totalStaff: staffCount || 0 });

        // Bar chart — projects by progress
        setChartData((projects || []).slice(0, 6).map((p: any) => ({
          name: p.title?.slice(0, 16) + '...',
          progress: p.progress,
        })));

        // Pie chart — by status
        const statusCounts: any = {};
        (projects || []).forEach((p: any) => {
          statusCounts[p.status] = (statusCounts[p.status] || 0) + 1;
        });
        setStatusData(Object.entries(statusCounts).map(([name, value]) => ({ name, value })));

      } else if (prof?.role === 'CENTRE_ADMIN') {
        const [
          { count: projectsCount },
          { count: staffCount },
          { data: projects },
        ] = await Promise.all([
          supabase.from('projects').select('*', { count: 'exact', head: true }).eq('centre_id', prof.centre_id),
          supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('centre_id', prof.centre_id),
          supabase.from('projects').select('title, status, progress').eq('centre_id', prof.centre_id),
        ]);

        setStats({ totalProjects: projectsCount || 0, totalStaff: staffCount || 0 });
        setChartData((projects || []).slice(0, 6).map((p: any) => ({
          name: p.title?.slice(0, 16) + '...',
          progress: p.progress,
        })));
        const statusCounts: any = {};
        (projects || []).forEach((p: any) => {
          statusCounts[p.status] = (statusCounts[p.status] || 0) + 1;
        });
        setStatusData(Object.entries(statusCounts).map(([name, value]) => ({ name, value })));

      } else if (['DIVISION_HEAD', 'DEPT_HEAD', 'UNIT_HEAD'].includes(prof?.role)) {
        const { data: memberships } = await supabase
          .from('project_members').select('project_id').eq('profile_id', user.id);
        const ids = (memberships || []).map((m: any) => m.project_id);
        const { data: projects } = ids.length > 0
          ? await supabase.from('projects').select('*, centres(name)').in('id', ids)
          : { data: [] };
        const { data: tasks } = await supabase
          .from('tasks').select('*, projects(title)')
          .eq('assigned_to', user.id).neq('status', 'COMPLETED');

        setMyProjects(projects || []);
        setMyTasks(tasks || []);
        setStats({ myProjects: ids.length, myTasks: (tasks || []).length });

      } else {
        // STAFF
        const { data: memberships } = await supabase
          .from('project_members').select('project_id').eq('profile_id', user.id);
        const ids = (memberships || []).map((m: any) => m.project_id);
        const { data: projects } = ids.length > 0
          ? await supabase.from('projects').select('*, centres(name)').in('id', ids)
          : { data: [] };
        const { data: tasks } = await supabase
          .from('tasks').select('*, projects(title)')
          .eq('assigned_to', user.id).neq('status', 'COMPLETED');

        setMyProjects(projects || []);
        setMyTasks(tasks || []);
        setStats({ myProjects: ids.length, myTasks: (tasks || []).length });
      }

      setLoading(false);
    };
    load();
  }, []);

  const openPopup = async (type: string) => {
    setPopup(type);
    setPopupLoading(true);
    setPopupData([]);

    if (type === 'centres') {
      const { data } = await supabase.from('centres').select('name, location, type');
      setPopupData(data || []);
    } else if (type === 'projects') {
      const query = profile?.role === 'SUPER_ADMIN'
        ? supabase.from('projects').select('title, status, progress, due_date')
        : supabase.from('projects').select('title, status, progress, due_date').eq('centre_id', profile?.centre_id);
      const { data } = await query;
      setPopupData(data || []);
    } else if (type === 'staff') {
      const query = profile?.role === 'SUPER_ADMIN'
        ? supabase.from('profiles').select('name, designation, role')
        : supabase.from('profiles').select('name, designation, role').eq('centre_id', profile?.centre_id);
      const { data } = await query;
      setPopupData(data || []);
    }
    setPopupLoading(false);
  };

  const getGreeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const toggleTask = async (task: any) => {
    const newStatus = task.status === 'COMPLETED' ? 'PENDING' : 'COMPLETED';
    await supabase.from('tasks').update({ status: newStatus }).eq('id', task.id);
    setMyTasks(prev => prev.map((t: any) => t.id === task.id ? { ...t, status: newStatus } : t));
  };

  if (loading) return <div className="loading">Loading dashboard...</div>;

  const isAdmin = ['SUPER_ADMIN', 'CENTRE_ADMIN'].includes(profile?.role);
  const isMidAdmin = ['DIVISION_HEAD', 'DEPT_HEAD', 'UNIT_HEAD'].includes(profile?.role);

  return (
    <div className="dashboard-page">
      <div className="greeting">
        <h1>{getGreeting()}, {profile?.name?.split(' ')[0] || 'User'}.</h1>
        <p>
          {profile?.role === 'SUPER_ADMIN' && 'Agency-wide overview.'}
          {profile?.role === 'CENTRE_ADMIN' && 'Your centre overview.'}
          {isMidAdmin && 'Your division overview.'}
          {profile?.role === 'STAFF' && 'Your personal workspace.'}
        </p>
      </div>

      {/* Centre Admin Banner */}
      {profile?.role === 'CENTRE_ADMIN' && centre && (
        <div className="centre-banner">
          <div className="centre-banner-label">Your Centre</div>
          <div className="centre-banner-name">{centre.name}</div>
          <div className="centre-banner-location">📍 {centre.location}</div>
        </div>
      )}

      {/* SUPER ADMIN / CENTRE ADMIN stats */}
      {isAdmin && (
        <>
          <div className="stats-grid">
            {profile?.role === 'SUPER_ADMIN' && (
              <div className="stat-card clickable" onClick={() => openPopup('centres')}>
                <div className="stat-value">{stats.totalCentres}</div>
                <div className="stat-label">Total Centres & Labs</div>
                <div className="stat-hint">Click to view</div>
              </div>
            )}
            <div className="stat-card clickable" onClick={() => openPopup('projects')}>
              <div className="stat-value">{stats.totalProjects}</div>
              <div className="stat-label">Total Projects</div>
              <div className="stat-hint">Click to view</div>
            </div>
            <div className="stat-card clickable" onClick={() => openPopup('staff')}>
              <div className="stat-value">{stats.totalStaff}</div>
              <div className="stat-label">Total Staff</div>
              <div className="stat-hint">Click to view</div>
            </div>
          </div>

          {/* Charts */}
          {chartData.length > 0 && (
            <div className="charts-grid">
              <div className="chart-card">
                <div className="chart-title">Project Progress</div>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 40 }}>
                    <XAxis dataKey="name" tick={{ fill: '#7a8699', fontSize: 10 }} angle={-30} textAnchor="end" />
                    <YAxis tick={{ fill: '#2a6fdd', fontSize: 10 }} domain={[0, 100]} />
                    <Tooltip contentStyle={{ background: '#0f1117', border: '1px solid #1a2030', color: '#dde3ed' }} />
                    <Bar dataKey="progress" fill="#c9a84c" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {statusData.length > 0 && (
                <div className="chart-card">
                  <div className="chart-title">Projects by Status</div>
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={statusData} cx="50%" cy="50%" outerRadius={80}
                        dataKey="value" label={({ name }) => String(name || 'Unknown').replace('_', ' ')}>
                        {statusData.map((_: any, i: number) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ background: '#0f1117', border: '1px solid #1a2030', color: '#dde3ed' }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}

          {stats.totalProjects === 0 && (
            <div className="empty-state">
              <p>No projects yet. Go to <strong>All Projects</strong> to create one.</p>
            </div>
          )}
        </>
      )}

      {/* Mid admin / Staff view */}
      {(isMidAdmin || profile?.role === 'STAFF') && (
        <>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-value">{stats.myProjects}</div>
              <div className="stat-label">My Projects</div>
            </div>
            <div className="stat-card highlight">
              <div className="stat-value">{stats.myTasks}</div>
              <div className="stat-label">Pending Tasks</div>
            </div>
          </div>

          {myProjects.length > 0 && (
            <div className="section-block">
              <h2 className="section-title-sm">My Projects</h2>
              <div className="mini-project-list">
                {myProjects.map((p: any) => (
                  <div key={p.id} className="mini-project-card">
                    <div className="mini-project-header">
                      <div className="mini-project-title">{p.title}</div>
                      <div className={`status-badge ${p.status === 'COMPLETED' ? 'status-done' : p.status === 'UNDER_REVIEW' ? 'status-review' : 'status-progress'}`}>
                        {p.status.replace('_', ' ')}
                      </div>
                    </div>
                    <div className="progress-bar">
                      <div className="progress-fill" style={{ width: `${p.progress}%` }}></div>
                    </div>
                    <div className="progress-text">{p.progress}% complete</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {myTasks.length > 0 && (
            <div className="section-block">
              <h2 className="section-title-sm">My Tasks</h2>
              <div className="tasks-list-dash">
                {myTasks.map((t: any) => (
                  <div key={t.id} className="task-row-dash" onClick={() => toggleTask(t)}>
                    <div className={`task-check ${t.status === 'COMPLETED' ? 'checked' : ''}`}>
                      {t.status === 'COMPLETED' ? '✓' : ''}
                    </div>
                    <div className="task-info-dash">
                      <div className={`task-title-dash ${t.status === 'COMPLETED' ? 'done' : ''}`}>{t.title}</div>
                      <div className="task-project">{t.projects?.title}</div>
                      {t.due_date && <div className="task-due">Due {new Date(t.due_date).toLocaleDateString()}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {myProjects.length === 0 && myTasks.length === 0 && (
            <div className="empty-state">
              <p>You have not been assigned to any projects or tasks yet.</p>
            </div>
          )}
        </>
      )}

      {/* Popup modal */}
      {popup && (
        <div className="modal-overlay" onClick={() => setPopup(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>
                {popup === 'centres' ? 'All Centres & Labs' :
                 popup === 'projects' ? 'All Projects' : 'All Staff'}
              </h2>
              <button className="modal-close" onClick={() => setPopup(null)}>✕</button>
            </div>
            {popupLoading ? <p className="loading">Loading...</p> : (
              <div className="popup-list">
                {popupData.map((item: any, i: number) => (
                  <div key={i} className="popup-item">
                    {popup === 'centres' && (
                      <>
                        <div className="popup-item-title">{item.name}</div>
                        <div className="popup-item-sub">{item.type} · {item.location}</div>
                      </>
                    )}
                    {popup === 'projects' && (
                      <>
                        <div className="popup-item-title">{item.title}</div>
                        <div className="popup-item-sub">{item.status?.replace('_', ' ')} · {item.progress}% · {item.due_date ? `Due ${new Date(item.due_date).toLocaleDateString()}` : 'No deadline'}</div>
                      </>
                    )}
                    {popup === 'staff' && (
                      <>
                        <div className="popup-item-title">{item.name}</div>
                        <div className="popup-item-sub">{item.designation || 'No designation'} · {item.role}</div>
                      </>
                    )}
                  </div>
                ))}
                {popupData.length === 0 && <p style={{ color: 'var(--text3)' }}>Nothing to show yet.</p>}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}