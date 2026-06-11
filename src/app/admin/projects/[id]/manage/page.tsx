/* src/app/admin/projects/[id]/manage/page.tsx */

'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useParams } from 'next/navigation';

export default function ManageTasks() {
  const { id } = useParams();
  const [staff, setStaff] = useState<any[]>([]);
  const [taskTitle, setTaskTitle] = useState('');
  const [assignedTo, setAssignedTo] = useState('');

  useEffect(() => {
    // Fetch staff within the same unit to populate the dropdown
    supabase.from('profiles').select('id, name').then(({ data }) => setStaff(data || []));
  }, []);

  const addTask = async () => {
    await supabase.from('tasks').insert({
      project_id: id,
      title: taskTitle,
      assigned_to: assignedTo,
      status: 'PENDING'
    });
    alert('Task Assigned');
  };

  return (
    <div>
      <input value={taskTitle} onChange={e => setTaskTitle(e.target.value)} placeholder="Task Title" />
      <select onChange={e => setAssignedTo(e.target.value)}>
        {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      <button onClick={addTask}>Assign Task</button>
    </div>
  );
}