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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    let interval: NodeJS.Timeout;

    const load = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || !mounted) return;

        const { data: prof } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single();

        if (mounted) setProfile(prof);

        // Fetch notification counts
        const fetchCounts = async () => {
          if (!user || !mounted) return;

          const { count: nc } = await supabase
            .from('notifications')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .eq('read', false);

          const { count: mc } = await supabase
            .from('messages')
            .select('*', { count: 'exact', head: true })
            .eq('receiver_id', user.id)
            .eq('read', false);

          if (mounted) {
            setUnreadNotifs(nc || 0);
            setUnreadMsgs(mc || 0);
          }
        };

        await fetchCounts();
        interval = setInterval(fetchCounts, 15000); // 15 seconds instead of 10

      } catch (err) {
        console.error("Topbar load error:", err);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();

    // Theme
    setIsLight(document.body.classList.contains('light-mode'));

    return () => {
      mounted = false;
      if (interval) clearInterval(interval);
    };
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