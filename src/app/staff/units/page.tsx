/* src/app/staff/units/page.tsx */

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import './manage-units.css';

const initials = (name: string) =>
  name?.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase() || '??';

export default function ManageUnits() {
  const router = useRouter();
  const [units, setUnits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [scopeLabel, setScopeLabel] = useState('');

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showManageModal, setShowManageModal] = useState(false);
  const [selectedUnit, setSelectedUnit] = useState<any>(null);

  // Form state
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newDivisionId, setNewDivisionId] = useState('');
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');

  // Head search
  const [headSearch, setHeadSearch] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedHead, setSelectedHead] = useState<any>(null);
  const [searching, setSearching] = useState(false);

  // Division options (for create)
  const [divisions, setDivisions] = useState<any[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState('');

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

      // Determine scope and label
      if (prof.role === 'DEPT_ADMIN') {
        // Get dept via head_id
        const { data: dept } = await supabase
          .from('departments').select('id, name').eq('head_id', user.id).single();

        if (dept) {
          setScopeLabel(`Department of ${dept.name}`);
          // Get all divisions in dept for the create form
          const { data: divs } = await supabase
            .from('divisions').select('id, name').eq('department_id', dept.id).order('name');
          setDivisions(divs || []);
          await loadUnits({ departmentId: dept.id });
        }
      } else if (prof.role === 'DIVISION_HEAD') {
        const { data: div } = await supabase
          .from('divisions').select('id, name').eq('head_id', user.id).single();
        if (div) {
          setScopeLabel(div.name);
          setDivisions([div]);
          setNewDivisionId(div.id);
          await loadUnits({ divisionId: div.id });
        }
      } else {
        // SUPER_ADMIN / DG — show all, scoped by their dept if available
        if (prof.department_id) {
          const { data: divs } = await supabase
            .from('divisions').select('id, name').eq('department_id', prof.department_id).order('name');
          setDivisions(divs || []);
          await loadUnits({ departmentId: prof.department_id });
        } else {
          const { data: divs } = await supabase
            .from('divisions').select('id, name').order('name').limit(50);
          setDivisions(divs || []);
          await loadUnits({});
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const loadUnits = async ({ departmentId, divisionId }: { departmentId?: string; divisionId?: string }) => {
    let query = supabase
      .from('units')
      .select(`
        id, name, description, division_id, department_id,
        head:profiles!units_head_id_fkey(id, name, designation),
        division:divisions(name)
      `)
      .order('name', { ascending: true });

    if (divisionId) query = query.eq('division_id', divisionId);
    else if (departmentId) query = query.eq('department_id', departmentId);

    const { data, error: err } = await query;
    if (err) { console.error(err); setUnits([]); return; }

    // Get member counts
    const withCounts = await Promise.all((data || []).map(async (u: any) => {
      const { count } = await supabase
        .from('profiles').select('id', { count: 'exact', head: true }).eq('unit_id', u.id);
      const { count: taskCount } = await supabase
        .from('tasks').select('id', { count: 'exact', head: true })
        .in('project_id',
          (await supabase.from('projects').select('id').eq('unit_scope_id', u.id)).data?.map((p: any) => p.id) || []
        ).neq('status', 'COMPLETED');
      return { ...u, memberCount: count ?? 0, openTaskCount: taskCount ?? 0 };
    }));

    setUnits(withCounts);
  };

  // Scoped staff search
  useEffect(() => {
    const search = async () => {
      if (headSearch.length < 2 || !profile) { setSearchResults([]); return; }
      setSearching(true);

      let query = supabase
        .from('profiles')
        .select('id, name, designation, unit_id, units:units!profiles_unit_id_fkey(name)')
        .ilike('name', `%${headSearch}%`)
        .limit(10);

      if (profile.role === 'DIVISION_HEAD' && profile.division_id) {
        query = query.eq('division_id', profile.division_id);
      } else if (profile.department_id) {
        query = query.eq('department_id', profile.department_id);
      }

      const { data } = await query;
      setSearchResults(data || []);
      setSearching(false);
    };
    const t = setTimeout(search, 300);
    return () => clearTimeout(t);
  }, [headSearch, profile]);

  const resetForm = () => {
    setNewName(''); setNewDescription(''); setNewDivisionId(divisions[0]?.id || '');
    setEditName(''); setEditDescription('');
    setSelectedHead(null); setHeadSearch('');
    setSearchResults([]); setError(''); setConfirmDelete(false);
  };

  const handleCreate = async () => {
    if (!newName.trim()) { setError('Unit name is required.'); return; }
    setSubmitting(true); setError('');

    // Resolve department_id from chosen division
    const chosenDiv = divisions.find(d => d.id === newDivisionId);
    let deptId: string | null = null;
    if (newDivisionId) {
      const { data: divRow } = await supabase.from('divisions').select('department_id').eq('id', newDivisionId).single();
      deptId = divRow?.department_id || null;
    }

    const { data: unit, error: err } = await supabase
      .from('units')
      .insert({
        name: newName.trim(),
        description: newDescription.trim() || null,
        division_id: newDivisionId || null,
        department_id: deptId,
        head_id: selectedHead?.id || null,
      })
      .select()
      .single();

    if (err || !unit) { setError(err?.message || 'Failed to create unit.'); setSubmitting(false); return; }

    if (selectedHead?.id) {
      await supabase.from('profiles').update({
        role: 'UNIT_HEAD',
        unit_id: unit.id,
        division_id: newDivisionId || null,
        department_id: deptId,
      }).eq('id', selectedHead.id);
    }

    resetForm();
    setShowCreateModal(false);
    await loadPage();
    setSubmitting(false);
  };

  const handleUpdate = async () => {
    if (!selectedUnit || !editName.trim()) { setError('Name is required.'); return; }
    setSubmitting(true); setError('');

    const { error: err } = await supabase
      .from('units')
      .update({
        name: editName.trim(),
        description: editDescription.trim() || null,
        head_id: selectedHead?.id || selectedUnit.head?.id || null,
      })
      .eq('id', selectedUnit.id);

    if (err) { setError(err.message); setSubmitting(false); return; }

    if (selectedHead?.id) {
      await supabase.from('profiles').update({
        role: 'UNIT_HEAD',
        unit_id: selectedUnit.id,
      }).eq('id', selectedHead.id);
    }

    resetForm();
    setShowManageModal(false);
    await loadPage();
    setSubmitting(false);
  };

  const handleDelete = async () => {
    if (!selectedUnit) return;
    await supabase.from('units').delete().eq('id', selectedUnit.id);
    resetForm();
    setShowManageModal(false);
    await loadPage();
  };

  const openManage = (unit: any) => {
    setSelectedUnit(unit);
    setEditName(unit.name || '');
    setEditDescription(unit.description || '');
    setSelectedHead(unit.head?.id ? unit.head : null);
    setConfirmDelete(false);
    setError('');
    setShowManageModal(true);
  };

  const SearchDropdown = ({ onSelect }: { onSelect: (s: any) => void }) => (
    <>
      <input
        className="un-input"
        placeholder="Search by name…"
        value={headSearch}
        onChange={(e) => setHeadSearch(e.target.value)}
        autoComplete="off"
      />
      {headSearch.length >= 2 && (
        <div className="un-search-drop">
          {searching && <div className="un-search-empty">Searching…</div>}
          {!searching && searchResults.length === 0 && (
            <div className="un-search-empty">No staff found.</div>
          )}
          {searchResults.map((s: any) => (
            <div key={s.id} className="un-search-item" onClick={() => onSelect(s)}>
              <div className="un-avatar sm">{initials(s.name)}</div>
              <div className="un-search-info">
                <div className="un-search-name">{s.name}</div>
                <div className="un-search-role">
                  {s.designation || '—'}
                  {s.unit_id && s.units?.name && (
                    <span className="un-search-assigned"> · {s.units.name}</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );

  const SelectedHead = ({ head, onRemove }: { head: any; onRemove: () => void }) => (
    <div className="un-selected-head">
      <div className="un-avatar sm">{initials(head.name)}</div>
      <div className="un-selected-info">
        <div className="un-selected-name">{head.name}</div>
        <div className="un-selected-role">{head.designation || 'Staff Member'}</div>
      </div>
      <button className="un-remove-btn" onClick={onRemove}>✕</button>
    </div>
  );

  if (loading) return (
    <div className="un-loading">
      <div className="un-loading-bar" />
      <span>Loading units…</span>
    </div>
  );

  return (
    <div className="un-page">
      <div className="un-page-header">
        <div>
          <h1 className="un-page-title">Units</h1>
          {scopeLabel && <p className="un-page-sub">{scopeLabel}</p>}
        </div>
        <button className="un-btn-gold" onClick={() => { resetForm(); setShowCreateModal(true); }}>
          + New Unit
        </button>
      </div>

      {units.length === 0 ? (
        <div className="un-empty">
          <p>No units found in your scope. Create one to get started.</p>
        </div>
      ) : (
        <div className="un-grid">
          {units.map((unit) => (
            <div
              key={unit.id}
              className="un-card"
              onClick={() => router.push(`/staff/units/${unit.id}`)}
            >
              <div className="un-card-top">
                <div className="un-card-name">{unit.name}</div>
                <button
                  className="un-manage-btn"
                  onClick={(e) => { e.stopPropagation(); openManage(unit); }}
                >
                  Manage
                </button>
              </div>

              {unit.description && (
                <p className="un-card-desc">{unit.description}</p>
              )}

              <div className="un-card-meta">
                <div className="un-meta-item">
                  <span className="un-meta-label">Head</span>
                  <span className="un-meta-value">
                    {unit.head?.name || <span className="un-vacant">Vacant</span>}
                  </span>
                </div>
                {unit.division?.name && (
                  <div className="un-meta-item">
                    <span className="un-meta-label">Division</span>
                    <span className="un-meta-value">{unit.division.name}</span>
                  </div>
                )}
              </div>

              <div className="un-card-chips">
                <span className="un-chip">{unit.memberCount} staff</span>
                <span className="un-chip gold">{unit.openTaskCount} open tasks</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── CREATE MODAL ── */}
      {showCreateModal && (
        <div className="un-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="un-modal" onClick={(e) => e.stopPropagation()}>
            <div className="un-modal-header">
              <h2>New Unit</h2>
              <button className="un-modal-close" onClick={() => setShowCreateModal(false)}>✕</button>
            </div>

            {error && <div className="un-error">{error}</div>}

            <div className="un-form-group">
              <label>Unit Name *</label>
              <input className="un-input" placeholder="e.g. Ground Systems Unit"
                value={newName} onChange={(e) => setNewName(e.target.value)} />
            </div>

            <div className="un-form-group">
              <label>Description</label>
              <textarea className="un-input" rows={3}
                placeholder="Brief description of this unit's mandate…"
                value={newDescription} onChange={(e) => setNewDescription(e.target.value)} />
            </div>

            {divisions.length > 1 && (
              <div className="un-form-group">
                <label>Division</label>
                <select className="un-input" value={newDivisionId}
                  onChange={(e) => setNewDivisionId(e.target.value)}>
                  <option value="">Select division…</option>
                  {divisions.map((d: any) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="un-form-group" style={{ position: 'relative' }}>
              <label>Unit Head (optional)</label>
              {selectedHead
                ? <SelectedHead head={selectedHead} onRemove={() => setSelectedHead(null)} />
                : <SearchDropdown onSelect={(s) => { setSelectedHead(s); setHeadSearch(''); setSearchResults([]); }} />}
            </div>

            <div className="un-modal-actions">
              <button className="un-btn-outline" onClick={() => setShowCreateModal(false)}>Cancel</button>
              <button className="un-btn-gold" onClick={handleCreate} disabled={submitting}>
                {submitting ? 'Creating…' : 'Create Unit'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MANAGE MODAL ── */}
      {showManageModal && selectedUnit && (
        <div className="un-overlay" onClick={() => { setShowManageModal(false); resetForm(); }}>
          <div className="un-modal" onClick={(e) => e.stopPropagation()}>
            <div className="un-modal-header">
              <h2>Edit Unit</h2>
              <button className="un-modal-close" onClick={() => { setShowManageModal(false); resetForm(); }}>✕</button>
            </div>

            {error && <div className="un-error">{error}</div>}

            <div className="un-form-group">
              <label>Unit Name *</label>
              <input className="un-input" value={editName}
                onChange={(e) => setEditName(e.target.value)} />
            </div>

            <div className="un-form-group">
              <label>Description</label>
              <textarea className="un-input" rows={3} value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)} />
            </div>

            <div className="un-form-group" style={{ position: 'relative' }}>
              <label>Unit Head</label>
              {selectedHead
                ? <SelectedHead head={selectedHead} onRemove={() => setSelectedHead(null)} />
                : <SearchDropdown onSelect={(s) => { setSelectedHead(s); setHeadSearch(''); setSearchResults([]); }} />}
            </div>

            <div className="un-modal-actions un-modal-actions-split">
              <div>
                {!confirmDelete ? (
                  <button className="un-btn-danger-outline" onClick={() => setConfirmDelete(true)}>
                    🗑 Delete Unit
                  </button>
                ) : (
                  <div className="un-confirm-delete">
                    <span>Delete {selectedUnit.name}?</span>
                    <button className="un-btn-danger" onClick={handleDelete}>Yes, Delete</button>
                    <button className="un-btn-outline sm" onClick={() => setConfirmDelete(false)}>Cancel</button>
                  </div>
                )}
              </div>
              <div className="un-modal-actions-right">
                <button className="un-btn-outline" onClick={() => { setShowManageModal(false); resetForm(); }}>Cancel</button>
                <button className="un-btn-gold" onClick={handleUpdate} disabled={submitting}>
                  {submitting ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}