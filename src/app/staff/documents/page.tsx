// src/app/staff/documents/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import './documents.css';

const initials = (name: string) =>
  name?.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase() || '??';

const formatTimeShort = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) +
  ' ' + new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export default function DocumentsPage() {
  const [userId, setUserId]     = useState('');
  const [routes, setRoutes]     = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);
  const [filter, setFilter]     = useState<'all' | 'created' | 'received'>('all');
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
      await fetchRoutes(user.id);
    };
    load();
  }, []);

  const fetchRoutes = async (uid: string) => {
    setLoading(true);

    const selectStr = `
      id, file_name, file_url, status, created_at, task_id,
      creator:profiles!created_by(id, name, designation),
      file_route_recipients(
        id, profile_id, status, opened_at, completed_at, added_by,
        profile:profiles(name, designation)
      ),
      file_route_events(
        id, action, note, created_at, forwarded_to,
        actor:profiles!actor_id(name, designation),
        forwarded_to_profile:profiles!forwarded_to(name)
      )
    `;

    const { data: created } = await supabase
      .from('file_routes').select(selectStr)
      .eq('created_by', uid).order('created_at', { ascending: false });

    const { data: recipRows } = await supabase
      .from('file_route_recipients').select('route_id').eq('profile_id', uid);

    const receivedIds = (recipRows || []).map((r: any) => r.route_id);
    let received: any[] = [];

    if (receivedIds.length > 0) {
      const { data: receivedData } = await supabase
        .from('file_routes').select(selectStr)
        .in('id', receivedIds).neq('created_by', uid)
        .order('created_at', { ascending: false });
      received = receivedData || [];
    }

    const seen = new Set<string>();
    const allRoutes = [
      ...(created || []).map(r => ({ ...r, _role: 'created' })),
      ...received.map(r => ({ ...r, _role: 'received' })),
    ].filter(r => { if (seen.has(r.id)) return false; seen.add(r.id); return true; });

    // Enrich task info
    const taskIds = [...new Set(allRoutes.filter(r => r.task_id).map(r => r.task_id))];
    let taskMap: Record<string, any> = {};
    if (taskIds.length > 0) {
      const { data: tasks } = await supabase
        .from('tasks').select('id, title, project_id').in('id', taskIds);
      const projectIds = [...new Set((tasks || []).filter(t => t.project_id).map(t => t.project_id))];
      let projectMap: Record<string, string> = {};
      if (projectIds.length > 0) {
        const { data: projects } = await supabase
          .from('projects').select('id, title').in('id', projectIds);
        (projects || []).forEach((p: any) => { projectMap[p.id] = p.title; });
      }
      (tasks || []).forEach((t: any) => {
        taskMap[t.id] = { title: t.title, project_title: projectIds.includes(t.project_id) ? projectMap[t.project_id] : null };
      });
    }

    const enriched = allRoutes
      .map(r => ({ ...r, task: r.task_id ? taskMap[r.task_id] : null }))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    setRoutes(enriched);
    setLoading(false);
  };

  // Mark as opened when user clicks open file
  const markOpened = async (routeId: string) => {
    const { data: myRec } = await supabase
      .from('file_route_recipients')
      .select('id, status, opened_at')
      .eq('route_id', routeId)
      .eq('profile_id', userId)
      .maybeSingle();

    if (myRec && !myRec.opened_at) {
      await supabase.from('file_route_recipients').update({
        status: 'OPENED',
        opened_at: new Date().toISOString(),
      }).eq('id', myRec.id);

      await supabase.from('file_route_events').insert({
        route_id: routeId,
        recipient_id: myRec.id,
        actor_id: userId,
        action: 'OPENED',
      });

      // Refresh
      await fetchRoutes(userId);
    }
  };

  const visible = routes.filter(r => {
    if (filter === 'created') return r._role === 'created';
    if (filter === 'received') return r._role === 'received';
    return true;
  });

  const createdCount  = routes.filter(r => r._role === 'created').length;
  const receivedCount = routes.filter(r => r._role === 'received').length;
  const pendingCount  = routes.filter(r => {
    const myRec = r.file_route_recipients?.find((rc: any) => rc.profile_id === userId);
    return myRec && (myRec.status === 'PENDING' || myRec.status === 'OPENED');
  }).length;

  if (loading) return (
    <div className="docs-loading-page">
      <div className="docs-loading-bar" />
      <span>Loading documents…</span>
    </div>
  );

  return (
    <div className="docs-page">
      <div className="docs-header">
        <h1 className="docs-title">Documents</h1>
        <p className="docs-sub">File routing and chain-of-custody tracker</p>
      </div>

      <div className="docs-metrics">
        <div className="docs-metric">
          <div className="docs-metric-value">{createdCount}</div>
          <div className="docs-metric-label">Sent by me</div>
        </div>
        <div className="docs-metric">
          <div className="docs-metric-value">{receivedCount}</div>
          <div className="docs-metric-label">Received</div>
        </div>
        <div className="docs-metric docs-metric-accent">
          <div className="docs-metric-value">{pendingCount}</div>
          <div className="docs-metric-label">Need action</div>
        </div>
      </div>

      <div className="docs-tabs">
        {(['all', 'created', 'received'] as const).map(f => (
          <button key={f} className={`docs-tab ${filter === f ? 'active' : ''}`}
            onClick={() => setFilter(f)}>
            {f === 'all' ? 'All' : f === 'created' ? 'Sent by me' : 'Received'}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="docs-empty">
          <div className="docs-empty-icon">📂</div>
          <p>No documents yet.</p>
          <span>Go to a project task and click <strong>Route File</strong> to send a document.</span>
        </div>
      ) : (
        <div className="docs-list">
          {visible.map((r: any) => {
            const myRec = r.file_route_recipients?.find((rc: any) => rc.profile_id === userId);
            const needsAction = myRec && (myRec.status === 'PENDING' || myRec.status === 'OPENED');
            const isExpanded  = expanded === r.id;
            const recipients: any[] = r.file_route_recipients || [];
            const events: any[] = (r.file_route_events || []).sort(
              (a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            );
            const openedCount = recipients.filter(rc => rc.opened_at).length;
            const doneCount   = recipients.filter(rc => rc.status === 'DONE').length;

            return (
              <div key={r.id} className={`docs-card ${needsAction ? 'needs-action' : ''} ${r.status === 'COMPLETED' ? 'completed' : ''}`}>

                {/* Card header */}
                <div className="docs-card-header"
                  onClick={() => setExpanded(isExpanded ? null : r.id)}>
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
                        <span>From: {r.creator?.name}</span>
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

                {/* Visual chain — originator fans out to ALL recipients in parallel */}
                <div className="docs-chain-preview">
                  <div className="docs-chain-inner">

                    {/* Originator */}
                    <div className="docs-node originator">
                      <div className="docs-node-avatar gold">{initials(r.creator?.name || '')}</div>
                      <div className="docs-node-label">{r.creator?.name?.split(' ')[0]}</div>
                      <div className="docs-node-sublabel">Originator</div>
                    </div>

                    {/* Fan-out connector */}
                    {recipients.length > 0 && (
                      <div className="docs-fanout">
                        <div className="docs-fanout-spine" />
                        <div className="docs-fanout-recipients">
                          {recipients.map((rc: any) => {
                            const isMe = rc.profile_id === userId;
                            const nodeClass = rc.status === 'DONE' ? 'done'
                              : rc.opened_at ? 'opened' : 'pending';
                            const avatarClass = rc.status === 'DONE' ? 'green'
                              : rc.opened_at ? 'teal' : 'grey';

                            return (
                              <div key={rc.id} className="docs-fanout-row">
                                <div className={`docs-fanout-line ${rc.opened_at ? 'active' : ''}`} />
                                <div className={`docs-fanout-arrow ${rc.opened_at ? 'active' : ''}`}>▶</div>
                                <div className={`docs-node ${nodeClass} ${isMe ? 'is-me' : ''}`}>
                                  <div className={`docs-node-avatar ${avatarClass}`}>
                                    {initials(rc.profile?.name || '')}
                                  </div>
                                  <div className="docs-node-label">
                                    {rc.profile?.name?.split(' ')[0]}
                                    {isMe && <span className="docs-node-me-tag">you</span>}
                                  </div>
                                  <div className="docs-node-sublabel">
                                    {rc.status === 'DONE' ? '✓ Done'
                                      : rc.opened_at ? '👁 Opened'
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

                {/* Expanded */}
                {isExpanded && (
                  <div className="docs-expanded">

                    {/* Open file button — clicking this marks as opened */}
                    <a href={r.file_url} target="_blank" rel="noreferrer"
                      className="docs-open-file-btn"
                      onClick={() => markOpened(r.id)}>
                      🔗 Open File in Drive
                    </a>

                    {/* My action buttons if I'm a recipient */}
                    {myRec && myRec.status !== 'DONE' && r.status !== 'COMPLETED' && (
                      <div className="docs-my-actions">
                        <div className="docs-my-actions-label">Your actions</div>
                        <div className="docs-my-actions-row">
                          <button className="docs-action-btn return"
                            onClick={async () => {
                              await supabase.from('file_route_recipients').update({
                                status: 'DONE', completed_at: new Date().toISOString()
                              }).eq('id', myRec.id);
                              await supabase.from('file_route_events').insert({
                                route_id: r.id, recipient_id: myRec.id,
                                actor_id: userId, action: 'RETURNED',
                              });
                              await supabase.from('notifications').insert({
                                user_id: r.creator?.id || r.created_by,
                                type: 'FILE_RETURNED',
                                title: `File returned: ${r.file_name}`,
                                body: 'A recipient has finished reviewing your file.',
                                link: '/staff/documents', read: false,
                              });
                              await fetchRoutes(userId);
                            }}>
                            ↩ Mark as Done
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Timeline */}
                    <div className="docs-timeline-label">Activity Timeline</div>
                    <div className="docs-timeline">
                      {events.length === 0 && (
                        <div className="docs-timeline-empty">No activity yet.</div>
                      )}
                      {events.map((ev: any, i: number) => {
                        const isLast = i === events.length - 1;
                        const actionMeta: Record<string, { icon: string; color: string; label: string }> = {
                          CREATED:   { icon: '✦', color: 'var(--gold)',   label: 'Created & routed' },
                          OPENED:    { icon: '👁', color: '#64dcb4',      label: 'Opened file' },
                          FORWARDED: { icon: '→',  color: '#a78bfa',      label: 'Forwarded to' },
                          RETURNED:  { icon: '←',  color: '#64c864',      label: 'Marked as done' },
                          COMMENTED: { icon: '💬', color: 'var(--text2)', label: 'Left a comment' },
                          COMPLETED: { icon: '★',  color: '#64c864',      label: 'Marked complete' },
                          RECALLED:  { icon: '✗',  color: '#e05c5c',      label: 'Recalled' },
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
                                <div className="docs-tl-avatar">{initials(ev.actor?.name || '')}</div>
                                <div className="docs-tl-actor-info">
                                  <span className="docs-tl-name">{ev.actor?.name}</span>
                                  <span className="docs-tl-action" style={{ color: meta.color }}>
                                    {meta.icon} {meta.label}
                                    {ev.forwarded_to_profile?.name && (
                                      <span className="docs-tl-forward-target"> {ev.forwarded_to_profile.name}</span>
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
                    <div className="docs-timeline-label" style={{ marginTop: 20 }}>All Recipients</div>
                    <div className="docs-recipients-table">
                      {recipients.map((rc: any) => (
                        <div key={rc.id} className="docs-recipient-row">
                          <div className="docs-tl-avatar">{initials(rc.profile?.name || '')}</div>
                          <div className="docs-recipient-info">
                            <div className="docs-recipient-name">{rc.profile?.name}</div>
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
                      ))}
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