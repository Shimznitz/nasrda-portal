// src/app/staff/staff-directory/page.tsx

'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import './staff-directory.css';

const fmt = (role: string) =>
  role?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) ?? '';

const inits = (name: string) =>
  name?.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase() || '??';

export default function StaffDirectoryPage() {
  const [staff, setStaff]       = useState<any[]>([]);
  const [myProfile, setMyProfile] = useState<any>(null);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [filterDept, setFilterDept] = useState('');
  const [departments, setDepartments] = useState<any[]>([]);
  const [isPrivileged, setIsPrivileged] = useState(false);

  useEffect(() => { load(); }, []);

  const load = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: prof } = await supabase
      .from('profiles')
      .select('id, role, department_id, division_id, unit_id')
      .eq('id', user.id).single();

    if (!prof) return;
    setMyProfile(prof);

    const privileged = ['DG','SUPER_ADMIN','DEPT_ADMIN','DIVISION_HEAD','UNIT_HEAD'].includes(prof.role);
    setIsPrivileged(privileged);

    // Base select — everyone gets
    const baseSelect = `
      id, name, email, designation, role, staff_no, avatar_url,
      qualification, degree_level, course_of_study, skills, bio,
      department:departments!profiles_department_id_fkey(id, name),
      division:divisions!profiles_division_id_fkey(name),
      unit:units!profiles_unit_id_fkey(name)
    `;

    let query = supabase.from('profiles').select(baseSelect).order('name');

    // Scope by role
    if (prof.role === 'DG' || prof.role === 'SUPER_ADMIN') {
      // See everyone — no filter
      const { data: depts } = await supabase.from('departments').select('id, name').order('name');
      setDepartments(depts || []);
    } else if (prof.role === 'DEPT_ADMIN') {
      // See everyone in their department
      const { data: dept } = await supabase
        .from('departments').select('id, name').eq('head_id', user.id).maybeSingle();
      if (dept) {
        query = query.eq('department_id', dept.id);
        setDepartments([dept]);
      } else if (prof.department_id) {
        query = query.eq('department_id', prof.department_id);
      }
    } else if (prof.role === 'DIVISION_HEAD') {
      // See everyone in their division
      const { data: div } = await supabase
        .from('divisions').select('id').eq('head_id', user.id).maybeSingle();
      if (div) query = query.eq('division_id', div.id);
      else if (prof.division_id) query = query.eq('division_id', prof.division_id);
    } else if (prof.role === 'UNIT_HEAD') {
      // See everyone in their unit
      const { data: unit } = await supabase
        .from('units').select('id').eq('head_id', user.id).maybeSingle();
      if (unit) query = query.eq('unit_id', unit.id);
      else if (prof.unit_id) query = query.eq('unit_id', prof.unit_id);
    } else {
      // Regular staff — see their department
      if (prof.department_id) query = query.eq('department_id', prof.department_id);
      else if (prof.division_id) query = query.eq('division_id', prof.division_id);
    }

    const { data } = await query;
    setStaff(data || []);
    setLoading(false);
  };

  const filtered = staff.filter(s => {
    const matchSearch = !search ||
      s.name?.toLowerCase().includes(search.toLowerCase()) ||
      s.email?.toLowerCase().includes(search.toLowerCase()) ||
      s.designation?.toLowerCase().includes(search.toLowerCase()) ||
      s.staff_no?.toLowerCase().includes(search.toLowerCase()) ||
      s.skills?.some((sk: string) => sk.toLowerCase().includes(search.toLowerCase()));
    const matchDept = !filterDept || s.department?.id === filterDept;
    return matchSearch && matchDept;
  });

  if (loading) return (
    <div className="sd-loading"><div className="sd-loading-bar" /><span>Loading…</span></div>
  );

  return (
    <div className="sd-page">
      <div className="sd-header">
        <h1 className="sd-title">Staff Directory</h1>
        <p className="sd-sub">{staff.length} personnel</p>
      </div>

      <div className="sd-controls">
        <input className="sd-search" placeholder="Search name, email, skill, designation…"
          value={search} onChange={e => setSearch(e.target.value)} />
        {departments.length > 1 && (
          <select className="sd-filter" value={filterDept}
            onChange={e => setFilterDept(e.target.value)}>
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
        <div className={`sd-grid ${isPrivileged ? 'sd-grid-detail' : ''}`}>
          {filtered.map((s: any) => (
            <div key={s.id} className={`sd-card ${isPrivileged ? 'sd-card-detail' : ''}`}>
              {/* Avatar */}
              <div className="sd-card-top">
                {s.avatar_url ? (
                  <img src={s.avatar_url} alt={s.name} className="sd-avatar-img" />
                ) : (
                  <div className="sd-avatar">{inits(s.name || '')}</div>
                )}
                <div className="sd-card-name-block">
                  <div className="sd-card-name">{s.name || 'Unnamed'}</div>
                  {s.designation && <div className="sd-card-desig">{s.designation}</div>}
                  <div className="sd-card-email">{s.email}</div>
                </div>
              </div>

              {/* Role + org */}
              <div className="sd-card-meta">
                <span className="sd-role-badge">{fmt(s.role)}</span>
                {s.department?.name && <div className="sd-meta-line">🏛 {s.department.name}</div>}
                {s.division?.name   && <div className="sd-meta-line">▧ {s.division.name}</div>}
                {s.unit?.name       && <div className="sd-meta-line">▨ {s.unit.name}</div>}
                {s.staff_no         && <div className="sd-meta-line pf-mono">{s.staff_no}</div>}
              </div>

              {/* Privileged extra detail */}
              {isPrivileged && (
                <div className="sd-card-extra">
                  {(s.degree_level || s.qualification) && (
                    <div className="sd-extra-row">
                      <span className="sd-extra-label">Qualification</span>
                      <span className="sd-extra-value">
                        {s.degree_level && s.course_of_study
                          ? `${s.degree_level} ${s.course_of_study}`
                          : s.qualification || '—'}
                      </span>
                    </div>
                  )}
                  {s.skills?.length > 0 && (
                    <div className="sd-extra-row sd-extra-skills">
                      <span className="sd-extra-label">Skills</span>
                      <div className="sd-skills-wrap">
                        {s.skills.map((sk: string) => (
                          <span key={sk} className="sd-skill-chip">{sk}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {s.whatsapp && (
                    <div className="sd-extra-row">
                      <span className="sd-extra-label">WhatsApp</span>
                      <a href={`https://wa.me/${s.whatsapp.replace(/\D/g,'')}`}
                        target="_blank" rel="noreferrer" className="sd-wa-link">
                        💬 +{s.whatsapp}
                      </a>
                    </div>
                  )}
                  {s.bio && (
                    <div className="sd-extra-row">
                      <span className="sd-extra-label">Bio</span>
                      <span className="sd-extra-value sd-bio">{s.bio}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}