// src/app/staff/units/[id]/page.tsx

'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import './unit-detail.css';

const initials = (name: string) =>
  name?.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase() || '??';

const STATUS_CLASS: Record<string, string> = {
  COMPLETED: 'ud-badge-done',
  UNDER_REVIEW: 'ud-badge-review',
  IN_PROGRESS: 'ud-badge-active',
  ACTIVE: 'ud-badge-active',
  PENDING: 'ud-badge-pending',
  REJECTED: 'ud-badge-rejected',
};

export default function UnitDetail() {
  const { id } = useParams();
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    load();
  }, [id]);

  const load = async () => {
    setLoading(true);

    const { data: unit } = await supabase
      .from('units')
      .select(`
        id, name, description,
        head:profiles!units_head_id_fkey(id, name, designation),
        division:divisions(id, name),
        department:departments(id, name)
      `)
      .eq('id', id as string)
      .single();

    if (!unit) { setLoading(false); return; }

    const [
      { data: staff },
      { data: projects },
    ] = await Promise.all([
      supabase.from('profiles')
        .select('id, name, designation, role')
        .eq('unit_id', id as string)
        .order('name'),
      supabase.from('projects')
        .select('id, title, status, progress, due_date, created_at')
        .eq('unit_scope_id', id as string)
        .order('created_at', { ascending: false }),
    ]);

    // Fetch tasks for these projects
    const projIds = (projects || []).map((p: any) => p.id);
    let tasks: any[] = [];
    if (projIds.length > 0) {
      const { data: taskData } = await supabase
        .from('tasks')
        .select('id, title, status, due_date, assignee:profiles!assigned_to(name), projects(title)')
        .in('project_id', projIds)
        .order('due_date', { ascending: true })
        .limit(20);
      tasks = taskData || [];
    }

    const completedTasks = tasks.filter(t => t.status === 'COMPLETED').length;
    const pendingTasks = tasks.filter(t => t.status === 'PENDING' || t.status === 'IN_PROGRESS').length;
    const reviewTasks = tasks.filter(t => t.status === 'UNDER_REVIEW').length;
    const activeProjects = (projects || []).filter(p => p.status !== 'COMPLETED').length;

    setData({
      ...unit,
      staff: staff || [],
      projects: projects || [],
      tasks,
      stats: {
        staffCount: staff?.length ?? 0,
        totalProjects: projects?.length ?? 0,
        activeProjects,
        completedProjects: (projects || []).filter(p => p.status === 'COMPLETED').length,
        totalTasks: tasks.length,
        completedTasks,
        pendingTasks,
        reviewTasks,
        productivity: tasks.length > 0 ? Math.round((completedTasks / tasks.length) * 100) : 0,
      },
    });
    setLoading(false);
  };

  if (loading) return (
    <div className="ud-loading">
      <div className="ud-loading-bar" />
      <span>Loading unit…</span>
    </div>
  );

  if (!data) return <div className="ud-not-found">Unit not found.</div>;

  return (
    <div className="ud-page">
      <button className="ud-back" onClick={() => router.push('/staff/units')}>
        ← Units
      </button>

      {/* Header */}
      <div className="ud-header">
        <div className="ud-header-left">
          <div className="ud-header-eyebrow">
            {data.department?.name && <span>{data.department.name}</span>}
            {data.division?.name && <span> · {data.division.name}</span>}
            <span> · Unit</span>
          </div>
          <h1 className="ud-title">{data.name}</h1>
          {data.description && <p className="ud-desc">{data.description}</p>}
          {data.head?.name && (
            <div className="ud-head-row">
              <div className="ud-avatar sm">{initials(data.head.name)}</div>
              <div>
                <div className="ud-head-name">{data.head.name}</div>
                <div className="ud-head-role">{data.head.designation || 'Unit Head'}</div>
              </div>
            </div>
          )}
        </div>

        <div className="ud-metrics-grid">
          <div className="ud-metric">
            <div className="ud-metric-value">{data.stats.staffCount}</div>
            <div className="ud-metric-label">Staff</div>
          </div>
          <div className="ud-metric">
            <div className="ud-metric-value">{data.stats.activeProjects}</div>
            <div className="ud-metric-label">Active Projects</div>
          </div>
          <div className="ud-metric">
            <div className="ud-metric-value">{data.stats.productivity}%</div>
            <div className="ud-metric-label">Task Completion</div>
          </div>
          <div className="ud-metric">
            <div className="ud-metric-value">{data.stats.pendingTasks}</div>
            <div className="ud-metric-label">Open Tasks</div>
          </div>
        </div>
      </div>

      {/* Task status breakdown */}
      {data.stats.totalTasks > 0 && (
        <div className="ud-task-breakdown">
          <div className="ud-breakdown-bar">
            {data.stats.completedTasks > 0 && (
              <div
                className="ud-bar-seg done"
                style={{ width: `${(data.stats.completedTasks / data.stats.totalTasks) * 100}%` }}
                title={`${data.stats.completedTasks} completed`}
              />
            )}
            {data.stats.reviewTasks > 0 && (
              <div
                className="ud-bar-seg review"
                style={{ width: `${(data.stats.reviewTasks / data.stats.totalTasks) * 100}%` }}
                title={`${data.stats.reviewTasks} under review`}
              />
            )}
            {data.stats.pendingTasks > 0 && (
              <div
                className="ud-bar-seg pending"
                style={{ width: `${(data.stats.pendingTasks / data.stats.totalTasks) * 100}%` }}
                title={`${data.stats.pendingTasks} pending`}
              />
            )}
          </div>
          <div className="ud-breakdown-legend">
            <span className="ud-legend-item done">● Completed ({data.stats.completedTasks})</span>
            <span className="ud-legend-item review">● Under Review ({data.stats.reviewTasks})</span>
            <span className="ud-legend-item pending">● Pending ({data.stats.pendingTasks})</span>
          </div>
        </div>
      )}

      <div className="ud-grid">
        {/* Projects */}
        <div className="ud-panel">
          <div className="ud-panel-header">
            <span className="ud-panel-title">Projects</span>
            <span className="ud-panel-count">{data.projects.length}</span>
          </div>
          {data.projects.length === 0 ? (
            <div className="ud-empty">No projects scoped to this unit.</div>
          ) : (
            <div className="ud-project-list">
              {data.projects.map((p: any) => (
                <div
                  key={p.id}
                  className="ud-project-row"
                  onClick={() => router.push(`/staff/projects/${p.id}`)}
                >
                  <div className="ud-project-top">
                    <span className="ud-project-name">{p.title}</span>
                    <span className={`ud-badge ${STATUS_CLASS[p.status] || 'ud-badge-active'}`}>
                      {p.status?.replace(/_/g, ' ') || 'ACTIVE'}
                    </span>
                  </div>
                  <div className="ud-prog-track">
                    <div className="ud-prog-fill" style={{ width: `${p.progress ?? 0}%` }} />
                  </div>
                  <div className="ud-project-meta">
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

        {/* Open tasks */}
        <div className="ud-panel">
          <div className="ud-panel-header">
            <span className="ud-panel-title">Open Tasks</span>
            <span className="ud-panel-count">{data.stats.pendingTasks + data.stats.reviewTasks}</span>
          </div>
          {data.tasks.filter((t: any) => t.status !== 'COMPLETED').length === 0 ? (
            <div className="ud-empty">No open tasks.</div>
          ) : (
            <div className="ud-task-list">
              {data.tasks
                .filter((t: any) => t.status !== 'COMPLETED')
                .map((t: any) => {
                  const overdue = t.due_date && new Date(t.due_date) < new Date();
                  return (
                    <div key={t.id} className="ud-task-row">
                      <div className={`ud-task-dot ${t.status === 'UNDER_REVIEW' ? 'review' : ''}`} />
                      <div className="ud-task-body">
                        <div className="ud-task-title">{t.title}</div>
                        <div className="ud-task-meta">
                          {t.assignee?.name && <span>{t.assignee.name}</span>}
                          {(t.projects as any)?.title && <span>{(t.projects as any).title}</span>}
                          {t.due_date && (
                            <span className={overdue ? 'ud-overdue' : ''}>
                              {overdue ? 'Overdue · ' : 'Due '}
                              {new Date(t.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                            </span>
                          )}
                        </div>
                      </div>
                      <span className={`ud-badge ${STATUS_CLASS[t.status] || 'ud-badge-pending'}`}>
                        {t.status?.replace(/_/g, ' ')}
                      </span>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      </div>

      {/* Staff roster */}
      <div className="ud-panel ud-panel-full">
        <div className="ud-panel-header">
          <span className="ud-panel-title">Staff Roster</span>
          <span className="ud-panel-count">{data.staff.length} members</span>
        </div>
        {data.staff.length === 0 ? (
          <div className="ud-empty">No staff assigned to this unit yet.</div>
        ) : (
          <div className="ud-staff-grid">
            {data.staff.map((s: any) => (
              <div key={s.id} className="ud-staff-card">
                <div className="ud-avatar">{initials(s.name)}</div>
                <div className="ud-staff-info">
                  <div className="ud-staff-name">{s.name}</div>
                  <div className="ud-staff-role">{s.designation || '—'}</div>
                  <div className="ud-staff-tag">{s.role?.replace(/_/g, ' ')}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}