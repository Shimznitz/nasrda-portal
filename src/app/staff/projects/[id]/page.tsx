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
  const [visibleTasks, setVisibleTasks] = useState<any[]>([]);
  const [userId, setUserId] = useState<string | null>(null);

  const [files, setFiles] = useState<File[]>([]);
  const [comment, setComment] = useState('');
  const [activeTask, setActiveTask] = useState<any>(null);
  const [viewingReview, setViewingReview] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) loadStaffProjectProfile();
  }, [id]);

  const loadStaffProjectProfile = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);

    const { data: proj } = await supabase.from('projects').select('*').eq('id', id).single();
    if (!proj) {
      setLoading(false);
      return;
    }
    setProject(proj);

    const { data: tasks } = await supabase.from('tasks').select('*').eq('project_id', id).eq('assigned_to', user.id);
    const { data: submissions } = await supabase.from('submissions').select('*').eq('project_id', id).eq('submitted_by', user.id);

    const enriched = (tasks || []).map(t => ({
      ...t,
      submission: submissions?.find(s => s.task_id === t.id) || null
    }));

    setVisibleTasks(enriched);
    setLoading(false);
  };

  const submitTaskExecution = async () => {
    if (!activeTask) return;

    const uploadedUrls: string[] = [];
    for (const f of files) {
      const path = `${id}/${Date.now()}-${f.name}`;
      const { error: uploadError } = await supabase.storage.from('submissions').upload(path, f);
      
      if (!uploadError) {
        const { data } = supabase.storage.from('submissions').getPublicUrl(path);
        uploadedUrls.push(data.publicUrl);
      }
    }

    // Upsert mechanism to prevent dual processing row errors
    if (activeTask.submission) {
      await supabase.from('submissions').update({
        description: comment,
        file_urls: uploadedUrls,
        status: 'PENDING'
      }).eq('id', activeTask.submission.id);
    } else {
      await supabase.from('submissions').insert({
        project_id: id,
        task_id: activeTask.id,
        submitted_by: userId,
        description: comment,
        file_urls: uploadedUrls,
        status: 'PENDING'
      });
    }

    await supabase.from('tasks').update({ status: 'UNDER_REVIEW' }).eq('id', activeTask.id);

    setActiveTask(null);
    setComment('');
    setFiles([]);
    loadStaffProjectProfile();
  };

  if (loading) return <p className="loading">Parsing context profiles...</p>;
  if (!project) return <p className="loading">Target module not online.</p>;

  return (
    <div className="project-detail-page">
      <button className="back-btn" onClick={() => router.push('/staff/projects')}>← Operations Hub</button>
      
      <div className="detail-header">
        <h1>{project.title}</h1>
        <div className="progress-container">
          <div className="big-progress-text">{project.progress || 0}%</div>
          <p>Overall Metric Stability</p>
        </div>
      </div>

      <h2>Your Assigned Pipeline Objectives</h2>
      <div className="tasks-list">
        {visibleTasks.map(task => (
          <div key={task.id} className="task-row">
            <div className={`task-check ${task.status === 'COMPLETED' ? 'checked' : ''}`}>
              {task.status === 'COMPLETED' ? '✓' : '⎔'}
            </div>

            <div className="task-content">
              <div className={`task-title ${task.status === 'COMPLETED' ? 'done' : ''}`}>{task.title}</div>
              <div className="task-meta">Status Condition: <strong>{task.status}</strong></div>
            </div>

            <div className="task-row-actions">
              {task.submission?.admin_feedback && (
                <button className="view-feedback-btn" onClick={() => setViewingReview(task)}>
                  View Feedback Note
                </button>
              )}

              <button
                className="submit-work-btn"
                onClick={() => {
                  setActiveTask(task);
                  setComment(task.submission?.description || "");
                }}
                disabled={task.status === 'UNDER_REVIEW' || task.status === 'COMPLETED'}
              >
                {task.status === 'UNDER_REVIEW' ? 'System Under Review' : task.status === 'COMPLETED' ? 'Completed' : task.submission ? 'Resubmit Revision' : 'Submit Artifacts'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* SUBMIT WORK MODAL */}
      {activeTask && (
        <div className="modal-overlay" onClick={() => setActiveTask(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Upload System Deliverables</h2>
              <button className="modal-close-btn" onClick={() => setActiveTask(null)}>✕</button>
            </div>
            
            <label className="modal-label">Operational Notes / Commentary</label>
            <textarea
              className="modal-textarea"
              placeholder="Detail deployment vectors, configurations, or execution metrics..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />

            <label className="modal-label">Attach Verification Payloads</label>
            <input
              type="file"
              className="modal-file-input"
              multiple
              onChange={(e) => setFiles(Array.from(e.target.files || []))}
            />

            <button className="btn-execute" onClick={submitTaskExecution}>
              Transmit Payload Package
            </button>
          </div>
        </div>
      )}

      {/* FEEDBACK VIEWER MODAL */}
      {viewingReview && (
        <div className="modal-overlay" onClick={() => setViewingReview(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Supervisor Review Assessment</h2>
              <button className="modal-close-btn" onClick={() => setViewingReview(null)}>✕</button>
            </div>
            <p className="task-context-heading">Target Task: <strong>{viewingReview.title}</strong></p>
            
            <div className="feedback-statement-box">
              <h4>Administrative Statement:</h4>
              <p>{viewingReview.submission?.admin_feedback}</p>
            </div>
            
            <button className="btn-execute secondary" onClick={() => setViewingReview(null)}>Dismiss Panel</button>
          </div>
        </div>
      )}
    </div>
  );
}