/* src/components/layout/Sidebar.tsx */

'use client';

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import Image from "next/image";
import "./Sidebar.css";

interface NavItem {
  href: string;
  label: string;
  icon: string;
}

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [profile, setProfile] = useState<any>(null);
  const [isESS, setIsESS] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: prof } = await supabase
        .from('profiles').select('*').eq('id', user.id).single();
      setProfile(prof);

      if (prof?.role === 'DEPT_ADMIN') {
        const { data: dept } = await supabase
          .from('departments').select('name').eq('head_id', user.id).single();
        if (dept) {
          const name = dept.name?.toUpperCase();
          setIsESS(name?.includes('ESS') || name?.includes('ENGINEERING') || name?.includes('SPACE SYSTEMS'));
        }
      }

      // Unread notifications
      const { count } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('read', false);
      setUnreadCount(count ?? 0);
    };
    load();

    // Poll unread count every 15s
    const interval = setInterval(async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { count } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('read', false);
      setUnreadCount(count ?? 0);
    }, 15000);

    return () => clearInterval(interval);
  }, []);

  const role = profile?.role;

  const getNavItems = (): NavItem[] => {
    const base: NavItem[] = [
      { href: '/staff/dashboard', label: 'Dashboard', icon: '⬡' },
    ];

    const notifications: NavItem = { href: '/staff/notifications', label: 'Notifications', icon: '🔔' };
    const messages: NavItem = { href: '/staff/messages', label: 'Messages', icon: '💬' };
    const directory: NavItem = { href: '/staff/staff-directory', label: 'Staff Directory', icon: '👥' };
    const profile_link: NavItem = { href: '/staff/profile', label: 'My Profile', icon: '◯' };
    const projects: NavItem = { href: '/staff/projects', label: 'Projects', icon: '◈' };
    const triage: NavItem = { href: '/staff/directory', label: 'Staff Triage', icon: '⚡' };

    switch (role) {
      case 'SUPER_ADMIN':
      case 'DG':
        return [
          ...base,
          triage,
          { href: '/staff/departments', label: 'Departments', icon: '▦' },
          { href: '/staff/centres', label: 'Centres & Labs', icon: '◫' },
          { ...projects, label: 'All Projects' },
          directory,
          messages,
          notifications,
          profile_link,
        ];

      case 'DEPT_ADMIN':
        return [
          ...base,
          triage,
          { href: '/staff/divisions', label: 'Divisions', icon: '▧' },
          { href: '/staff/units', label: 'Units', icon: '▨' },
          ...(isESS ? [
            { href: '/staff/centres', label: 'Centres', icon: '◫' },
            { href: '/staff/labs', label: 'Labs', icon: '⬡' },
          ] : []),
          { ...projects, label: 'Department Projects' },
          directory,
          messages,
          notifications,
          profile_link,
        ];

      case 'DIVISION_HEAD':
        return [
          ...base,
          { href: '/staff/units', label: 'Units', icon: '▨' },
          { ...projects, label: 'Division Projects' },
          directory,
          messages,
          notifications,
          profile_link,
        ];

      case 'UNIT_HEAD':
        return [
          ...base,
          { ...projects, label: 'Unit Projects' },
          directory,
          messages,
          notifications,
          profile_link,
        ];

      case 'CENTRE_ADMIN':
      case 'CENTRE_HEAD':
        return [
          ...base,
          { href: '/staff/labs', label: 'Labs', icon: '⬡' },
          { ...projects, label: 'Centre Projects' },
          directory,
          messages,
          notifications,
          profile_link,
        ];

      default:
        return [
          ...base,
          { ...projects, label: 'My Projects' },
          messages,
          notifications,
          profile_link,
        ];
    }
  };

  const navItems = getNavItems();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const name = profile?.name || 'User';
  const initials = name.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase();

  return (
    <aside className="sidebar">
      <div className="logo-section">
        <div className="logo-icon">
          <Image src="/nasrdalogo.png" alt="NASRDA" width={44} height={44} className="official-logo" priority />
        </div>
        <div>
          <div className="logo-title">NASRDA</div>
          <div className="logo-subtitle">STAFF PORTAL</div>
        </div>
      </div>

      <nav className="nav-section">
        {navItems.map((item) => {
          const isNotif = item.href === '/staff/notifications';
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-link ${active ? 'active' : ''}`}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
              {isNotif && unreadCount > 0 && (
                <span className="nav-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <div className="user-info">
          <div className="user-avatar">{initials}</div>
          <div className="user-details">
            <div className="user-name">{name}</div>
            <div className="user-staffno">{profile?.staff_no || formatRole(profile?.role || '')}</div>
          </div>
        </div>
        <button onClick={handleSignOut} className="signout-btn">Sign Out</button>
      </div>
    </aside>
  );
}

function formatRole(role: string) {
  return role?.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) ?? '';
}