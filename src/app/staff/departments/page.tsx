'use client';

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import "./departments.css";

export default function ManageDepartments() {
  const [departments, setDepartments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ name: '', description: '', location: '' });
  
  // Edit Modal States
  const [editingDept, setEditingDept] = useState<any>(null);
  const [editFormData, setEditFormData] = useState({ name: '', description: '', location: '' });

  // Staff search states
  const [headSearch, setHeadSearch] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedHead, setSelectedHead] = useState<any>(null);
  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const fetchDepartments = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('departments')
      .select(`
        *,
        profiles:head_id ( id, name, designation, staff_no )
      `)
      .order('created_at', { ascending: false });
    
    if (error) console.error('DEPARTMENTS ERROR:', error);
    else setDepartments(data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchDepartments();
  }, []);

  useEffect(() => {
    const search = async () => {
      if (headSearch.length < 2) {
        setSearchResults([]);
        return;
      }
      setSearching(true);
      const { data } = await supabase
        .from('profiles')
        .select('id, name, designation, staff_no, role')
        .ilike('name', `%${headSearch}%`)
        .limit(10);
      setSearchResults(data || []);
      setSearching(false);
    };
    const timeout = setTimeout(search, 300);
    return () => clearTimeout(timeout);
  }, [headSearch]);

  const handleSelectHead = (staff: any) => {
    setSelectedHead(staff);
    setHeadSearch('');
    setSearchResults([]);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    // 1. Create the department
    const { data: dept, error: deptError } = await supabase
      .from('departments')
      .insert({
        name: formData.name,
        description: formData.description,
        location: formData.location || 'HQ, Abuja',
        head_id: selectedHead?.id || null,
      })
      .select()
      .single();

    if (deptError) {
      setError(deptError.message);
      setSubmitting(false);
      return;
    }

    // 2. Update the profile role ONLY if a head was selected
    if (selectedHead && dept) {
      const { error: roleError } = await supabase
        .from('profiles')
        .update({ role: 'DEPT_ADMIN' })
        .eq('id', selectedHead.id);

      if (roleError) {
        console.error("Role update failed:", roleError);
        // We don't return here because the department was already created
        setError("Department created, but failed to update user role.");
      }
    }

    resetForm();
    fetchDepartments();
    setSubmitting(false);
  };

  const openEditModal = (e: React.MouseEvent, dept: any) => {
    e.stopPropagation();
    setEditingDept(dept);
    setEditFormData({ 
      name: dept.name, 
      description: dept.description || '', 
      location: dept.location || 'HQ, Abuja' 
    });
    setSelectedHead(dept.profiles || null);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    // 1. Update department info
    const { error: updateError } = await supabase
      .from('departments')
      .update({
        name: editFormData.name,
        description: editFormData.description,
        location: editFormData.location,
        head_id: selectedHead?.id || null,
      })
      .eq('id', editingDept.id);

    if (updateError) {
      setError(updateError.message);
      setSubmitting(false);
      return;
    }

    // 2. Update the profile role if a head is selected
    if (selectedHead) {
      const { error: roleError } = await supabase
        .from('profiles')
        .update({ role: 'DEPT_ADMIN' })
        .eq('id', selectedHead.id);

      if (roleError) console.error("Role update failed:", roleError);
    }

    setEditingDept(null);
    setSelectedHead(null);
    fetchDepartments();
    setSubmitting(false);
  };

  const resetForm = () => {
    setShowForm(false);
    setFormData({ name: '', description: '', location: '' });
    setSelectedHead(null);
    setHeadSearch('');
    setSearchResults([]);
    setError('');
  };

  const generateAcronym = (name: string) => {
    const words = name.split(' ');
    const acronym = words
      .filter(w => !['and', 'for', 'the', '&', 'of', 'in'].includes(w.toLowerCase()))
      .map(w => w[0])
      .join('')
      .toUpperCase();
    return acronym.slice(0, 4) || name.slice(0, 2).toUpperCase();
  };

  return (
    <div className="departments-page">
      <div className="page-header">
        <div>
          <h1>Manage Departments</h1>
          <p>Create and manage core structural departments across the platform</p>
        </div>
        <button className="btn" onClick={() => showForm ? resetForm() : setShowForm(true)}>
          {showForm ? 'Cancel' : '+ Create New'}
        </button>
      </div>

      {/* Creation Form Expansion */}
      {showForm && (
        <div className="form-card">
          <h2>New Department</h2>
          <form onSubmit={handleCreate}>
            <div className="form-group"><label>Department Name</label>
              <input type="text" className="input-field" placeholder="e.g. Department of Engineering" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required />
            </div>
            <div className="form-group"><label>Location</label>
              <input type="text" className="input-field" placeholder="e.g. HQ, Abuja" value={formData.location} onChange={(e) => setFormData({ ...formData, location: e.target.value })} />
            </div>
            <div className="form-group"><label>Description</label>
              <textarea className="input-field" placeholder="Brief description..." rows={3} value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Assign Head of Department</label>
              {selectedHead ? (
                <div className="selected-head">
                  <div className="selected-head-info">
                    <div className="selected-avatar">{selectedHead.name.slice(0,2).toUpperCase()}</div>
                    <div><div className="selected-name">{selectedHead.name}</div></div>
                  </div>
                  <button type="button" className="remove-head-btn" onClick={() => setSelectedHead(null)}>✕ Remove</button>
                </div>
              ) : (
                <div className="search-wrapper">
                  <input type="text" className="input-field" placeholder="Search staff name..." value={headSearch} onChange={(e) => setHeadSearch(e.target.value)} />
                  {headSearch.length >= 2 && (
                    <div className="search-results">
                      {searching && <div className="search-item muted">Searching...</div>}
                      {searchResults.map(staff => (
                        <div key={staff.id} className="search-item" onClick={() => handleSelectHead(staff)}>
                          <div className="search-avatar">{staff.name.slice(0,2).toUpperCase()}</div>
                          <div className="search-item-info"><div className="search-name">{staff.name}</div></div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            {error && <p className="error">{error}</p>}
            <button type="submit" className="btn" disabled={submitting}>Create Department</button>
          </form>
        </div>
      )}

      {/* Departments Overview Cards Grid */}
      {loading ? <p className="loading">Loading...</p> : (
        <div className="departments-grid">
          {departments.map((dept) => (
            <div key={dept.id} className="dept-card" onClick={() => window.location.href = `/staff/departments/${dept.id}`}>
              <div className="dept-header">
                <div className="dept-icon">{generateAcronym(dept.name)}</div>
                <div>
                  <div className="dept-name">{dept.name}</div>
                  <div className="dept-location">📍 {dept.location || 'HQ, Abuja'}</div>
                </div>
              </div>
              {dept.description && <div className="dept-description">{dept.description}</div>}
              <div className="dept-footer">
                <div className="dept-head">{dept.profiles ? `Head: ${dept.profiles.name}` : 'No head assigned'}</div>
                <button className="manage-btn" onClick={(e) => openEditModal(e, dept)}>Manage</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pop-up Quick Edit Update Layer Backdrop */}
      {editingDept && (
        <div className="modal-overlay" onClick={() => setEditingDept(null)}>
          <div className="modal-window" onClick={(e) => e.stopPropagation()}>
            <h3>Modify Department Information</h3>
            <form onSubmit={handleUpdate} className="modal-form">
              <div className="form-group">
                <label>Department Name</label>
                <input type="text" className="input-field" value={editFormData.name} onChange={(e) => setEditFormData({...editFormData, name: e.target.value})} required />
              </div>
              <div className="form-group">
                <label>Location</label>
                <input type="text" className="input-field" value={editFormData.location} onChange={(e) => setEditFormData({...editFormData, location: e.target.value})} />
              </div>
              <div className="form-group">
                <label>Description</label>
                <textarea className="input-field" rows={3} value={editFormData.description} onChange={(e) => setEditFormData({...editFormData, description: e.target.value})} />
              </div>
              <div className="form-group">
                <label>Change Leadership Head</label>
                {selectedHead ? (
                  <div className="selected-head">
                    <div className="selected-head-info">
                      <div className="selected-avatar">{selectedHead.name.slice(0,2).toUpperCase()}</div>
                      <div className="selected-name">{selectedHead.name}</div>
                    </div>
                    <button type="button" className="remove-head-btn" onClick={() => setSelectedHead(null)}>✕ Remove</button>
                  </div>
                ) : (
                  <div className="search-wrapper">
                    <input type="text" className="input-field" placeholder="Look up personnel..." value={headSearch} onChange={(e) => setHeadSearch(e.target.value)} />
                    {headSearch.length >= 2 && (
                      <div className="search-results">
                        {searchResults.map(staff => (
                          <div key={staff.id} className="search-item" onClick={() => handleSelectHead(staff)}>
                            <div className="search-name">{staff.name}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="modal-actions">
                <button type="button" className="cancel-btn" onClick={() => setEditingDept(null)}>Discard</button>
                <button type="submit" className="btn">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}