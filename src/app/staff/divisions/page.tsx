/* src/app/staff/divisions/page.tsx */
'use client';

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { useParams } from 'next/navigation';
import "./divisions.css";

export default function ManageDivisions() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [myDept, setMyDept] = useState<any>(null);
  const [divisions, setDivisions] = useState<any[]>([]);

  // Modals Visibility States
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showManageModal, setShowManageModal] = useState(false);
  const [selectedDivision, setSelectedDivision] = useState<any>(null);

  // Form Field States
  const [newName, setNewName] = useState("");
  const [newCode, setNewCode] = useState("");

  // Staff Search States
  const [headSearch, setHeadSearch] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedHead, setSelectedHead] = useState<any>(null);
  const [searching, setSearching] = useState(false);
  const [conflictMsg, setConflictMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // state for editing fields
const [editName, setEditName] = useState("");
const [editDescription, setEditDescription] = useState("");

  // Replace your existing loadDivisionsScreen with this:
const loadDivisionsScreen = async () => {
  setLoading(true);
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) { setLoading(false); return; }

  const { data: profile } = await supabase
    .from('profiles')
    .select('department_id')
    .eq('id', user.id)
    .single();

  if (!profile?.department_id) { setLoading(false); return; }

  const { data: dept } = await supabase
    .from('departments')
    .select('*')
    .eq('id', profile?.department_id)
    .single();
  

  if (dept) setMyDept(dept);

  if (!dept) { setLoading(false); return; }
  setMyDept(dept);

  // Fetch divisions AND count using a lateral join or simple join
  // Note: Ensure your 'divisions' table has a 'description' column
  const { data: divs, error: divErr } = await supabase
    .from('divisions')
    .select(`
      *, 
      division_head:profiles!divisions_head_id_fkey(
        id,
      name,
      designation,
      role,
      division_id,
      department_id
      ),
      member_count:profiles!profiles_division_id_fkey(count)
    `)
    .eq('department_id', dept.id)
    .order('name', { ascending: true });

    console.log("Found divisions:", divs);

  if (divErr) {
    // This forces the hidden details into view
    console.error("Divisions fetch error:", divErr);
    console.error("DEBUGGING SUPABASE ERROR:", JSON.stringify(divErr, null, 2));
    console.dir(divErr); 
  }

  if (!divErr) {
    const formatted = (divs || []).map(d => ({
      ...d,
      staffCount: d.staff_count?.[0]?.count || 0
    }));
    setDivisions(formatted);
  }
  setLoading(false);
};

  useEffect(() => {
    loadDivisionsScreen();
  }, []);

  // Single, Unified Search Engine Logic
  useEffect(() => {
    const search = async () => {
      // Guard: Ensure department ID exists before querying
  if (!myDept?.id) return; 

  if (headSearch.length < 2) {
    setSearchResults([]);
    setConflictMsg('');
    return;
  }

      if (headSearch.length < 2) {
        setSearchResults([]);
        setConflictMsg('');
        return;
      }
      setSearching(true);

      const { data, error } = await supabase
  .from('profiles')
  .select(`
    id, 
    name, 
    designation, 
    division_id, 
    divisions:profiles_division_id_fkey(name)
  `)
  .ilike('name', `%${headSearch}%`)
  .eq('department_id', myDept?.id)
  .limit(10);
      if (error) {
  // Use console.dir to see the full object properties
  console.error("Search error details:", JSON.stringify(error, null, 2));
} else {
  setSearchResults(data || []);
}
      
      setSearching(false);
    };

    const timeout = setTimeout(search, 300);
    return () => clearTimeout(timeout);
  }, [headSearch, myDept]);

  const handleSelectHead = (staff: any) => {
    if (staff.division_id && (!selectedDivision || staff.division_id !== selectedDivision.id)) {
      setConflictMsg(`"${staff.name}" already assigned elsewhere.`);
      return;
    }
    setConflictMsg('');
    setSelectedHead(staff);
    setHeadSearch('');
    setSearchResults([]);
  };

  const handleCreateDivision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName || !myDept) return;
    setSubmitting(true);
    setError('');

    const { data: division, error: divisionError } = await supabase
      .from('divisions')
      .insert({
        name: newName,
        code: newCode || null,
        department_id: myDept.id,
        head_id: selectedHead?.id || null,
      })
      .select()
      .single();

    if (divisionError) {
      setError(divisionError.message);
      setSubmitting(false);
      return;
    }

    // Replace your current logic block with this:
