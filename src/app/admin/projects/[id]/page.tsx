// src/app/admin/projects/[id]/page.tsx
'use client';

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useParams } from "next/navigation";
import "./admin.css";

export default function AdminProjectReview() {
  const { id } = useParams();

  const [project, setProject] = useState<any>(null);
  const [tasks, setTasks] = useState<any[]>([]);
  const [selectedTask, setSelectedTask] = useState<any>(null);

  useEffect(() => {
    load();
  }, [id]);

  const load = async () => {
    const { data: project } = await supabase
      .from('projects')
      .select('*')
      .eq('id', id)
      .single();

    setProject(project);

    const { data: tasks } = await supabase
      .from('tasks')
      .select('*, profiles:assigned_to(name) ')
      .eq('project_id', id);

    const { data: submissions } = await supabase
      .from('submissions')
      .select('*')
      .eq('project_id', id);

    const enriched = (tasks || []).map(t => ({
      ...t,
      submission: submissions?.find(s => s.task_id === t.id) || null
    }));

    setTasks(enriched);
  };

  const updateStatus = async (taskId: string, status: string) => {
    await supabase
      .from('tasks')
      .update({ status })
      .eq('id', taskId);

    setTasks(prev =>
      prev.map(t =>
        t.id === taskId ? { ...t, status } : t
      )
    );
  };

  if (!project) return <p>Loading...</p>;

  return (
    <div className="admin-review">

      <h1>{project.title} — Task Review</h1>

      <div className="task-list">
        {tasks.map(task => (
          <div key={task.id} className="task-card">

            <div className="task-info">
              <h3>{task.title}</h3>
              <p>Assigned to: {task.profiles?.name || "Unassigned"}</p>
              <p>Status: {task.status}</p>
            </div>

            <div className="task-actions">

              {task.submission ? (
                <button onClick={() => setSelectedTask(task)}>
                  View Submission
                </button>
              ) : (
                <p className="pending">No submission yet</p>
              )}

              {task.status === "UNDER_REVIEW" && (
                <div className="review-buttons">
                  <button
                    className="approve"
                    onClick={() => updateStatus(task.id, "COMPLETED")}
                  >
                    Approve
                  </button>

                  <button
                    className="reject"
                    onClick={() => updateStatus(task.id, "PENDING")}
                  >
                    Reject
                  </button>
                </div>
              )}

            </div>

          </div>
        ))}
      </div>

      {/* SUBMISSION MODAL */}
      {selectedTask && (
        <div className="modal-overlay" onClick={() => setSelectedTask(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>

            <h2>{selectedTask.title}</h2>

            <p>{selectedTask.submission?.description}</p>

            <div className="file-list">
              {selectedTask.submission?.file_urls?.map((url: string, i: number) => (
                <a key={i} href={url} target="_blank">
                  View File {i + 1}
                </a>
              ))}
            </div>

            <button onClick={() => setSelectedTask(null)}>Close</button>

          </div>
        </div>
      )}

    </div>
  );
}