/*src/app/staff/units/[id]/page.tsx*/

'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import Avatar from '@/components/Avatar';
import './unit-detail.css';

const initials = (name: string) =>
  name?.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase() || '??';

const STATUS_CLASS: Record<string, string> = {
  COMPLETED: 'ud-badge-done',
  UNDER_REVIEW: 'ud-badge-review',
  IN_PROGRESS: 'ud-badge-active',
  ACTIVE: 'ud-badge-active',
  PENDING: 'ud-badge-pending',
};

export default function UnitDetail() {
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

      const { data: unit } = await supabase
        .from('units')
        .select(`
          id, name, code, description,
          head:profiles!units_head_id_fkey(id, name, designation, avatar_url),
          division:divisions(id, name, department:departments(id, name))
        `)
        .eq('id', id)
        .single();

      if (!unit) { setLoading(false); return; }

      const [
        { data: staff },
        { data: projects },
      ] = await Promise.all([
        supabase.from('profiles')
          .select('id, name, designation, role, avatar_url')
          .eq('unit_id', id as string)
          .order('name'),
        supabase.from('projects')
          .select('id, title, status, progress, due_date, created_at')
          .eq('unit_scope_id', id as string)
          .order('created_at', { ascending: false })
          .limit(10),
      ]);

      const activeProjects = (projects || []).filter(p => p.status !== 'COMPLETED').length;
      const completedProjects = (projects || []).filter(p => p.status === 'COMPLETED').length;

      setData({
        ...unit,
        staff: staff || [],
        projects: projects || [],
        stats: {
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
    <div className="ud-loading">
      <div className="ud-loading-bar" />
      <span>Loading unit…</span>
    </div>
  );

  if (!data) return <div className="ud-not-found">Unit not found.</div>;

  return (
    <div className="ud-page">
      {/* Back */}
      <button className="ud-back" onClick={() => router.push('/staff/units')}>
        ← Units
      </button>

      {/* Header */}
      <div className="ud-header">
        <div className="ud-header-left">
          <div className="ud-header-eyebrow">
            {data.division?.department?.name && <span>{data.division.department.name} · </span>}
            {data.division?.name && <span>{data.division.name} · </span>}
            Unit
          </div>
          <h1 className="ud-title">
            {data.name}
            {data.code && <span className="ud-code">{data.code}</span>}
          </h1>
          {data.description && <p className="ud-desc">{data.description}</p>}
          {data.head?.name && (
            <div className="ud-head-row">
              <Avatar avatarUrl={data.head.avatar_url} name={data.head.name} size="sm" />
              <div>
                <div className="ud-head-name">{data.head.name}</div>
                <div className="ud-head-role">{data.head.designation || 'Unit Head'}</div>
              </div>
            </div>
          )}
        </div>

        <div className="ud-metrics">
          <div className="ud-metric">
            <div className="ud-metric-value">{data.stats.staffCount}</div>
            <div className="ud-metric-label">Staff</div>
          </div>
          <div className="ud-metric">
            <div className="ud-metric-value">{data.stats.activeProjects}</div>
            <div className="ud-metric-label">Active Projects</div>
          </div>
          <div className="ud-metric">
            <div className="ud-metric-value">{data.stats.completedProjects}</div>
            <div className="ud-metric-label">Completed</div>
          </div>
        </div>
      </div>

      <div className="ud-grid">
        {/* Projects */}
        <div className="ud-panel ud-panel-full">
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
                <Avatar avatarUrl={s.avatar_url} name={s.name} size="md" />
                <div className="ud-staff-info">
                  <div className="ud-staff-name">{s.name}</div>
                  <div className="ud-staff-role">{s.designation || '—'}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Org Drives panel */}
      <OrgDrivesPanel entityType="UNIT" entityId={id as string} currentUser={currentUser} />
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
    <div className="ud-panel ud-panel-full" style={{ marginTop: 20 }}>
      <div className="ud-panel-header">
        <span className="ud-panel-title">🗂 Org Drives</span>
        <button className="div-btn-gold" style={{ fontSize: '0.78rem', padding: '5px 12px' }}
          onClick={() => setShowAdd(!showAdd)}>
          {showAdd ? 'Cancel' : '+ Add Drive'}
        </button>
      </div>

      {showAdd && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
          <input className="div-input" style={{ flex: 1, minWidth: 140 }}
            placeholder="Drive name (e.g. Unit Resources)"
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
        <div className="ud-empty">No drives added yet.</div>
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