if (selectedHead && division) {
  if (selectedHead.role !== 'DG') {
    const { error } = await supabase
      .from('profiles')
      .update({ 
        role: 'DIVISION_HEAD', 
        division_id: division.id, 
        department_id: myDept.id 
      })
      .eq('id', selectedHead.id);

    if (error) {
      console.error("ROLE UPDATE FAILED:", error);
      setError("Division created, but failed to update user role.");
    }
  }
}

    setNewName("");
    setNewCode("");
    resetFormState();
    setShowCreateModal(false);
    loadDivisionsScreen();
    setSubmitting(false);
  };

  const handleUpdate = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!selectedDivision) return;
  setSubmitting(true);

  const { error } = await supabase
    .from('divisions')
    .update({ 
      name: editName, 
      description: editDescription,
      head_id: selectedHead?.id || null 
    })
    .eq('id', selectedDivision.id);
  
  if (!error && selectedHead) {
     await supabase.from('profiles').update({ role: 'DIVISION_HEAD', division_id: selectedDivision.id }).eq('id', selectedHead.id);
  }
  
  setShowManageModal(false);
  loadDivisionsScreen();
  setSubmitting(false);
};

  const handleDeleteDivision = async () => {
    if (!selectedDivision) return;
    const confirmRemoval = confirm(`Are you completely sure you want to delete ${selectedDivision.name}?`);
    if (!confirmRemoval) return;

    await supabase.from('divisions').delete().eq('id', selectedDivision.id);
    setShowManageModal(false);
    resetFormState();
    loadDivisionsScreen();
  };

  const resetFormState = () => {
    setSelectedDivision(null);
    setSelectedHead(null);
    setHeadSearch('');
    setSearchResults([]);
    setConflictMsg('');
    setError('');
  };

  const getStaffSubtitle = (staff: any) => {
    const parts = [];
    if (staff.designation) parts.push(staff.designation);
    if (staff.divisions?.name) parts.push(staff.divisions.name);
    if (staff.units?.name) parts.push(staff.units.name);
    return parts.join(' · ') || 'No designation';
  };

  if (loading) return <div className="loading">Polling divisional infrastructure nodes...</div>;

  return (
    <div className="divisions-container">
      
      {/* Upper Control Panel */}
      <div className="divisions-header">
        <div className="divisions-title">
          <h1>Manage Departmental Divisions</h1>
          <p>Sector Track: <strong>Department of {myDept?.name}</strong></p>
        </div>
        <button className="create-btn" onClick={() => { resetFormState(); setShowCreateModal(true); }}>
          + Create Division Node
        </button>
      </div>

      {/* Grid Layout Container */}
      <div className="divisions-grid">
        {divisions.length === 0 ? (
          <div className="empty-state" style={{ gridColumn: '1/-1' }}>
            No administrative divisions registered under this sector track. Click above to initialize a node.
          </div>
        ) : (
          divisions.map((div) => (
            <div 
              key={div.id} 
              className="division-card"
              onClick={() => router.push(`/staff/divisions/${div.id}`)}
            >
              <div className="division-card-header">
    <div className="division-name">{div.name}</div>

    <button
      className="manage-node-btn"
      onClick={(e) => {
        e.stopPropagation();
        setSelectedDivision(div);
        setEditName(div.name);
        setEditDescription(div.description || "");
        setSelectedHead(div.division_head?.name || null);
        setShowManageModal(true);
      }}
    >
      Manage
    </button>
</div>

              <div className="division-meta">
                <div className="meta-item">Division Code: <strong>{div.code || 'N/A'}</strong></div>
                <div className="meta-item">Appointed Head: <strong>{div.division_head?.name || 'Vacant Node'}</strong></div>
                <div className="meta-item">Staff Members: <strong>{div.staffCount || 0}</strong></div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* POPUP MODAL 1: INITIALIZE NEW DIVISION */}
      {showCreateModal && (
        <div className="modal-overlay">
          <form className="modal-content" onSubmit={handleCreateDivision}>
            <div className="modal-header-row">
              <div className="modal-title">Initialize New Division</div>
              <button type="button" className="modal-close-x" onClick={() => setShowCreateModal(false)}>✕</button>
            </div>
            
            <div className="form-group">
              <label>Division Name</label>
              <input 
                type="text" 
                className="input-field" 
                required 
                placeholder="e.g. Space Hardware Architecture Division"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label>Division Identifier Code</label>
              <input 
                type="text" 
                className="input-field" 
                placeholder="e.g. SHAD"
                value={newCode}
                onChange={(e) => setNewCode(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label>Assign Head / Director (optional)</label>
              {selectedHead ? (
                <div className="selected-head">
                  <div className="selected-head-info">
                    <div className="selected-avatar">
                      {selectedHead?.name?.slice(0, 2).toUpperCase() || '??'}
                    </div>
                    <div>
                      <div className="selected-name">{selectedHead.name}</div>
                      <div className="selected-designation">{selectedHead.designation || 'Active Profile'}</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="remove-head-btn"
                    onClick={() => { setSelectedHead(null); setHeadSearch(''); }}
                  >
                    ✕ Remove
                  </button>
                </div>
              ) : (
                <div className="search-wrapper">
                  <input
                    type="text"
                    className="input-field"
                    placeholder="Search by name e.g. John..."
                    value={headSearch}
                    onChange={(e) => { setHeadSearch(e.target.value); setConflictMsg(''); }}
                  />
                  {headSearch.length >= 2 && (
                    <div className="search-results">
                      {searching && (
                        <div className="search-item muted">Searching...</div>
                      )}
                      {!searching && searchResults.length === 0 && (
                        <div className="search-item muted">No staff found</div>
                      )}
                      {searchResults.map((staff) => (
                        <div
                          key={staff.id}
                          className="search-item"
                          onClick={() => handleSelectHead(staff)}
                        >
                          <div className="search-avatar">
                            {staff.name.slice(0, 2).toUpperCase()}
                          </div>
                          <div className="search-item-info">
                            <div className="search-name">{staff.name}</div>
                            <div className="search-designation">
                              {getStaffSubtitle(staff)}
                            </div>
                            {staff.division_id && (
                              <div className="search-assigned-tag">
                                Already assigned · {staff.divisions?.name}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {conflictMsg && (
                    <div className="conflict-msg">⚠️ {conflictMsg}</div>
                  )}
                </div>
              )}
            </div>

            {error && <p className="error">{error}</p>}

            <div className="modal-actions">
              <button type="button" className="btn-cancel" onClick={() => setShowCreateModal(false)}>Cancel</button>
              <button type="submit" className="btn-submit" disabled={submitting}>
                {submitting ? 'Creating...' : 'Confirm Setup'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* POPUP MODAL 2: MANAGEMENT CONTROL */}
      {showManageModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header-row">
              <div className="modal-title">Manage: {selectedDivision?.name}</div>
              <button type="button" className="modal-close-x" onClick={() => { setShowManageModal(false); resetFormState(); }}>✕</button>
            </div>
            
            <form onSubmit={handleUpdate}>
  <div className="form-group">
    <label>Division Name</label>
    <input className="input-field" value={editName} onChange={(e) => setEditName(e.target.value)} />
  </div>
  <div className="form-group">
    <label>Description</label>
    <textarea className="input-field" value={editDescription} onChange={(e) => setEditDescription(e.target.value)} />
  </div>
  
  <label>Update Assigned Division Head</label>
                {selectedHead ? (
                  <div className="selected-head">
                    <div className="selected-head-info">
                      <div className="selected-avatar">
                        {selectedHead?.name?.slice(0, 2).toUpperCase() || '??'}
                      </div>
                      <div>
                        <div className="selected-name">{selectedHead.name}</div>
                        <div className="selected-designation">{selectedHead.designation || 'Active Profile'}</div>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="remove-head-btn"
                      onClick={() => { setSelectedHead(null); setHeadSearch(''); }}
                    >
                      ✕ Remove
                    </button>
                  </div>
                ) : (
                  <div className="search-wrapper">
                    <input
                      type="text"
                      className="input-field"
                      placeholder="Search by name e.g. John..."
                      value={headSearch}
                      onChange={(e) => { setHeadSearch(e.target.value); setConflictMsg(''); }}
                    />
                    {headSearch.length >= 2 && (
                      <div className="search-results">
                        {searching && (
                          <div className="search-item muted">Searching...</div>
                        )}
                        {!searching && searchResults.length === 0 && (
                          <div className="search-item muted">No staff found</div>
                        )}
                        {searchResults.map((staff) => (
                          <div
                            key={staff.id}
                            className="search-item"
                            onClick={() => handleSelectHead(staff)}
                          >
                            <div className="search-avatar">
                              {staff.name.slice(0, 2).toUpperCase()}
                            </div>
                            <div className="search-item-info">
                              <div className="search-name">{staff.name}</div>
                              <div className="search-designation">
                                {getStaffSubtitle(staff)}
                              </div>
                              {staff.division_id && (
                                <div className="search-assigned-tag">
                                  Already assigned · {staff.divisions?.name}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {conflictMsg && (
                      <div className="conflict-msg">⚠️ {conflictMsg}</div>
                    )}
                  </div>
                )}
  
  <div className="modal-actions" style={{ justifyContent: 'space-between', marginTop: '40px' }}>
  <button
    type="button"
    className="btn-delete"
    onClick={handleDeleteDivision}
  >
    Delete Node
  </button>

  <div style={{ display: 'flex', gap: '12px' }}>
    <button
      type="button"
      className="btn-cancel"
      onClick={() => {
        setShowManageModal(false);
        resetFormState();
      }}
    >
      Cancel
    </button>

    <button
      type="submit"
      className="btn-submit"
      disabled={submitting}
    >
      {submitting ? "Saving..." : "Save Changes"}
    </button>
  </div>
</div>

</form>
</div>
</div>
)}
    </div>
  );
}