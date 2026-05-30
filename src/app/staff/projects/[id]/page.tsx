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
  const [userId, setUserId] = useState<string | null>(null);

  const [file, setFile] = useState<File[]>([]);
  const [comment, setComment] = useState('');
  const [activeTask, setActiveTask] = useState<any>(null);

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

    setProject(project);
    setTasks(tasks || []);
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

    await load();
    setActiveTask(null);
    setComment('');
    setFile([]);
  };

  if (!project) return <p>Loading...</p>;

  return (
    <div className="project-detail-page">

      <h1>{project.title}</h1>

      <div className="tasks-list">
        {tasks.map(task => (
          <div key={task.id} className="task-row">
            <div>{task.title}</div>

            <button onClick={() => setActiveTask(task)}>
              Submit
            </button>
          </div>
        ))}
      </div>

      {activeTask && (
        <div className="modal-overlay">
          <div className="modal">

            <h2>Submit Work</h2>

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