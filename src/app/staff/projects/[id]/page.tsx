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

  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [submitComment, setSubmitComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [files, setFiles] = useState<File[]>([]);
  const [filePreviews, setFilePreviews] = useState<any[]>([]);

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
      .select(`*, profiles!assigned_to (id, name, designation)`)
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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  const selected = Array.from(e.target.files || []);
  setFiles(selected);

  const previews = selected.map(file => ({
  url: URL.createObjectURL(file),
  type: file.type,
  name: file.name
}));

setFilePreviews(previews as any);
};

const uploadFiles = async (): Promise<string[]> => {
  if (!files.length) return [];

  const uploadedUrls: string[] = [];

  for (const file of files) {
    const safeName = file.name.replace(/\s/g, "_");
    const filePath = `${projectId}/${Date.now()}-${safeName}`;

    const { error } = await supabase.storage
      .from('submissions')
      .upload(filePath, file);

    if (error) throw error;

    const { data } = supabase.storage
      .from('submissions')
      .getPublicUrl(filePath);

    uploadedUrls.push(data.publicUrl);
  }

  return uploadedUrls;
};

  const submitWork = async () => {
  if (!selectedTask) return;

  setSubmitting(true);

  try {
    // 1. upload files
    const uploadedUrls = await uploadFiles();

    // 2. create submission
    const { error } = await supabase
      .from('submissions')
      .insert({
        project_id: projectId,
        task_id: selectedTask.id,
        submitted_by: currentUserId,
        description: submitComment,
        file_urls: uploadedUrls,
      });

    if (error) {
      alert(error.message);
      setSubmitting(false);
      return;
    }

    // 3. update task status
    const { error: taskError } = await supabase
      .from('tasks')
      .update({
        status: 'UNDER_REVIEW'
      })
      .eq('id', selectedTask.id);

    if (taskError) {
      alert(taskError.message);
      setSubmitting(false);
      return;
    }

    alert('Work submitted successfully');

    // reset UI
    setShowSubmitModal(false);
    setFiles([]);
    setFilePreviews([]);
    setSubmitComment('');

    fetchProjectData();

  } catch (err: any) {
    alert(err.message);
  }

  setSubmitting(false);
};

  if (loading) return <div className="loading-full">Loading project...</div>;
  if (!project) return <div>Project not found</div>;

  return (
    <div className="project-detail-page">
      <button className="back-btn" onClick={() => router.back()}>
        ← Back to Projects
      </button>

      <div className="detail-header">
        <h1>{project.title}</h1>
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
            <div
              className="big-progress-fill"
              style={{ width: `${project.progress || 0}%` }}
            />
          </div>
          <p>{project.progress || 0}% Complete</p>
        </div>
      </div>

      <div className="detail-card">
        <h3>{isStaff ? "My Tasks" : "All Tasks"} ({visibleTasks.length})</h3>

        <div className="tasks-list">
          {visibleTasks.length === 0 ? (
            <p>No tasks assigned.</p>
          ) : (
            visibleTasks.map((task: any) => (
              <div
                key={task.id}
                className="task-row"
                onClick={() => isStaff && openSubmitModal(task)}
              >
                <div className={`task-check ${task.status === 'COMPLETED' ? 'checked' : ''}`}>
                  {task.status === 'COMPLETED' ? '✓' : ''}
                </div>

                <div className="task-content">
                  <div className={`task-title ${task.status === 'COMPLETED' ? 'done' : ''}`}>
                    {task.title}
                  </div>

                  <div className="task-meta">
                    Assigned to: {task.profiles?.name || 'Unassigned'}
                  </div>
                </div>

                {isStaff && task.status !== 'COMPLETED' && task.status !== 'UNDER_REVIEW' && (
                  <button
  className="submit-work-btn"
  onClick={(e) => {
    e.stopPropagation();
    openSubmitModal(task);
  }}
>
                    Submit Work
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {showSubmitModal && selectedTask && (
        <div className="modal-overlay" onClick={() => setShowSubmitModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>

            <div className="modal-header">
              <h2>Submit Work</h2>
              <button onClick={() => setShowSubmitModal(false)}>✕</button>
            </div>

            <p><strong>Task:</strong> {selectedTask.title}</p>

            <textarea
              className="input-field"
              rows={5}
              placeholder="Write your submission..."
              value={submitComment}
              onChange={(e) => setSubmitComment(e.target.value)}
            />

            <input
              type="file"
              multiple
              onChange={handleFileChange}
            />

            {filePreviews.length > 0 && (
  <div className="file-preview-grid">
    {filePreviews.map((file, i) => (
      <div key={i} className="file-preview">
        
        {file.type.startsWith("image/") ? (
          <img src={file.url} />
        ) : (
          <div className="file-placeholder">
            📄 {file.name}
          </div>
        )}

      </div>
    ))}
  </div>
)}

            <button
              className="btn"
              disabled={!submitComment.trim() || submitting}
              onClick={submitWork}
            >
              {submitting ? 'Submitting...' : 'Submit Work'}
            </button>

          </div>
        </div>
      )}
    </div>
  );
}