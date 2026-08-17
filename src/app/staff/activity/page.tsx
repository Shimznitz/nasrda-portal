//src/app/staff/activity/page.tsx

'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import './activity.css';

const initials = (name: string) =>
  name?.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase() || '??';

const ACTION_META: Record<string, { icon: string; color: string }> = {
  CREATED:      { icon: '✦', color: 'var(--gold)' },
  UPDATED:      { icon: '✎', color: '#64dcb4' },
  SUBMITTED:    { icon: '↑', color: '#a78bfa' },
  DRAFT_SAVED:  { icon: '◎', color: 'var(--text3)' },
  APPROVED:     { icon: '✓', color: '#64c864' },
  REJECTED:     { icon: '↩', color: '#e05c5c' },
  OPENED:       { icon: '◉', color: '#64dcb4' },
  FORWARDED:    { icon: '→', color: '#a78bfa' },
  RETURNED:     { icon: '←', color: '#64c864' },
  COMMENTED:    { icon: '💬', color: 'var(--text2)' },
  COMPLETED:    { icon: '★', color: '#64c864' },
  RECALLED:     { icon: '✗', color: '#e05c5c' },
};

const ENTITY_LABEL: Record<string, string> = {
  PROJECT:    '📁 Project',
  TASK:       '✅ Task',
  SUBMISSION: '📤 Submission',
  FILE_ROUTE: '📄 File',
};

export default function ActivityPage() {
  const router = useRouter();
  const [logs, setLogs]           = useState<any[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [page, setPage]           = useState(0);
  const PAGE_SIZE = 40;

  useEffect(() => { loadLogs(); }, [page, filterType, filterAction]);

  const loadLogs = async () => {
    setLoading(true);
    let query = supabase
      .from('activity_logs')
      .select(`
        id, entity_type, entity_id, action, note, meta, created_at,
        actor:profiles!actor_id(id, name, designation)
      `)
      .order('created_at', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (filterType) query = query.eq('entity_type', filterType);
    if (filterAction) query = query.eq('action', filterAction);

    const { data, error } = await query;
    if (error) { console.error(error); setLoading(false); return; }
    setLogs(data || []);
    setLoading(false);
  };

  const filtered = logs.filter(l => {
    if (!search) return true;
    return (
      l.actor?.name?.toLowerCase().includes(search.toLowerCase()) ||
      l.action?.toLowerCase().includes(search.toLowerCase()) ||
      l.note?.toLowerCase().includes(search.toLowerCase())
    );
  });

  // Group by date
  const grouped = filtered.reduce((acc: Record<string, any[]>, log: any) => {
    const date = new Date(log.created_at);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const isYesterday = new Date(now.setDate(now.getDate() - 1)).toDateString() === date.toDateString();
    const key = isToday ? 'Today'
      : isYesterday ? 'Yesterday'
      : date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    if (!acc[key]) acc[key] = [];
    acc[key].push(log);
    return acc;
  }, {});

  return (
    <div className="act-page">
      <div className="act-header">
        <div>
          <h1 className="act-title">Activity Log</h1>
          <p className="act-sub">All project, task and file activity across the portal</p>
        </div>
      </div>

      {/* Controls */}
      <div className="act-controls">
        <input className="act-search" placeholder="Search by person, action, or note…"
          value={search} onChange={e => setSearch(e.target.value)} />
        <select className="act-filter" value={filterType}
          onChange={e => { setFilterType(e.target.value); setPage(0); }}>
          <option value="">All types</option>
          <option value="PROJECT">Projects</option>
          <option value="TASK">Tasks</option>
          <option value="SUBMISSION">Submissions</option>
          <option value="FILE_ROUTE">Files</option>
        </select>
        <select className="act-filter" value={filterAction}
          onChange={e => { setFilterAction(e.target.value); setPage(0); }}>
          <option value="">All actions</option>
          <option value="CREATED">Created</option>
          <option value="UPDATED">Updated</option>
          <option value="SUBMITTED">Submitted</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
          <option value="FORWARDED">Forwarded</option>
          <option value="COMPLETED">Completed</option>
        </select>
      </div>

      {loading ? (
        <div className="act-loading"><div className="act-loading-bar" /><span>Loading activity…</span></div>
      ) : Object.keys(grouped).length === 0 ? (
        <div className="act-empty"><p>No activity found.</p></div>
      ) : (
        <div className="act-groups">
          {Object.entries(grouped).map(([date, items]) => (
            <div key={date} className="act-group">
              <div className="act-group-label">{date}</div>
              <div className="act-list">
                {items.map((log: any) => {
                  const meta = ACTION_META[log.action] || { icon: '·', color: 'var(--text3)' };
                  const entityLabel = ENTITY_LABEL[log.entity_type] || log.entity_type;
                  return (
                    <div key={log.id} className="act-entry">
                      <div className="act-icon" style={{ color: meta.color, borderColor: meta.color + '40' }}>
                        {meta.icon}
                      </div>
                      <div className="act-body">
                        <div className="act-line">
                          <span className="act-actor">{log.actor?.name || 'System'}</span>
                          <span className="act-action" style={{ color: meta.color }}>
                            {log.action.toLowerCase().replace(/_/g, ' ')}
                          </span>
                          <span className="act-entity-tag">{entityLabel}</span>
                        </div>
                        {log.note && <div className="act-note">{log.note}</div>}
                        <div className="act-time">
                          {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      <div className="act-pagination">
        <button className="act-page-btn" onClick={() => setPage(p => Math.max(0, p - 1))}
          disabled={page === 0}>← Previous</button>
        <span className="act-page-num">Page {page + 1}</span>
        <button className="act-page-btn" onClick={() => setPage(p => p + 1)}
          disabled={logs.length < PAGE_SIZE}>Next →</button>
      </div>
    </div>
  );
}