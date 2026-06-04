// src/app/admin/submissions/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import './submissions.css';

export default function AdminSubmissionsPage() {
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSubmission, setSelectedSubmission] = useState<any>(null);
  const [feedbackText, setFeedbackText] = useState("");

  useEffect(() => {
    fetchSubmissions();
  }, []);

  const fetchSubmissions = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('submissions')
      .select(`
        *,
        tasks(title, id),
        profiles!submitted_by(name, id)
      `)
      .order('created_at', { ascending: false });

    if (!error) setSubmissions(data || []);
    setLoading(false);
  };

  const handleAction = async (
    submissionId: string,
    taskId: string,
    action: 'APPROVED' | 'REJECTED'
  ) => {
    const targetStatus = action === 'APPROVED' ? 'COMPLETED' : 'IN_PROGRESS';

    await supabase
      .from('submissions')
      .update({ status: action, admin_feedback: feedbackText })
      .eq('id', submissionId);

    await supabase
      .from('tasks')
      .update({ status: targetStatus })
      .eq('id', taskId);

    setSelectedSubmission(null);
    setFeedbackText("");
    fetchSubmissions();
  };

  if (loading) return <div className="loading">Querying master submission registers...</div>;

  return (
    <div className="admin-page">
      <h1 className="title">Central Submissions Review</h1>

      {submissions.length === 0 ? (
        <p className="empty">No employee pipeline actions found.</p>
      ) : (
        <div className="grid">
          {submissions.map((sub) => (
            <div key={sub.id} className="card">
              <div className="card-header">
                <h3>{sub.tasks?.title || "Detached Operational Item"}</h3>
                <span className={`status ${sub.status || 'PENDING'}`}>
                  {sub.status || 'PENDING'}
                </span>
              </div>

              <p className="meta">Submitted By: <strong>{sub.profiles?.name || 'Unknown Specialist'}</strong></p>
              <p className="desc-preview">{sub.description ? sub.description.substring(0, 100) + "..." : "No context provided."}</p>

              <button 
                className="evaluate-trigger-btn"
                onClick={() => { setSelectedSubmission(sub); setFeedbackText(sub.admin_feedback || ""); }}
              >
                Open Evaluation Workspace
              </button>
            </div>
          ))}
        </div>
      )}

      {/* DETAILED SUBMISSION INSPECTION MODAL */}
      {selectedSubmission && (
        <div className="modal-overlay" onClick={() => setSelectedSubmission(null)}>
          <div className="modal-view" onClick={e => e.stopPropagation()}>
            <h2>Operational Evaluation Panel</h2>
            <div className="inspect-group">
              <label>Assignment Line</label>
              <p className="inspect-text">{selectedSubmission.tasks?.title}</p>
              
              <label>Submission Commentary</label>
              <p className="inspect-desc-box">{selectedSubmission.description || "Statement field empty."}</p>
              
              <label>Attached Document Deliverables</label>
              <div className="inspect-files">
                {selectedSubmission.file_urls?.map((url: string, i: number) => (
                  <a key={i} href={url} target="_blank" rel="noreferrer" className="file-token">
                    📎 Document Payload #{i + 1} ↗
                  </a>
                )) || <p>No system payloads attached.</p>}
              </div>

              <hr className="inspect-divider" />
              
              <label>Provide Performance Evaluation/Feedback</label>
              <textarea 
                className="feedback-entry"
                placeholder="Declare explicit processing conditions, error metrics, or authorization updates..."
                value={feedbackText}
                onChange={e => setFeedbackText(e.target.value)}
              />

              <div className="inspect-actions">
                <button className="btn-modal approve" onClick={() => handleAction(selectedSubmission.id, selectedSubmission.task_id, 'APPROVED')}>
                  Approve Deliverable
                </button>
                <button className="btn-modal reject" onClick={() => handleAction(selectedSubmission.id, selectedSubmission.task_id, 'REJECTED')}>
                  Reject Deliverable
                </button>
                <button className="btn-modal close" onClick={() => setSelectedSubmission(null)}>
                  Exit Panel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}