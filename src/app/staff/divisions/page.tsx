/* src/app/staff/divisions/page.tsx */

'use client';

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import "./divisions.css";

const initials = (name: string) =>
  name?.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase() || '??';

export default function ManageDivisions() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [myDept, setMyDept] = useState<any>(null);
  const [divisions, setDivisions] = useState<any[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string>('');

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showManageModal, setShowManageModal] = useState(false);
  const [selectedDivision, setSelectedDivision] = useState<any>(null);

  const [newName, setNewName] = useState('');
  const [newCode, setNewCode] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [editName, setEditName] = useState('');
  const [editCode, setEditCode] = useState('');
  const [editDescription, setEditDescription] = useState('');

  const [headSearch, setHeadSearch] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedHead, setSelectedHead] = useState<any>(null);
  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { loadPage(); }, []);

  const loadPage = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setCurrentUserId(user.id);

      const { data: profile } = await supabase
        .from('profiles')
        .select('id, role, department_id')
        .eq('id', user.id)
        .single();

      if (!profile) return;

      // Find dept: DEPT_ADMIN is head_id, others use department_id on profile
      let dept: any = null;
      if (profile.role === 'DEPT_ADMIN') {
        const { data } = await supabase
          .from('departments')
          .select('*')
          .eq('head_id', user.id)
          .single();
        dept = data;
      } else if (profile.department_id) {
        const { data } = await supabase
          .from('departments')
          .select('*')
          .eq('id', profile.department_id)
          .single();
        dept = data;
      }

      if (!dept) return;
      setMyDept(dept);

      await loadDivisions(dept.id);
    } finally {
      setLoading(false);
    }
  };

  const loadDivisions = async (deptId: string) => {
    const { data: divs } = await supabase
      .from('divisions')
      .select(`
        id, name, code, description, department_id,
        head:profiles!divisions_head_id_fkey(id, name, designation)
      `)
      .eq('department_id', deptId)
      .order('name', { ascending: true });

    if (!divs) { setDivisions([]); return; }

    // Get staff counts per division
    const withCounts = await Promise.all(divs.map(async (d: any) => {
      const { count } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('division_id', d.id);
      const { count: unitCount } = await supabase
        .from('units')
        .select('id', { count: 'exact', head: true })
        .eq('division_id', d.id);
      const { count: projectCount } = await supabase
        .from('projects')
        .select('id', { count: 'exact', head: true })
        .eq('div_scope_id', d.id);
      return { ...d, staffCount: count ?? 0, unitCount: unitCount ?? 0, projectCount: projectCount ?? 0 };
    }));

    setDivisions(withCounts);
  };

  // Staff search scoped to department
  useEffect(() => {
    const search = async () => {
      if (headSearch.length < 2 || !myDept?.id) { setSearchResults([]); return; }
      setSearching(true);
      const { data } = await supabase
        .from('profiles')
        .select('id, name, designation, division_id, divisions:divisions!profiles_division_id_fkey(name)')
        .ilike('name', `%${headSearch}%`)
        .eq('department_id', myDept.id)
        .limit(10);
      setSearchResults(data || []);
      setSearching(false);
    };
    const t = setTimeout(search, 300);
    return () => clearTimeout(t);
  }, [headSearch, myDept]);

  const handleSelectHead = (staff: any) => {
    setSelectedHead(staff);
    setHeadSearch('');
    setSearchResults([]);
  };

  const resetForm = () => {
    setNewName(''); setNewCode(''); setNewDescription('');
    setEditName(''); setEditCode(''); setEditDescription('');
    setSelectedHead(null); setHeadSearch('');
    setSearchResults([]); setError('');
    setConfirmDelete(false);
  };

  const handleCreate = async () => {
    if (!newName.trim() || !myDept) { setError('Division name is required.'); return; }
    setSubmitting(true);
    setError('');

    const { data: division, error: err } = await supabase
      .from('divisions')
      .insert({
        name: newName.trim(),
        code: newCode.trim() || null,
        description: newDescription.trim() || null,
        department_id: myDept.id,
        head_id: selectedHead?.id || null,
      })
      .select()
      .single();

    if (err || !division) { setError(err?.message || 'Failed to create.'); setSubmitting(false); return; }

    if (selectedHead?.id) {
      await supabase.from('profiles').update({
        role: 'DIVISION_HEAD',
        division_id: division.id,
        department_id: myDept.id,
      }).eq('id', selectedHead.id);
    }

    resetForm();
    setShowCreateModal(false);
    await loadDivisions(myDept.id);
    setSubmitting(false);
  };

  const handleUpdate = async () => {
    if (!selectedDivision || !editName.trim()) { setError('Name is required.'); return; }
    setSubmitting(true);
    setError('');

    const { error: err } = await supabase
      .from('divisions')
      .update({
        name: editName.trim(),
        code: editCode.trim() || null,
        description: editDescription.trim() || null,
        head_id: selectedHead?.id || selectedDivision.head?.id || null,
      })
      .eq('id', selectedDivision.id);

    if (err) { setError(err.message); setSubmitting(false); return; }

    if (selectedHead?.id) {
      await supabase.from('profiles').update({
        role: 'DIVISION_HEAD',
        division_id: selectedDivision.id,
        department_id: myDept.id,
      }).eq('id', selectedHead.id);
    }

    resetForm();
    setShowManageModal(false);
    await loadDivisions(myDept.id);
    setSubmitting(false);
  };

  const handleDelete = async () => {
    if (!selectedDivision) return;
    await supabase.from('divisions').delete().eq('id', selectedDivision.id);
    resetForm();
    setShowManageModal(false);
    await loadDivisions(myDept.id);
  };

  const openManage = (div: any) => {
    setSelectedDivision(div);
    setEditName(div.name || '');
    setEditCode(div.code || '');
    setEditDescription(div.description || '');
    setSelectedHead(div.head?.id ? div.head : null);
    setConfirmDelete(false);
    setError('');
    setShowManageModal(true);
  };

  const SearchDropdown = ({ onSelect }: { onSelect: (s: any) => void }) => (
    <>
      <input
        className="div-input"
        placeholder="Search by name…"
        value={headSearch}
        onChange={(e) => setHeadSearch(e.target.value)}
        autoComplete="off"
      />
      {headSearch.length >= 2 && (
        <div className="div-search-drop">
          {searching && <div className="div-search-empty">Searching…</div>}
          {!searching && searchResults.length === 0 && (
            <div className="div-search-empty">No staff found in this department.</div>
          )}
          {searchResults.map((s: any) => (
            <div key={s.id} className="div-search-item" onClick={() => onSelect(s)}>
              <div className="div-avatar sm">{initials(s.name)}</div>
              <div className="div-search-info">
                <div className="div-search-name">{s.name}</div>
                <div className="div-search-role">
                  {s.designation || '—'}
                  {s.division_id && s.divisions?.name && (
                    <span className="div-search-assigned"> · Currently in {s.divisions.name}</span>
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
    <div className="div-selected-head">
      <div className="div-avatar sm">{initials(head.name)}</div>
      <div className="div-selected-info">
        <div className="div-selected-name">{head.name}</div>
        <div className="div-selected-role">{head.designation || 'Staff Member'}</div>
      </div>
      <button className="div-remove-btn" onClick={onRemove}>✕</button>
    </div>
  );

  if (loading) return (
    <div className="div-loading">
      <div className="div-loading-bar" />
      <span>Loading divisions…</span>
    </div>
  );

  return (
    <div className="div-page">
      {/* Header */}
      <div className="div-page-header">
        <div>
          <h1 className="div-page-title">Divisions</h1>
          <p className="div-page-sub">Department of {myDept?.name || '…'}</p>
        </div>
        <button className="div-btn-gold" onClick={() => { resetForm(); setShowCreateModal(true); }}>
          + New Division
        </button>
      </div>

      {/* Grid */}
      {divisions.length === 0 ? (
        <div className="div-empty">
          <p>No divisions yet. Create one to get started.</p>
        </div>
      ) : (
        <div className="div-grid">
          {divisions.map((div) => (
            <div
              key={div.id}
              className="div-card"
              onClick={() => router.push(`/staff/divisions/${div.id}`)}
            >
              <div className="div-card-top">
                <div className="div-card-left">
                  {div.code && <div className="div-code-tag">{div.code}</div>}
                  <div className="div-card-name">{div.name}</div>
                </div>
                <button
                  className="div-manage-btn"
                  onClick={(e) => { e.stopPropagation(); openManage(div); }}
                >
                  Manage
                </button>
              </div>

              {div.description && (
                <p className="div-card-desc">{div.description}</p>
              )}

              <div className="div-card-meta">
                <div className="div-meta-row">
                  <div className="div-meta-item">
                    <span className="div-meta-label">Head</span>
                    <span className="div-meta-value">
                      {div.head?.name || <span className="div-vacant">Vacant</span>}
                    </span>
                  </div>
                </div>
              </div>

              <div className="div-card-chips">
                <span className="div-chip">{div.staffCount} staff</span>
                <span className="div-chip">{div.unitCount} units</span>
                <span className="div-chip gold">{div.projectCount} projects</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── CREATE MODAL ── */}
      {showCreateModal && (
        <div className="div-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="div-modal" onClick={(e) => e.stopPropagation()}>
            <div className="div-modal-header">
              <h2>New Division</h2>
              <button className="div-modal-close" onClick={() => setShowCreateModal(false)}>✕</button>
            </div>

            {error && <div className="div-error">{error}</div>}

            <div className="div-form-group">
              <label>Division Name *</label>
              <input className="div-input" placeholder="e.g. Space Hardware Architecture"
                value={newName} onChange={(e) => setNewName(e.target.value)} />
            </div>

            <div className="div-form-group">
              <label>Division Code</label>
              <input className="div-input" placeholder="e.g. SHAD"
                value={newCode} onChange={(e) => setNewCode(e.target.value)} />
            </div>

            <div className="div-form-group">
              <label>Description</label>
              <textarea className="div-input" rows={3} placeholder="Brief description of this division's mandate…"
                value={newDescription} onChange={(e) => setNewDescription(e.target.value)} />
            </div>

            <div className="div-form-group" style={{ position: 'relative' }}>
              <label>Division Head (optional)</label>
              {selectedHead
                ? <SelectedHead head={selectedHead} onRemove={() => setSelectedHead(null)} />
                : <SearchDropdown onSelect={handleSelectHead} />}
            </div>

            <div className="div-modal-actions">
              <button className="div-btn-outline" onClick={() => setShowCreateModal(false)}>Cancel</button>
              <button className="div-btn-gold" onClick={handleCreate} disabled={submitting}>
                {submitting ? 'Creating…' : 'Create Division'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MANAGE MODAL ── */}
      {showManageModal && selectedDivision && (
        <div className="div-overlay" onClick={() => { setShowManageModal(false); resetForm(); }}>
          <div className="div-modal" onClick={(e) => e.stopPropagation()}>
            <div className="div-modal-header">
              <h2>Edit Division</h2>
              <button className="div-modal-close" onClick={() => { setShowManageModal(false); resetForm(); }}>✕</button>
            </div>

            {error && <div className="div-error">{error}</div>}

            <div className="div-form-group">
              <label>Division Name *</label>
              <input className="div-input" value={editName}
                onChange={(e) => setEditName(e.target.value)} />
            </div>

            <div className="div-form-group">
              <label>Division Code</label>
              <input className="div-input" value={editCode}
                onChange={(e) => setEditCode(e.target.value)} />
            </div>

            <div className="div-form-group">
              <label>Description</label>
              <textarea className="div-input" rows={3} value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)} />
            </div>

            <div className="div-form-group" style={{ position: 'relative' }}>
              <label>Division Head</label>
              {selectedHead
                ? <SelectedHead head={selectedHead} onRemove={() => setSelectedHead(null)} />
                : <SearchDropdown onSelect={handleSelectHead} />}
            </div>

            <div className="div-modal-actions div-modal-actions-split">
              <div>
                {!confirmDelete ? (
                  <button className="div-btn-danger-outline" onClick={() => setConfirmDelete(true)}>
                    🗑 Delete Division
                  </button>
                ) : (
                  <div className="div-confirm-delete">
                    <span>Delete {selectedDivision.name}?</span>
                    <button className="div-btn-danger" onClick={handleDelete}>Yes, Delete</button>
                    <button className="div-btn-outline sm" onClick={() => setConfirmDelete(false)}>Cancel</button>
                  </div>
                )}
              </div>
              <div className="div-modal-actions-right">
                <button className="div-btn-outline" onClick={() => { setShowManageModal(false); resetForm(); }}>Cancel</button>
                <button className="div-btn-gold" onClick={handleUpdate} disabled={submitting}>
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