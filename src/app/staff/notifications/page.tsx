// src/app/staff/notifications/page.tsx
'use client';

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import "./notifications.css";

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  const fetchNotifications = async (uid: string) => {
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', uid)
      .order('created_at', { ascending: false });
    setNotifications(data || []);
    setLoading(false);
  };

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
      await fetchNotifications(user.id);

      // Poll every 10 seconds
      const interval = setInterval(() => fetchNotifications(user.id), 10000);
      return () => clearInterval(interval);
    };
    load();
  }, []);

  const markRead = async (id: string) => {
    await supabase.from('notifications').update({ read: true }).eq('id', id);
    setNotifications(prev => prev.map((n: any) =>
      n.id === id ? { ...n, read: true } : n));
  };

  const markAllRead = async () => {
    if (!userId) return;
    await supabase.from('notifications').update({ read: true }).eq('user_id', userId);
    setNotifications(prev => prev.map((n: any) => ({ ...n, read: true })));
  };

  const getTypeIcon = (type: string) => {
    if (type === 'TASK') return '✅';
    if (type === 'PROJECT') return '📁';
    if (type === 'DEADLINE') return '⏰';
    if (type === 'SUBMISSION') return '📤';
    return '🔔';
  };

  const unreadCount = notifications.filter((n: any) => !n.read).length;

  return (
    <div className="notifications-page">
      <div className="page-header">
        <div>
          <h1>Notifications</h1>
          <p>{unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}</p>
        </div>
        {unreadCount > 0 && (
          <button className="mark-all-btn" onClick={markAllRead}>
            Mark all as read
          </button>
        )}
      </div>

      {loading ? <p className="loading">Loading...</p> :
        notifications.length === 0 ? (
          <div className="empty-state"><p>No notifications yet.</p></div>
        ) : (
          <div className="notif-list">
            {notifications.map((n: any) => (
              <div key={n.id}
                className={`notif-card ${!n.read ? 'unread' : ''}`}
                onClick={() => markRead(n.id)}>
                <div className="notif-icon">{getTypeIcon(n.type)}</div>
                <div className="notif-body">
                  <div className="notif-title">{n.title}</div>
                  {n.body && <div className="notif-text">{n.body}</div>}
                  <div className="notif-time">
                    {new Date(n.created_at).toLocaleDateString()} · {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
                {!n.read && <div className="unread-dot"></div>}
              </div>
            ))}
          </div>
        )}
    </div>
  );
}