// src/app/admin/submissions/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import './submissions.css';

export default function AdminSubmissionsPage() {
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

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
    // 1. update submission
    await supabase
      .from('submissions')
      .update({
        status: action
      })
      .eq('id', submissionId);

    // 2. update task
    await supabase
      .from('tasks')
      .update({
        status: action === 'APPROVED' ? 'COMPLETED' : 'IN_PROGRESS'
      })
      .eq('id', taskId);

    fetchSubmissions();
  };

  if (loading) return <div className="loading">Loading submissions...</div>;

  return (
    <div className="admin-page">
      <h1 className="title">Submissions Review</h1>

      {submissions.length === 0 ? (
        <p className="empty">No submissions yet</p>
      ) : (
        <div className="grid">
          {submissions.map((sub) => (
            <div key={sub.id} className="card">

              <div className="card-header">
                <h3>{sub.tasks?.title}</h3>
                <span className={`status ${sub.status || 'PENDING'}`}>
                  {sub.status || 'PENDING'}
                </span>
              </div>

              <p className="meta">
                Submitted by: {sub.profiles?.name || 'Unknown'}
              </p>

              <p className="desc">{sub.description}</p>

              {/* FILES */}
              <div className="files">
                {sub.file_urls?.length > 0 ? (
                  sub.file_urls.map((url: string, i: number) => (
                    <a
                      key={i}
                      href={url}
                      target="_blank"
                      className="file"
                    >
                      📎 View File {i + 1}
                    </a>
                  ))
                ) : (
                  <p className="no-files">No files uploaded</p>
                )}
              </div>

              {/* ACTIONS */}
              <div className="actions">
                <button
                  className="approve"
                  onClick={() =>
                    handleAction(sub.id, sub.task_id, 'APPROVED')
                  }
                >
                  Approve
                </button>

                <button
                  className="reject"
                  onClick={() =>
                    handleAction(sub.id, sub.task_id, 'REJECTED')
                  }
                >
                  Reject
                </button>
              </div>

            </div>
          ))}
        </div>
      )}
    </div>
  );
}