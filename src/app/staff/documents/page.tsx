// src/app/staff/documents/page.tsx
'use client';

import { useEffect, useState, useMemo, Suspense, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { initials } from '@/lib/utils';
import './documents.css';
import Avatar from '@/components/Avatar';
import { useSearchParams } from 'next/navigation';

// ── TypeScript Types ──
interface Profile {
  id?: string;
  name?: string | null;
  email?: string | null;
  designation?: string | null;
  avatar_url?: string | null;
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

// Helper to reliably compute a displayable user name
function getDisplayName(profile: Profile | null | undefined): string {
  if (!profile) return 'Unknown User';
  if (profile.name && profile.name.trim() !== '') return profile.name;
  if (profile.email) return profile.email.split('@')[0];
  return 'Unknown User';
}

const formatTimeShort = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) +
  ' ' + new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

function DocumentsContent() {
  const [userId, setUserId] = useState('');
  const [routes, setRoutes] = useState<FileRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'created' | 'received' | 'action'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const searchParams = useSearchParams();
  const highlightRouteId = searchParams.get('route');

  const fetchRoutes = useCallback(async (uid: string) => {
    setLoading(true);
    setErrorMsg(null);

    const selectStr = `
      id, file_name, file_url, status, created_at, task_id, created_by,
      creator:profiles!created_by(id, name, designation, avatar_url),
      file_route_recipients(
        id, profile_id, status, opened_at, completed_at, added_by,
        profile:profiles!profile_id(name, designation, avatar_url)
      ),
      file_route_events(
        id, action, note, created_at, forwarded_to,
        actor:profiles!actor_id(name, designation),
        forwarded_to_profile:profiles!forwarded_to(name)
      )
    `;

    try {
      // 1. Parallel fetch: Created routes & Recipient rows
      const [createdRes, recipRowsRes] = await Promise.all([
        supabase
          .from('file_routes')
          .select(selectStr)
          .eq('created_by', uid)
          .order('created_at', { ascending: false }),
        supabase
          .from('file_route_recipients')
          .select('route_id')
          .eq('profile_id', uid),
      ]);

      if (createdRes.error) throw createdRes.error;
      if (recipRowsRes.error) throw recipRowsRes.error;

      const created = (createdRes.data as unknown as FileRoute[]) || [];
      const receivedIds = (recipRowsRes.data || []).map((r) => r.route_id);
      let received: FileRoute[] = [];

      // 2. Fetch received routes if any exist
      if (receivedIds.length > 0) {
        const { data: receivedData, error: receivedErr } = await supabase
          .from('file_routes')
          .select(selectStr)
          .in('id', receivedIds)
          .order('created_at', { ascending: false });

        if (receivedErr) throw receivedErr;
        received = (receivedData as unknown as FileRoute[]) || [];
      }

      // 3. Merge and assign roles
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

      // 4. Enrich task & project details
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

  const markOpened = async (routeId: string) => {
    const routeIndex = routes.findIndex((r) => r.id === routeId);
    if (routeIndex === -1) return;

    const route = routes[routeIndex];
    const myRec = route.file_route_recipients?.find((rc) => rc.profile_id === userId);

    if (myRec && !myRec.opened_at) {
      const now = new Date().toISOString();
      const previousRoutes = [...routes];

      // Optimistic update
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
        setRoutes(previousRoutes); // Rollback on failure
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

    // Optimistic update
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
      setRoutes(previousRoutes); // Rollback on failure
    }
  };

  // ── Metrics Counters ──
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

  // ── Search & Filter Logic ──
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
      const creatorMatch = getDisplayName(r.creator).toLowerCase().includes(q);
      const recipientMatch = r.file_route_recipients?.some((rc) =>
        getDisplayName(rc.profile).toLowerCase().includes(q)
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
      <div className="docs-header">
        <h1 className="docs-title">Documents</h1>
        <p className="docs-sub">File routing and chain-of-custody tracker</p>
      </div>

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
            const creatorDisplayName = getDisplayName(r.creator);
            const myRec = r.file_route_recipients?.find((rc) => rc.profile_id === userId);
            const needsAction = myRec && (myRec.status === 'PENDING' || myRec.status === 'OPENED');
            const isExpanded = expanded === r.id;
            const recipients = r.file_route_recipients || [];
            const events = [...(r.file_route_events || [])].sort(
              (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            );
            const openedCount = recipients.filter((rc) => rc.opened_at).length;
            const doneCount = recipients.filter((rc) => rc.status === 'DONE').length;

            return (
              <div key={r.id} className={`docs-card ${needsAction ? 'needs-action' : ''} ${r.status === 'COMPLETED' ? 'completed' : ''}`}>
                {/* Card header */}
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

                {/* Visual chain */}
                <div className="docs-chain-preview">
                  <div className="docs-chain-inner">
                    {/* Originator */}
                    <div className="docs-node originator">
                      <Avatar name={creatorDisplayName} avatarUrl={r.creator?.avatar_url} size="sm" />
                      <div className="docs-node-label">{creatorDisplayName.split(' ')[0]}</div>
                      <div className="docs-node-sublabel">Originator</div>
                    </div>

                    {/* Fan-out connector */}
                    {recipients.length > 0 && (
                      <div className="docs-fanout">
                        <div className="docs-fanout-spine" />
                        <div className="docs-fanout-recipients">
                          {recipients.map((rc) => {
                            const recipientDisplayName = getDisplayName(rc.profile);
                            const isMe = rc.profile_id === userId;
                            const nodeClass = rc.status === 'DONE' ? 'done' : rc.opened_at ? 'opened' : 'pending';
                            const avatarClass = rc.status === 'DONE' ? 'green' : rc.opened_at ? 'teal' : 'grey';

                            return (
                              <div key={rc.id} className="docs-fanout-row">
                                <div className={`docs-fanout-line ${rc.opened_at ? 'active' : ''}`} />
                                <div className={`docs-fanout-arrow ${rc.opened_at ? 'active' : ''}`}>▶</div>
                                <div className={`docs-node ${nodeClass} ${isMe ? 'is-me' : ''}`}>
                                  <div className={`docs-node-avatar ${avatarClass}`}>
                                    {initials(recipientDisplayName)}
                                  </div>
                                  <div className="docs-node-label">
                                    {recipientDisplayName.split(' ')[0]}
                                    {isMe && <span className="docs-node-me-tag">you</span>}
                                  </div>
                                  <div className="docs-node-sublabel">
                                    {rc.status === 'DONE'
                                      ? '✓ Done'
                                      : rc.opened_at
                                      ? '👁 Opened'
                                      : '⏳ Pending'}
                                  </div>
                                  {rc.opened_at && (
                                    <div className="docs-node-time">{formatTimeShort(rc.opened_at)}</div>
                                  )}
                                  {rc.completed_at && (
                                    <div className="docs-node-time done">{formatTimeShort(rc.completed_at)}</div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Stats */}
                  <div className="docs-chain-summary">
                    <span className={openedCount === recipients.length && recipients.length > 0 ? 'all-opened' : ''}>
                      {openedCount}/{recipients.length} opened
                    </span>
                    <span className={doneCount === recipients.length && recipients.length > 0 ? 'all-done' : ''}>
                      {doneCount}/{recipients.length} done
                    </span>
                  </div>
                </div>

                {/* Expanded Section */}
                {isExpanded && (
                  <div className="docs-expanded">
                    {/* Open file button */}
                    <a
                      href={r.file_url}
                      target="_blank"
                      rel="noreferrer"
                      className="docs-open-file-btn"
                      onClick={() => markOpened(r.id)}
                    >
                      🔗 Open File in Drive
                    </a>

                    {/* Action buttons for recipient */}
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

                    {/* Timeline */}
                    <div className="docs-timeline-label">Activity Timeline</div>
                    <div className="docs-timeline">
                      {events.length === 0 && <div className="docs-timeline-empty">No activity yet.</div>}
                      {events.map((ev, i) => {
                        const actorDisplayName = getDisplayName(ev.actor);
                        const forwardTargetDisplayName = getDisplayName(ev.forwarded_to_profile);
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

                    {/* Recipients detail */}
                    <div className="docs-timeline-label" style={{ marginTop: 20 }}>
                      All Recipients
                    </div>
                    <div className="docs-recipients-table">
                      {recipients.map((rc) => {
                        const recipientDisplayName = getDisplayName(rc.profile);
                        return (
                          <div key={rc.id} className="docs-recipient-row">
                            <div className="docs-tl-avatar">{initials(recipientDisplayName)}</div>
                            <div className="docs-recipient-info">
                              <div className="docs-recipient-name">{recipientDisplayName}</div>
                              <div className="docs-recipient-desig">{rc.profile?.designation}</div>
                            </div>
                            <div className="docs-recipient-timestamps">
                              {rc.opened_at ? (
                                <div className="docs-ts opened">👁 Opened {formatTimeShort(rc.opened_at)}</div>
                              ) : (
                                <div className="docs-ts pending">⏳ Not yet opened</div>
                              )}
                              {rc.completed_at && (
                                <div className="docs-ts done">✓ Done {formatTimeShort(rc.completed_at)}</div>
                              )}
                            </div>
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