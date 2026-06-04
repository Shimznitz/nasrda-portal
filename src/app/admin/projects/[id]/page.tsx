// src/app/admin/projects/[id]/page.tsx
'use client';

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useParams, useRouter } from "next/navigation";
import "../admin.css";

export default function AdminProjectReview() {
  const { id } = useParams();
  const router = useRouter();

  const [project, setProject] = useState<any>(null);
  const [tasks, setTasks] = useState<any[]>([]);
  const [staffProfiles, setStaffProfiles] = useState<any[]>([]);
  const [selectedTask, setSelectedTask] = useState<any>(null);
  
  // Task Creation & Modification States
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<any>(null);
  const [taskTitle, setTaskTitle] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [taskDueDate, setTaskDueDate] = useState("");
  
  // Feedback States
  const [feedbackText, setFeedbackText] = useState("");

  useEffect(() => {
    if (id) {
      loadProjectContext();
      loadStaffProfiles();
    }
  }, [id]);

  const loadProjectContext = async () => {
    const { data: proj } = await supabase.from('projects').select('*').eq('id', id).single();
    if (!proj) return;
    setProject(proj);

    const { data: tList } = await supabase.from('tasks').select('*, profiles:assigned_to(name)').eq('project_id', id);
    const { data: sList } = await supabase.from('submissions').select('*').eq('project_id', id);

    const enriched = (tList || []).map(t => ({
      ...t,
      submission: sList?.find(s => s.task_id === t.id) || null
    }));
    setTasks(enriched);
  };

  const loadStaffProfiles = async () => {
    const { data } = await supabase.from('profiles').select('id, name, role').eq('role', 'STAFF');
    if (data) setStaffProfiles(data);
  };

  const handleSaveTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingTask) {
      await supabase
        .from('tasks')
        .update({ title: taskTitle, assigned_to: assignedTo || null, due_date: taskDueDate || null })
        .eq('id', editingTask.id);
    } else {
      await supabase
        .from('tasks')
        .insert({
          project_id: id,
          title: taskTitle,
          assigned_to: assignedTo || null,
          due_date: taskDueDate || null,
          status: 'PENDING'
        });
    }
    closeTaskModal();
    loadProjectContext();
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!window.confirm("Delete this assignment task permanently?")) return;
    await supabase.from('tasks').delete().eq('id', taskId);
    loadProjectContext();
  };

  const handleReviewSubmission = async (taskId: string, submissionId: string, action: 'APPROVED' | 'REJECTED') => {
    const targetStatus = action === 'APPROVED' ? 'COMPLETED' : 'IN_PROGRESS';
    
    await supabase.from('submissions').update({ status: action, admin_feedback: feedbackText }).eq('id', submissionId);
    await supabase.from('tasks').update({ status: targetStatus }).eq('id', taskId);

    setSelectedTask(null);
    setFeedbackText("");
    loadProjectContext();
  };

  const openCreateTaskModal = () => {
    setEditingTask(null);
    setTaskTitle("");
    setAssignedTo("");
    setTaskDueDate("");
    setIsTaskModalOpen(true);
  };

  const openModifyTaskModal = (task: any) => {
    setEditingTask(task);
    setTaskTitle(task.title);
    setAssignedTo(task.assigned_to || "");
    setTaskDueDate(task.due_date || "");
    setIsTaskModalOpen(true);
  };

  const closeTaskModal = () => {
    setIsTaskModalOpen(false);
    setEditingTask(null);
  };

  if (!project) return <p className="loading">Processing Project Profile Context...</p>;

  return (
    <div className="admin-review">
      <button className="back-link" onClick={() => router.push('/admin/projects')}>← Return to Workspace</button>
      
      <div className="page-header">
        <div>
          <h1>{project.title}</h1>
          <p className="subtitle">{project.objectives}</p>
        </div>
        <button className="btn primary-btn" onClick={openCreateTaskModal}>+ Append Project Task</button>
      </div>

      <div className="task-list">
        {tasks.map(task => (
          <div key={task.id} className="task-card">
            <div className="task-info">
              <h3>{task.title}</h3>
              <p className="meta-assignee">Assigned Professional: <strong>{task.profiles?.name || "Unassigned Operations"}</strong></p>
              <p className={`status-pill ${task.status}`}>State: {task.status}</p>
              {task.due_date && <p className="meta-deadline">Target Date: {task.due_date}</p>}
            </div>

            <div className="task-actions">
              <button className="action-alt-btn" onClick={() => openModifyTaskModal(task)}>Modify</button>
              <button className="action-danger-btn" onClick={() => handleDeleteTask(task.id)}>Remove</button>
              
              {task.submission ? (
                <button className="action-primary-btn" onClick={() => { setSelectedTask(task); setFeedbackText(task.submission.admin_feedback || ""); }}>
                  Evaluate Submission
                </button>
              ) : (
                <span className="pending-notice">Awaiting Field Submission</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* TASK GENERATOR / MODIFIER MODAL */}
      {isTaskModalOpen && (
        <div className="modal-overlay" onClick={closeTaskModal}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>{editingTask ? "Modify Objective Parameters" : "Formulate Task Parameters"}</h2>
            <form onSubmit={handleSaveTask} className="admin-form">
              <label>Task Directive/Title</label>
              <input type="text" className="input-field" value={taskTitle} onChange={e => setTaskTitle(e.target.value)} required />

              <label>Assign Operations Staff</label>
              <select className="input-field" value={assignedTo} onChange={e => setAssignedTo(e.target.value)}>
                <option value="">Leave Unassigned (Open Pool)</option>
                {staffProfiles.map(staff => (
                  <option key={staff.id} value={staff.id}>{staff.name}</option>
                ))}
              </select>

              <label>Target Execution Date</label>
              <input type="date" className="input-field" value={taskDueDate} onChange={e => setTaskDueDate(e.target.value)} />

              <div className="form-actions">
                <button type="button" className="btn secondary-btn" onClick={closeTaskModal}>Cancel</button>
                <button type="submit" className="btn primary-btn">Commit Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EVALUATION MODAL */}
      {selectedTask && (
        <div className="modal-overlay" onClick={() => setSelectedTask(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>Review: {selectedTask.title}</h2>
            <div className="submission-body">
              <h4>Staff Commentary Notes:</h4>
              <p className="submission-desc">{selectedTask.submission?.description || "No commentary submitted."}</p>
              
              <h4>Delivered Materials:</h4>
              <div className="file-attachments">
                {selectedTask.submission?.file_urls?.map((url: string, i: number) => (
                  <a key={i} href={url} target="_blank" rel="noreferrer" className="file-link">
                    Open Resource File #{i + 1} ↗
                  </a>
                )) || <p className="no-files">No files attached.</p>}
              </div>

              <hr className="divider" />

              <h4>Administrative Feedback Statement</h4>
              <textarea 
                className="input-field dynamic-textarea" 
                placeholder="Log feedback, review parameters, or rejection requirements here..."
                value={feedbackText}
                onChange={e => setFeedbackText(e.target.value)}
              />

              <div className="form-actions row-layout">
                <button className="btn reject-btn" onClick={() => handleReviewSubmission(selectedTask.id, selectedTask.submission.id, 'REJECTED')}>
                  Issue Deficit/Reject
                </button>
                <button className="btn approve-btn" onClick={() => handleReviewSubmission(selectedTask.id, selectedTask.submission.id, 'APPROVED')}>
                  Approve Asset
                </button>
                <button className="btn secondary-btn" onClick={() => setSelectedTask(null)}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}