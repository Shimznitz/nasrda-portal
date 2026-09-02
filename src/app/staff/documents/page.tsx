// src/app/staff/documents/page.tsx
'use client';

import { useEffect, useState, useMemo, Suspense, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { initials, displayName } from '@/lib/utils';
import './documents.css';
import Avatar from '@/components/Avatar';
import { useSearchParams } from 'next/navigation';

// ── TypeScript Types ──
interface Profile {
  id?: string;
  title?: string | null;
  name?: string | null;
  email?: string | null;
  designation?: string | null;
  avatar_url?: string | null;
  drive_folder_url?: string | null;
}

interface FileRouteRecipient {
  id: string;
  profile_id: string;
  status: 'PENDING' | 'OPENED' | 'DONE';
  opened_at?: string | null;
  completed_at?: string | null;
  added_by?: string | null;
  profile?: Profile | null;
}

interface FileRouteEvent {
  id: string;
  action: string;
  note?: string | null;
  created_at: string;
  forwarded_to?: string | null;
  actor?: Profile | null;
  forwarded_to_profile?: Profile | null;
}

interface TaskInfo {
  title: string;
  project_title: string | null;
}

interface FileRoute {
  id: string;
  file_name: string;
  file_url: string;
  drive_url?: string | null;
  status: string;
  created_at: string;
  task_id?: string | null;
  created_by: string;
  creator?: Profile | null;
  file_route_recipients?: FileRouteRecipient[];
  file_route_events?: FileRouteEvent[];
  _role?: 'created' | 'received';
  task?: TaskInfo | null;
}

interface UserReport {
  id: string;
  profile_id: string;
  recipient_id?: string | null;
  period_type: string;
  summary_markdown: string;
  created_at: string;
  profile?: Profile | null;
}

// Format fallback for profiles missing names
function getProfileDisplayName(profile: Profile | null | undefined): string {
  if (!profile) return 'Unknown User';
  const name = displayName(profile);
  if (name !== '—') return name;
  if (profile.email) return profile.email.split('@')[0];
  return 'Unknown User';
}

const formatTimeShort = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) +
  ' ' + new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

