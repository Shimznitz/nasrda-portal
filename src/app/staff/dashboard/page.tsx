/* src/app/staff/dashboard/page.tsx */

'use client';

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import "./dashboard.css";

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function formatRole(role: string) {
  return role?.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) ?? '';
}

export default function StaffDashboard() {
  const router = useRouter();
  const [userProfile, setUserProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Shared
  const [myProjects, setMyProjects] = useState<any[]>([]);
  const [myTasks, setMyTasks] = useState<any[]>([]);

  // Manager/Admin extras
  const [analytics, setAnalytics] = useState({ staffCount: 0, activeProjects: 0, pendingTasks: 0 });
  const [scopeName, setScopeName] = useState('');

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (!profile) return;
      setUserProfile(profile);

      const isPrivileged =
        profile.role === 'SUPER_ADMIN' ||
        profile.role === 'DG' ||
        profile.role?.includes('ADMIN') ||
        profile.role === 'DIVISION_HEAD' ||
        profile.role === 'UNIT_HEAD' ||
        profile.role === 'CENTRE_HEAD';

      // ── My projects (via membership) ──────────────────────────
      const { data: memberships } = await supabase
        .from('project_members')
        .select('project_id')
        .eq('profile_id', user.id);

      const memberProjectIds = memberships?.map((m: any) => m.project_id) ?? [];

      // ── Privileged: also fetch scoped projects ─────────────────
      let scopedProjectIds: string[] = [];
      if (isPrivileged) {
        const conditions: string[] = [`created_by.eq.${profile.id}`];
        if (profile.centre_id)     conditions.push(`centre_id.eq.${profile.centre_id}`);
        if (profile.division_id)   conditions.push(`div_scope_id.eq.${profile.division_id}`, `division_id.eq.${profile.division_id}`);
        if (profile.department_id) conditions.push(`dept_scope_id.eq.${profile.department_id}`);
        if (profile.unit_id)       conditions.push(`unit_scope_id.eq.${profile.unit_id}`);

        const { data: scopedProjects } = await supabase
          .from('projects')
          .select('id')
          .or(conditions.join(','));

        scopedProjectIds = scopedProjects?.map((p: any) => p.id) ?? [];
      }

      const allProjectIds = [...new Set([...memberProjectIds, ...scopedProjectIds])];

      if (allProjectIds.length > 0) {
        const { data: projects } = await supabase
          .from('projects')
          .select('id, title, status, progress, due_date, created_by')
          .in('id', allProjectIds)
          .order('created_at', { ascending: false })
          .limit(5);
        setMyProjects(projects ?? []);
      }

      // ── My tasks (via project_members → tasks) ─────────────────
      if (memberProjectIds.length > 0) {
        const { data: tasks } = await supabase
          .from('tasks')
          .select('id, title, status, due_date, project_id, projects(title)')
          .in('project_id', memberProjectIds)
          .eq('assigned_to', user.id)
          .neq('status', 'COMPLETED')
          .order('due_date', { ascending: true })
          .limit(6);
        setMyTasks(tasks ?? []);
      }

      // ── Analytics for privileged roles ─────────────────────────
      if (isPrivileged) {
        // Scope name
        if (profile.role === 'DG' || profile.role === 'SUPER_ADMIN') {
          setScopeName('National Space Research and Development Agency');
        } else if (profile.centre_id) {
          const { data: c } = await supabase.from('centres').select('name').eq('id', profile.centre_id).single();
          if (c) setScopeName(c.name);
        } else if (profile.division_id) {
          const { data: d } = await supabase.from('divisions').select('name').eq('id', profile.division_id).single();
          if (d) setScopeName(d.name);
        }

        // Staff count in scope
        let staffQuery = supabase.from('profiles').select('id', { count: 'exact', head: true });
        if (profile.role !== 'DG' && profile.role !== 'SUPER_ADMIN') {
          if (profile.centre_id)     staffQuery = staffQuery.eq('centre_id', profile.centre_id);
          else if (profile.division_id) staffQuery = staffQuery.eq('division_id', profile.division_id);
          else if (profile.department_id) staffQuery = staffQuery.eq('department_id', profile.department_id);
        }
        const { count: staffCount } = await staffQuery;

        const activeProjects = allProjectIds.length;

        // Pending tasks in scope
        let pendingCount = 0;
        if (allProjectIds.length > 0) {
          const { count } = await supabase
            .from('tasks')
            .select('id', { count: 'exact', head: true })
            .in('project_id', allProjectIds)
            .neq('status', 'COMPLETED');
          pendingCount = count ?? 0;
        }

        setAnalytics({
          staffCount: staffCount ?? 0,
          activeProjects,
          pendingTasks: pendingCount,
        });
      }
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="db-loading">
        <div className="db-loading-bar" />
        <span>Loading dashboard…</span>
      </div>
    );
  }

  if (!userProfile) return null;

  const isPrivileged =
    userProfile.role === 'SUPER_ADMIN' ||
    userProfile.role === 'DG' ||
    userProfile.role?.includes('ADMIN') ||
    userProfile.role === 'DIVISION_HEAD' ||
    userProfile.role === 'UNIT_HEAD' ||
    userProfile.role === 'CENTRE_HEAD';

  const firstName = userProfile.name?.split(' ')[0] ?? 'there';

  return (
    <div className="dashboard-page">

      {/* ── Header ──────────────────────────────────── */}
      <div className="db-header">
        <div className="db-header-left">
          <p className="db-eyebrow">{getGreeting()}</p>
          <h1 className="db-title">{firstName}<span className="db-title-dot">.</span></h1>
          <p className="db-subtitle">
            {isPrivileged
              ? scopeName || 'Your operational scope is active'
              : userProfile.designation || formatRole(userProfile.role)}
          </p>
        </div>
        <div className="db-role-badge">{formatRole(userProfile.role)}</div>
      </div>

      {/* ── Metrics (privileged only) ────────────────── */}
      {isPrivileged && (
        <div className="db-metrics">
          <div className="db-metric">
            <div className="db-metric-value">{analytics.staffCount}</div>
            <div className="db-metric-label">Staff in scope</div>
          </div>
          <div className="db-metric db-metric-accent">
            <div className="db-metric-value">{analytics.activeProjects}</div>
            <div className="db-metric-label">Active projects</div>
          </div>
          <div className="db-metric">
            <div className="db-metric-value">{analytics.pendingTasks}</div>
            <div className="db-metric-label">Open tasks</div>
          </div>
        </div>
      )}

      {/* ── Main grid ───────────────────────────────── */}
      <div className={`db-grid ${isPrivileged ? 'db-grid-2' : 'db-grid-1'}`}>

        {/* Projects panel */}
        <div className="db-panel">
          <div className="db-panel-header">
            <span className="db-panel-title">Projects</span>
            <button className="db-panel-link" onClick={() => router.push('/staff/projects')}>
              View all →
            </button>
          </div>

          {myProjects.length === 0 ? (
            <div className="db-empty">
              <p>No projects yet.</p>
              <button onClick={() => router.push('/staff/projects')}>Go to Projects</button>
            </div>
          ) : (
            <div className="db-project-list">
              {myProjects.map((p) => (
                <div
                  key={p.id}
                  className="db-project-row"
                  onClick={() => router.push(`/staff/projects/${p.id}`)}
                >
                  <div className="db-project-row-top">
                    <span className="db-project-name">{p.title}</span>
                    <span className={`db-status ${
                      p.status === 'COMPLETED' ? 'db-status-done' :
                      p.status === 'UNDER_REVIEW' || p.status === 'REVIEW' ? 'db-status-review' :
                      'db-status-active'
                    }`}>{p.status ?? 'ACTIVE'}</span>
                  </div>
                  <div className="db-progress-track">
                    <div className="db-progress-fill" style={{ width: `${p.progress ?? 0}%` }} />
                  </div>
                  <div className="db-project-row-meta">
                    <span>{p.progress ?? 0}% complete</span>
                    {p.due_date && (
                      <span>Due {new Date(p.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Tasks panel */}
        <div className="db-panel">
          <div className="db-panel-header">
            <span className="db-panel-title">My Tasks</span>
          </div>

          {myTasks.length === 0 ? (
            <div className="db-empty">
              <p>No open tasks assigned to you.</p>
            </div>
          ) : (
            <div className="db-task-list">
              {myTasks.map((t) => {
                const isOverdue = t.due_date && new Date(t.due_date) < new Date();
                return (
                  <div key={t.id} className="db-task-row">
                    <div className={`db-task-dot ${t.status === 'UNDER_REVIEW' ? 'db-task-dot-review' : ''}`} />
                    <div className="db-task-body">
                      <div className="db-task-title">{t.title}</div>
                      <div className="db-task-meta">
                        {(t.projects as any)?.title && <span>{(t.projects as any).title}</span>}
                        {t.due_date && (
                          <span className={isOverdue ? 'db-overdue' : ''}>
                            {isOverdue ? 'Overdue · ' : 'Due '}
                            {new Date(t.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="db-task-status">{t.status?.replace(/_/g, ' ')}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}