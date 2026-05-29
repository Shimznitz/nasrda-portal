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

  // Submit modal
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [submitComment, setSubmitComment] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Approval modal (for admins)
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [selectedSubmission, setSelectedSubmission] = useState<any>(null);
  const [approvalNote, setApprovalNote] = useState('');
  const [approvalAction, setApprovalAction] = useState<'APPROVED' | 'REJECTED'>('APPROVED');

  useEffect(() => {
    fetchProjectData();
  }, [projectId]);

  const fetchProjectData = async () => {
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
        assignee:profiles!assigned_to (id, name, designation),
        submissions (*)
      `)
      .eq('project_id', projectId)
      .order('created_at');

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

  const isAdmin = ['SUPER_ADMIN', 'CENTRE_ADMIN', 'DIVISION_HEAD', 'UNIT_HEAD'].includes(userRole);
  const isStaff = userRole === 'STAFF';

  const myTasks = isStaff 
    ? tasks.filter(t => t.assignee?.id === currentUserId || t.assigned_to === currentUserId)
    : tasks;

  const openSubmitModal = (task: any) => {
    setSelectedTask(task);
    setSubmitComment('');
    setFiles([]);
    setShowSubmitModal(true);
  };

  const submitWork = async () => {
    if (!submitComment.trim() || !selectedTask) return;

    setSubmitting(true);

    // Upload files if any (you can expand this with actual storage later)
    const fileUrls: string[] = [];

    const { error } = await supabase.from('submissions').insert({
      task_id: selectedTask.id,
      submitted_by: currentUserId,
      comment: submitComment,
      file_urls: fileUrls,
    });

    if (!error) {
      await supabase.from('tasks').update({
        status: 'UNDER_REVIEW',
        approval_status: 'PENDING'
      }).eq('id', selectedTask.id);
    }

    setShowSubmitModal(false);
    setSubmitting(false);
    fetchProjectData();
  };

  const openApprovalModal = (task: any) => {
    setSelectedTask(task);
    setApprovalNote('');
    setShowApprovalModal(true);
  };

  const handleApproval = async () => {
    if (!selectedTask) return;

    await supabase.from('tasks').update({
      approval_status: approvalAction,
      approval_note: approvalNote,
      approved_by: currentUserId,
      status: approvalAction === 'APPROVED' ? 'COMPLETED' : 'PENDING'
    }).eq('id', selectedTask.id);

    setShowApprovalModal(false);
    fetchProjectData();
  };

  if (loading) return <div className="loading-full">Loading project...</div>;

  return (
    <div className="project-detail-page">
      {/* ... existing header and info cards ... */}

      <div className="detail-card">
        <h3>{isStaff ? "My Tasks" : "All Tasks"}</h3>
        <div className="tasks-list">
          {myTasks.map((task: any) => (
            <div key={task.id} className="task-row">
              <div className={`task-check ${task.status === 'COMPLETED' ? 'checked' : ''}`}>
                {task.status === 'COMPLETED' ? '✓' : ''}
              </div>
              <div className="task-content">
                <div className={`task-title ${task.status === 'COMPLETED' ? 'done' : ''}`}>{task.title}</div>
                <div className="task-meta">
                  Assigned to: {task.assignee?.name}
                  {task.due_date && ` • Due ${new Date(task.due_date).toLocaleDateString()}`}
                </div>
              </div>

              {isStaff && task.status !== 'COMPLETED' && (
                <button className="submit-work-btn" onClick={() => openSubmitModal(task)}>
                  Submit Work
                </button>
              )}

              {isAdmin && task.status === 'UNDER_REVIEW' && (
                <button className="approve-btn" onClick={() => openApprovalModal(task)}>
                  Review
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Submit Modal */}
      {showSubmitModal && selectedTask && (
        <div className="modal-overlay" onClick={() => setShowSubmitModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>Submit Work for: {selectedTask.title}</h2>
            <textarea 
              placeholder="Write your comments / report here *"
              value={submitComment}
              onChange={(e) => setSubmitComment(e.target.value)}
              rows={6}
            />
            <input type="file" multiple onChange={(e) => setFiles(Array.from(e.target.files || []))} />
            <button onClick={submitWork} disabled={!submitComment.trim() || submitting}>
              {submitting ? 'Submitting...' : 'Submit Work'}
            </button>
          </div>
        </div>
      )}

      {/* Approval Modal */}
      {showApprovalModal && selectedTask && (
        <div className="modal-overlay" onClick={() => setShowApprovalModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>Review Task: {selectedTask.title}</h2>
            <select value={approvalAction} onChange={(e) => setApprovalAction(e.target.value as any)}>
              <option value="APPROVED">Approve</option>
              <option value="REJECTED">Reject</option>
            </select>
            <textarea 
              placeholder="Add note (required for rejection)" 
              value={approvalNote} 
              onChange={(e) => setApprovalNote(e.target.value)} 
            />
            <button onClick={handleApproval}>Confirm Decision</button>
          </div>
        </div>
      )}
    </div>
  );
}