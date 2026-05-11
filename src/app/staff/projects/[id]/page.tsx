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
  const [members, setMembers] = useState<any[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<string>('');
  const [loading, setLoading] = useState(true);

  // Submit modal states
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
        assignee:profiles!assigned_to (id, name, designation)
      `)
      .eq('project_id', projectId)
      .order('created_at');

    setTasks(taskData || []);

    const { data: memberData } = await supabase
      .from('project_members')
      .select(`
        *,
        profiles (id, name, designation, role)
      `)
      .eq('project_id', projectId);

    setMembers(memberData || []);

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

  const myTasks = isStaff 
    ? tasks.filter(t => t.assignee?.id === currentUserId || t.assigned_to === currentUserId)
    : tasks;

  const openSubmitModal = (task: any) => {
    setSelectedTask(task);
    setSubmitComment('');
    setShowSubmitModal(true);
  };

  const submitWork = async () => {
    if (!submitComment.trim() || !selectedTask) return;

    setSubmitting(true);

    // Save submission
    await supabase.from('submissions').insert({
      task_id: selectedTask.id,
      submitted_by: currentUserId,
      comment: submitComment,
      submitted_at: new Date().toISOString(),
    });

    // Mark task completed
    await supabase.from('tasks').update({
      status: 'COMPLETED',
      completed_at: new Date().toISOString(),
    }).eq('id', selectedTask.id);

    setSubmitComment('');
    setShowSubmitModal(false);
    setSelectedTask(null);
    fetchProjectData();
    setSubmitting(false);
  };

  if (loading) return <div className="loading-full">Loading...</div>;
  if (!project) return <div className="empty-state">Project not found</div>;

  return (
    <div className="project-detail-page">
      <button className="back-btn" onClick={() => router.back()}>← Back</button>

      <div className="detail-header">
        <h1>{project.title}</h1>
        <div className={`status-badge ${getStatusClass(project.status)}`}>
          {getStatusLabel(project.status)}
        </div>
      </div>

      {/* Info Cards */}
      <div className="detail-grid">
        <div className="detail-card">
          <h3>Project Information</h3>
          {project.objectives && <p>{project.objectives}</p>}
          {project.centres && <p><strong>Centre:</strong> {project.centres.name}</p>}
          {project.due_date && <p><strong>Deadline:</strong> {new Date(project.due_date).toLocaleDateString()}</p>}
        </div>

        <div className="detail-card">
          <h3>Overall Progress</h3>
          <div className="big-progress-bar">
            <div className="big-progress-fill" style={{ width: `${project.progress || 0}%` }}></div>
          </div>
          <p className="big-progress-text">{project.progress || 0}% Complete</p>
        </div>
      </div>

      {/* Tasks */}
      <div className="detail-card">
        <h3>{isStaff ? "My Tasks" : "All Tasks"} ({myTasks.length})</h3>
        <div className="tasks-list">
          {myTasks.map((task: any) => (
            <div key={task.id} className="task-row">
              <div className={`task-check ${task.status === 'COMPLETED' ? 'checked' : ''}`} 
                   onClick={() => task.status !== 'COMPLETED' && isStaff && openSubmitModal(task)}>
                {task.status === 'COMPLETED' ? '✓' : ''}
              </div>
              <div className="task-content">
                <div className={`task-title ${task.status === 'COMPLETED' ? 'done' : ''}`}>{task.title}</div>
                {task.due_date && <div className="task-meta">Due {new Date(task.due_date).toLocaleDateString()}</div>}
              </div>
              {isStaff && task.status !== 'COMPLETED' && (
                <button className="btn submit-work-btn" onClick={() => openSubmitModal(task)}>
                  Submit Work
                </button>
              )}
            </div>
          ))}
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

            <div className="form-group">
              <label>Task: <strong>{selectedTask.title}</strong></label>
            </div>

            <div className="form-group">
              <label>Comments / Notes <span style={{color:'red'}}>*</span></label>
              <textarea 
                className="input-field" 
                rows={5} 
                value={submitComment} 
                onChange={(e) => setSubmitComment(e.target.value)}
                placeholder="Write your report, findings, or notes here..."
              />
            </div>

            <div className="form-group">
              <label>Attachments (Optional)</label>
              <input type="file" className="input-field" multiple />
            </div>

            <button 
              className="btn" 
              style={{width:'100%', marginTop:'20px'}}
              onClick={submitWork}
              disabled={submitting || !submitComment.trim()}
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