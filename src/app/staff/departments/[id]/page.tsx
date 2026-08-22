/*src/app/staff/departments/[id]/page.tsx*/

'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import Avatar from '@/components/Avatar';
import './department-detail.css';

const initials = (name: string) =>
  name?.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase() || '??';

const STATUS_CLASS: Record<string, string> = {
  COMPLETED: 'deptd-badge-done',
  UNDER_REVIEW: 'deptd-badge-review',
  IN_PROGRESS: 'deptd-badge-active',
  ACTIVE: 'deptd-badge-active',
  PENDING: 'deptd-badge-pending',
};

export default function DepartmentDetail() {
  const { id } = useParams();
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      setLoading(true);

      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUser(user);

      const { data: dept } = await supabase
        .from('departments')
        .select(`
          id, name, code, description,
          head:profiles!departments_head_id_fkey(id, name, designation, avatar_url)
        `)
        .eq('id', id)
        .single();

      if (!dept) { setLoading(false); return; }

      const [
        { data: divisions },
        { data: staff },
        { data: projects },
      ] = await Promise.all([
        supabase.from('divisions')
          .select('id, name, code, description, head:profiles!divisions_head_id_fkey(name)')
          .eq('department_id', id as string)
          .order('name'),
        supabase.from('profiles')
          .select('id, name, designation, role, avatar_url, division_id, divisions:divisions!profiles_division_id_fkey(name)')
          .eq('department_id', id as string)
          .order('name'),
        supabase.from('projects')
          .select('id, title, status, progress, due_date, created_at')
          .eq('dept_scope_id', id as string)
          .order('created_at', { ascending: false })
          .limit(10),
      ]);

      // Divisions with staff counts
      const divisionsWithCounts = await Promise.all((divisions || []).map(async (div: any) => {
        const { count } = await supabase
          .from('profiles').select('id', { count: 'exact', head: true }).eq('division_id', div.id);
        return { ...div, staffCount: count ?? 0 };
      }));

      const activeProjects = (projects || []).filter(p => p.status !== 'COMPLETED').length;
      const completedProjects = (projects || []).filter(p => p.status === 'COMPLETED').length;

      setData({
        ...dept,
        divisions: divisionsWithCounts,
        staff: staff || [],
        projects: projects || [],
        stats: {
          divisionCount: divisions?.length ?? 0,
          staffCount: staff?.length ?? 0,
          activeProjects,
          completedProjects,
        },
      });
      setLoading(false);
    };
    load();
  }, [id]);

  if (loading) return (
    <div className="deptd-loading">
      <div className="deptd-loading-bar" />
      <span>Loading department…</span>
    </div>
  );

  if (!data) return <div className="deptd-not-found">Department not found.</div>;

  return (
    <div className="deptd-page">
      {/* Back */}
      <button className="deptd-back" onClick={() => router.push('/staff/departments')}>
        ← Departments
      </button>

      {/* Header */}
      <div className="deptd-header">
        <div className="deptd-header-left">
          <div className="deptd-header-eyebrow">Department</div>
          <h1 className="deptd-title">
            {data.name}
            {data.code && <span className="deptd-code">{data.code}</span>}
          </h1>
          {data.description && <p className="deptd-desc">{data.description}</p>}
          {data.head?.name && (
            <div className="deptd-head-row">
              <Avatar avatarUrl={data.head.avatar_url} name={data.head.name} size="sm" />
              <div>
                <div className="deptd-head-name">{data.head.name}</div>
                <div className="deptd-head-role">{data.head.designation || 'Department Head'}</div>
              </div>
            </div>
          )}
        </div>

        <div className="deptd-metrics">
          <div className="deptd-metric">
            <div className="deptd-metric-value">{data.stats.divisionCount}</div>
            <div className="deptd-metric-label">Divisions</div>
          </div>
          <div className="deptd-metric">
            <div className="deptd-metric-value">{data.stats.staffCount}</div>
            <div className="deptd-metric-label">Staff</div>
          </div>
          <div className="deptd-metric">
            <div className="deptd-metric-value">{data.stats.activeProjects}</div>
            <div className="deptd-metric-label">Active Projects</div>
          </div>
          <div className="deptd-metric">
            <div className="deptd-metric-value">{data.stats.completedProjects}</div>
            <div className="deptd-metric-label">Completed</div>
          </div>
        </div>
      </div>

      <div className="deptd-grid">
        {/* Divisions */}
        <div className="deptd-panel">
          <div className="deptd-panel-header">
            <span className="deptd-panel-title">Divisions</span>
            <span className="deptd-panel-count">{data.divisions.length}</span>
          </div>
          {data.divisions.length === 0 ? (
            <div className="deptd-empty">No divisions in this department.</div>
          ) : (
            <div className="deptd-div-list">
              {data.divisions.map((d: any) => (
                <div
                  key={d.id}
                  className="deptd-div-row"
                  onClick={() => router.push(`/staff/divisions/${d.id}`)}
                >
                  <div className="deptd-div-info">
                    <div className="deptd-div-name">
                      {d.name}
                      {d.code && <span className="deptd-code">{d.code}</span>}
                    </div>
                    <div className="deptd-div-head">{d.head?.name || 'No head assigned'}</div>
                  </div>
                  <span className="deptd-chip">{d.staffCount} staff</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Projects */}
        <div className="deptd-panel">
          <div className="deptd-panel-header">
            <span className="deptd-panel-title">Projects</span>
            <span className="deptd-panel-count">{data.projects.length}</span>
          </div>
          {data.projects.length === 0 ? (
            <div className="deptd-empty">No projects scoped to this department.</div>
          ) : (
            <div className="deptd-project-list">
              {data.projects.map((p: any) => (
                <div
                  key={p.id}
                  className="deptd-project-row"
                  onClick={() => router.push(`/staff/projects/${p.id}`)}
                >
                  <div className="deptd-project-top">
                    <span className="deptd-project-name">{p.title}</span>
                    <span className={`deptd-badge ${STATUS_CLASS[p.status] || 'deptd-badge-active'}`}>
                      {p.status?.replace(/_/g, ' ') || 'ACTIVE'}
                    </span>
                  </div>
                  <div className="deptd-prog-track">
                    <div className="deptd-prog-fill" style={{ width: `${p.progress ?? 0}%` }} />
                  </div>
                  <div className="deptd-project-meta">
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
      </div>

      {/* Staff roster */}
      <div className="deptd-panel deptd-panel-full">
        <div className="deptd-panel-header">
          <span className="deptd-panel-title">Staff Roster</span>
          <span className="deptd-panel-count">{data.staff.length} members</span>
        </div>
        {data.staff.length === 0 ? (
          <div className="deptd-empty">No staff assigned to this department yet.</div>
        ) : (
          <div className="deptd-staff-grid">
            {data.staff.map((s: any) => (
              <div key={s.id} className="deptd-staff-card">
                <Avatar avatarUrl={s.avatar_url} name={s.name} size="md" />
                <div className="deptd-staff-info">
                  <div className="deptd-staff-name">{s.name}</div>
                  <div className="deptd-staff-role">{s.designation || '—'}</div>
                  {s.divisions?.name && <div className="deptd-staff-unit">{s.divisions.name}</div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Org Drives panel */}
      <OrgDrivesPanel entityType="DEPARTMENT" entityId={id as string} currentUser={currentUser} />
    </div>
  );
}

function OrgDrivesPanel({ entityType, entityId, currentUser }: any) {
  const [drives, setDrives]   = useState<any[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [name, setName]       = useState('');
  const [url, setUrl]         = useState('');
  const [saving, setSaving]   = useState(false);

  useEffect(() => {
    supabase.from('org_drives').select('*')
      .eq('entity_type', entityType).eq('entity_id', entityId)
      .then(({ data }) => setDrives(data || []));
  }, [entityId, entityType]);

  const add = async () => {
    if (!name.trim() || !url.trim()) return;
    setSaving(true);
    const { data } = await supabase.from('org_drives').insert({
      entity_type: entityType, entity_id: entityId,
      name: name.trim(), drive_url: url.trim(),
      added_by: currentUser?.id,
    }).select().single();
    if (data) setDrives(prev => [...prev, data]);
    setName(''); setUrl(''); setShowAdd(false); setSaving(false);
  };

  const remove = async (id: string) => {
    await supabase.from('org_drives').delete().eq('id', id);
    setDrives(prev => prev.filter(d => d.id !== id));
  };

  return (
    <div className="deptd-panel deptd-panel-full" style={{ marginTop: 20 }}>
      <div className="deptd-panel-header">
        <span className="deptd-panel-title">🗂 Org Drives</span>
        <button className="div-btn-gold" style={{ fontSize: '0.78rem', padding: '5px 12px' }}
          onClick={() => setShowAdd(!showAdd)}>
          {showAdd ? 'Cancel' : '+ Add Drive'}
        </button>
      </div>

      {showAdd && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
          <input className="div-input" style={{ flex: 1, minWidth: 140 }}
            placeholder="Drive name (e.g. Department Assets)"
            value={name} onChange={e => setName(e.target.value)} />
          <input className="div-input" style={{ flex: 2, minWidth: 200 }}
            placeholder="https://drive.google.com/…"
            value={url} onChange={e => setUrl(e.target.value)} />
          <button className="div-btn-gold" onClick={add} disabled={saving}>
            {saving ? 'Adding…' : 'Add'}
          </button>
        </div>
      )}

      {drives.length === 0 ? (
        <div className="deptd-empty">No drives added yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {drives.map((d: any) => (
            <div key={d.id} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              background: 'var(--bg3)', borderRadius: 8, padding: '8px 12px',
            }}>
              <span style={{ fontSize: '0.88rem', color: 'var(--text)', flex: 1 }}>{d.name}</span>
              <a href={d.drive_url} target="_blank" rel="noreferrer"
                style={{ fontSize: '0.78rem', color: 'var(--gold)' }}>Open →</a>
              <button onClick={() => remove(d.id)}
                style={{ background: 'none', border: 'none', color: '#e05c5c', cursor: 'pointer', fontSize: '0.8rem' }}>
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}