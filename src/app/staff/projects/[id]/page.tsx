// src/app/staff/projects/[id]/page.tsx
'use client';

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useParams, useRouter } from "next/navigation";
import "./[id].css";

export default function ProjectDetail() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const [project, setProject] = useState<any>(null);
  const [tasks, setTasks] = useState<any[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string>('');
  const [loading, setLoading] = useState(true);

  // Submit Modal
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [submitComment, setSubmitComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchProjectData();
  }, [projectId]);

  const fetchProjectData = async () => {
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (user) setCurrentUserId(user.id);

    const { data: proj } = await supabase
      .from('projects')
      .select('*, centres(name, location)')
      .eq('id', projectId)
      .single();

    setProject(proj);

    const { data: taskData } = await supabase
      .from('tasks')
      .select(`
        *,
        profiles!assigned_to (id, name, designation)
      `)
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    setTasks(taskData || []);

    if (user) {
      const { data: prof } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();
      setUserRole(prof?.role || '');
    }

    setLoading(false);
  };

  const isStaff = userRole === 'STAFF';
  const visibleTasks = isStaff 
    ? tasks.filter(t => t.assigned_to === currentUserId)
    : tasks;

  const openSubmitModal = (task: any) => {
    if (!isStaff) return;
    setSelectedTask(task);
    setSubmitComment('');
    setShowSubmitModal(true);
  };

  const submitWork = async () => {
    if (!submitComment.trim() || !selectedTask) return;

    setSubmitting(true);

    await supabase.from('submissions').insert({
      task_id: selectedTask.id,
      submitted_by: currentUserId,
      comment: submitComment,
    });

    await supabase.from('tasks').update({
      status: 'UNDER_REVIEW'
    }).eq('id', selectedTask.id);

    setShowSubmitModal(false);
    setSubmitting(false);
    fetchProjectData();   // Refresh to update progress
  };

  if (loading) return <div className="loading-full">Loading project...</div>;
  if (!project) return <div>Project not found</div>;

  return (
    <div className="project-detail-page">
      <button className="back-btn" onClick={() => router.back()}>← Back to Projects</button>

      <div className="detail-header">
        <h1>{project.title}</h1>
        <div className={`status-badge ${getStatusClass(project.status)}`}>
          {getStatusLabel(project.status)}
        </div>
      </div>

      <div className="detail-grid">
        <div className="detail-card">
          <h3>Project Information</h3>
          {project.objectives && <p>{project.objectives}</p>}
          {project.centres && <p><strong>Centre:</strong> {project.centres.name}</p>}
        </div>

        <div className="detail-card">
          <h3>Overall Progress</h3>
          <div className="big-progress-bar">
            <div className="big-progress-fill" style={{ width: `${project.progress || 0}%` }}></div>
          </div>
          <p className="big-progress-text">{project.progress || 0}% Complete</p>
        </div>
      </div>

      {/* Tasks Section */}
<div className="detail-card">
  <h3>{isStaff ? "My Tasks" : "All Tasks"} ({visibleTasks.length})</h3>
  
  <div className="tasks-list">
    {visibleTasks.length === 0 ? (
      <p className="no-tasks">No tasks assigned to you yet.</p>
    ) : (
      visibleTasks.map((task: any) => (
        <div key={task.id} className="task-row" onClick={() => isStaff && openSubmitModal(task)}>
          <div className={`task-check ${task.status === 'COMPLETED' ? 'checked' : ''}`}>
            {task.status === 'COMPLETED' ? '✓' : ''}
          </div>
          <div className="task-content">
            <div className={`task-title ${task.status === 'COMPLETED' ? 'done' : ''}`}>
              {task.title}
            </div>
            <div className="task-meta">
              Assigned to: {task.profiles?.name || 'Unassigned'}
              {task.due_date && ` • Due ${new Date(task.due_date).toLocaleDateString()}`}
              {task.status === 'UNDER_REVIEW' && <span className="review-tag">● Under Review</span>}
            </div>
          </div>

          {isStaff && task.status !== 'COMPLETED' && task.status !== 'UNDER_REVIEW' && (
            <button className="submit-work-btn">Submit Work</button>
          )}
        </div>
      ))
    )}
  </div>
</div>

      {/* Submit Work Modal */}
      {showSubmitModal && selectedTask && (
        <div className="modal-overlay" onClick={() => setShowSubmitModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Submit Work</h2>
              <button className="modal-close" onClick={() => setShowSubmitModal(false)}>✕</button>
            </div>

            <p><strong>Task:</strong> {selectedTask.title}</p>
            {selectedTask.due_date && (
              <p><strong>Due:</strong> {new Date(selectedTask.due_date).toLocaleDateString()}</p>
            )}

            <textarea
              className="input-field"
              rows={6}
              placeholder="Write your comments, findings, or report here *"
              value={submitComment}
              onChange={(e) => setSubmitComment(e.target.value)}
            />

            <div className="form-group">
              <label>Attachments (Optional)</label>
              <input type="file" multiple className="input-field" />
            </div>

            <button 
              className="btn" 
              onClick={submitWork}
              disabled={!submitComment.trim() || submitting}
            >
              {submitting ? 'Submitting...' : 'Submit Work'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Helper functions
const getStatusClass = (status: string) => {
  if (status === 'COMPLETED') return 'status-done';
  if (status === 'UNDER_REVIEW') return 'status-review';
  return 'status-progress';
};

const getStatusLabel = (status: string) => {
  if (status === 'COMPLETED') return 'Completed';
  if (status === 'UNDER_REVIEW') return 'Under Review';
  return 'In Progress';
};