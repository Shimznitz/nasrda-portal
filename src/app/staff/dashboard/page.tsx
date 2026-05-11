// src/app/staff/dashboard/page.tsx
'use client';

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import "./dashboard.css";

const COLORS = ['#c9a84c', '#64dcb4', '#64a0ff', '#e05c5c'];

export default function Dashboard() {
  const [profile, setProfile] = useState<any>(null);
  const [centre, setCentre] = useState<any>(null);
  const [stats, setStats] = useState<any>({});
  const [chartData, setChartData] = useState<any[]>([]);
  const [statusData, setStatusData] = useState<any[]>([]);
  const [recentTasks, setRecentTasks] = useState<any[]>([]);
  const [myProjects, setMyProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    setLoading(true);

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

    if (['SUPER_ADMIN', 'CENTRE_ADMIN'].includes(prof?.role)) {
      // Admin Dashboard
      const adminStats = await Promise.all([
        supabase.from('centres').select('*', { count: 'exact', head: true }),
        supabase.from('projects').select('*', { count: 'exact', head: true }),
        supabase.from('profiles').select('*', { count: 'exact', head: true }),
        supabase.from('projects').select('title, status, progress').limit(6),
      ]);

      setStats({
        totalCentres: adminStats[0].count || 0,
        totalProjects: adminStats[1].count || 0,
        totalStaff: adminStats[2].count || 0,
      });

      setChartData(adminStats[3].data?.map((p: any) => ({
        name: p.title?.slice(0, 14) + '...',
        progress: p.progress || 0,
      })) || []);

      // Status pie
      const statusCounts: any = {};
      adminStats[3].data?.forEach((p: any) => {
        statusCounts[p.status] = (statusCounts[p.status] || 0) + 1;
      });
      setStatusData(Object.entries(statusCounts).map(([name, value]) => ({ name, value })));

    } else {
      // Staff / Mid-level Dashboard
      const { data: tasks } = await supabase
        .from('tasks')
        .select('*, projects(title)')
        .eq('assigned_to', user.id)
        .neq('status', 'COMPLETED')
        .order('due_date', { ascending: true })
        .limit(5);

      const { data: projects } = await supabase
        .from('project_members')
        .select('projects(*)')
        .eq('profile_id', user.id);

      setRecentTasks(tasks || []);
      setMyProjects(projects?.map(p => p.projects) || []);
      setStats({
        myProjects: projects?.length || 0,
        myPendingTasks: tasks?.length || 0,
      });
    }

    setLoading(false);
  };

  const toggleTask = async (taskId: string) => {
    await supabase.from('tasks').update({ status: 'COMPLETED' }).eq('id', taskId);
    setRecentTasks(prev => prev.filter(t => t.id !== taskId));
  };

  if (loading) return <div className="loading">Loading dashboard...</div>;

  const isAdmin = ['SUPER_ADMIN', 'CENTRE_ADMIN'].includes(profile?.role);
  const isStaff = profile?.role === 'STAFF';

  return (
    <div className="dashboard-page">
      <div className="greeting">
        <h1>Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, {profile?.name?.split(' ')[0]}.</h1>
        <p>{isAdmin ? 'Agency / Centre Overview' : 'Your personal workspace'}</p>
      </div>

      {isAdmin && (
        <>
          <div className="stats-grid">
            {/* Admin Stats Cards */}
            <div className="stat-card">
              <div className="stat-value">{stats.totalProjects}</div>
              <div className="stat-label">Total Projects</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{stats.totalCentres}</div>
              <div className="stat-label">Centres & Labs</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{stats.totalStaff}</div>
              <div className="stat-label">Total Staff</div>
            </div>
          </div>

          {/* Charts for Admins */}
          {chartData.length > 0 && (
            <div className="charts-grid">
              {/* Bar Chart */}
              <div className="chart-card">
                <h3>Project Progress</h3>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={chartData}>
                    <XAxis dataKey="name" tick={{ fill: '#7a8699', fontSize: 11 }} />
                    <YAxis domain={[0, 100]} />
                    <Tooltip />
                    <Bar dataKey="progress" fill="#c9a84c" radius={4} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Pie Chart */}
              {statusData.length > 0 && (
                <div className="chart-card">
                  <h3>Projects by Status</h3>
                  <ResponsiveContainer width="100%" height={240}>
                    <PieChart>
                      <Pie data={statusData} cx="50%" cy="45%" outerRadius={90} dataKey="value">
                        {statusData.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Staff & Mid-level View */}
      {!isAdmin && (
        <>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-value">{stats.myProjects}</div>
              <div className="stat-label">My Projects</div>
            </div>
            <div className="stat-card highlight">
              <div className="stat-value">{stats.myPendingTasks}</div>
              <div className="stat-label">Pending Tasks</div>
            </div>
          </div>

          {/* Recent Tasks */}
          {recentTasks.length > 0 && (
            <div className="section-block">
              <h2 className="section-title-sm">Recent Tasks</h2>
              <div className="tasks-list-dash">
                {recentTasks.map((task: any) => (
                  <div key={task.id} className="task-row-dash" onClick={() => toggleTask(task.id)}>
                    <div className={`task-check ${task.status === 'COMPLETED' ? 'checked' : ''}`}>
                      {task.status === 'COMPLETED' ? '✓' : ''}
                    </div>
                    <div className="task-info-dash">
                      <div className="task-title-dash">{task.title}</div>
                      <div className="task-project">{task.projects?.title}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {recentTasks.length === 0 && (
            <div className="empty-state">
              <p>You have no pending tasks at the moment.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}