/*src/app/staff/directory/page.tsx*/
'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import './directory.css';

const initials = (name: string) =>
  name?.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase() || '??';

export default function StaffTriagePage() {
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [staff, setStaff] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [divisions, setDivisions] = useState<any[]>([]);
  const [units, setUnits] = useState<any[]>([]);
  const [saving, setSaving] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterScope, setFilterScope] = useState<'unassigned' | 'all'>('unassigned');

  useEffect(() => { loadPage(); }, []);

  const loadPage = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: prof } = await supabase
        .from('profiles')
        .select('id, role, department_id, division_id')
        .eq('id', user.id)
        .single();

      if (!prof) return;
      setProfile(prof);

      if (prof.role === 'DG' || prof.role === 'SUPER_ADMIN') {
        // DG sees all staff and all departments
        const [{ data: allStaff }, { data: depts }] = await Promise.all([
          supabase.from('profiles')
            .select('id, name, email, designation, role, department_id, division_id, unit_id, departments:departments!profiles_department_id_fkey(name)')
            .neq('id', prof.id)
            .order('name'),
          supabase.from('departments').select('id, name').order('name'),
        ]);
        setStaff(allStaff || []);
        setDepartments(depts || []);

      } else if (prof.role === 'DEPT_ADMIN') {
        // Director sees staff in their department + divisions + units
        const { data: dept } = await supabase
          .from('departments').select('id, name').eq('head_id', user.id).single();

        if (!dept) return;

        const [{ data: deptStaff }, { data: divs }, { data: unitRows }] = await Promise.all([
          supabase.from('profiles')
            .select('id, name, email, designation, role, department_id, division_id, unit_id, divisions:divisions!profiles_division_id_fkey(name), units:units!profiles_unit_id_fkey(name)')
            .eq('department_id', dept.id)
            .neq('id', prof.id)
            .order('name'),
          supabase.from('divisions').select('id, name').eq('department_id', dept.id).order('name'),
          supabase.from('units').select('id, name, division_id').eq('department_id', dept.id).order('name'),
        ]);
        setStaff(deptStaff || []);
        setDivisions(divs || []);
        setUnits(unitRows || []);

      } else if (prof.role === 'DIVISION_HEAD') {
        // Division head sees staff in their division + units
        const { data: div } = await supabase
          .from('divisions').select('id, name').eq('head_id', user.id).single();

        if (!div) return;

        const [{ data: divStaff }, { data: unitRows }] = await Promise.all([
          supabase.from('profiles')
            .select('id, name, email, designation, role, division_id, unit_id, units:units!profiles_unit_id_fkey(name)')
            .eq('division_id', div.id)
            .neq('id', prof.id)
            .order('name'),
          supabase.from('units').select('id, name').eq('division_id', div.id).order('name'),
        ]);
        setStaff(divStaff || []);
        setUnits(unitRows || []);
      }
    } finally {
      setLoading(false);
    }
  };

  const assignDepartment = async (staffId: string, deptId: string) => {
    setSaving(staffId);
    const { error } = await supabase
      .from('profiles')
      .update({ department_id: deptId || null, division_id: null, unit_id: null })
      .eq('id', staffId);
    if (!error) {
      setStaff(prev => prev.map(s =>
        s.id === staffId ? { ...s, department_id: deptId || null, division_id: null, unit_id: null } : s
      ));
    }
    setSaving(null);
  };

  const assignDivision = async (staffId: string, divId: string) => {
    setSaving(staffId);
    const div = divisions.find(d => d.id === divId);
    const { error } = await supabase
      .from('profiles')
      .update({ division_id: divId || null, unit_id: null })
      .eq('id', staffId);
    if (!error) {
      setStaff(prev => prev.map(s =>
        s.id === staffId ? { ...s, division_id: divId || null, unit_id: null, divisions: div ? { name: div.name } : null } : s
      ));
    }
    setSaving(null);
  };

  const assignUnit = async (staffId: string, unitId: string) => {
    setSaving(staffId);
    const unit = units.find(u => u.id === unitId);
    const { error } = await supabase
      .from('profiles')
      .update({ unit_id: unitId || null })
      .eq('id', staffId);
    if (!error) {
      setStaff(prev => prev.map(s =>
        s.id === staffId ? { ...s, unit_id: unitId || null, units: unit ? { name: unit.name } : null } : s
      ));
    }
    setSaving(null);
  };

  const isDG = profile?.role === 'DG' || profile?.role === 'SUPER_ADMIN';
  const isDeptAdmin = profile?.role === 'DEPT_ADMIN';
  const isDivHead = profile?.role === 'DIVISION_HEAD';

  const filtered = staff.filter(s => {
    const matchSearch = !search || s.name?.toLowerCase().includes(search.toLowerCase()) ||
      s.email?.toLowerCase().includes(search.toLowerCase());
    const matchScope = filterScope === 'all' || (
      isDG ? !s.department_id :
      isDeptAdmin ? !s.division_id :
      isDivHead ? !s.unit_id : true
    );
    return matchSearch && matchScope;
  });

  const scopeLabel = isDG ? 'Organisation-wide triage'
    : isDeptAdmin ? 'Department triage'
    : isDivHead ? 'Division triage' : 'Triage';

  const unassignedCount = staff.filter(s =>
    isDG ? !s.department_id :
    isDeptAdmin ? !s.division_id :
    isDivHead ? !s.unit_id : false
  ).length;

  if (loading) return (
    <div className="triage-loading">
      <div className="triage-loading-bar" />
      <span>Loading staff…</span>
    </div>
  );

  return (
    <div className="triage-page">
      <div className="triage-header">
        <div>
          <h1 className="triage-title">Staff Triage</h1>
          <p className="triage-sub">{scopeLabel}</p>
        </div>
        <div className="triage-summary">
          <div className="triage-summary-item">
            <div className="triage-summary-value">{staff.length}</div>
            <div className="triage-summary-label">Total staff</div>
          </div>
          <div className="triage-summary-item accent">
            <div className="triage-summary-value">{unassignedCount}</div>
            <div className="triage-summary-label">Unassigned</div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="triage-controls">
        <input
          className="triage-search"
          placeholder="Search by name or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="triage-filter-tabs">
          <button
            className={filterScope === 'unassigned' ? 'active' : ''}
            onClick={() => setFilterScope('unassigned')}
          >
            Unassigned {unassignedCount > 0 && <span className="triage-badge">{unassignedCount}</span>}
          </button>
          <button
            className={filterScope === 'all' ? 'active' : ''}
            onClick={() => setFilterScope('all')}
          >
            All Staff
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="triage-empty">
          <p>{filterScope === 'unassigned' ? '✓ All staff are assigned.' : 'No staff found.'}</p>
        </div>
      ) : (
        <div className="triage-list">
          {filtered.map((s) => {
            const isSaving = saving === s.id;
            const staffDivisions = isDeptAdmin
              ? divisions
              : isDivHead
              ? divisions
              : [];
            const staffUnits = s.division_id
              ? units.filter(u => u.division_id === s.division_id || !u.division_id)
              : units;

            return (
              <div key={s.id} className={`triage-row ${isSaving ? 'saving' : ''}`}>
                <div className="triage-row-left">
                  <div className="triage-avatar">{initials(s.name || '')}</div>
                  <div className="triage-info">
                    <div className="triage-name">{s.name || 'Unnamed'}</div>
                    <div className="triage-email">{s.email}</div>
                    {s.designation && <div className="triage-desig">{s.designation}</div>}
                  </div>
                </div>

                <div className="triage-row-right">
                  {/* DG: assign to department */}
                  {isDG && (
                    <div className="triage-assign-group">
                      <label>Department</label>
                      <select
                        className="triage-select"
                        value={s.department_id || ''}
                        onChange={(e) => assignDepartment(s.id, e.target.value)}
                        disabled={isSaving}
                      >
                        <option value="">— Unassigned —</option>
                        {departments.map((d: any) => (
                          <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* DEPT_ADMIN: assign to division */}
                  {isDeptAdmin && (
                    <div className="triage-assign-group">
                      <label>Division</label>
                      <select
                        className="triage-select"
                        value={s.division_id || ''}
                        onChange={(e) => assignDivision(s.id, e.target.value)}
                        disabled={isSaving}
                      >
                        <option value="">— Unassigned —</option>
                        {divisions.map((d: any) => (
                          <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* DEPT_ADMIN: also assign to unit if division chosen */}
                  {isDeptAdmin && s.division_id && (
                    <div className="triage-assign-group">
                      <label>Unit</label>
                      <select
                        className="triage-select"
                        value={s.unit_id || ''}
                        onChange={(e) => assignUnit(s.id, e.target.value)}
                        disabled={isSaving}
                      >
                        <option value="">— Unassigned —</option>
                        {units
                          .filter((u: any) => !u.division_id || u.division_id === s.division_id)
                          .map((u: any) => (
                            <option key={u.id} value={u.id}>{u.name}</option>
                          ))}
                      </select>
                    </div>
                  )}

                  {/* DIVISION_HEAD: assign to unit */}
                  {isDivHead && (
                    <div className="triage-assign-group">
                      <label>Unit</label>
                      <select
                        className="triage-select"
                        value={s.unit_id || ''}
                        onChange={(e) => assignUnit(s.id, e.target.value)}
                        disabled={isSaving}
                      >
                        <option value="">— Unassigned —</option>
                        {units.map((u: any) => (
                          <option key={u.id} value={u.id}>{u.name}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Current location chips */}
                  <div className="triage-chips">
                    {s.departments?.name && (
                      <span className="triage-chip">{s.departments.name}</span>
                    )}
                    {s.divisions?.name && (
                      <span className="triage-chip">{s.divisions.name}</span>
                    )}
                    {s.units?.name && (
                      <span className="triage-chip gold">{s.units.name}</span>
                    )}
                  </div>

                  {isSaving && <div className="triage-saving-indicator">Saving…</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}