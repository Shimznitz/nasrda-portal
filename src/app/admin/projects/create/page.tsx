/* src/app/admin/projects/create/page.tsx */

'use client';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function CreateProject() {
  const [title, setTitle] = useState('');
  
  const createProject = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', user?.id).single();
    
    await supabase.from('projects').insert({
      title,
      creator_id: user?.id,
      department_id: profile.department_id,
      division_id: profile.division_id,
      status: 'PLANNING'
    });
    alert('Project Initialized');
  };

  return (
    <div className="admin-page">
      <h1>Initialize New Workspace</h1>
      <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Project Title" />
      <button onClick={createProject}>Initialize</button>
    </div>
  );
}