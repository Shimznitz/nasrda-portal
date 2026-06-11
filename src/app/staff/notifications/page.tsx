// src/app/staff/notifications/page.tsx

'use client';

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import "./notifications.css";

const TYPE_META: Record<string, { icon: string; label: string }> = {
  PROJECT_ADDED:     { icon: '📁', label: 'Project' },
  TASK_ASSIGNED:     { icon: '✅', label: 'Task' },
  SUBMISSION_REVIEW: { icon: '📋', label: 'Review' },
  TASK_APPROVED:     { icon: '🎉', label: 'Approved' },
  TASK_REJECTED:     { icon: '↩️', label: 'Revision' },
  DEADLINE:          { icon: '⏰', label: 'Deadline' },
  MESSAGE:           { icon: '💬', label: 'Message' },
};

export default function NotificationsPage() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  useEffect(() => {
    let interval: any;
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
      await fetchNotifications(user.id);
      interval = setInterval(() => fetchNotifications(user.id), 10000);
    };
    load();
    return () => clearInterval(interval);
  }, []);

  const fetchNotifications = async (uid: string) => {
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('profile_id', uid)
      .order('created_at', { ascending: false })
      .limit(60);
    setNotifications(data || []);
    setLoading(false);
  };

  const markRead = async (n: any) => {
    if (!n.is_read) {
      await supabase.from('notifications').update({ is_read: true }).eq('id', n.id);
      setNotifications(prev => prev.map((x: any) => x.id === n.id ? { ...x, is_read: true } : x));
    }
    if (n.link) router.push(n.link);
  };

  const markAllRead = async () => {
    if (!userId) return;
    await supabase.from('notifications').update({ is_read: true })
      .eq('profile_id', userId).eq('is_read', false);
    setNotifications(prev => prev.map((n: any) => ({ ...n, is_read: true })));
  };

  const deleteNotification = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await supabase.from('notifications').delete().eq('id', id);
    setNotifications(prev => prev.filter((n: any) => n.id !== id));
  };

  const unreadCount = notifications.filter((n: any) => !n.is_read).length;
  const visible = filter === 'unread'
    ? notifications.filter((n: any) => !n.is_read)
    : notifications;

  const grouped = visible.reduce((acc: Record<string, any[]>, n: any) => {
    const date = new Date(n.created_at);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    const isYesterday = new Date(now.setDate(now.getDate() - 1)).toDateString() === date.toDateString();
    const key = isToday ? 'Today' : isYesterday ? 'Yesterday' : date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
    if (!acc[key]) acc[key] = [];
    acc[key].push(n);
    return acc;
  }, {});

  return (
    <div className="notif-page">
      <div className="notif-page-header">
        <div className="notif-page-header-left">
          <h1>Notifications</h1>
          <p>{unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}</p>
        </div>
        <div className="notif-header-actions">
          <div className="notif-filter-tabs">
            <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>All</button>
            <button className={filter === 'unread' ? 'active' : ''} onClick={() => setFilter('unread')}>
              Unread {unreadCount > 0 && <span className="tab-badge">{unreadCount}</span>}
            </button>
          </div>
          {unreadCount > 0 && (
            <button className="mark-all-btn" onClick={markAllRead}>Mark all read</button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="notif-loading">
          {[...Array(4)].map((_, i) => <div key={i} className="notif-skeleton" />)}
        </div>
      ) : visible.length === 0 ? (
        <div className="notif-empty">
          <div className="notif-empty-icon">🔔</div>
          <p>{filter === 'unread' ? 'No unread notifications.' : 'No notifications yet.'}</p>
          {filter === 'unread' && (
            <button onClick={() => setFilter('all')}>View all</button>
          )}
        </div>
      ) : (
        <div className="notif-groups">
          {Object.entries(grouped).map(([date, items]) => (
            <div key={date} className="notif-group">
              <div className="notif-group-label">{date}</div>
              <div className="notif-list">
                {items.map((n: any) => {
                  const meta = TYPE_META[n.type] ?? { icon: '🔔', label: n.type };
                  return (
                    <div
                      key={n.id}
                      className={`notif-card ${!n.is_read ? 'unread' : ''} ${n.link ? 'clickable' : ''}`}
                      onClick={() => markRead(n)}
                    >
                      <div className="notif-icon-wrap">
                        <span className="notif-icon">{meta.icon}</span>
                      </div>
                      <div className="notif-body">
                        <div className="notif-type-label">{meta.label}</div>
                        <div className="notif-title">{n.title}</div>
                        {n.body && <div className="notif-text">{n.body}</div>}
                        <div className="notif-time">
                          {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          {n.link && <span className="notif-link-hint"> · tap to open →</span>}
                        </div>
                      </div>
                      {!n.is_read && <div className="unread-dot" />}
                      <button
                        className="notif-dismiss"
                        onClick={(e) => deleteNotification(e, n.id)}
                        title="Dismiss"
                      >✕</button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}