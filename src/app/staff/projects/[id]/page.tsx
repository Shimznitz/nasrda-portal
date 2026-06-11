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
  const [isCreator, setIsCreator] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Modal states
  const [activeTask, setActiveTask] = useState<any>(null);
  const [comment, setComment] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [existingFiles, setExistingFiles] = useState<string[]>([]);
  const [viewingReview, setViewingReview] = useState<any>(null);

  useEffect(() => {
    if (id) loadProject();
  }, [id]);

  const loadProject = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setCurrentUserId(user.id);

    const { data: proj } = await supabase
      .from('projects')
      .select(`
        *,
        tasks (
          *,
          submissions (*)
        )
      `)
      .eq('id', id)
      .single();

    if (proj) {
      setProject(proj);
      setIsCreator(proj.creator_id === user.id);

      // Filter tasks for current user (unless creator)
      let visibleTasks = proj.tasks || [];
      if (!isCreator) {
        visibleTasks = visibleTasks.filter((t: any) => t.assigned_to === user.id);
      }
      setTasks(visibleTasks);
    }
    setLoading(false);
  };

  // Submit / Update submission
  const saveSubmission = async (isFinalSubmit: boolean) => {
    if (!activeTask) return;

    let uploadedUrls: string[] = [...existingFiles];

    for (const file of files) {
      const path = `${id}/submissions/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from('submissions')
        .upload(path, file);

      if (!uploadError) {
        const { data: urlData } = supabase.storage
          .from('submissions')
          .getPublicUrl(path);
        uploadedUrls.push(urlData.publicUrl);
      }
    }

    const payload = {
      project_id: id,
      task_id: activeTask.id,
      submitted_by: currentUserId,
      description: comment,
      file_urls: uploadedUrls,
      status: isFinalSubmit ? 'PENDING' : 'DRAFT'
    };

    if (activeTask.submissions?.[0]?.id) {
      await supabase.from('submissions')
        .update(payload)
        .eq('id', activeTask.submissions[0].id);
    } else {
      await supabase.from('submissions').insert(payload);
    }

    if (isFinalSubmit) {
      await supabase.from('tasks')
        .update({ status: 'UNDER_REVIEW' })
        .eq('id', activeTask.id);
    }

    setActiveTask(null);
    setComment('');
    setFiles([]);
    setExistingFiles([]);
    loadProject();
  };

  // Creator: Approve / Reject
  const handleReview = async (submissionId: string, newStatus: 'COMPLETED' | 'REJECTED', feedback: string) => {
    await supabase.from('submissions')
      .update({ admin_feedback: feedback, status: newStatus })
      .eq('id', submissionId);

    if (newStatus === 'COMPLETED') {
      await supabase.from('tasks')
        .update({ status: 'COMPLETED' })
        .eq('id', viewingReview.id);
    }

    setViewingReview(null);
    loadProject();
  };

  if (loading) return <div className="loading">Loading project...</div>;
  if (!project) return <div>Project not found</div>;

  return (
    <div className="project-detail-page">
      <button className="back-btn" onClick={() => router.push('/staff/projects')}>
        ← Back to Projects
      </button>

      <div className="detail-header">
        <h1>{project.title}</h1>
        <div className="progress-container">
          <div className="big-progress-text">{project.progress || 0}%</div>
        </div>
      </div>

      <p className="project-objectives">{project.objectives}</p>

      <h2>Tasks</h2>
      <div className="tasks-list">
        {tasks.map((task: any) => (
          <div key={task.id} className="task-row">
            <div className="task-content">
              <h4>{task.title}</h4>
              <p className="task-status">Status: <strong>{task.status}</strong></p>
            </div>

            <div className="task-actions">
              {(isCreator || task.assigned_to === currentUserId) && (
                <button 
                  className="submit-work-btn"
                  onClick={() => {
                    setActiveTask(task);
                    setComment(task.submissions?.[0]?.description || '');
                    setExistingFiles(task.submissions?.[0]?.file_urls || []);
                  }}
                >
                  {task.status === 'UNDER_REVIEW' ? 'Reviewing' : 'Submit Work'}
                </button>
              )}

              {isCreator && task.submissions?.[0] && (
                <button 
                  className="view-feedback-btn"
                  onClick={() => setViewingReview(task)}
                >
                  Review Submission
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* SUBMIT WORK MODAL */}
      {activeTask && (
        <div className="modal-overlay" onClick={() => setActiveTask(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>Submit Work - {activeTask.title}</h2>

            <label>Comments / Notes</label>
            <textarea
              className="modal-textarea"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Describe what you completed..."
            />

            <label>Current Attachments</label>
            <div className="file-list">
              {existingFiles.map((url, i) => (
                <div key={i} className="file-chip">
                  Attachment {i + 1}
                  <button onClick={() => setExistingFiles(existingFiles.filter((_, idx) => idx !== i))}>×</button>
                </div>
              ))}
            </div>

            <label>New Attachments</label>
            <input type="file" multiple onChange={(e) => setFiles(Array.from(e.target.files || []))} />

            <div className="modal-actions">
              <button onClick={() => setActiveTask(null)}>Cancel</button>
              <button onClick={() => saveSubmission(false)}>Save Draft</button>
              <button onClick={() => saveSubmission(true)}>Submit for Review</button>
            </div>
          </div>
        </div>
      )}

      {/* CREATOR REVIEW MODAL */}
      {viewingReview && viewingReview.submissions?.[0] && (
        <div className="modal-overlay" onClick={() => setViewingReview(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>Review Submission</h2>
            <p><strong>Task:</strong> {viewingReview.title}</p>

            <textarea 
              placeholder="Feedback / Comments for the staff member..."
              onChange={(e) => setComment(e.target.value)}
            />

            <div className="modal-actions">
              <button onClick={() => handleReview(viewingReview.submissions[0].id, 'REJECTED', comment)}>
                Reject & Request Revision
              </button>
              <button onClick={() => handleReview(viewingReview.submissions[0].id, 'COMPLETED', comment)}>
                Approve Task
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}