/* src/app/staff/departments/[id]/page.tsx */

'use client';

import { useEffect, useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { displayName } from '@/lib/utils';
import Avatar from '@/components/Avatar';
import './department-details.css';

const STATUS_CLASS: Record<string, string> = {
  COMPLETED: 'status-pill completed',
  UNDER_REVIEW: 'status-pill idle',
  IN_PROGRESS: 'status-pill progress',
  ACTIVE: 'status-pill active',
  PENDING: 'status-pill idle',
};

export default function DepartmentDetail() {
  const { id } = useParams();
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);

  // Search states
  const [projectSearch, setProjectSearch] = useState('');
  const [staffSearch, setStaffSearch] = useState('');
  const [showAllStaff, setShowAllStaff] = useState(false);

  useEffect(() => {
    if (!id) return;

    const load = async () => {
      setLoading(true);

      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUser(user);

      // 1. Fetch department details
      const { data: dept, error: deptError } = await supabase
        .from('departments')
        .select(`
          id, name, description,
          head:profiles!departments_head_id_fkey(id, name, title, designation, avatar_url)
        `)
        .eq('id', id)
        .maybeSingle();

      if (deptError) {
        console.error('Department fetch error:', deptError);
        setLoading(false);
        return;
      }

      if (!dept) {
        setLoading(false);
        return;
      }

      // 2. Sub-resource fetches
      const [
        { data: divisions, error: divError },
        { data: staff, error: staffError },
        { data: projects, error: projError },
      ] = await Promise.all([
        supabase.from('divisions')
          .select('id, name, code, description, head:profiles!divisions_head_id_fkey(name, title)')
          .eq('department_id', id as string)
          .order('name'),
        supabase.from('profiles')
          .select('id, name, title, designation, role, avatar_url, division_id, divisions:divisions!profiles_division_id_fkey(name)')
          .eq('department_id', id as string)
          .order('name'),
        supabase.from('projects')
          .select('id, title, status, progress, due_date, created_at')
          .eq('dept_scope_id', id as string)
          .order('created_at', { ascending: false })
          .limit(50),
      ]);

      if (divError) console.error('Divisions fetch error:', divError);
      if (staffError) console.error('Staff fetch error:', staffError);
      if (projError) console.error('Projects fetch error:', projError);

      const staffList = staff || [];
      const staffByDivision = staffList.reduce((acc: Record<string, number>, s: any) => {
        if (s.division_id) acc[s.division_id] = (acc[s.division_id] || 0) + 1;
        return acc;
      }, {});

      const divisionsWithCounts = (divisions || []).map((div: any) => ({
        ...div,
        staffCount: staffByDivision[div.id] ?? 0,
      }));

      const activeProjects = (projects || []).filter(p => p.status !== 'COMPLETED').length;
      const completedProjects = (projects || []).filter(p => p.status === 'COMPLETED').length;

      setData({
        ...dept,
        divisions: divisionsWithCounts,
        staff: staffList,
        projects: projects || [],
        stats: {
          divisionCount: divisions?.length ?? 0,
          staffCount: staffList.length,
          activeProjects,
          completedProjects,
        },
      });

      setLoading(false);
    };

    load();
  }, [id]);

  // Filtered queries
  const filteredProjects = useMemo(() => {
    if (!data?.projects) return [];
    return data.projects.filter((p: any) =>
      p.title.toLowerCase().includes(projectSearch.toLowerCase())
    );
  }, [data?.projects, projectSearch]);

  const filteredStaff = useMemo(() => {
    if (!data?.staff) return [];
    return data.staff.filter((s: any) => {
      const full = displayName(s).toLowerCase();
      const role = (s.designation || s.role || '').toLowerCase();
      const q = staffSearch.toLowerCase();
      return full.includes(q) || role.includes(q);
    });
  }, [data?.staff, staffSearch]);

  const visibleStaff = useMemo(() => {
    if (staffSearch || showAllStaff) return filteredStaff;
    return filteredStaff.slice(0, 8);
  }, [filteredStaff, staffSearch, showAllStaff]);

  if (loading) {
    return <div className="telemetry-loading">Loading department telemetry…</div>;
  }

  if (!data) return <div className="telemetry-error">Department not found.</div>;

  return (
    <div className="dept-details-container">
      {/* Header Banner */}
      <div className="insight-header-banner">
        <span className="accent-pill">Department Overview</span>
        <h1>{data.name}</h1>
        {data.description && <p className="location-tag">{data.description}</p>}
      </div>

      {/* Analytics Grid */}
      <div className="analytics-dashboard-grid">
        <div className="metric-box">
          <div className="metric-label">Divisions</div>
          <div className="metric-row">
            <div className="metric-num">{data.stats.divisionCount}</div>
            <span className="trend-indicator textual">Active Units</span>
          </div>
          <div className="mini-progress-track">
            <div className="fill-bar" style={{ width: '100%' }} />
          </div>
        </div>

        <div className="metric-box">
          <div className="metric-label">Total Staff</div>
          <div className="metric-row">
            <div className="metric-num">{data.stats.staffCount}</div>
            <span className="trend-indicator upward">Members</span>
          </div>
          <div className="mini-progress-track">
            <div className="fill-bar gold-fill" style={{ width: '100%' }} />
          </div>
        </div>

        <div className="metric-box">
          <div className="metric-label">Active Projects</div>
          <div className="metric-row">
            <div className="metric-num">{data.stats.activeProjects}</div>
            <span className="trend-indicator upward">In Progress</span>
          </div>
          <div className="mini-progress-track">
            <div className="fill-bar" style={{ width: `${(data.stats.activeProjects / (data.projects.length || 1)) * 100}%` }} />
          </div>
        </div>

        <div className="metric-box">
          <div className="metric-label">Completed</div>
          <div className="metric-row">
            <div className="metric-num">{data.stats.completedProjects}</div>
            <span className="trend-indicator upward">Delivered</span>
          </div>
          <div className="mini-progress-track">
            <div className="fill-bar success-fill" style={{ width: `${(data.stats.completedProjects / (data.projects.length || 1)) * 100}%` }} />
          </div>
        </div>
      </div>

      {/* Main Split Content */}
      <div className="insight-sections-split">
        {/* Main Column */}
        <div className="section-main-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <h3 style={{ margin: 0 }}>Active Projects</h3>
            <input
              type="text"
              placeholder="Filter projects…"
              value={projectSearch}
              onChange={(e) => setProjectSearch(e.target.value)}
              style={{
                background: 'var(--bg3)',
                border: '1px solid var(--border)',
                color: 'var(--text)',
                padding: '6px 12px',
                borderRadius: 8,
                fontSize: '0.82rem',
                outline: 'none',
                width: '180px',
              }}
            />
          </div>

          {filteredProjects.length === 0 ? (
            <div className="empty-table-state">
              {projectSearch ? 'No matching projects found.' : 'No projects scoped to this department.'}
            </div>
          ) : (
            <div className="telemetry-table">
              <div className="table-row table-header">
                <div>Project Title</div>
                <div>Status</div>
                <div>Progress</div>
              </div>
              {filteredProjects.map((p: any) => (
                <div
                  key={p.id}
                  className="table-row"
                  style={{ cursor: 'pointer' }}
                  onClick={() => router.push(`/staff/projects/${p.id}`)}
                >
                  <div className="proj-title-cell">{p.title}</div>
                  <div>
                    <span className={STATUS_CLASS[p.status] || 'status-pill idle'}>
                      {p.status?.replace(/_/g, ' ') || 'ACTIVE'}
                    </span>
                  </div>
                  <div>
                    <div className="health-bar-container">
                      <div
                        className={`health-fill ${p.progress >= 75 ? 'green' : 'yellow'}`}
                        style={{ width: `${p.progress ?? 0}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <h3 style={{ marginTop: 40, marginBottom: 20 }}>Divisions</h3>
          {data.divisions.length === 0 ? (
            <div className="empty-table-state">No divisions configured.</div>
          ) : (
            <div className="telemetry-table">
              <div className="table-row table-header">
                <div>Division Name</div>
                <div>Head</div>
                <div>Staff</div>
              </div>
              {data.divisions.map((d: any) => (
                <div
                  key={d.id}
                  className="table-row"
                  style={{ cursor: 'pointer' }}
                  onClick={() => router.push(`/staff/divisions/${d.id}`)}
                >
                  <div className="proj-title-cell">{d.name}</div>
                  <div>{d.head ? displayName(d.head) : '—'}</div>
                  <div>{d.staffCount} members</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sidebar Column */}
        <div className="section-side-card">
          <h3>Department Leadership</h3>
          {data.head ? (
            <div className="meta-profile-capsule">
              <Avatar avatarUrl={data.head.avatar_url} name={displayName(data.head)} size="md" />
              <div>
                <div className="meta-name">{displayName(data.head)}</div>
                <div className="meta-title">{data.head.designation || data.head.title || 'Department Head'}</div>
              </div>
            </div>
          ) : (
            <div className="empty-table-state" style={{ padding: '16px 0' }}>No head assigned</div>
          )}

          {/* Compact Staff Roster */}
          <div style={{ marginTop: 32 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}>Staff ({data.staff.length})</h3>
              <input
                type="text"
                placeholder="Search staff…"
                value={staffSearch}
                onChange={(e) => setStaffSearch(e.target.value)}
                style={{
                  background: 'var(--bg3)',
                  border: '1px solid var(--border)',
                  color: 'var(--text)',
                  padding: '4px 10px',
                  borderRadius: 6,
                  fontSize: '0.78rem',
                  outline: 'none',
                  width: '120px',
                }}
              />
            </div>

            {filteredStaff.length === 0 ? (
              <div className="empty-table-state" style={{ padding: '16px 0' }}>
                {staffSearch ? 'No staff matching filter.' : 'No staff members listed.'}
              </div>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8 }}>
                  {visibleStaff.map((s: any) => (
                    <div
                      key={s.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        background: 'var(--bg3)',
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                        padding: '6px 8px',
                        overflow: 'hidden',
                      }}
                      title={`${displayName(s)} - ${s.designation || s.role || 'Member'}`}
                    >
                      <Avatar avatarUrl={s.avatar_url} name={displayName(s)} size="sm" />
                      <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        <span style={{ fontSize: '0.78rem', fontWeight: 500, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {displayName(s)}
                        </span>
                        <span style={{ fontSize: '0.68rem', color: 'var(--text3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {s.designation || s.role || 'Member'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                {!staffSearch && filteredStaff.length > 8 && (
                  <button
                    onClick={() => setShowAllStaff(!showAllStaff)}
                    style={{
                      width: '100%',
                      marginTop: 10,
                      background: 'transparent',
                      border: '1px dashed var(--border)',
                      color: 'var(--text3)',
                      padding: '6px',
                      borderRadius: 6,
                      fontSize: '0.75rem',
                      fontFamily: "'IBM Plex Mono', monospace",
                      cursor: 'pointer',
                    }}
                  >
                    {showAllStaff ? 'Collapse Roster ↑' : `+ ${filteredStaff.length - 8} More Members`}
                  </button>
                )}
              </>
            )}
          </div>

          {/* Org Drives */}
          <div style={{ marginTop: 32 }}>
            <OrgDrivesPanel entityType="DEPARTMENT" entityId={id as string} currentUser={currentUser} />
          </div>
        </div>
      </div>
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
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>🗂 Org Drives</h3>
        <button className="accent-pill" style={{ cursor: 'pointer', margin: 0 }} onClick={() => setShowAdd(!showAdd)}>
          {showAdd ? 'Cancel' : '+ Add'}
        </button>
      </div>

      {showAdd && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
          <input
            style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 6, fontSize: '0.82rem' }}
            placeholder="Drive name"
            value={name} onChange={e => setName(e.target.value)}
          />
          <input
            style={{ background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 6, fontSize: '0.82rem' }}
            placeholder="https://drive.google.com/…"
            value={url} onChange={e => setUrl(e.target.value)}
          />
          <button className="accent-pill" style={{ cursor: 'pointer' }} onClick={add} disabled={saving}>
            {saving ? 'Adding…' : 'Save Drive'}
          </button>
        </div>
      )}

      {drives.length === 0 ? (
        <div className="empty-table-state" style={{ padding: '12px 0' }}>No drives connected.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {drives.map((d: any) => (
            <div key={d.id} className="meta-profile-capsule" style={{ marginBottom: 0, padding: 10, justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.82rem', color: 'var(--text)' }}>{d.name}</span>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <a href={d.drive_url} target="_blank" rel="noreferrer" style={{ fontSize: '0.78rem', color: 'var(--gold)' }}>Open →</a>
                <button onClick={() => remove(d.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}>✕</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}