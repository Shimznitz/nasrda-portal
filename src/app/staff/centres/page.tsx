// src/app/staff/centres/page.tsx
'use client';

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import "./centres.css";

export default function ManageCentres() {
  const [centres, setCentres] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    type: 'CENTRE',
    location: '',
    description: '',
  });
  const [headSearch, setHeadSearch] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedHead, setSelectedHead] = useState<any>(null);
  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [conflictMsg, setConflictMsg] = useState('');

  const fetchCentres = async () => {
  const { data, error } = await supabase
    .from('centres')
    .select('*')
    .order('created_at', { ascending: false });
  
  console.log('CENTRES DATA:', data);
  console.log('CENTRES ERROR:', error);
  
  setCentres(data || []);
  setLoading(false);
};

  useEffect(() => {
    fetchCentres();
  }, []);

  // Search staff by name
  useEffect(() => {
    const search = async () => {
      if (headSearch.length < 2) {
        setSearchResults([]);
        setConflictMsg('');
        return;
      }
      setSearching(true);
      const { data } = await supabase
        .from('profiles')
        .select(`
          id, name, designation, staff_no, role, centre_id,
          division_id, unit_id,
          divisions(name),
          units(name),
          centres(name)
        `)
        .ilike('name', `%${headSearch}%`)
        .limit(10);
      setSearchResults(data || []);
      setSearching(false);
    };

    const timeout = setTimeout(search, 300);
    return () => clearTimeout(timeout);
  }, [headSearch]);

  const handleSelectHead = (staff: any) => {
    // Block if already assigned to a centre
    if (staff.centre_id) {
      const centreName = staff.centres?.name || 'another centre';
      setConflictMsg(
        `"${staff.name}" already belongs to ${centreName}. Please contact the head of that centre to remove them first.`
      );
      return;
    }
    setConflictMsg('');
    setSelectedHead(staff);
    setHeadSearch('');
    setSearchResults([]);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    const { data: centre, error: centreError } = await supabase
      .from('centres')
      .insert({
        name: formData.name,
        type: formData.type,
        location: formData.location,
        description: formData.description,
        head_id: selectedHead?.id || null,
      })
      .select()
      .single();

    if (centreError) {
      setError(centreError.message);
      setSubmitting(false);
      return;
    }

    // Assign head — never demote SUPER_ADMIN
    if (selectedHead && centre) {
      const { data: headProfile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', selectedHead.id)
        .single();

      if (headProfile?.role !== 'SUPER_ADMIN') {
        await supabase
          .from('profiles')
          .update({ role: 'CENTRE_ADMIN', centre_id: centre.id })
          .eq('id', selectedHead.id);
      }
    }

    setFormData({ name: '', type: 'CENTRE', location: '', description: '' });
    setSelectedHead(null);
    setHeadSearch('');
    setShowForm(false);
    fetchCentres();
    setSubmitting(false);
  };

  const resetForm = () => {
    setShowForm(false);
    setFormData({ name: '', type: 'CENTRE', location: '', description: '' });
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

  return (
    <div className="centres-page">
      <div className="page-header">
        <div>
          <h1>Manage Centres & Labs</h1>
          <p>Create and manage centres and labs across the agency</p>
        </div>
        <button className="btn" onClick={() => showForm ? resetForm() : setShowForm(true)}>
          {showForm ? 'Cancel' : '+ Create New'}
        </button>
      </div>

      {showForm && (
        <div className="form-card">
          <h2>New Centre / Lab</h2>
          <form onSubmit={handleCreate}>

            <div className="form-group">
              <label>Type</label>
              <div className="type-toggle">
                <button
                  type="button"
                  className={`type-btn ${formData.type === 'CENTRE' ? 'active' : ''}`}
                  onClick={() => setFormData({ ...formData, type: 'CENTRE' })}
                >
                  Centre
                </button>
                <button
                  type="button"
                  className={`type-btn ${formData.type === 'LAB' ? 'active' : ''}`}
                  onClick={() => setFormData({ ...formData, type: 'LAB' })}
                >
                  Lab
                </button>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Name</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder={formData.type === 'CENTRE' ? 'e.g. Centre for Space Propulsion' : 'e.g. Satellite Integration Lab'}
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Location</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="e.g. Lagos"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label>Description</label>
              <textarea
                className="input-field"
                placeholder="Brief description of this centre or lab..."
                rows={3}
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label>Assign Head / Director (optional)</label>
              {selectedHead ? (
                <div className="selected-head">
                  <div className="selected-head-info">
                    <div className="selected-avatar">
                      {selectedHead.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="selected-name">{selectedHead.name}</div>
                      <div className="selected-designation">{selectedHead.designation}</div>
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
                          className={`search-item ${staff.centre_id ? 'assigned' : ''}`}
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
                            {staff.centre_id && (
                              <div className="search-assigned-tag">
                                Already assigned · {staff.centres?.name}
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

            <button type="submit" className="btn" disabled={submitting}>
              {submitting ? 'Creating...' : `Create ${formData.type === 'CENTRE' ? 'Centre' : 'Lab'}`}
            </button>
          </form>
        </div>
      )}

      {loading ? (
        <p className="loading">Loading...</p>
      ) : centres.length === 0 ? (
        <div className="empty-state">
          <p>No centres or labs created yet. Click <strong>"+ Create New"</strong> to get started.</p>
        </div>
      ) : (
        <div className="centres-grid">
          {centres.map((centre) => (
            <div key={centre.id} className="centre-card">
              <div className="centre-type-badge">
                {centre.type === 'LAB' ? '🔬 Lab' : '🏛 Centre'}
              </div>
              <div className="centre-header">
                <div className="centre-icon">
                  {centre.name.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <div className="centre-name">{centre.name}</div>
                  <div className="centre-location">📍 {centre.location}</div>
                </div>
              </div>
              {centre.description && (
                <div className="centre-description">{centre.description}</div>
              )}
              <div className="centre-footer">
                <div className="centre-head">
                  {centre.profiles
                    ? `Head: ${centre.profiles.name}`
                    : 'No head assigned'}
                </div>
                <button className="assign-btn">Manage</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}