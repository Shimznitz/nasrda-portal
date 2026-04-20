// src/components/layout/Topbar.tsx
'use client';

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import "./Topbar.css";

export default function Topbar() {
  const [profile, setProfile] = useState<any>(null);
  const [isLight, setIsLight] = useState(false);
  const [unreadNotifs, setUnreadNotifs] = useState(0);
  const [unreadMsgs, setUnreadMsgs] = useState(0);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: prof } = await supabase
        .from('profiles').select('*').eq('id', user.id).single();
      setProfile(prof);

      const fetchCounts = async () => {
        const { count: nc } = await supabase
          .from('notifications')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('read', false);
        setUnreadNotifs(nc || 0);

        const { count: mc } = await supabase
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .eq('receiver_id', user.id)
          .eq('read', false);
        setUnreadMsgs(mc || 0);
      };

      fetchCounts();
      // Poll every 10 seconds
      const interval = setInterval(fetchCounts, 10000);
      return () => clearInterval(interval);
    };

    load();
    setIsLight(document.body.classList.contains('light-mode'));
  }, []);

  const toggleTheme = () => {
    document.body.classList.toggle('light-mode');
    setIsLight(!isLight);
  };

  const name = profile?.name || 'User';
  const firstName = name.split(' ')[0];
  const initials = name.slice(0, 2).toUpperCase();
  const role = profile?.role || 'STAFF';

  return (
    <header className="topbar">
      <div className="topbar-content">
        <div className="greeting">
          Welcome back, <span className="highlight">{firstName}</span>
        </div>
        <div className="topbar-right">
          <button onClick={toggleTheme} className="theme-toggle">
            {isLight ? '☀️' : '🌙'}
          </button>
          <Link href="/staff/messages" className="icon-btn">
            💬
            {unreadMsgs > 0 && <span className="badge">{unreadMsgs}</span>}
          </Link>
          <Link href="/staff/notifications" className="icon-btn">
            🔔
            {unreadNotifs > 0 && <span className="badge">{unreadNotifs}</span>}
          </Link>
          <div className="user-info">
            <div>
              <div className="user-name">{name}</div>
              <div className="user-role">{role}</div>
            </div>
            <Link href="/staff/profile" style={{ textDecoration: 'none' }}>
  <div className="user-avatar">{initials}</div>
</Link>
          </div>
        </div>
      </div>
    </header>
  );
}