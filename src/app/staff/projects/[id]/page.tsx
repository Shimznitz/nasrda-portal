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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, [id]);

  const load = async () => {
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    setUserId(user?.id || null);

    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('*')
      .eq('id', id)
      .single();

    if (projectError) {
      console.error("PROJECT ERROR:", projectError);
      setProject(null);
      setLoading(false);
      return;
    }

    setProject(project);

    const { data: tasks } = await supabase
      .from('tasks')
      .select('*')
      .eq('project_id', id);

    const { data: submissions } = await supabase
      .from('submissions')
      .select('*')
      .eq('project_id', id);

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

    const isOwner = project.created_by === user?.id;

    const sourceTasks = enrichedTasks;

    const filtered =
      prof?.role === 'STAFF'
        ? sourceTasks.filter((t: any) => t.assigned_to === user?.id)
        : isOwner
          ? sourceTasks
          : [];

    setVisibleTasks(filtered);

    setLoading(false);
  };

  const submitTask = async () => {
    if (!activeTask) return;

    const uploaded: string[] = [];

    for (const f of file) {
      const path = `${id}/${Date.now()}-${f.name}`;

      const { error: uploadError } = await supabase.storage
        .from('submissions')
        .upload(path, f);

      if (uploadError) {
        console.error(uploadError);
        return;
      }

      const { data } = supabase.storage
        .from('submissions')
        .getPublicUrl(path);

      uploaded.push(data.publicUrl);
    }

    const { error: insertError } = await supabase.from('submissions').insert({
      project_id: id,
      task_id: activeTask.id,
      submitted_by: userId,
      description: comment,
      file_urls: uploaded
    });

    if (insertError) {
      console.error(insertError);
      return;
    }

    await supabase
      .from('tasks')
      .update({ status: 'UNDER_REVIEW' })
      .eq('id', activeTask.id);

    const newSubmission = {
      task_id: activeTask.id,
      file_urls: uploaded,
      description: comment,
    };

    setTasks(prev =>
      prev.map(t =>
        t.id === activeTask.id
          ? { ...t, status: 'UNDER_REVIEW', submission: newSubmission }
          : t
      )
    );

    setVisibleTasks(prev =>
      prev.map(t =>
        t.id === activeTask.id
          ? { ...t, status: 'UNDER_REVIEW', submission: newSubmission }
          : t
      )
    );

    setActiveTask(null);
    setComment('');
    setFile([]);
  };

  if (loading) return <p>Loading...</p>;
  if (!project) return <p>Project not found</p>;

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