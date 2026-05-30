// src/app/staff/projects/[id]/page.tsx
'use client';

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useParams, useRouter } from "next/navigation";
import "./[id].css";

export default function ProjectDetail() {
  const { id } = useParams();
  const router = useRouter();

  const [project, setProject] = useState<any>(null);
  const [tasks, setTasks] = useState<any[]>([]);
  const [visibleTasks, setVisibleTasks] = useState<any[]>([]);
  const [userId, setUserId] = useState<string | null>(null);

  const [file, setFile] = useState<File[]>([]);
  const [comment, setComment] = useState('');
  const [activeTask, setActiveTask] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);

  useEffect(() => {
    load();
  }, [id]);

  const load = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setUserId(user?.id || null);

    const { data: project } = await supabase
      .from('projects')
      .select('*')
      .eq('id', id)
      .single();

  const { data: tasks } = await supabase
  .from('tasks')
  .select('*')
  .eq('project_id', id);

// 🔽 ADD THIS RIGHT HERE (after tasks fetch)
const { data: submissions } = await supabase
  .from('submissions')
  .select('*')
  .eq('project_id', id);

// 🔽 NOW YOU ENRICH TASKS (IMPORTANT STEP)
const enrichedTasks = (tasks || []).map(task => ({
  ...task,
  submission: submissions?.find(s => s.task_id === task.id) || null
}));

setTasks(enrichedTasks);

    const { data: prof } = await supabase
  .from('profiles')
  .select('role')
  .eq('id', user?.id)
  .single();

setProfile(prof);
const isOwner = project?.created_by === user?.id;

const sourceTasks = enrichedTasks;

const filtered =
  prof?.role === 'STAFF'
    ? sourceTasks.filter((t: any) => t.assigned_to === user?.id)
    : isOwner
      ? sourceTasks
      : [];

setVisibleTasks(filtered);
  };

  const submitTask = async () => {
    if (!activeTask) return;

    const uploaded: string[] = [];

    for (const f of file) {
      const path = `${id}/${Date.now()}-${f.name}`;

      await supabase.storage
        .from('submissions')
        .upload(path, f);

      const { data } = supabase.storage
        .from('submissions')
        .getPublicUrl(path);

      uploaded.push(data.publicUrl);
    }

    await supabase.from('submissions').insert({
      project_id: id,
      task_id: activeTask.id,
      submitted_by: userId,
      description: comment,
      file_urls: uploaded
    });

    await supabase
  .from('tasks')
  .update({ status: 'UNDER_REVIEW' })
  .eq('id', activeTask.id);

  const newSubmission = {
  task_id: activeTask.id,
  file_urls: uploaded,
  description: comment,
};

// 🔥 instant UI update (no reload lag)
setTasks(prev =>
  prev.map(t =>
    t.id === activeTask.id
      ? { ...t, status: 'UNDER_REVIEW' }
      : t
  )
);

setVisibleTasks(prev =>
  prev.map(t =>
    t.id === activeTask.id
      ? { ...t, status: 'UNDER_REVIEW' }
      : t
  )
);

setActiveTask(null);
setComment('');
setFile([]);
  };

  if (!project) return <p>Loading...</p>;

  return (
    <div className="project-detail-page">

      <h1>{project.title}</h1>

      <div className="tasks-list">
        {visibleTasks.map(task => (
          <div key={task.id} className="task-row">

  {/* STATUS INDICATOR */}
  <div
    className={`task-check ${
      task.status === 'UNDER_REVIEW' || task.status === 'COMPLETED'
        ? 'checked'
        : ''
    }`}
  >
    {task.status === 'UNDER_REVIEW' || task.status === 'COMPLETED' ? '✓' : ''}
  </div>

  {/* TASK CONTENT */}
  <div className="task-content">
    <div className={`task-title ${
      task.status === 'COMPLETED' ? 'done' : ''
    }`}>
      {task.title}
    </div>

    <div className="task-meta">
      Status: {task.status}
    </div>
  </div>

  {/* ACTION */}
  {profile?.role === 'STAFF' && (
  <button
    className="submit-work-btn"
    onClick={() => setActiveTask(task)}
    disabled={
      task.status === 'UNDER_REVIEW' ||
      task.status === 'COMPLETED'
    }
  >
    {task.status === 'UNDER_REVIEW'
      ? 'Under Review'
      : task.status === 'COMPLETED'
        ? 'Completed'
        : 'Submit Work'}
  </button>
)}

</div>
        ))}
      </div>

      {activeTask && (
        <div className="modal-overlay">
          <div className="modal">

            <div className="modal-header">
  <h2>Submit Work</h2>

  <button
    className="modal-close-btn"
    onClick={() => setActiveTask(null)}
  >
    ✕
  </button>
</div>

            <textarea
              className="input-field"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />

            <input
              type="file"
              multiple
              onChange={(e) =>
                setFile(Array.from(e.target.files || []))
              }
            />

            <button className="btn" onClick={submitTask}>
              Submit
            </button>

          </div>
        </div>
      )}
    </div>
  );
}