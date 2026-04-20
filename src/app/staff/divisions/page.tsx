// src/app/staff/divisions/page.tsx
'use client';

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import "./divisions.css";

export default function ManageDivisions() {
  const [profile, setProfile] = useState<any>(null);
  const [divisions, setDivisions] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [units, setUnits] = useState<any[]>([]);
  const [divisionStaff, setDivisionStaff] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formType, setFormType] = useState<'division' | 'department' | 'unit'>('division');
  const [form, setForm] = useState({ name: '', parent_id: '' });
  const [headSearch, setHeadSearch] = useState('');
  const [headResults, setHeadResults] = useState<any[]>([]);
  const [selectedHead, setSelectedHead] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<any>(null);
  const [selectedType, setSelectedType] = useState('');
  const [activeTab, setActiveTab] = useState<'structure' | 'staff'>('structure');

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: prof } = await supabase
        .from('profiles').select('*').eq('id', user.id).single();
      setProfile(prof);
      await fetchAll(prof);
    };
    load();
  }, []);

  const fetchAll = async (prof: any) => {
    if (prof?.role === 'SUPER_ADMIN') {
      // Super admin sees all HQ divisions and departments
      const { data: divs } = await supabase.from('divisions').select('*').eq('is_hq', true);
      const { data: depts } = await supabase.from('departments').select('*').eq('is_hq', true);
      await fetchHeadsAndUnits(divs || [], depts || []);

    } else if (prof?.role === 'CENTRE_ADMIN') {
      // Centre admin sees their centre's divisions and departments
      const { data: divs } = await supabase.from('divisions').select('*').eq('centre_id', prof.centre_id);
      const { data: depts } = await supabase.from('departments').select('*').eq('centre_id', prof.centre_id);
      await fetchHeadsAndUnits(divs || [], depts || []);

    } else if (prof?.role === 'DIVISION_HEAD' || prof?.role === 'DEPT_HEAD') {
      // Division/Dept head sees only their own units and staff
      const { data: myDiv } = await supabase
        .from('divisions').select('*').eq('head_id', prof.id).single();
      const { data: myDept } = await supabase
        .from('departments').select('*').eq('head_id', prof.id).single();

      const parentId = myDiv?.id || myDept?.id;
      const parentType = myDiv ? 'division' : 'department';

      if (parentId) {
        const { data: myUnits } = await supabase
          .from('units')
          .select('*')
          [parentType === 'division' ? 'eq' : 'eq']
          (parentType === 'division' ? 'division_id' : 'department_id', parentId);

        // Get unit heads
        const unitHeadIds = (myUnits || []).map((u: any) => u.head_id).filter(Boolean);
        let unitHeadsMap: any = {};
        if (unitHeadIds.length > 0) {
          const { data: heads } = await supabase
            .from('profiles').select('id, name, designation').in('id', unitHeadIds);
          (heads || []).forEach((h: any) => { unitHeadsMap[h.id] = h; });
        }

        const unitsWithHeads = (myUnits || []).map((u: any) => ({
          ...u,
          profiles: u.head_id ? unitHeadsMap[u.head_id] : null,
          divisions: myDiv ? { name: myDiv.name } : null,
          departments: myDept ? { name: myDept.name } : null,
        }));

        setUnits(unitsWithHeads);

        // Get staff in this division
        const unitIds = (myUnits || []).map((u: any) => u.id);
        const { data: staff } = await supabase
          .from('profiles')
          .select('id, name, designation, role, unit_id')
          .or(
            parentType === 'division'
              ? `division_id.eq.${parentId}`
              : `department_id.eq.${parentId}`
          );
        setDivisionStaff(staff || []);
      }

      setDivisions([]);
      setDepartments([]);
      setLoading(false);
      return;
    }
    setLoading(false);
  };

  const fetchHeadsAndUnits = async (divs: any[], depts: any[]) => {
    const headIds = [...divs, ...depts].map((d: any) => d.head_id).filter(Boolean);
    let headsMap: any = {};
    if (headIds.length > 0) {
      const { data: heads } = await supabase
        .from('profiles').select('id, name, designation').in('id', headIds);
      (heads || []).forEach((h: any) => { headsMap[h.id] = h; });
    }

    const divsWithHeads = divs.map((d: any) => ({ ...d, profiles: d.head_id ? headsMap[d.head_id] : null }));
    const deptsWithHeads = depts.map((d: any) => ({ ...d, profiles: d.head_id ? headsMap[d.head_id] : null }));

    const divIds = divs.map((d: any) => d.id);
    const deptIds = depts.map((d: any) => d.id);
    let unitsData: any[] = [];

    if (divIds.length > 0) {
      const { data: u1 } = await supabase.from('units').select('*').in('division_id', divIds);
      unitsData = [...unitsData, ...(u1 || [])];
    }
    if (deptIds.length > 0) {
      const { data: u2 } = await supabase.from('units').select('*').in('department_id', deptIds);
      unitsData = [...unitsData, ...(u2 || [])];
    }

    const unitHeadIds = unitsData.map((u: any) => u.head_id).filter(Boolean);
    let unitHeadsMap: any = {};
    if (unitHeadIds.length > 0) {
      const { data: uHeads } = await supabase
        .from('profiles').select('id, name, designation').in('id', unitHeadIds);
      (uHeads || []).forEach((h: any) => { unitHeadsMap[h.id] = h; });
    }

    const unitsWithHeads = unitsData.map((u: any) => ({
      ...u,
      profiles: u.head_id ? unitHeadsMap[u.head_id] : null,
      divisions: divs.find((d: any) => d.id === u.division_id) || null,
      departments: depts.find((d: any) => d.id === u.department_id) || null,
    }));

    setDivisions(divsWithHeads);
    setDepartments(deptsWithHeads);
    setUnits(unitsWithHeads);
    setLoading(false);
  };

  useEffect(() => {
    const search = async () => {
      if (headSearch.length < 2) { setHeadResults([]); return; }
      const { data } = await supabase
        .from('profiles').select('id, name, designation, role')
        .ilike('name', `%${headSearch}%`).limit(8);
      setHeadResults(data || []);
    };
    const t = setTimeout(search, 300);
    return () => clearTimeout(t);
  }, [headSearch]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    const isHq = profile?.role === 'SUPER_ADMIN';
    const centreId = profile?.centre_id;

    if (formType === 'division') {
      const { error: err } = await supabase.from('divisions').insert({
        name: form.name, is_hq: isHq,
        centre_id: isHq ? null : centreId,
        head_id: selectedHead?.id || null,
      });
      if (err) { setError(err.message); setSubmitting(false); return; }
      if (selectedHead?.role !== 'SUPER_ADMIN') {
        await supabase.from('profiles').update({ role: 'DIVISION_HEAD' }).eq('id', selectedHead.id);
      }
    } else if (formType === 'department') {
      const { error: err } = await supabase.from('departments').insert({
        name: form.name, is_hq: isHq,
        centre_id: isHq ? null : centreId,
        head_id: selectedHead?.id || null,
      });
      if (err) { setError(err.message); setSubmitting(false); return; }
      if (selectedHead?.role !== 'SUPER_ADMIN') {
        await supabase.from('profiles').update({ role: 'DEPT_HEAD' }).eq('id', selectedHead.id);
      }
    } else if (formType === 'unit') {
      const isDivParent = divisions.find((d: any) => d.id === form.parent_id);
      const { error: err } = await supabase.from('units').insert({
        name: form.name,
        division_id: isDivParent ? form.parent_id : null,
        department_id: !isDivParent ? form.parent_id : null,
        head_id: selectedHead?.id || null,
      });
      if (err) { setError(err.message); setSubmitting(false); return; }
      if (selectedHead?.role !== 'SUPER_ADMIN') {
        await supabase.from('profiles').update({ role: 'UNIT_HEAD' }).eq('id', selectedHead.id);
      }
    }

    setForm({ name: '', parent_id: '' });
    setSelectedHead(null);
    setHeadSearch('');
    setShowForm(false);
    await fetchAll(profile);
    setSubmitting(false);
  };

  const isDivisionOrDeptHead = profile?.role === 'DIVISION_HEAD' || profile?.role === 'DEPT_HEAD';
  const isUnitHead = profile?.role === 'UNIT_HEAD';
  const canCreate = ['SUPER_ADMIN', 'CENTRE_ADMIN', 'DIVISION_HEAD', 'DEPT_HEAD'].includes(profile?.role);

  const getAvailableForms = () => {
    if (profile?.role === 'SUPER_ADMIN' || profile?.role === 'CENTRE_ADMIN') return ['division', 'department', 'unit'];
    if (isDivisionOrDeptHead) return ['unit'];
    return [];
  };

  const pageTitle = isDivisionOrDeptHead ? 'Manage Units' : isUnitHead ? 'My Unit' : 'Manage Divisions';

  return (
    <div className="divisions-page">
      <div className="page-header">
        <div>
          <h1>{pageTitle}</h1>
          <p>
            {profile?.role === 'SUPER_ADMIN' ? 'Divisions, departments and units across HQ' :
             profile?.role === 'CENTRE_ADMIN' ? 'Divisions and departments in your centre' :
             isDivisionOrDeptHead ? 'Units under your division and your staff' :
             'Your unit and team'}
          </p>
        </div>
        {canCreate && (
          <button className="btn" onClick={() => setShowForm(!showForm)}>
            {showForm ? 'Cancel' : isDivisionOrDeptHead ? '+ Create Unit' : '+ Create New'}
          </button>
        )}
      </div>

      {/* Tabs for division/dept heads */}
      {isDivisionOrDeptHead && (
        <div className="div-tabs">
          <button className={`div-tab ${activeTab === 'structure' ? 'active' : ''}`}
            onClick={() => setActiveTab('structure')}>Units</button>
          <button className={`div-tab ${activeTab === 'staff' ? 'active' : ''}`}
            onClick={() => setActiveTab('staff')}>Staff ({divisionStaff.length})</button>
        </div>
      )}

      {showForm && (
        <div className="form-card">
          {getAvailableForms().length > 1 && (
            <div className="type-toggle" style={{ marginBottom: 20 }}>
              {getAvailableForms().map((t) => (
                <button key={t} type="button"
                  className={`type-btn ${formType === t ? 'active' : ''}`}
                  onClick={() => setFormType(t as any)}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          )}

          <form onSubmit={handleCreate}>
            <div className="form-group">
              <label>{isDivisionOrDeptHead ? 'Unit' : formType.charAt(0).toUpperCase() + formType.slice(1)} Name</label>
              <input type="text" className="input-field"
                placeholder={isDivisionOrDeptHead ? 'e.g. Ground Operations Unit' :
                  formType === 'division' ? 'e.g. Engineering Division' :
                  formType === 'department' ? 'e.g. Finance Department' : 'e.g. Ground Operations Unit'}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>

            {formType === 'unit' && !isDivisionOrDeptHead && (
              <div className="form-group">
                <label>Parent Division or Department</label>
                <select className="input-field" value={form.parent_id}
                  onChange={(e) => setForm({ ...form, parent_id: e.target.value })} required>
                  <option value="">— Select Parent —</option>
                  {divisions.length > 0 && <optgroup label="Divisions">
                    {divisions.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </optgroup>}
                  {departments.length > 0 && <optgroup label="Departments">
                    {departments.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </optgroup>}
                </select>
              </div>
            )}

            <div className="form-group">
              <label>Assign Head (optional)</label>
              {selectedHead ? (
                <div className="selected-head">
                  <div className="selected-head-info">
                    <div className="search-avatar">{selectedHead.name.slice(0, 2).toUpperCase()}</div>
                    <div>
                      <div className="search-name">{selectedHead.name}</div>
                      <div className="search-designation">{selectedHead.designation}</div>
                    </div>
                  </div>
                  <button type="button" className="remove-btn"
                    onClick={() => { setSelectedHead(null); setHeadSearch(''); }}>✕</button>
                </div>
              ) : (
                <div className="search-wrapper">
                  <input type="text" className="input-field" placeholder="Search by name..."
                    value={headSearch} onChange={(e) => setHeadSearch(e.target.value)} />
                  {headResults.length > 0 && (
                    <div className="search-results">
                      {headResults.map((s: any) => (
                        <div key={s.id} className="search-item"
                          onClick={() => { setSelectedHead(s); setHeadSearch(''); setHeadResults([]); }}>
                          <div className="search-avatar">{s.name.slice(0, 2).toUpperCase()}</div>
                          <div>
                            <div className="search-name">{s.name}</div>
                            <div className="search-designation">{s.designation}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {error && <p className="error">{error}</p>}
            <button type="submit" className="btn" disabled={submitting}>
              {submitting ? 'Creating...' : `Create ${isDivisionOrDeptHead ? 'Unit' : formType.charAt(0).toUpperCase() + formType.slice(1)}`}
            </button>
          </form>
        </div>
      )}

      {loading ? <p className="loading">Loading...</p> : (
        <>
          {/* Structure tab */}
          {activeTab === 'structure' && (
            <div className="divisions-sections">
              {!isDivisionOrDeptHead && divisions.length > 0 && (
                <div className="section">
                  <h2 className="section-heading">Divisions</h2>
                  <div className="cards-grid">
                    {divisions.map((d: any) => (
                      <div key={d.id} className="div-card"
                        onClick={() => { setSelected(d); setSelectedType('division'); }}>
                        <div className="div-icon">DV</div>
                        <div className="div-info">
                          <div className="div-name">{d.name}</div>
                          <div className="div-head">{d.profiles?.name ? `Head: ${d.profiles.name}` : 'No head assigned'}</div>
                          <div className="div-units">{units.filter((u: any) => u.division_id === d.id).length} units</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!isDivisionOrDeptHead && departments.length > 0 && (
                <div className="section">
                  <h2 className="section-heading">Departments</h2>
                  <div className="cards-grid">
                    {departments.map((d: any) => (
                      <div key={d.id} className="div-card dept"
                        onClick={() => { setSelected(d); setSelectedType('department'); }}>
                        <div className="div-icon dept-icon">DP</div>
                        <div className="div-info">
                          <div className="div-name">{d.name}</div>
                          <div className="div-head">{d.profiles?.name ? `Head: ${d.profiles.name}` : 'No head assigned'}</div>
                          <div className="div-units">{units.filter((u: any) => u.department_id === d.id).length} units</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {units.length > 0 && (
                <div className="section">
                  <h2 className="section-heading">Units</h2>
                  <div className="cards-grid">
                    {units.map((u: any) => (
                      <div key={u.id} className="div-card unit"
                        onClick={() => { setSelected(u); setSelectedType('unit'); }}>
                        <div className="div-icon unit-icon">UN</div>
                        <div className="div-info">
                          <div className="div-name">{u.name}</div>
                          <div className="div-head">{u.profiles?.name ? `Head: ${u.profiles.name}` : 'No head assigned'}</div>
                          <div className="div-units">Under: {u.divisions?.name || u.departments?.name || '—'}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {divisions.length === 0 && departments.length === 0 && units.length === 0 && (
                <div className="empty-state">
                  <p>{isDivisionOrDeptHead ? 'No units created yet. Click "+ Create Unit" to get started.' : 'No divisions, departments or units created yet.'}</p>
                </div>
              )}
            </div>
          )}

          {/* Staff tab for division/dept heads */}
          {activeTab === 'staff' && isDivisionOrDeptHead && (
            <div className="staff-section">
              {divisionStaff.length === 0 ? (
                <div className="empty-state"><p>No staff assigned to your division yet.</p></div>
              ) : (
                <div className="staff-list">
                  {divisionStaff.map((s: any) => (
                    <div key={s.id} className="staff-row">
                      <div className="staff-avatar-sm">{s.name?.slice(0, 2).toUpperCase()}</div>
                      <div className="staff-row-info">
                        <div className="staff-row-name">{s.name}</div>
                        <div className="staff-row-meta">{s.designation || 'No designation'} · {s.role}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {selected && (
        <div className="modal-overlay" onClick={() => setSelected(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{selected.name}</h2>
              <button className="modal-close" onClick={() => setSelected(null)}>✕</button>
            </div>
            <div className="modal-fields">
              <div className="modal-field">
                <span className="modal-label">Type</span>
                <span className="modal-value">{selectedType.charAt(0).toUpperCase() + selectedType.slice(1)}</span>
              </div>
              <div className="modal-field">
                <span className="modal-label">Head</span>
                <span className="modal-value">{selected.profiles?.name || 'Not assigned'}</span>
              </div>
              {selectedType !== 'unit' && (
                <div className="modal-field">
                  <span className="modal-label">Units</span>
                  <span className="modal-value">
                    {units.filter((u: any) =>
                      selectedType === 'division' ? u.division_id === selected.id : u.department_id === selected.id
                    ).length} units
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}