function DocumentsContent() {
  const [userId, setUserId] = useState('');
  const [userProfile, setUserProfile] = useState<Profile | null>(null);
  const [routes, setRoutes] = useState<FileRoute[]>([]);
  const [userReports, setUserReports] = useState<UserReport[]>([]);
  const [selectedReport, setSelectedReport] = useState<UserReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'created' | 'received' | 'action'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  
  // Modal state for linking individual Drive folder
  const [driveUrlInput, setDriveUrlInput] = useState('');
  const [savingDrive, setSavingDrive] = useState(false);
  const [showDriveModal, setShowDriveModal] = useState(false);

  const searchParams = useSearchParams();
  const highlightRouteId = searchParams.get('route');

  const fetchRoutes = useCallback(async (uid: string) => {
    setLoading(true);
    setErrorMsg(null);

    const selectStr = `
      id, file_name, file_url, drive_url, status, created_at, task_id, created_by,
      creator:profiles!created_by(id, title, name, designation, avatar_url, drive_folder_url),
      file_route_recipients(
        id, profile_id, status, opened_at, completed_at, added_by,
        profile:profiles!profile_id(id, title, name, designation, avatar_url, drive_folder_url)
      ),
      file_route_events(
        id, action, note, created_at, forwarded_to,
        actor:profiles!actor_id(title, name, designation),
        forwarded_to_profile:profiles!forwarded_to(title, name)
      )
    `;

    try {
      const [createdRes, recipRowsRes, userProfRes, reportsRes] = await Promise.all([
        supabase
          .from('file_routes')
          .select(selectStr)
          .eq('created_by', uid)
          .order('created_at', { ascending: false }),
        supabase
          .from('file_route_recipients')
          .select('route_id')
          .eq('profile_id', uid),
        supabase
          .from('profiles')
          .select('id, title, name, email, designation, avatar_url, drive_folder_url')
          .eq('id', uid)
          .single(),
        supabase
          .from('user_reports')
          .select('*, profile:profiles!user_reports_profile_id_fkey(id, title, name, email)')
          .or(`profile_id.eq.${uid},recipient_id.eq.${uid}`)
          .order('created_at', { ascending: false }),
      ]);

      if (createdRes.error) throw createdRes.error;
      if (recipRowsRes.error) throw recipRowsRes.error;
      if (userProfRes.data) setUserProfile(userProfRes.data);
      if (reportsRes.data) setUserReports(reportsRes.data as UserReport[]);

      const created = (createdRes.data as unknown as FileRoute[]) || [];
      const receivedIds = (recipRowsRes.data || []).map((r) => r.route_id);
      let received: FileRoute[] = [];

      if (receivedIds.length > 0) {
        const { data: receivedData, error: receivedErr } = await supabase
          .from('file_routes')
          .select(selectStr)
          .in('id', receivedIds)
          .order('created_at', { ascending: false });

        if (receivedErr) throw receivedErr;
        received = (receivedData as unknown as FileRoute[]) || [];
      }

      const createdMap = new Set(created.map((r) => r.id));
      const seen = new Set<string>();

      const allRoutes: FileRoute[] = [
        ...created.map((r) => ({ ...r, _role: 'created' as const })),
        ...received.map((r) => ({
          ...r,
          _role: createdMap.has(r.id) ? ('created' as const) : ('received' as const),
        })),
      ].filter((r) => {
        if (seen.has(r.id)) return false;
        seen.add(r.id);
        return true;
      });

      const taskIds = [...new Set(allRoutes.filter((r) => r.task_id).map((r) => r.task_id!))];
      let taskMap: Record<string, TaskInfo> = {};

      if (taskIds.length > 0) {
        const { data: tasks } = await supabase
          .from('tasks')
          .select('id, title, project_id')
          .in('id', taskIds);

        const projectIds = [
          ...new Set((tasks || []).filter((t) => t.project_id).map((t) => t.project_id)),
        ];
        let projectMap: Record<string, string> = {};

        if (projectIds.length > 0) {
          const { data: projects } = await supabase
            .from('projects')
            .select('id, title')
            .in('id', projectIds);

          (projects || []).forEach((p) => {
            projectMap[p.id] = p.title;
          });
        }

        (tasks || []).forEach((t) => {
          taskMap[t.id] = {
            title: t.title,
            project_title: t.project_id ? (projectMap[t.project_id] || null) : null,
          };
        });
      }

      const enriched = allRoutes
        .map((r) => ({ ...r, task: r.task_id ? taskMap[r.task_id] : null }))
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      setRoutes(enriched);
      if (highlightRouteId) setExpanded(highlightRouteId);
    } catch (err: any) {
      console.error('Error fetching routes:', err);
      setErrorMsg('Failed to load document routes. Please refresh the page.');
    } finally {
      setLoading(false);
    }
  }, [highlightRouteId]);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !mounted) return;
      setUserId(user.id);
      await fetchRoutes(user.id);
    };
    load();
    return () => { mounted = false; };
  }, [fetchRoutes]);

  // Save/Update Google Drive Folder Link for current user
  const handleSaveDriveUrl = async () => {
    if (!driveUrlInput.trim()) return;
    setSavingDrive(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ drive_folder_url: driveUrlInput.trim() })
        .eq('id', userId);

      if (error) throw error;

      setUserProfile((prev) => prev ? { ...prev, drive_folder_url: driveUrlInput.trim() } : null);
      setShowDriveModal(false);
      setDriveUrlInput('');
    } catch (err) {
      console.error('Failed to save Drive URL:', err);
      alert('Could not update Drive URL. Please try again.');
    } finally {
      setSavingDrive(false);
    }
  };

  const markOpened = async (routeId: string) => {
    const routeIndex = routes.findIndex((r) => r.id === routeId);
    if (routeIndex === -1) return;

    const route = routes[routeIndex];
    const myRec = route.file_route_recipients?.find((rc) => rc.profile_id === userId);

    if (myRec && !myRec.opened_at) {
      const now = new Date().toISOString();
      const previousRoutes = [...routes];

      setRoutes((prev) => {
        const copy = [...prev];
        const target = { ...copy[routeIndex] };
        target.file_route_recipients = target.file_route_recipients?.map((rc) =>
          rc.profile_id === userId ? { ...rc, status: 'OPENED' as const, opened_at: now } : rc
        );
        copy[routeIndex] = target;
        return copy;
      });

      try {
        const { error: updateErr } = await supabase
          .from('file_route_recipients')
          .update({ status: 'OPENED', opened_at: now })
          .eq('id', myRec.id);

        if (updateErr) throw updateErr;

        await supabase.from('file_route_events').insert({
          route_id: routeId,
          recipient_id: myRec.id,
          actor_id: userId,
          action: 'OPENED',
        });
      } catch (err) {
        console.error('Failed to mark file as opened:', err);
        setRoutes(previousRoutes);
      }
    }
  };

  const markDone = async (
    routeId: string,
    recipientId: string,
    creatorId: string,
    fileName: string
  ) => {
    const now = new Date().toISOString();
    const previousRoutes = [...routes];

    setRoutes((prev) =>
      prev.map((r) => {
        if (r.id !== routeId) return r;
        return {
          ...r,
          file_route_recipients: r.file_route_recipients?.map((rc) =>
            rc.id === recipientId ? { ...rc, status: 'DONE' as const, completed_at: now } : rc
          ),
        };
      })
    );

    try {
      const { error: updateErr } = await supabase
        .from('file_route_recipients')
        .update({ status: 'DONE', completed_at: now })
        .eq('id', recipientId);

      if (updateErr) throw updateErr;

      await supabase.from('file_route_events').insert({
        route_id: routeId,
        recipient_id: recipientId,
        actor_id: userId,
        action: 'RETURNED',
      });

      await supabase.from('notifications').insert({
        user_id: creatorId,
        type: 'FILE_RETURNED',
        title: `File returned: ${fileName}`,
        body: 'A recipient has finished reviewing your file.',
        link: '/staff/documents',
        read: false,
      });
    } catch (err) {
      console.error('Failed to mark file as done:', err);
      setRoutes(previousRoutes);
    }
  };

  const createdCount = useMemo(() => routes.filter((r) => r._role === 'created').length, [routes]);
  const receivedCount = useMemo(() => routes.filter((r) => r._role === 'received').length, [routes]);
  const actionCount = useMemo(
    () =>
      routes.filter((r) => {
        const myRec = r.file_route_recipients?.find((rc) => rc.profile_id === userId);
        return myRec && (myRec.status === 'PENDING' || myRec.status === 'OPENED');
      }).length,
    [routes, userId]
  );

  const visible = useMemo(() => {
    return routes.filter((r) => {
      const myRec = r.file_route_recipients?.find((rc) => rc.profile_id === userId);
      const needsAction = myRec && (myRec.status === 'PENDING' || myRec.status === 'OPENED');

      if (filter === 'created' && r._role !== 'created') return false;
      if (filter === 'received' && r._role !== 'received') return false;
      if (filter === 'action' && !needsAction) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();

      const fileNameMatch = r.file_name?.toLowerCase().includes(q);
      const taskTitleMatch = r.task?.title?.toLowerCase().includes(q);
      const projectTitleMatch = r.task?.project_title?.toLowerCase().includes(q);
      const creatorMatch = getProfileDisplayName(r.creator).toLowerCase().includes(q);
      const recipientMatch = r.file_route_recipients?.some((rc) =>
        getProfileDisplayName(rc.profile).toLowerCase().includes(q)
      );

      return fileNameMatch || taskTitleMatch || projectTitleMatch || creatorMatch || recipientMatch;
    });
  }, [routes, filter, searchQuery, userId]);

  if (loading)
    return (
      <div className="docs-loading-page">
        <div className="docs-loading-bar" />
        <span>Loading documents…</span>
      </div>
    );

  if (errorMsg)
    return (
      <div className="docs-empty">
        <div className="docs-empty-icon">⚠️</div>
        <p>{errorMsg}</p>
        <button onClick={() => fetchRoutes(userId)} style={{ marginTop: 12, padding: '8px 16px', cursor: 'pointer' }}>
          Retry
        </button>
      </div>
    );

  return (
    <div className="docs-page">
      <div className="docs-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="docs-title">Documents</h1>
          <p className="docs-sub">File routing and chain-of-custody tracker</p>
        </div>
        
        {/* Button to manage Google Drive folder link */}
        <button 
          className="docs-action-btn"
          style={{ background: 'var(--bg-input, #222)', border: '1px solid #444', padding: '8px 14px', borderRadius: '6px' }}
          onClick={() => {
            setDriveUrlInput(userProfile?.drive_folder_url || '');
            setShowDriveModal(true);
          }}
        >
          📁 {userProfile?.drive_folder_url ? 'Update My Drive Folder' : 'Link Google Drive Folder'}
        </button>
      </div>

      {/* Modal for setting Drive Link */}
      {showDriveModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000,
          display: 'flex', justifyContent: 'center', alignItems: 'center'
        }}>
          <div style={{ background: '#1e1e1e', padding: '24px', borderRadius: '8px', maxWidth: '480px', width: '100%' }}>
            <h3>Set Personal Google Drive Folder</h3>
            <p style={{ fontSize: '0.85rem', color: '#ccc', margin: '8px 0 16px 0' }}>
              Paste the shareable Google Drive link to your assigned personal folder.
            </p>
            <input 
              type="text" 
              placeholder="https://drive.google.com/drive/folders/..." 
              value={driveUrlInput}
              onChange={(e) => setDriveUrlInput(e.target.value)}
              style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #444', background: '#111', color: '#fff' }}
            />
            <div style={{ marginTop: '16px', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowDriveModal(false)} style={{ padding: '6px 12px', background: 'transparent', border: 'none', color: '#ccc' }}>Cancel</button>
              <button onClick={handleSaveDriveUrl} disabled={savingDrive} style={{ padding: '6px 16px', background: '#2563eb', border: 'none', borderRadius: '4px', color: '#fff' }}>
                {savingDrive ? 'Saving...' : 'Save Link'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal for Viewing Full AI Report */}
      {selectedReport && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 1100,
          display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px'
        }}>
          <div style={{ background: '#18181b', border: '1px solid #333', padding: '24px', borderRadius: '12px', maxWidth: '720px', width: '100%', maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3>✨ Performance Report ({selectedReport.period_type})</h3>
              <button onClick={() => setSelectedReport(null)} style={{ background: 'transparent', border: 'none', color: '#aaa', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ fontSize: '0.85rem', color: '#888', marginBottom: '16px' }}>
              Created: {formatTimeShort(selectedReport.created_at)} | Author: {getProfileDisplayName(selectedReport.profile)}
            </div>
            <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.6', background: '#09090b', padding: '16px', borderRadius: '8px', fontSize: '0.9rem', color: '#e4e4e7', border: '1px solid #27272a' }}>
              {selectedReport.summary_markdown}
            </div>
            <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
              <button 
                onClick={() => {
                  const blob = new Blob([selectedReport.summary_markdown], { type: 'text/markdown' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `Report_${selectedReport.period_type}_${selectedReport.created_at.split('T')[0]}.md`;
                  a.click();
                }}
                style={{ padding: '8px 16px', background: '#2563eb', border: 'none', borderRadius: '6px', color: '#fff', cursor: 'pointer' }}
              >
                Download (.md)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── AI Generated Performance Reports Section ── */}
      {userReports.length > 0 && (
        <div style={{ marginBottom: '28px' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#e4e4e7', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>✨</span> AI Generated Reports ({userReports.length})
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
            {userReports.map((report) => (
              <div 
                key={report.id} 
                onClick={() => setSelectedReport(report)}
                style={{
                  background: 'var(--bg-input, #1e1e24)',
                  border: '1px solid var(--border-color, #2d2d3a)',
                  borderRadius: '8px',
                  padding: '14px',
                  cursor: 'pointer',
                  transition: 'transform 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, background: '#2563eb22', color: '#60a5fa', padding: '2px 8px', borderRadius: '4px' }}>
                    {report.period_type}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: '#888' }}>
                    {formatTimeShort(report.created_at)}
                  </span>
                </div>
                <div style={{ fontSize: '0.85rem', fontWeight: 500, color: '#fff', marginBottom: '4px' }}>
                  Performance Report
                </div>
                <div style={{ fontSize: '0.75rem', color: '#aaa' }}>
                  By: {getProfileDisplayName(report.profile)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Search Bar & Filter Tabs ── */}
      <div className="docs-toolbar" style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '20px' }}>
        <div className="docs-search-wrapper">
          <input
            type="text"
            className="docs-search-input"
            placeholder="Search by file name, task, project, sender, or participant..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 16px',
              borderRadius: '8px',
              border: '1px solid var(--border-color, #333)',
              background: 'var(--bg-input, #1a1a1a)',
              color: 'var(--text-main, #fff)',
              fontSize: '0.9rem',
              outline: 'none',
            }}
          />
        </div>

        <div className="docs-tabs" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button className={`docs-tab ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
            All <span className="tab-badge">{routes.length}</span>
          </button>

          <button className={`docs-tab ${filter === 'created' ? 'active' : ''}`} onClick={() => setFilter('created')}>
            Sent by me <span className="tab-badge">{createdCount}</span>
          </button>

          <button className={`docs-tab ${filter === 'received' ? 'active' : ''}`} onClick={() => setFilter('received')}>
            Received <span className="tab-badge">{receivedCount}</span>
          </button>

          <button className={`docs-tab ${filter === 'action' ? 'active' : ''}`} onClick={() => setFilter('action')}>
            Need action {actionCount > 0 && <span className="tab-badge urgent">{actionCount}</span>}
          </button>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="docs-empty">
          <div className="docs-empty-icon">📂</div>
          <p>No matching documents found.</p>
          <span>Try adjusting your search query or switching tabs.</span>
        </div>
      ) : (
        <div className="docs-list">
          {visible.map((r) => {
            const creatorDisplayName = getProfileDisplayName(r.creator);
            const myRec = r.file_route_recipients?.find((rc) => rc.profile_id === userId);
            const needsAction = myRec && (myRec.status === 'PENDING' || myRec.status === 'OPENED');
            const isExpanded = expanded === r.id;
            const recipients = r.file_route_recipients || [];
            const events = [...(r.file_route_events || [])].sort(
              (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            );

            return (
              <div key={r.id} className={`docs-card ${needsAction ? 'needs-action' : ''} ${r.status === 'COMPLETED' ? 'completed' : ''}`}>
                <div className="docs-card-header" onClick={() => setExpanded(isExpanded ? null : r.id)}>
                  <div className="docs-card-header-left">
                    <div className={`docs-file-type-icon ${r.status === 'COMPLETED' ? 'done' : needsAction ? 'urgent' : ''}`}>
                      📄
                    </div>
                    <div className="docs-file-info">
                      <div className="docs-file-name">{r.file_name}</div>
                      <div className="docs-file-meta">
                        {r.task?.title && <span>📋 {r.task.title}</span>}
                        {r.task?.project_title && <span>◈ {r.task.project_title}</span>}
                        {!r.task && <span>Standalone</span>}
                        <span>🕐 {formatTimeShort(r.created_at)}</span>
                        <span>From: {creatorDisplayName}</span>
                      </div>
                    </div>
                  </div>
                  <div className="docs-card-header-right">
                    {needsAction && <div className="docs-action-pill">Action needed</div>}
                    <div className={`docs-status-pill ${r.status === 'COMPLETED' ? 'done' : r._role === 'created' ? 'sent' : 'received'}`}>
                      {r.status === 'COMPLETED' ? '✓ Complete' : r._role === 'created' ? '↑ Sent' : '↓ Received'}
                    </div>
                    <div className="docs-expand-btn">{isExpanded ? '▲' : '▼'}</div>
                  </div>
                </div>

                {isExpanded && (
                  <div className="docs-expanded">
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '16px' }}>
                      {/* Direct Google Drive Link if provided, otherwise fallback to base file_url */}
                      <a
                        href={r.drive_url || r.file_url}
                        target="_blank"
                        rel="noreferrer"
                        className="docs-open-file-btn"
                        onClick={() => markOpened(r.id)}
                      >
                        {r.drive_url ? '📂 Open Document (Drive)' : '🔗 Open Document File'}
                      </a>
                    </div>

                    {myRec && myRec.status !== 'DONE' && r.status !== 'COMPLETED' && (
                      <div className="docs-my-actions">
                        <div className="docs-my-actions-label">Your actions</div>
                        <div className="docs-my-actions-row">
                          <button
                            className="docs-action-btn return"
                            onClick={() => markDone(r.id, myRec.id, r.creator?.id || r.created_by, r.file_name)}
                          >
                            ↩ Mark as Done
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="docs-timeline-label">Activity Timeline</div>
                    <div className="docs-timeline">
                      {events.length === 0 && <div className="docs-timeline-empty">No activity yet.</div>}
                      {events.map((ev, i) => {
                        const actorDisplayName = getProfileDisplayName(ev.actor);
                        const forwardTargetDisplayName = getProfileDisplayName(ev.forwarded_to_profile);
                        const isLast = i === events.length - 1;
                        const actionMeta: Record<string, { icon: string; color: string; label: string }> = {
                          CREATED: { icon: '✦', color: 'var(--gold)', label: 'Created & routed' },
                          OPENED: { icon: '👁', color: '#64dcb4', label: 'Opened file' },
                          FORWARDED: { icon: '→', color: '#a78bfa', label: 'Forwarded to' },
                          RETURNED: { icon: '←', color: '#64c864', label: 'Marked as done' },
                          COMMENTED: { icon: '💬', color: 'var(--text2)', label: 'Left a comment' },
                          COMPLETED: { icon: '★', color: '#64c864', label: 'Marked complete' },
                          RECALLED: { icon: '✗', color: '#e05c5c', label: 'Recalled' },
                        };
                        const meta = actionMeta[ev.action] || { icon: '·', color: 'var(--text3)', label: ev.action };
                        return (
                          <div key={ev.id} className="docs-timeline-entry">
                            <div className="docs-tl-left">
                              <div className="docs-tl-dot" style={{ background: meta.color }} />
                              {!isLast && <div className="docs-tl-line" />}
                            </div>
                            <div className="docs-tl-body">
                              <div className="docs-tl-actor-row">
                                <div className="docs-tl-avatar">{initials(actorDisplayName)}</div>
                                <div className="docs-tl-actor-info">
                                  <span className="docs-tl-name">{actorDisplayName}</span>
                                  <span className="docs-tl-action" style={{ color: meta.color }}>
                                    {meta.icon} {meta.label}
                                    {ev.forwarded_to && (
                                      <span className="docs-tl-forward-target"> {forwardTargetDisplayName}</span>
                                    )}
                                  </span>
                                </div>
                                <div className="docs-tl-time">{formatTimeShort(ev.created_at)}</div>
                              </div>
                              {ev.note && <div className="docs-tl-note">"{ev.note}"</div>}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="docs-timeline-label" style={{ marginTop: 20 }}>
                      All Recipients
                    </div>
                    <div className="docs-recipients-table">
                      {recipients.map((rc) => {
                        const recipientDisplayName = getProfileDisplayName(rc.profile);
                        return (
                          <div key={rc.id} className="docs-recipient-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <div className="docs-tl-avatar">{initials(recipientDisplayName)}</div>
                              <div className="docs-recipient-info">
                                <div className="docs-recipient-name">{recipientDisplayName}</div>
                                <div className="docs-recipient-desig">{rc.profile?.designation}</div>
                              </div>
                            </div>
                            
                            {/* Link to recipient's personal Google Drive folder if available */}
                            {rc.profile?.drive_folder_url && (
                              <a 
                                href={rc.profile.drive_folder_url} 
                                target="_blank" 
                                rel="noreferrer"
                                style={{ fontSize: '0.8rem', color: '#60a5fa', textDecoration: 'underline' }}
                              >
                                View Folder 📁
                              </a>
                            )}

                            <div className={`docs-recip-status ${rc.status.toLowerCase()}`}>
                              {rc.status}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function DocumentsPage() {
  return (
    <Suspense fallback={<div className="docs-loading-page"><span>Loading documents…</span></div>}>
      <DocumentsContent />
    </Suspense>
  );
}