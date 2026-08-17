// src/app/staff/documents/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import './documents.css';

const initials = (name: string) =>
  name?.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase() || '??';

const formatTime = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) +
  ' · ' + new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const formatTimeShort = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) +
  ' ' + new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export default function DocumentsPage() {
  const [userId, setUserId]   = useState('');
  const [routes, setRoutes]   = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter]   = useState<'all' | 'created' | 'received'>('all');
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

    // 1. Fetch routes created by the user
    const { data: created } = await supabase
      .from('file_routes')
      .select(`
        id, file_name, file_url, status, created_at, task_id,
        creator:profiles!created_by(id, name, designation),
        file_route_recipients(
          id, profile_id, status, opened_at, completed_at,
          added_by,
          profile:profiles!profile_id(name, designation)
        ),
        file_route_events(
          id, action, note, created_at, forwarded_to,
          actor:profiles!actor_id(name, designation),
          forwarded_to_profile:profiles!forwarded_to(name)
        )
      `)
      .eq('created_by', uid)
      .order('created_at', { ascending: false });

    // 2. Fetch routes where user is a recipient
    const { data: recipRows } = await supabase
      .from('file_route_recipients')
      .select('route_id')
      .eq('profile_id', uid);

    const receivedIds = (recipRows || []).map((r: any) => r.route_id);
    let received: any[] = [];

    if (receivedIds.length > 0) {
      const { data: receivedData } = await supabase
        .from('file_routes')
        .select(`
          id, file_name, file_url, status, created_at, task_id,
          creator:profiles!created_by(id, name, designation),
          file_route_recipients(
            id, profile_id, status, opened_at, completed_at,
            added_by,
            profile:profiles!profile_id(name, designation)
          ),
          file_route_events(
            id, action, note, created_at, forwarded_to,
            actor:profiles!actor_id(name, designation),
            forwarded_to_profile:profiles!forwarded_to(name)
          )
        `)
        .in('id', receivedIds)
        .order('created_at', { ascending: false }); // Removed .neq('created_by', uid)
      
      received = receivedData || [];
    }

    // 3. Prevent duplicates & categorize roles
    const createdSet = new Set((created || []).map(r => r.id));
    
    const createdList = (created || []).map(r => ({ ...r, _role: 'created' }));
    const receivedList = received.map(r => ({
      ...r,
      // If user created AND received it, keep role as created
      _role: createdSet.has(r.id) ? 'created' : 'received'
    }));

    const seen = new Set<string>();
    const allRoutes = [...createdList, ...receivedList].filter(r => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    });

    // 4. Enrich task & project info
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
        taskMap[t.id] = { 
          title: t.title, 
          project_title: t.project_id ? projectMap[t.project_id] : null 
        };
      });
    }

    const enriched = allRoutes
      .map(r => ({ ...r, task: r.task_id ? taskMap[r.task_id] : null }))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    setRoutes(enriched);
    setLoading(false);
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
    return myRec?.status === 'PENDING';
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
        <div>
          <h1 className="docs-title">Documents</h1>
          <p className="docs-sub">File routing and chain-of-custody tracker</p>
        </div>
      </div>

      {/* Metrics */}
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
          <div className="docs-metric-label">Awaiting action</div>
        </div>
      </div>

      {/* Tabs */}
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
          <span>Go to a project task and click <strong>Route File</strong> to send a document for review.</span>
        </div>
      ) : (
        <div className="docs-list">
          {visible.map((r: any) => {
            const myRec = r.file_route_recipients?.find((rc: any) => rc.profile_id === userId);
            const needsAction = myRec?.status === 'PENDING';
            const isExpanded = expanded === r.id;
            const recipients: any[] = r.file_route_recipients || [];
            const events: any[] = (r.file_route_events || []).sort(
              (a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
            );
            const openedCount = recipients.filter(rc => rc.opened_at).length;
            const doneCount   = recipients.filter(rc => rc.status === 'DONE').length;

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

                {/* Quick chain preview — always visible */}
                <div className="docs-chain-preview">
                  {/* Originator node */}
                  <div className="docs-node originator">
                    <div className="docs-node-avatar gold">{initials(r.creator?.name || '')}</div>
                    <div className="docs-node-label">{r.creator?.name?.split(' ')[0]}</div>
                    <div className="docs-node-status-label">Sent</div>
                  </div>

                  {recipients.map((rc: any, i: number) => (
                    <div key={rc.id} className="docs-chain-segment">
                      {/* Connector line */}
                      <div className={`docs-connector ${rc.opened_at ? 'active' : 'inactive'}`}>
                        <div className="docs-connector-line" />
                        <div className={`docs-connector-arrow ${rc.opened_at ? 'active' : ''}`}>▶</div>
                      </div>

                      {/* Recipient node */}
                      <div className={`docs-node ${rc.status === 'DONE' ? 'done' : rc.opened_at ? 'opened' : 'pending'}`}>
                        <div className={`docs-node-avatar ${rc.status === 'DONE' ? 'green' : rc.opened_at ? 'teal' : 'grey'}`}>
                          {initials(rc.profile?.name || '')}
                        </div>
                        <div className="docs-node-label">{rc.profile?.name?.split(' ')[0]}</div>
                        <div className="docs-node-status-label">
                          {rc.status === 'DONE' ? '✓ Done' : rc.opened_at ? '👁 Opened' : '⏳ Pending'}
                        </div>
                        {rc.opened_at && (
                          <div className="docs-node-time">{formatTimeShort(rc.opened_at)}</div>
                        )}
                      </div>
                    </div>
                  ))}

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

                {/* Expanded: full timeline + open link */}
                {isExpanded && (
                  <div className="docs-expanded">
                    <div className="docs-expanded-divider" />

                    <a href={r.file_url} target="_blank" rel="noreferrer" className="docs-open-file-btn">
                      🔗 Open File in Drive
                    </a>

                    {/* Full timeline */}
                    <div className="docs-timeline-label">Activity Timeline</div>
                    <div className="docs-timeline">
                      {events.length === 0 && (
                        <div className="docs-timeline-empty">No activity recorded yet.</div>
                      )}
                      {events.map((ev: any, i: number) => {
                        const isLast = i === events.length - 1;
                        const actionMeta: Record<string, { icon: string; color: string; label: string }> = {
                          CREATED:   { icon: '✦', color: 'var(--gold)',  label: 'Created & routed' },
                          OPENED:    { icon: '👁', color: '#64dcb4',     label: 'Opened file' },
                          FORWARDED: { icon: '→',  color: '#a78bfa',     label: 'Forwarded to' },
                          RETURNED:  { icon: '←',  color: '#64c864',     label: 'Returned to originator' },
                          COMMENTED: { icon: '💬', color: 'var(--text2)', label: 'Left a comment' },
                          COMPLETED: { icon: '★',  color: '#64c864',     label: 'Marked complete' },
                          RECALLED:  { icon: '✗',  color: '#e05c5c',     label: 'Recalled' },
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

                    {/* Recipient detail table */}
                    <div className="docs-timeline-label" style={{ marginTop: 16 }}>Recipients</div>
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