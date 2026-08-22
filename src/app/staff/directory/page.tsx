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
        .select('id, role, department_id, division_id, unit_id')
        .eq('id', user.id)
        .single();

      if (!prof) return;
      setProfile(prof);

      // 1. DIRECTOR GENERAL / SUPER ADMIN
      // Sees all created Departments, Divisions, and Units across the organization
      if (prof.role === 'DG' || prof.role === 'SUPER_ADMIN') {
        const [{ data: allStaff }, { data: depts }, { data: divs }, { data: unitRows }] = await Promise.all([
          supabase.from('profiles')
            .select('id, name, email, designation, role, department_id, division_id, unit_id, departments:departments!profiles_department_id_fkey(name), divisions:divisions!profiles_division_id_fkey(name), units:units!profiles_unit_id_fkey(name)')
            .neq('id', prof.id)
            .order('name'),
          supabase.from('departments').select('id, name').order('name'),
          supabase.from('divisions').select('id, name, department_id').order('name'),
          supabase.from('units').select('id, name, division_id, department_id').order('name'),
        ]);
        setStaff(allStaff || []);
        setDepartments(depts || []);
        setDivisions(divs || []);
        setUnits(unitRows || []);

      // 2. DEPARTMENT DIRECTOR (DEPT_ADMIN)
      // Only sees Divisions created under their specific Department
      } else if (prof.role === 'DEPT_ADMIN') {
        const { data: dept } = await supabase
          .from('departments').select('id, name').eq('head_id', user.id).single();

        const activeDeptId = dept?.id || prof.department_id;
        if (!activeDeptId) return;

        const [{ data: deptStaff }, { data: depts }, { data: divs }, { data: unitRows }] = await Promise.all([
          supabase.from('profiles')
            .select('id, name, email, designation, role, department_id, division_id, unit_id, departments:departments!profiles_department_id_fkey(name), divisions:divisions!profiles_division_id_fkey(name), units:units!profiles_unit_id_fkey(name)')
            .neq('id', prof.id)
            .order('name'),
          supabase.from('departments').select('id, name').order('name'),
          // Only fetch divisions explicitly created under this department
          supabase.from('divisions').select('id, name, department_id').eq('department_id', activeDeptId).order('name'),
          // Only fetch units under this department's created divisions
          supabase.from('units').select('id, name, division_id, department_id').eq('department_id', activeDeptId).order('name'),
        ]);

        setStaff(deptStaff || []);
        setDepartments(depts || []);
        setDivisions(divs || []);
        setUnits(unitRows || []);

      // 3. DIVISION HEAD
      // Only sees Units created under their specific Division
      } else if (prof.role === 'DIVISION_HEAD') {
        const { data: div } = await supabase
          .from('divisions').select('id, name, department_id').eq('head_id', user.id).single();

        const activeDivId = div?.id || prof.division_id;
        const activeDeptId = div?.department_id || prof.department_id;

        if (!activeDivId) return;

        const [{ data: scopedStaff }, { data: unitRows }] = await Promise.all([
          supabase.from('profiles')
            .select('id, name, email, designation, role, department_id, division_id, unit_id, departments:departments!profiles_department_id_fkey(name), divisions:divisions!profiles_division_id_fkey(name), units:units!profiles_unit_id_fkey(name)')
            .eq('department_id', activeDeptId)
            .neq('id', prof.id)
            .order('name'),
          // Only fetch units explicitly created under this specific division
          supabase.from('units').select('id, name, division_id, department_id').eq('division_id', activeDivId).order('name'),
        ]);

        setStaff(scopedStaff || []);
        setDivisions(div ? [div] : []);
        setUnits(unitRows || []);

      // 4. UNIT HEAD
      // Only manages staff within their created Unit
      } else if (prof.role === 'UNIT_HEAD') {
        const { data: unit } = await supabase
          .from('units').select('id, name, division_id, department_id').eq('head_id', user.id).single();

        const activeDivId = unit?.division_id || prof.division_id;
        if (!activeDivId) return;

        const { data: scopedStaff } = await supabase
          .from('profiles')
          .select('id, name, email, designation, role, department_id, division_id, unit_id, departments:departments!profiles_department_id_fkey(name), divisions:divisions!profiles_division_id_fkey(name), units:units!profiles_unit_id_fkey(name)')
          .eq('division_id', activeDivId)
          .neq('id', prof.id)
          .order('name');

        setStaff(scopedStaff || []);
        setUnits(unit ? [unit] : []);
      }
    } finally {
      setLoading(false);
    }
  };

  const assignDepartment = async (staffId: string, deptId: string) => {
    setSaving(staffId);
    const dept = departments.find(d => d.id === deptId);
    const updates = { department_id: deptId || null, division_id: null, unit_id: null };

    const { error } = await supabase.from('profiles').update(updates).eq('id', staffId);

    if (!error) {
      setStaff(prev => prev.map(s => s.id === staffId ? {
        ...s,
        ...updates,
        departments: dept ? { name: dept.name } : null,
        divisions: null,
        units: null
      } : s));
    }
    setSaving(null);
  };

  const assignDivision = async (staffId: string, divId: string) => {
    setSaving(staffId);
    const div = divisions.find(d => d.id === divId);
    const updates = { division_id: divId || null, unit_id: null };

    const { error } = await supabase.from('profiles').update(updates).eq('id', staffId);

    if (!error) {
      setStaff(prev => prev.map(s => s.id === staffId ? {
        ...s,
        ...updates,
        divisions: div ? { name: div.name } : null,
        units: null
      } : s));
    }
    setSaving(null);
  };

  const assignUnit = async (staffId: string, unitId: string) => {
    setSaving(staffId);
    const unit = units.find(u => u.id === unitId);
    const updates = { unit_id: unitId || null };

    const { error } = await supabase.from('profiles').update(updates).eq('id', staffId);

    if (!error) {
      setStaff(prev => prev.map(s => s.id === staffId ? {
        ...s,
        ...updates,
        units: unit ? { name: unit.name } : null
      } : s));
    }
    setSaving(null);
  };

  const isDG = profile?.role === 'DG' || profile?.role === 'SUPER_ADMIN';
  const isDeptAdmin = profile?.role === 'DEPT_ADMIN';
  const isDivHead = profile?.role === 'DIVISION_HEAD';
  const isUnitHead = profile?.role === 'UNIT_HEAD';

  const filtered = staff.filter(s => {
    const matchSearch = !search || s.name?.toLowerCase().includes(search.toLowerCase()) ||
      s.email?.toLowerCase().includes(search.toLowerCase());
    const matchScope = filterScope === 'all' || (
      isDG || isDeptAdmin ? !s.department_id :
      isDivHead ? !s.division_id :
      isUnitHead ? !s.unit_id : true
    );
    return matchSearch && matchScope;
  });

  const scopeLabel = isDG ? 'Organisation-wide Triage'
    : isDeptAdmin ? 'Department Triage'
    : isDivHead ? 'Division Triage'
    : isUnitHead ? 'Unit Triage' : 'Triage';

  const unassignedCount = staff.filter(s =>
    isDG || isDeptAdmin ? !s.department_id :
    isDivHead ? !s.division_id :
    isUnitHead ? !s.unit_id : false
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
            const availableDivisions = divisions.filter((d: any) => d.department_id === s.department_id);
            const availableUnits = units.filter((u: any) => u.division_id === s.division_id);

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
                  {/* DEPARTMENT SELECTOR: Only if created departments exist */}
                  {(isDG || isDeptAdmin) && departments.length > 0 && (
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

                  {/* DIVISION SELECTOR: Only if created divisions exist under this department */}
                  {(isDeptAdmin || isDivHead) && s.department_id && availableDivisions.length > 0 && (
                    <div className="triage-assign-group">
                      <label>Division</label>
                      <select
                        className="triage-select"
                        value={s.division_id || ''}
                        onChange={(e) => assignDivision(s.id, e.target.value)}
                        disabled={isSaving}
                      >
                        <option value="">— Unassigned —</option>
                        {availableDivisions.map((d: any) => (
                          <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* UNIT SELECTOR: Only if created units exist under this division */}
                  {(isDivHead || isUnitHead || isDeptAdmin) && s.division_id && availableUnits.length > 0 && (
                    <div className="triage-assign-group">
                      <label>Unit</label>
                      <select
                        className="triage-select"
                        value={s.unit_id || ''}
                        onChange={(e) => assignUnit(s.id, e.target.value)}
                        disabled={isSaving}
                      >
                        <option value="">— Unassigned —</option>
                        {availableUnits.map((u: any) => (
                          <option key={u.id} value={u.id}>{u.name}</option>
                        ))}
                      </select>
                    </div>
                  )}

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