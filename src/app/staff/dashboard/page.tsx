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

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="db-prog-track">
      <div className="db-prog-fill" style={{ width: `${Math.min(value, 100)}%` }} />
    </div>
  );
}

// ── DG DASHBOARD ──────────────────────────────────────────────
function DGDashboard({ profile }: { profile: any }) {
  const [stats, setStats] = useState({
    totalStaff: 0, totalDepts: 0, totalProjects: 0,
    completedProjects: 0, activeTasks: 0, centres: 0,
  });
  const [departments, setDepartments] = useState<any[]>([]);
  const [recentProjects, setRecentProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const [
        { count: totalStaff },
        { count: totalDepts },
        { data: allProjects },
        { count: activeTasks },
        { count: centres },
        { data: depts },
      ] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact', head: true }),
        supabase.from('departments').select('id', { count: 'exact', head: true }),
        supabase.from('projects').select('id, status, progress, title, created_at').order('created_at', { ascending: false }).limit(5),
        supabase.from('tasks').select('id', { count: 'exact', head: true }).neq('status', 'COMPLETED'),
        supabase.from('centres').select('id', { count: 'exact', head: true }),
        supabase.from('departments').select(`
          id, name,
          head:profiles!head_id(name),
          divisions(id),
          units(id)
        `),
      ]);

      const completed = allProjects?.filter(p => p.status === 'COMPLETED').length ?? 0;

      // Per-dept staff counts
      const deptsWithCounts = await Promise.all((depts || []).map(async (d: any) => {
        const { count: staffCount } = await supabase
          .from('profiles')
          .select('id', { count: 'exact', head: true })
          .eq('department_id', d.id);
        const { count: projectCount } = await supabase
          .from('projects')
          .select('id', { count: 'exact', head: true })
          .eq('dept_scope_id', d.id);
        return { ...d, staffCount: staffCount ?? 0, projectCount: projectCount ?? 0 };
      }));

      setStats({
        totalStaff: totalStaff ?? 0,
        totalDepts: totalDepts ?? 0,
        totalProjects: allProjects?.length ?? 0,
        completedProjects: completed,
        activeTasks: activeTasks ?? 0,
        centres: centres ?? 0,
      });
      setDepartments(deptsWithCounts);
      setRecentProjects(allProjects?.slice(0, 5) ?? []);
      setLoading(false);
    };
    load();
  }, []);

  if (loading) return <DashSkeleton />;

  const completionRate = stats.totalProjects > 0
    ? Math.round((stats.completedProjects / stats.totalProjects) * 100)
    : 0;

  return (
    <div className="dashboard-page">
      <div className="db-header">
        <div className="db-header-left">
          <p className="db-eyebrow">{getGreeting()}, Director General</p>
          <h1 className="db-title">{profile.name?.split(' ')[0]}<span className="db-title-dot">.</span></h1>
          <p className="db-subtitle">National Space Research and Development Agency — Executive Overview</p>
        </div>
        <div className="db-role-badge">Director General</div>
      </div>

      {/* Org-wide metrics */}
      <div className="db-metrics db-metrics-5">
        <div className="db-metric db-metric-accent">
          <div className="db-metric-value">{stats.totalStaff}</div>
          <div className="db-metric-label">Total Personnel</div>
        </div>
        <div className="db-metric">
          <div className="db-metric-value">{stats.totalDepts}</div>
          <div className="db-metric-label">Departments</div>
        </div>
        <div className="db-metric">
          <div className="db-metric-value">{stats.centres}</div>
          <div className="db-metric-label">Centres & Labs</div>
        </div>
        <div className="db-metric">
          <div className="db-metric-value">{stats.totalProjects}</div>
          <div className="db-metric-label">Total Projects</div>
        </div>
        <div className="db-metric">
          <div className="db-metric-value">{completionRate}%</div>
          <div className="db-metric-label">Completion Rate</div>
        </div>
      </div>

      <div className="db-grid db-grid-2">
        {/* Department breakdown */}
        <div className="db-panel db-panel-tall">
          <div className="db-panel-header">
            <span className="db-panel-title">Department Overview</span>
            <span className="db-panel-count">{departments.length} depts</span>
          </div>
          <div className="db-dept-list">
            {departments.map((d: any) => (
              <div key={d.id} className="db-dept-row">
                <div className="db-dept-left">
                  <div className="db-dept-name">{d.name}</div>
                  <div className="db-dept-head">{d.head?.name || 'No head assigned'}</div>
                </div>
                <div className="db-dept-stats">
                  <span className="db-dept-chip">{d.staffCount} staff</span>
                  <span className="db-dept-chip">{d.divisions?.length ?? 0} divs</span>
                  <span className="db-dept-chip gold">{d.projectCount} projects</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right column */}
        <div className="db-col-stack">
          {/* Completion ring */}
          <div className="db-panel db-panel-ring">
            <div className="db-panel-header">
              <span className="db-panel-title">Project Health</span>
            </div>
            <div className="db-ring-wrap">
              <svg viewBox="0 0 100 100" className="db-ring-svg">
                <circle cx="50" cy="50" r="40" fill="none" stroke="var(--border)" strokeWidth="8" />
                <circle cx="50" cy="50" r="40" fill="none"
                  stroke="var(--gold)" strokeWidth="8"
                  strokeDasharray={`${2 * Math.PI * 40}`}
                  strokeDashoffset={`${2 * Math.PI * 40 * (1 - completionRate / 100)}`}
                  strokeLinecap="round"
                  transform="rotate(-90 50 50)" />
              </svg>
              <div className="db-ring-label">
                <div className="db-ring-value">{completionRate}%</div>
                <div className="db-ring-sub">complete</div>
              </div>
            </div>
            <div className="db-ring-legend">
              <div className="db-legend-item">
                <div className="db-legend-dot gold" />
                <span>Completed ({stats.completedProjects})</span>
              </div>
              <div className="db-legend-item">
                <div className="db-legend-dot muted" />
                <span>In Progress ({stats.totalProjects - stats.completedProjects})</span>
              </div>
            </div>
          </div>

          {/* Recent projects */}
          <div className="db-panel">
            <div className="db-panel-header">
              <span className="db-panel-title">Recent Projects</span>
            </div>
            <div className="db-project-list">
              {recentProjects.map((p: any) => (
                <div key={p.id} className="db-project-row">
                  <div className="db-project-row-top">
                    <span className="db-project-name">{p.title}</span>
                    <span className={`db-status ${
                      p.status === 'COMPLETED' ? 'db-status-done' :
                      p.status === 'UNDER_REVIEW' ? 'db-status-review' : 'db-status-active'
                    }`}>{p.status?.replace(/_/g, ' ') ?? 'ACTIVE'}</span>
                  </div>
                  <ProgressBar value={p.progress ?? 0} />
                  <div className="db-project-row-meta">
                    <span>{p.progress ?? 0}% complete</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── DEPT ADMIN DASHBOARD ──────────────────────────────────────
function DeptAdminDashboard({ profile }: { profile: any }) {
  const [dept, setDept] = useState<any>(null);
  const [stats, setStats] = useState({ staffCount: 0, divisionCount: 0, unitCount: 0, activeProjects: 0, pendingTasks: 0 });
  const [divisions, setDivisions] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [centres, setCentres] = useState<any[]>([]);
  const [isESS, setIsESS] = useState(false);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const load = async () => {
      // Get dept this person heads
      const { data: deptData } = await supabase
        .from('departments')
        .select('*')
        .eq('head_id', profile.id)
        .single();

      if (!deptData) { setLoading(false); return; }
      setDept(deptData);

      const ess = deptData.name?.toUpperCase().includes('ESS') ||
        deptData.name?.toUpperCase().includes('ENGINEERING') ||
        deptData.name?.toUpperCase().includes('SPACE SYSTEMS');
      setIsESS(ess);

      const [
        { count: staffCount },
        { data: divs },
        { count: unitCount },
        { data: projs },
      ] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('department_id', deptData.id),
        supabase.from('divisions').select(`
          id, name, code,
          head:profiles!head_id(name),
          units(id)
        `).eq('department_id', deptData.id),
        supabase.from('units').select('id', { count: 'exact', head: true }).eq('department_id', deptData.id),
        supabase.from('projects').select('id, title, status, progress, due_date')
          .eq('dept_scope_id', deptData.id)
          .order('created_at', { ascending: false })
          .limit(6),
      ]);

      // Per-division staff counts
      const divsWithCounts = await Promise.all((divs || []).map(async (d: any) => {
        const { count: sc } = await supabase
          .from('profiles').select('id', { count: 'exact', head: true }).eq('division_id', d.id);
        const { count: pc } = await supabase
          .from('projects').select('id', { count: 'exact', head: true }).eq('div_scope_id', d.id);
        return { ...d, staffCount: sc ?? 0, projectCount: pc ?? 0 };
      }));

      const activeProjects = (projs || []).filter(p => p.status !== 'COMPLETED').length;

      const { count: pendingTasks } = await supabase
        .from('tasks')
        .select('id', { count: 'exact', head: true })
        .in('project_id', (projs || []).map(p => p.id))
        .neq('status', 'COMPLETED');

      if (ess) {
        const { data: centreData } = await supabase
          .from('centres')
          .select(`id, name, type, head:profiles!head_id(name), labs(id)`)
          .order('name');
        setCentres(centreData || []);
      }

      setStats({
        staffCount: staffCount ?? 0,
        divisionCount: divs?.length ?? 0,
        unitCount: unitCount ?? 0,
        activeProjects,
        pendingTasks: pendingTasks ?? 0,
      });
      setDivisions(divsWithCounts);
      setProjects(projs || []);
      setLoading(false);
    };
    load();
  }, [profile.id]);

  if (loading) return <DashSkeleton />;

  return (
    <div className="dashboard-page">
      <div className="db-header">
        <div className="db-header-left">
          <p className="db-eyebrow">{getGreeting()}</p>
          <h1 className="db-title">{profile.name?.split(' ')[0]}<span className="db-title-dot">.</span></h1>
          <p className="db-subtitle">
            {dept?.name ? `Department of ${dept.name}` : 'Department Dashboard'}
            {isESS && <span className="db-ess-tag">ESS</span>}
          </p>
        </div>
        <div className="db-role-badge">Department Director</div>
      </div>

      <div className="db-metrics db-metrics-5">
        <div className="db-metric db-metric-accent">
          <div className="db-metric-value">{stats.staffCount}</div>
          <div className="db-metric-label">Total Staff</div>
        </div>
        <div className="db-metric">
          <div className="db-metric-value">{stats.divisionCount}</div>
          <div className="db-metric-label">Divisions</div>
        </div>
        <div className="db-metric">
          <div className="db-metric-value">{stats.unitCount}</div>
          <div className="db-metric-label">Units</div>
        </div>
        <div className="db-metric">
          <div className="db-metric-value">{stats.activeProjects}</div>
          <div className="db-metric-label">Active Projects</div>
        </div>
        <div className="db-metric">
          <div className="db-metric-value">{stats.pendingTasks}</div>
          <div className="db-metric-label">Open Tasks</div>
        </div>
      </div>

      <div className="db-grid db-grid-2">
        {/* Division breakdown */}
        <div className="db-panel db-panel-tall">
          <div className="db-panel-header">
            <span className="db-panel-title">Divisions</span>
            <span className="db-panel-count">{divisions.length}</span>
          </div>
          <div className="db-dept-list">
            {divisions.length === 0 && <p className="db-empty-hint">No divisions yet.</p>}
            {divisions.map((d: any) => (
              <div key={d.id} className="db-dept-row">
                <div className="db-dept-left">
                  <div className="db-dept-name">{d.name} {d.code && <span className="db-code-tag">{d.code}</span>}</div>
                  <div className="db-dept-head">{d.head?.name || 'No head assigned'}</div>
                </div>
                <div className="db-dept-stats">
                  <span className="db-dept-chip">{d.staffCount} staff</span>
                  <span className="db-dept-chip">{d.units?.length ?? 0} units</span>
                  <span className="db-dept-chip gold">{d.projectCount} proj</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="db-col-stack">
          {/* Projects */}
          <div className="db-panel">
            <div className="db-panel-header">
              <span className="db-panel-title">Department Projects</span>
              <button className="db-panel-link" onClick={() => router.push('/staff/projects')}>View all →</button>
            </div>
            {projects.length === 0 ? (
              <div className="db-empty"><p>No projects yet.</p></div>
            ) : (
              <div className="db-project-list">
                {projects.slice(0, 4).map((p: any) => (
                  <div key={p.id} className="db-project-row" onClick={() => router.push(`/staff/projects/${p.id}`)}>
                    <div className="db-project-row-top">
                      <span className="db-project-name">{p.title}</span>
                      <span className={`db-status ${
                        p.status === 'COMPLETED' ? 'db-status-done' :
                        p.status === 'UNDER_REVIEW' ? 'db-status-review' : 'db-status-active'
                      }`}>{p.status?.replace(/_/g, ' ') ?? 'ACTIVE'}</span>
                    </div>
                    <ProgressBar value={p.progress ?? 0} />
                    <div className="db-project-row-meta">
                      <span>{p.progress ?? 0}%</span>
                      {p.due_date && <span>Due {new Date(p.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ESS: Centres & Labs */}
          {isESS && centres.length > 0 && (
            <div className="db-panel">
              <div className="db-panel-header">
                <span className="db-panel-title">Centres & Labs</span>
                <span className="db-panel-count">{centres.length}</span>
              </div>
              <div className="db-dept-list">
                {centres.map((c: any) => (
                  <div key={c.id} className="db-dept-row">
                    <div className="db-dept-left">
                      <div className="db-dept-name">{c.name}</div>
                      <div className="db-dept-head">{c.head?.name || 'No head'} · {c.type || 'Centre'}</div>
                    </div>
                    <span className="db-dept-chip">{c.labs?.length ?? 0} labs</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── DIVISION HEAD DASHBOARD ───────────────────────────────────
function DivisionHeadDashboard({ profile }: { profile: any }) {
  const [division, setDivision] = useState<any>(null);
  const [stats, setStats] = useState({ staffCount: 0, unitCount: 0, activeProjects: 0, pendingTasks: 0, completedTasks: 0 });
  const [units, setUnits] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const load = async () => {
      const { data: div } = await supabase
        .from('divisions')
        .select('*, department:departments(name)')
        .eq('head_id', profile.id)
        .single();

      if (!div) { setLoading(false); return; }
      setDivision(div);

      const [
        { count: staffCount },
        { data: unitData },
        { data: projData },
      ] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('division_id', div.id),
        supabase.from('units').select(`id, name, head:profiles!head_id(name)`).eq('division_id', div.id),
        supabase.from('projects').select('id, title, status, progress, due_date')
          .eq('div_scope_id', div.id)
          .order('created_at', { ascending: false })
          .limit(8),
      ]);

      const unitsWithCounts = await Promise.all((unitData || []).map(async (u: any) => {
        const { count: sc } = await supabase
          .from('profiles').select('id', { count: 'exact', head: true }).eq('unit_id', u.id);
        return { ...u, staffCount: sc ?? 0 };
      }));

      const projIds = (projData || []).map(p => p.id);
      let pendingTasks = 0, completedTasks = 0;

      if (projIds.length > 0) {
        const [{ count: pt }, { count: ct }, { data: recentTasks }] = await Promise.all([
          supabase.from('tasks').select('id', { count: 'exact', head: true }).in('project_id', projIds).neq('status', 'COMPLETED'),
          supabase.from('tasks').select('id', { count: 'exact', head: true }).in('project_id', projIds).eq('status', 'COMPLETED'),
          supabase.from('tasks').select('id, title, status, due_date, assignee:profiles!assigned_to(name), projects(title)')
            .in('project_id', projIds).neq('status', 'COMPLETED')
            .order('due_date', { ascending: true }).limit(5),
        ]);
        pendingTasks = pt ?? 0;
        completedTasks = ct ?? 0;
        setTasks(recentTasks || []);
      }

      setStats({
        staffCount: staffCount ?? 0,
        unitCount: unitData?.length ?? 0,
        activeProjects: (projData || []).filter(p => p.status !== 'COMPLETED').length,
        pendingTasks,
        completedTasks,
      });
      setUnits(unitsWithCounts);
      setProjects(projData || []);
      setLoading(false);
    };
    load();
  }, [profile.id]);

  if (loading) return <DashSkeleton />;

  const taskCompletionRate = (stats.pendingTasks + stats.completedTasks) > 0
    ? Math.round((stats.completedTasks / (stats.pendingTasks + stats.completedTasks)) * 100)
    : 0;

  return (
    <div className="dashboard-page">
      <div className="db-header">
        <div className="db-header-left">
          <p className="db-eyebrow">{getGreeting()}</p>
          <h1 className="db-title">{profile.name?.split(' ')[0]}<span className="db-title-dot">.</span></h1>
          <p className="db-subtitle">
            {division?.name || 'Division Dashboard'}
            {division?.department?.name && <span className="db-breadcrumb"> · {division.department.name}</span>}
          </p>
        </div>
        <div className="db-role-badge">Division Head</div>
      </div>

      <div className="db-metrics">
        <div className="db-metric db-metric-accent">
          <div className="db-metric-value">{stats.staffCount}</div>
          <div className="db-metric-label">Division Staff</div>
        </div>
        <div className="db-metric">
          <div className="db-metric-value">{stats.unitCount}</div>
          <div className="db-metric-label">Units</div>
        </div>
        <div className="db-metric">
          <div className="db-metric-value">{stats.activeProjects}</div>
          <div className="db-metric-label">Active Projects</div>
        </div>
        <div className="db-metric">
          <div className="db-metric-value">{taskCompletionRate}%</div>
          <div className="db-metric-label">Task Completion</div>
        </div>
      </div>

      <div className="db-grid db-grid-2">
        <div className="db-col-stack">
          {/* Units */}
          <div className="db-panel">
            <div className="db-panel-header">
              <span className="db-panel-title">Units</span>
              <span className="db-panel-count">{units.length}</span>
            </div>
            <div className="db-dept-list">
              {units.length === 0 && <p className="db-empty-hint">No units in this division.</p>}
              {units.map((u: any) => (
                <div key={u.id} className="db-dept-row">
                  <div className="db-dept-left">
                    <div className="db-dept-name">{u.name}</div>
                    <div className="db-dept-head">{u.head?.name || 'No head assigned'}</div>
                  </div>
                  <span className="db-dept-chip">{u.staffCount} staff</span>
                </div>
              ))}
            </div>
          </div>

          {/* Open tasks */}
          <div className="db-panel">
            <div className="db-panel-header">
              <span className="db-panel-title">Open Tasks</span>
              <span className="db-panel-count">{stats.pendingTasks}</span>
            </div>
            {tasks.length === 0 ? (
              <div className="db-empty"><p>No open tasks.</p></div>
            ) : (
              <div className="db-task-list">
                {tasks.map((t: any) => {
                  const overdue = t.due_date && new Date(t.due_date) < new Date();
                  return (
                    <div key={t.id} className="db-task-row">
                      <div className={`db-task-dot ${t.status === 'UNDER_REVIEW' ? 'db-task-dot-review' : ''}`} />
                      <div className="db-task-body">
                        <div className="db-task-title">{t.title}</div>
                        <div className="db-task-meta">
                          {t.assignee?.name && <span>{t.assignee.name}</span>}
                          {t.due_date && (
                            <span className={overdue ? 'db-overdue' : ''}>
                              {overdue ? 'Overdue · ' : 'Due '}
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

        {/* Projects */}
        <div className="db-panel db-panel-tall">
          <div className="db-panel-header">
            <span className="db-panel-title">Projects</span>
            <button className="db-panel-link" onClick={() => router.push('/staff/projects')}>View all →</button>
          </div>
          {projects.length === 0 ? (
            <div className="db-empty"><p>No projects yet.</p></div>
          ) : (
            <div className="db-project-list">
              {projects.map((p: any) => (
                <div key={p.id} className="db-project-row" onClick={() => router.push(`/staff/projects/${p.id}`)}>
                  <div className="db-project-row-top">
                    <span className="db-project-name">{p.title}</span>
                    <span className={`db-status ${
                      p.status === 'COMPLETED' ? 'db-status-done' :
                      p.status === 'UNDER_REVIEW' ? 'db-status-review' : 'db-status-active'
                    }`}>{p.status?.replace(/_/g, ' ') ?? 'ACTIVE'}</span>
                  </div>
                  <ProgressBar value={p.progress ?? 0} />
                  <div className="db-project-row-meta">
                    <span>{p.progress ?? 0}%</span>
                    {p.due_date && <span>Due {new Date(p.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── UNIT HEAD DASHBOARD ───────────────────────────────────────
function UnitHeadDashboard({ profile }: { profile: any }) {
  const [unit, setUnit] = useState<any>(null);
  const [stats, setStats] = useState({ staffCount: 0, activeProjects: 0, pendingTasks: 0 });
  const [projects, setProjects] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const load = async () => {
      const { data: unitData } = await supabase
        .from('units')
        .select('*, division:divisions(name), department:departments(name)')
        .eq('head_id', profile.id)
        .single();

      if (!unitData) { setLoading(false); return; }
      setUnit(unitData);

      const [{ count: staffCount }, { data: projData }] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('unit_id', unitData.id),
        supabase.from('projects').select('id, title, status, progress, due_date')
          .eq('unit_scope_id', unitData.id)
          .order('created_at', { ascending: false }),
      ]);

      const projIds = (projData || []).map(p => p.id);
      if (projIds.length > 0) {
        const [{ count: pt }, { data: taskData }] = await Promise.all([
          supabase.from('tasks').select('id', { count: 'exact', head: true }).in('project_id', projIds).neq('status', 'COMPLETED'),
          supabase.from('tasks').select('id, title, status, due_date, assignee:profiles!assigned_to(name)')
            .in('project_id', projIds).neq('status', 'COMPLETED')
            .order('due_date', { ascending: true }).limit(6),
        ]);
        setStats({ staffCount: staffCount ?? 0, activeProjects: (projData || []).filter(p => p.status !== 'COMPLETED').length, pendingTasks: pt ?? 0 });
        setTasks(taskData || []);
      } else {
        setStats({ staffCount: staffCount ?? 0, activeProjects: 0, pendingTasks: 0 });
      }
      setProjects(projData || []);
      setLoading(false);
    };
    load();
  }, [profile.id]);

  if (loading) return <DashSkeleton />;

  return (
    <div className="dashboard-page">
      <div className="db-header">
        <div className="db-header-left">
          <p className="db-eyebrow">{getGreeting()}</p>
          <h1 className="db-title">{profile.name?.split(' ')[0]}<span className="db-title-dot">.</span></h1>
          <p className="db-subtitle">
            {unit?.name || 'Unit Dashboard'}
            {unit?.division?.name && <span className="db-breadcrumb"> · {unit.division.name}</span>}
          </p>
        </div>
        <div className="db-role-badge">Unit Head</div>
      </div>

      <div className="db-metrics">
        <div className="db-metric db-metric-accent">
          <div className="db-metric-value">{stats.staffCount}</div>
          <div className="db-metric-label">Unit Staff</div>
        </div>
        <div className="db-metric">
          <div className="db-metric-value">{stats.activeProjects}</div>
          <div className="db-metric-label">Active Projects</div>
        </div>
        <div className="db-metric">
          <div className="db-metric-value">{stats.pendingTasks}</div>
          <div className="db-metric-label">Open Tasks</div>
        </div>
      </div>

      <div className="db-grid db-grid-2">
        <div className="db-panel db-panel-tall">
          <div className="db-panel-header">
            <span className="db-panel-title">Unit Projects</span>
            <button className="db-panel-link" onClick={() => router.push('/staff/projects')}>View all →</button>
          </div>
          {projects.length === 0 ? (
            <div className="db-empty"><p>No projects yet.</p></div>
          ) : (
            <div className="db-project-list">
              {projects.map((p: any) => (
                <div key={p.id} className="db-project-row" onClick={() => router.push(`/staff/projects/${p.id}`)}>
                  <div className="db-project-row-top">
                    <span className="db-project-name">{p.title}</span>
                    <span className={`db-status ${
                      p.status === 'COMPLETED' ? 'db-status-done' :
                      p.status === 'UNDER_REVIEW' ? 'db-status-review' : 'db-status-active'
                    }`}>{p.status?.replace(/_/g, ' ') ?? 'ACTIVE'}</span>
                  </div>
                  <ProgressBar value={p.progress ?? 0} />
                  <div className="db-project-row-meta">
                    <span>{p.progress ?? 0}%</span>
                    {p.due_date && <span>Due {new Date(p.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="db-panel">
          <div className="db-panel-header">
            <span className="db-panel-title">Team Tasks</span>
            <span className="db-panel-count">{stats.pendingTasks} open</span>
          </div>
          {tasks.length === 0 ? (
            <div className="db-empty"><p>No open tasks.</p></div>
          ) : (
            <div className="db-task-list">
              {tasks.map((t: any) => {
                const overdue = t.due_date && new Date(t.due_date) < new Date();
                return (
                  <div key={t.id} className="db-task-row">
                    <div className={`db-task-dot ${t.status === 'UNDER_REVIEW' ? 'db-task-dot-review' : ''}`} />
                    <div className="db-task-body">
                      <div className="db-task-title">{t.title}</div>
                      <div className="db-task-meta">
                        {t.assignee?.name && <span>{t.assignee.name}</span>}
                        {t.due_date && (
                          <span className={overdue ? 'db-overdue' : ''}>
                            {overdue ? 'Overdue · ' : 'Due '}
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

// ── STAFF DASHBOARD ───────────────────────────────────────────
function StaffDashboard({ profile }: { profile: any }) {
  const [projects, setProjects] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [stats, setStats] = useState({ totalProjects: 0, openTasks: 0, completedTasks: 0 });
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const load = async () => {
      const { data: memberships } = await supabase
        .from('project_members')
        .select('project_id')
        .eq('profile_id', profile.id);

      const ids = memberships?.map((m: any) => m.project_id) ?? [];

      if (ids.length > 0) {
        const [{ data: projs }, { data: openTasks }, { count: completedCount }] = await Promise.all([
          supabase.from('projects').select('id, title, status, progress, due_date').in('id', ids).order('created_at', { ascending: false }).limit(5),
          supabase.from('tasks').select('id, title, status, due_date, projects(title)').in('project_id', ids).eq('assigned_to', profile.id).neq('status', 'COMPLETED').order('due_date', { ascending: true }).limit(8),
          supabase.from('tasks').select('id', { count: 'exact', head: true }).in('project_id', ids).eq('assigned_to', profile.id).eq('status', 'COMPLETED'),
        ]);
        setProjects(projs || []);
        setTasks(openTasks || []);
        setStats({ totalProjects: ids.length, openTasks: openTasks?.length ?? 0, completedTasks: completedCount ?? 0 });
      }
      setLoading(false);
    };
    load();
  }, [profile.id]);

  if (loading) return <DashSkeleton />;

  return (
    <div className="dashboard-page">
      <div className="db-header">
        <div className="db-header-left">
          <p className="db-eyebrow">{getGreeting()}</p>
          <h1 className="db-title">{profile.name?.split(' ')[0]}<span className="db-title-dot">.</span></h1>
          <p className="db-subtitle">{profile.designation || 'Staff Member'}</p>
        </div>
        <div className="db-role-badge">{formatRole(profile.role)}</div>
      </div>

      <div className="db-metrics">
        <div className="db-metric db-metric-accent">
          <div className="db-metric-value">{stats.totalProjects}</div>
          <div className="db-metric-label">My Projects</div>
        </div>
        <div className="db-metric">
          <div className="db-metric-value">{stats.openTasks}</div>
          <div className="db-metric-label">Open Tasks</div>
        </div>
        <div className="db-metric">
          <div className="db-metric-value">{stats.completedTasks}</div>
          <div className="db-metric-label">Completed Tasks</div>
        </div>
      </div>

      <div className="db-grid db-grid-2">
        <div className="db-panel">
          <div className="db-panel-header">
            <span className="db-panel-title">My Projects</span>
            <button className="db-panel-link" onClick={() => router.push('/staff/projects')}>View all →</button>
          </div>
          {projects.length === 0 ? (
            <div className="db-empty">
              <p>You haven't been added to any projects yet.</p>
              <button onClick={() => router.push('/staff/projects')}>Browse Projects</button>
            </div>
          ) : (
            <div className="db-project-list">
              {projects.map((p: any) => (
                <div key={p.id} className="db-project-row" onClick={() => router.push(`/staff/projects/${p.id}`)}>
                  <div className="db-project-row-top">
                    <span className="db-project-name">{p.title}</span>
                    <span className={`db-status ${
                      p.status === 'COMPLETED' ? 'db-status-done' :
                      p.status === 'UNDER_REVIEW' ? 'db-status-review' : 'db-status-active'
                    }`}>{p.status?.replace(/_/g, ' ') ?? 'ACTIVE'}</span>
                  </div>
                  <ProgressBar value={p.progress ?? 0} />
                  <div className="db-project-row-meta">
                    <span>{p.progress ?? 0}% complete</span>
                    {p.due_date && <span>Due {new Date(p.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="db-panel">
          <div className="db-panel-header">
            <span className="db-panel-title">My Tasks</span>
            {stats.openTasks > 0 && <span className="db-panel-count">{stats.openTasks} open</span>}
          </div>
          {tasks.length === 0 ? (
            <div className="db-empty"><p>No tasks assigned to you right now.</p></div>
          ) : (
            <div className="db-task-list">
              {tasks.map((t: any) => {
                const overdue = t.due_date && new Date(t.due_date) < new Date();
                return (
                  <div key={t.id} className="db-task-row">
                    <div className={`db-task-dot ${t.status === 'UNDER_REVIEW' ? 'db-task-dot-review' : ''}`} />
                    <div className="db-task-body">
                      <div className="db-task-title">{t.title}</div>
                      <div className="db-task-meta">
                        {(t.projects as any)?.title && <span>{(t.projects as any).title}</span>}
                        {t.due_date && (
                          <span className={overdue ? 'db-overdue' : ''}>
                            {overdue ? 'Overdue · ' : 'Due '}
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

// ── SKELETON ──────────────────────────────────────────────────
function DashSkeleton() {
  return (
    <div className="dashboard-page">
      <div className="db-loading">
        <div className="db-loading-bar" />
        <span>Loading dashboard…</span>
      </div>
    </div>
  );
}

// ── ROOT ROUTER ───────────────────────────────────────────────
export default function DashboardRouter() {
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      setProfile(data);
      setLoading(false);
    };
    load();
  }, []);

  if (loading) return <DashSkeleton />;
  if (!profile) return null;

  const role = profile.role;

  if (role === 'DG' || role === 'SUPER_ADMIN') return <DGDashboard profile={profile} />;
  if (role === 'DEPT_ADMIN') return <DeptAdminDashboard profile={profile} />;
  if (role === 'DIVISION_HEAD') return <DivisionHeadDashboard profile={profile} />;
  if (role === 'UNIT_HEAD') return <UnitHeadDashboard profile={profile} />;
  return <StaffDashboard profile={profile} />;
}