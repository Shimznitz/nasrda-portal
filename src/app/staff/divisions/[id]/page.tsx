/*src/app/staff/divisions/[id]/page.tsx*/

'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import Avatar from '@/components/Avatar';
import './division-detail.css';

const initials = (name: string) =>
  name?.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase() || '??';

const STATUS_CLASS: Record<string, string> = {
  COMPLETED: 'dd-badge-done',
  UNDER_REVIEW: 'dd-badge-review',
  IN_PROGRESS: 'dd-badge-active',
  ACTIVE: 'dd-badge-active',
  PENDING: 'dd-badge-pending',
};

export default function DivisionDetail() {
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

      const { data: div } = await supabase
        .from('divisions')
        .select(`
          id, name, code, description,
          head:profiles!divisions_head_id_fkey(id, name, designation, avatar_url),
          department:departments(id, name)
        `)
        .eq('id', id)
        .single();

      if (!div) { setLoading(false); return; }

      const [
        { data: staff },
        { data: units },
        { data: projects },
      ] = await Promise.all([
        supabase.from('profiles')
          .select('id, name, designation, role, avatar_url, unit_id, units:units!profiles_unit_id_fkey(name)')
          .eq('division_id', id as string)
          .order('name'),
        supabase.from('units')
          .select('id, name, description, head:profiles!units_head_id_fkey(name)')
          .eq('division_id', id as string)
          .order('name'),
        supabase.from('projects')
          .select('id, title, status, progress, due_date, created_at')
          .eq('div_scope_id', id as string)
          .order('created_at', { ascending: false })
          .limit(10),
      ]);

      // Staff per unit counts
      const unitsWithCounts = await Promise.all((units || []).map(async (u: any) => {
        const { count } = await supabase
          .from('profiles').select('id', { count: 'exact', head: true }).eq('unit_id', u.id);
        return { ...u, staffCount: count ?? 0 };
      }));

      const activeProjects = (projects || []).filter(p => p.status !== 'COMPLETED').length;
      const completedProjects = (projects || []).filter(p => p.status === 'COMPLETED').length;

      setData({
        ...div,
        staff: staff || [],
        units: unitsWithCounts,
        projects: projects || [],
        stats: {
          staffCount: staff?.length ?? 0,
          unitCount: units?.length ?? 0,
          activeProjects,
          completedProjects,
        },
      });
      setLoading(false);
    };
    load();
  }, [id]);

  if (loading) return (
    <div className="dd-loading">
      <div className="dd-loading-bar" />
      <span>Loading division…</span>
    </div>
  );

  if (!data) return <div className="dd-not-found">Division not found.</div>;

  return (
    <div className="dd-page">
      {/* Back */}
      <button className="dd-back" onClick={() => router.push('/staff/divisions')}>
        ← Divisions
      </button>

      {/* Header */}
      <div className="dd-header">
        <div className="dd-header-left">
          <div className="dd-header-eyebrow">
            {data.department?.name && <span>{data.department.name} · </span>}Division
          </div>
          <h1 className="dd-title">
            {data.name}
            {data.code && <span className="dd-code">{data.code}</span>}
          </h1>
          {data.description && <p className="dd-desc">{data.description}</p>}
          {data.head?.name && (
            <div className="dd-head-row">
              <Avatar avatarUrl={data.head.avatar_url} name={data.head.name} size="sm" />
              <div>
                <div className="dd-head-name">{data.head.name}</div>
                <div className="dd-head-role">{data.head.designation || 'Division Head'}</div>
              </div>
            </div>
          )}
        </div>

        <div className="dd-metrics">
          <div className="dd-metric">
            <div className="dd-metric-value">{data.stats.staffCount}</div>
            <div className="dd-metric-label">Staff</div>
          </div>
          <div className="dd-metric">
            <div className="dd-metric-value">{data.stats.unitCount}</div>
            <div className="dd-metric-label">Units</div>
          </div>
          <div className="dd-metric">
            <div className="dd-metric-value">{data.stats.activeProjects}</div>
            <div className="dd-metric-label">Active Projects</div>
          </div>
          <div className="dd-metric">
            <div className="dd-metric-value">{data.stats.completedProjects}</div>
            <div className="dd-metric-label">Completed</div>
          </div>
        </div>
      </div>

      <div className="dd-grid">
        {/* Units */}
        <div className="dd-panel">
          <div className="dd-panel-header">
            <span className="dd-panel-title">Units</span>
            <span className="dd-panel-count">{data.units.length}</span>
          </div>
          {data.units.length === 0 ? (
            <div className="dd-empty">No units in this division.</div>
          ) : (
            <div className="dd-unit-list">
              {data.units.map((u: any) => (
                <div key={u.id} className="dd-unit-row">
                  <div className="dd-unit-info">
                    <div className="dd-unit-name">{u.name}</div>
                    <div className="dd-unit-head">{u.head?.name || 'No head assigned'}</div>
                  </div>
                  <span className="dd-chip">{u.staffCount} staff</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Projects */}
        <div className="dd-panel">
          <div className="dd-panel-header">
            <span className="dd-panel-title">Projects</span>
            <span className="dd-panel-count">{data.projects.length}</span>
          </div>
          {data.projects.length === 0 ? (
            <div className="dd-empty">No projects scoped to this division.</div>
          ) : (
            <div className="dd-project-list">
              {data.projects.map((p: any) => (
                <div
                  key={p.id}
                  className="dd-project-row"
                  onClick={() => router.push(`/staff/projects/${p.id}`)}
                >
                  <div className="dd-project-top">
                    <span className="dd-project-name">{p.title}</span>
                    <span className={`dd-badge ${STATUS_CLASS[p.status] || 'dd-badge-active'}`}>
                      {p.status?.replace(/_/g, ' ') || 'ACTIVE'}
                    </span>
                  </div>
                  <div className="dd-prog-track">
                    <div className="dd-prog-fill" style={{ width: `${p.progress ?? 0}%` }} />
                  </div>
                  <div className="dd-project-meta">
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
      <div className="dd-panel dd-panel-full">
        <div className="dd-panel-header">
          <span className="dd-panel-title">Staff Roster</span>
          <span className="dd-panel-count">{data.staff.length} members</span>
        </div>
        {data.staff.length === 0 ? (
          <div className="dd-empty">No staff assigned to this division yet.</div>
        ) : (
          <div className="dd-staff-grid">
            {data.staff.map((s: any) => (
              <div key={s.id} className="dd-staff-card">
                <Avatar avatarUrl={s.avatar_url} name={s.name} size="md" />
                <div className="dd-staff-info">
                  <div className="dd-staff-name">{s.name}</div>
                  <div className="dd-staff-role">{s.designation || '—'}</div>
                  {s.units?.name && <div className="dd-staff-unit">{s.units.name}</div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Org Drives panel */}
      <OrgDrivesPanel entityType="DIVISION" entityId={id as string} currentUser={currentUser} />
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
    <div className="dd-panel dd-panel-full" style={{ marginTop: 20 }}>
      <div className="dd-panel-header">
        <span className="dd-panel-title">🗂 Org Drives</span>
        <button className="div-btn-gold" style={{ fontSize: '0.78rem', padding: '5px 12px' }}
          onClick={() => setShowAdd(!showAdd)}>
          {showAdd ? 'Cancel' : '+ Add Drive'}
        </button>
      </div>

      {showAdd && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
          <input className="div-input" style={{ flex: 1, minWidth: 140 }}
            placeholder="Drive name (e.g. Division Reports)"
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
        <div className="dd-empty">No drives added yet.</div>
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