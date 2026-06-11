/*src/app/staff/directory/page.tsx*/
'use client';

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import "./directory.css";

export default function AdminStaffTriage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);

  const handleSearch = async (val: string) => {
    setSearchTerm(val);
    if (val.length < 2) { setResults([]); return; }

    // Search for unassigned staff
    const { data } = await supabase
      .from('profiles')
      .select('id, name, designation')
      .is('department_id', null)
      .ilike('name', `%${val}%`)
      .limit(5);
    
    setResults(data || []);
    
    // Fetch departments if we haven't already
    if (departments.length === 0) {
      const { data: depts } = await supabase.from('departments').select('id, name');
      setDepartments(depts || []);
    }
  };

  const assignStaff = async (staffId: string, deptId: string) => {
    // Ensure we are updating the correct column name 'department_id'
    const { error } = await supabase
      .from('profiles')
      .update({ 
        department_id: deptId, // Ensure this matches your DB column name exactly
        role: 'STAFF' 
      })
      .eq('id', staffId);

    if (error) {
      console.error("Assignment error:", error);
      alert("Failed to assign staff. Check console for details.");
    } else {
      setResults(results.filter(r => r.id !== staffId));
      alert("Staff assigned successfully.");
    }
  };

  return (
    <div className="directory-page">
      <h1>Staff Triage Directory</h1>
      <div className="chart-card">
        <input 
          type="text" 
          placeholder="Search for unassigned staff name..." 
          value={searchTerm}
          onChange={(e) => handleSearch(e.target.value)}
          className="search-input"
        />

        <div className="search-results">
          {results.map(staff => (
            <div key={staff.id} className="triage-row">
              <span>{staff.name} ({staff.designation})</span>
              <select onChange={(e) => assignStaff(staff.id, e.target.value)}>
                <option value="">Assign to Department...</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}