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
    try {
      let query = supabase
        .from('profiles')
        .select('id, name, email, staff_no, designation, role, centre_id, division_id, unit_id')
        .order('name');

      if (prof?.role === 'CENTRE_ADMIN' && prof.centre_id) {
        query = query.eq('centre_id', prof.centre_id);
      } else if (prof?.role === 'DIVISION_HEAD' && prof.division_id) {
        query = query.eq('division_id', prof.division_id);
      } else if (prof?.role === 'UNIT_HEAD' && prof.unit_id) {
        query = query.eq('unit_id', prof.unit_id);
      }

      const { data, error } = await query;
      if (error) {
        console.error("Staff fetch error:", error);
        setLoading(false);
        return;
      }

      // Task counts for busyness
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

      setStaff(data || []);
      setFiltered(data || []);
    } catch (err) {
      console.error("Unexpected error:", err);
    } finally {
      setLoading(false);
    }
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
    if (!search) {
      setFiltered(staff);
      return;
    }
    const q = search.toLowerCase();
    setFiltered(staff.filter((s: any) =>
      s.name?.toLowerCase().includes(q) ||
      s.designation?.toLowerCase().includes(q) ||
      s.staff_no?.toLowerCase().includes(q)
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

    const { error } = await supabase
      .from('profiles')
      .update({ role: newRole })
      .eq('id', selectedStaff.id);

    if (error) {
      setUpdateMsg('Error: ' + error.message);
    } else {
      setUpdateMsg('Role updated successfully!');
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
          <p>{profile?.role === 'SUPER_ADMIN' ? 'All registered staff' : 'Staff under your responsibility'}</p>
        </div>
      </div>

      <div className="search-bar">
        <input 
          type="text" 
          className="input-field" 
          placeholder="Search by name, email, staff number or designation..." 
          value={search} 
          onChange={(e) => setSearch(e.target.value)} 
        />
      </div>

      {loading ? (
        <p className="loading">Loading staff directory...</p>
      ) : (
        <div className="staff-grid">
          {filtered.map((s: any) => {
            const busy = getBusyness(s.id);
            return (
              <div key={s.id} className="staff-card" onClick={() => { setSelectedStaff(s); setNewRole(s.role); setUpdateMsg(''); }}>
                <div className="staff-avatar" style={{ borderColor: busy.color }}>
                  {s.name?.slice(0, 2).toUpperCase() || 'NA'}
                </div>
                <div className="staff-info">
                  <div className="staff-name">{s.name}</div>
                  <div className="staff-meta">{s.designation || 'No designation'} · {s.staff_no || '—'}</div>
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
      )}

      {/* Detailed Popup */}
      {selectedStaff && (
        <div className="modal-overlay" onClick={() => setSelectedStaff(null)}>
          <div className="modal modal-large" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{selectedStaff.name}</h2>
              <button className="modal-close" onClick={() => setSelectedStaff(null)}>✕</button>
            </div>

            <div className="staff-detail-popup">
              <div className="detail-avatar-large">{selectedStaff.name?.slice(0, 2).toUpperCase()}</div>
              <h3>{selectedStaff.designation}</h3>
              <p className="staff-no-popup">{selectedStaff.staff_no}</p>

              <div className="detail-info">
                <p><strong>Email:</strong> {selectedStaff.email}</p>
                <p><strong>Active Tasks:</strong> {taskCounts[selectedStaff.id] || 0}</p>
              </div>

              {canManageRoles && selectedStaff.role !== 'SUPER_ADMIN' && (
                <div className="role-update">
                  <label>Change Role</label>
                  <select className="input-field" value={newRole} onChange={(e) => setNewRole(e.target.value)}>
                    <option value="STAFF">Staff</option>
                    <option value="UNIT_HEAD">Unit Head</option>
                    <option value="DIVISION_HEAD">Division Head</option>
                    <option value="DEPT_HEAD">Dept Head</option>
                    <option value="CENTRE_ADMIN">Centre Admin</option>
                  </select>
                  <button className="btn" onClick={handleUpdateRole} disabled={updating}>
                    {updating ? 'Updating...' : 'Update Role'}
                  </button>
                  {updateMsg && <p className="update-msg">{updateMsg}</p>}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}