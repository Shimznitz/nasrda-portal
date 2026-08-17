// src/app/staff/staff-directory/page.tsx

'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import './staff-directory.css';

const initials = (name: string) =>
  name?.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase() || '??';

const formatRole = (role: string) =>
  role?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) ?? '';

export default function StaffDirectoryPage() {
  const [staff, setStaff] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterDept, setFilterDept] = useState('');
  const [departments, setDepartments] = useState<any[]>([]);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: prof } = await supabase
        .from('profiles').select('id, role, department_id, division_id').eq('id', user.id).single();
      if (!prof) return;

      // Scope: DG/SUPER_ADMIN sees all, others see their dept
      let query = supabase
        .from('profiles')
        .select(`
          id, name, email, designation, role, staff_no,
          department:departments!profiles_department_id_fkey(id, name),
          division:divisions!profiles_division_id_fkey(name),
          unit:units!profiles_unit_id_fkey(name)
        `)
        .order('name');

      if (prof.role !== 'DG' && prof.role !== 'SUPER_ADMIN') {
        if (prof.department_id) {
          query = query.eq('department_id', prof.department_id);
        } else if (prof.division_id) {
          query = query.eq('division_id', prof.division_id);
        }
      }

      const { data } = await query;
      setStaff(data || []);

      // Load departments for filter (DG only)
      if (prof.role === 'DG' || prof.role === 'SUPER_ADMIN') {
        const { data: depts } = await supabase.from('departments').select('id, name').order('name');
        setDepartments(depts || []);
      }

      setLoading(false);
    };
    load();
  }, []);

  const filtered = staff.filter(s => {
    const matchSearch = !search ||
      s.name?.toLowerCase().includes(search.toLowerCase()) ||
      s.email?.toLowerCase().includes(search.toLowerCase()) ||
      s.designation?.toLowerCase().includes(search.toLowerCase()) ||
      s.staff_no?.toLowerCase().includes(search.toLowerCase());
    const matchDept = !filterDept || s.department?.id === filterDept;
    return matchSearch && matchDept;
  });

  if (loading) return (
    <div className="sd-loading">
      <div className="sd-loading-bar" />
      <span>Loading directory…</span>
    </div>
  );

  return (
    <div className="sd-page">
      <div className="sd-header">
        <div>
          <h1 className="sd-title">Staff Directory</h1>
          <p className="sd-sub">{staff.length} personnel</p>
        </div>
      </div>

      <div className="sd-controls">
        <input
          className="sd-search"
          placeholder="Search by name, email, or designation…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {departments.length > 0 && (
          <select className="sd-filter" value={filterDept} onChange={(e) => setFilterDept(e.target.value)}>
            <option value="">All Departments</option>
            {departments.map((d: any) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="sd-empty"><p>No staff found.</p></div>
      ) : (
        <div className="sd-grid">
          {filtered.map((s: any) => (
            <div key={s.id} className="sd-card">
              <div className="sd-avatar">{initials(s.name || '')}</div>
              <div className="sd-card-info">
                <div className="sd-card-name">{s.name || 'Unnamed'}</div>
                {s.designation && <div className="sd-card-desig">{s.designation}</div>}
                <div className="sd-card-email">{s.email}</div>
              </div>
              <div className="sd-card-meta">
                <span className="sd-role-badge">{formatRole(s.role)}</span>
                {s.department?.name && (
                  <div className="sd-meta-line">{s.department.name}</div>
                )}
                {s.division?.name && (
                  <div className="sd-meta-line">{s.division.name}</div>
                )}
                {s.unit?.name && (
                  <div className="sd-meta-line gold">{s.unit.name}</div>
                )}
                {s.staff_no && (
                  <div className="sd-staff-no">{s.staff_no}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}