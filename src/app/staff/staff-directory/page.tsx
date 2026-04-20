// src/app/staff/staff-directory/page.tsx
'use client';

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import "./staff-directory.css";

export default function StaffDirectory() {
  const [staff, setStaff] = useState<any[]>([]);
  const [filtered, setFiltered] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedStaff, setSelectedStaff] = useState<any>(null);
  const [newRole, setNewRole] = useState('');
  const [updating, setUpdating] = useState(false);
  const [updateMsg, setUpdateMsg] = useState('');
  const [profile, setProfile] = useState<any>(null);
  const [taskCounts, setTaskCounts] = useState<Record<string, number>>({});

  const fetchStaff = async (prof: any) => {
    let query = supabase
      .from('profiles')
      .select('id, name, email, staff_no, designation, role, centre_id, division_id, unit_id')
      .order('name');

    // Filter by centre for centre admins
    if (prof?.role === 'CENTRE_ADMIN') {
      query = query.eq('centre_id', prof.centre_id);
    } else if (prof?.role === 'DIVISION_HEAD') {
      query = query.eq('division_id', prof.division_id);
    } else if (prof?.role === 'UNIT_HEAD') {
      query = query.eq('unit_id', prof.unit_id);
    }

    const { data, error } = await query;
    if (error) { console.error(error); setLoading(false); return; }

    // Fetch centre names
    const centreIds = [...new Set((data || []).map((s: any) => s.centre_id).filter(Boolean))];
    const divisionIds = [...new Set((data || []).map((s: any) => s.division_id).filter(Boolean))];
    const unitIds = [...new Set((data || []).map((s: any) => s.unit_id).filter(Boolean))];

    let centreMap: any = {}, divMap: any = {}, unitMap: any = {};

    if (centreIds.length > 0) {
      const { data: centres } = await supabase.from('centres').select('id, name').in('id', centreIds);
      (centres || []).forEach((c: any) => { centreMap[c.id] = c.name; });
    }
    if (divisionIds.length > 0) {
      const { data: divs } = await supabase.from('divisions').select('id, name').in('id', divisionIds);
      (divs || []).forEach((d: any) => { divMap[d.id] = d.name; });
    }
    if (unitIds.length > 0) {
      const { data: units } = await supabase.from('units').select('id, name').in('id', unitIds);
      (units || []).forEach((u: any) => { unitMap[u.id] = u.name; });
    }

    // Fetch task counts for busyness
    const staffIds = (data || []).map((s: any) => s.id);
    let counts: Record<string, number> = {};
    if (staffIds.length > 0) {
      const { data: tasks } = await supabase
        .from('tasks')
        .select('assigned_to')
        .in('assigned_to', staffIds)
        .neq('status', 'COMPLETED');
      (tasks || []).forEach((t: any) => {
        counts[t.assigned_to] = (counts[t.assigned_to] || 0) + 1;
      });
    }
    setTaskCounts(counts);

    const enriched = (data || []).map((s: any) => ({
      ...s,
      centre_name: centreMap[s.centre_id] || null,
      division_name: divMap[s.division_id] || null,
      unit_name: unitMap[s.unit_id] || null,
    }));

    setStaff(enriched);
    setFiltered(enriched);
    setLoading(false);
  };

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      setProfile(prof);
      await fetchStaff(prof);
    };
    load();
  }, []);

  useEffect(() => {
    if (!search) { setFiltered(staff); return; }
    const q = search.toLowerCase();
    setFiltered(staff.filter((s: any) =>
      s.name?.toLowerCase().includes(q) ||
      s.email?.toLowerCase().includes(q) ||
      s.staff_no?.toLowerCase().includes(q) ||
      s.designation?.toLowerCase().includes(q)
    ));
  }, [search, staff]);

  const getBusyness = (staffId: string) => {
    const count = taskCounts[staffId] || 0;
    if (count >= 5) return { label: 'Heavy', color: '#e05c5c', bg: 'rgba(224,92,92,0.12)' };
    if (count >= 2) return { label: 'Moderate', color: '#f0a500', bg: 'rgba(240,165,0,0.12)' };
    return { label: 'Available', color: '#4caf8a', bg: 'rgba(76,175,138,0.12)' };
  };

  const handleUpdateRole = async () => {
    if (!selectedStaff || !newRole) return;
    setUpdating(true);
    setUpdateMsg('');
    const { error } = await supabase.from('profiles').update({ role: newRole }).eq('id', selectedStaff.id);
    if (error) {
      setUpdateMsg('Error: ' + error.message);
    } else {
      setUpdateMsg('Role updated successfully.');
      await fetchStaff(profile);
      setSelectedStaff({ ...selectedStaff, role: newRole });
    }
    setUpdating(false);
  };

  const getRoleBadgeClass = (role: string) => {
    switch (role) {
      case 'SUPER_ADMIN': return 'badge-super';
      case 'CENTRE_ADMIN': return 'badge-centre';
      case 'DIVISION_HEAD': return 'badge-division';
      case 'DEPT_HEAD': return 'badge-dept';
      case 'UNIT_HEAD': return 'badge-unit';
      default: return 'badge-staff';
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'SUPER_ADMIN': return 'Super Admin';
      case 'CENTRE_ADMIN': return 'Centre Admin';
      case 'DIVISION_HEAD': return 'Division Head';
      case 'DEPT_HEAD': return 'Dept Head';
      case 'UNIT_HEAD': return 'Unit Head';
      default: return 'Staff';
    }
  };

  const canManageRoles = ['SUPER_ADMIN', 'CENTRE_ADMIN'].includes(profile?.role);

  return (
    <div className="directory-page">
      <div className="page-header">
        <div>
          <h1>Staff Directory</h1>
          <p>{profile?.role === 'SUPER_ADMIN' ? 'All registered staff across the agency' :
              profile?.role === 'CENTRE_ADMIN' ? 'Staff in your centre' :
              'Staff in your division or unit'}</p>
        </div>
        <div className="busyness-legend">
          <span className="legend-item"><span className="legend-dot" style={{ background: '#e05c5c' }}></span>Heavy</span>
          <span className="legend-item"><span className="legend-dot" style={{ background: '#f0a500' }}></span>Moderate</span>
          <span className="legend-item"><span className="legend-dot" style={{ background: '#4caf8a' }}></span>Available</span>
        </div>
      </div>

      <div className="search-bar">
        <input type="text" className="input-field"
          placeholder="Search by name, email, staff number or designation..."
          value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {loading ? <p className="loading">Loading staff...</p> : (
        <div className="directory-layout">
          <div className="staff-list">
            {filtered.length === 0 && <div className="empty-state">No staff found.</div>}
            {filtered.map((s: any) => {
              const busy = getBusyness(s.id);
              return (
                <div key={s.id}
                  className={`staff-card ${selectedStaff?.id === s.id ? 'active' : ''}`}
                  onClick={() => { setSelectedStaff(s); setNewRole(s.role); setUpdateMsg(''); }}>
                  <div className="staff-avatar" style={{ borderColor: busy.color }}>
                    {s.name?.slice(0, 2).toUpperCase() || 'NA'}
                  </div>
                  <div className="staff-info">
                    <div className="staff-name">{s.name}</div>
                    <div className="staff-meta">{s.designation || 'No designation'} · {s.staff_no || '—'}</div>
                    <div className="staff-sub-meta">
                      {s.centre_name && <span>🏛 {s.centre_name}</span>}
                      {s.division_name && <span>· {s.division_name}</span>}
                      {s.unit_name && <span>· {s.unit_name}</span>}
                    </div>
                  </div>
                  <div className="staff-right">
                    <div className={`role-badge ${getRoleBadgeClass(s.role)}`}>
                      {getRoleLabel(s.role)}
                    </div>
                    <div className="busy-tag" style={{ color: busy.color, background: busy.bg }}>
                      ● {busy.label}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {selectedStaff && (
            <div className="staff-detail">
              <div className="detail-avatar"
                style={{ borderColor: getBusyness(selectedStaff.id).color }}>
                {selectedStaff.name?.slice(0, 2).toUpperCase()}
              </div>
              <h2>{selectedStaff.name}</h2>
              <p className="detail-designation">{selectedStaff.designation}</p>

              <div className="busy-badge-lg"
                style={{
                  color: getBusyness(selectedStaff.id).color,
                  background: getBusyness(selectedStaff.id).bg,
                }}>
                ● {getBusyness(selectedStaff.id).label} · {taskCounts[selectedStaff.id] || 0} active tasks
              </div>

              <div className="detail-fields">
                <div className="detail-field">
                  <span className="detail-label">Email</span>
                  <span className="detail-value">{selectedStaff.email}</span>
                </div>
                <div className="detail-field">
                  <span className="detail-label">Staff No.</span>
                  <span className="detail-value">{selectedStaff.staff_no || '—'}</span>
                </div>
                {selectedStaff.centre_name && (
                  <div className="detail-field">
                    <span className="detail-label">Centre</span>
                    <span className="detail-value">{selectedStaff.centre_name}</span>
                  </div>
                )}
                {selectedStaff.division_name && (
                  <div className="detail-field">
                    <span className="detail-label">Division</span>
                    <span className="detail-value">{selectedStaff.division_name}</span>
                  </div>
                )}
                {selectedStaff.unit_name && (
                  <div className="detail-field">
                    <span className="detail-label">Unit</span>
                    <span className="detail-value">{selectedStaff.unit_name}</span>
                  </div>
                )}
                <div className="detail-field">
                  <span className="detail-label">Current Role</span>
                  <span className={`role-badge ${getRoleBadgeClass(selectedStaff.role)}`}>
                    {getRoleLabel(selectedStaff.role)}
                  </span>
                </div>
              </div>

              {canManageRoles && selectedStaff.role !== 'SUPER_ADMIN' && (
                <div className="role-update">
                  <label className="detail-label">Change Role</label>
                  <select className="input-field" value={newRole}
                    onChange={(e) => setNewRole(e.target.value)}>
                    <option value="STAFF">Staff</option>
                    <option value="UNIT_HEAD">Unit Head</option>
                    <option value="DIVISION_HEAD">Division Head</option>
                    <option value="DEPT_HEAD">Dept Head</option>
                    <option value="CENTRE_ADMIN">Centre Admin</option>
                  </select>
                  <button className="btn" onClick={handleUpdateRole}
                    disabled={updating || newRole === selectedStaff.role}>
                    {updating ? 'Updating...' : 'Update Role'}
                  </button>
                  {updateMsg && <p className="update-msg">{updateMsg}</p>}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}