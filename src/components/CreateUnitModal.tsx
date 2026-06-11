/*src/components/CreateUnitModal.tsx*/

'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import './CreateUnitModal.css';

// 1. Explicitly define what a staff member looks like
interface StaffMember {
  id: string;
  name: string;
  designation?: string;
}

interface Props { 
  onClose: () => void; 
  onSuccess: () => void; 
  unitToEdit?: any; 
  divisionId: string; 
}

export default function CreateUnitModal({ onClose, onSuccess, unitToEdit, divisionId }: Props) {
  const isEdit = !!unitToEdit;
  
  const [formData, setFormData] = useState({ 
    name: unitToEdit?.name || '', 
    description: unitToEdit?.description || '' 
  });

  // 2. Use the interface for the states
  const [unitHead, setUnitHead] = useState<StaffMember | null>(unitToEdit?.profiles || null);
  const [teamMembers, setTeamMembers] = useState<StaffMember[]>(unitToEdit?.members || []);
  
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<StaffMember[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (search.length < 2) { setResults([]); return; }
    const timer = setTimeout(async () => {
      const { data } = await supabase.from('profiles')
        .select('id, name, designation')
        .eq('division_id', divisionId)
        .ilike('name', `%${search}%`)
        .limit(5);
      setResults(data as StaffMember[] || []);
    }, 300);
    return () => clearTimeout(timer);
  }, [search, divisionId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); 
    setSaving(true);
    try {
      if (isEdit) {
        await supabase.from('units').update({ name: formData.name, description: formData.description, head_id: unitHead?.id }).eq('id', unitToEdit.id);
        await supabase.from('profiles').update({ unit_id: null }).eq('unit_id', unitToEdit.id);
        if (teamMembers.length) await supabase.from('profiles').update({ unit_id: unitToEdit.id }).in('id', teamMembers.map(m => m.id));
      } else {
        const { data: newU } = await supabase.from('units').insert({ name: formData.name, description: formData.description, head_id: unitHead?.id, division_id: divisionId }).select().single();
        if (teamMembers.length) await supabase.from('profiles').update({ unit_id: newU.id }).in('id', teamMembers.map(m => m.id));
      }
      onSuccess(); onClose();
    } catch (err) { console.error(err); alert('Save failed'); } finally { setSaving(false); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-window" onClick={e => e.stopPropagation()}>
        <h3>{isEdit ? 'Edit Unit' : 'Create New Unit'}</h3>
        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-group"><label>Unit Name</label><input className="input-field" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} required /></div>
          <div className="form-group"><label>Description</label><textarea className="input-field" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} /></div>
          
          <div className="form-group">
            <label>Search Staff</label>
            <div className="search-wrapper">
              <input className="input-field" placeholder="Search staff..." value={search} onChange={e => setSearch(e.target.value)} />
              {results.length > 0 && (
                <div className="search-results">
                  {results.map((s: StaffMember) => (
                    <div key={s.id} className="search-item">
                      <div className="search-item-info"><div>{s.name}</div><div className="search-designation">{s.designation}</div></div>
                      <button type="button" className="remove-head-btn" onClick={() => setUnitHead(s)}>Head</button>
                      <button type="button" className="remove-head-btn" onClick={() => !teamMembers.find(t => t.id === s.id) && setTeamMembers([...teamMembers, s])}>Add</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="form-group"><label>Selected Head</label>
            <div className="selected-head">
              <div>{unitHead?.name || 'No head selected'}</div>
              {unitHead && <button type="button" className="remove-head-btn" onClick={() => setUnitHead(null)}>✕</button>}
            </div>
          </div>

          <div className="form-group"><label>Team Members ({teamMembers.length})</label>
            <div style={{display: 'flex', flexWrap: 'wrap', gap: '8px'}}>
              {teamMembers.map((m: StaffMember) => (
                <div key={m.id} className="selected-head">{m.name} <button type="button" className="remove-head-btn" onClick={() => setTeamMembers(teamMembers.filter(t => t.id !== m.id))}>✕</button></div>
              ))}
            </div>
          </div>

          <div className="modal-actions">
            <button type="button" className="cancel-btn" onClick={onClose}>Discard</button>
            <button type="submit" className="btn" disabled={saving}>{saving ? 'Saving...' : 'Save Unit'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}