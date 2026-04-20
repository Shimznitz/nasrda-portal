// src/components/layout/Sidebar.tsx
'use client';

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import "./Sidebar.css";

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [profile, setProfile] = useState<any>(null);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      setProfile(data);
    };
    load();
  }, []);

  const role = profile?.role;

  const navItems = role === 'SUPER_ADMIN' ? [
    { href: '/staff/dashboard', label: 'Dashboard' },
    { href: '/staff/centres', label: 'Manage Centres & Labs' },
    { href: '/staff/divisions', label: 'Manage Divisions' },
    { href: '/staff/projects', label: 'All Projects' },
    { href: '/staff/staff-directory', label: 'Staff Directory' },
    { href: '/staff/messages', label: 'Messages' },
    { href: '/staff/notifications', label: 'Notifications' },
  ] : role === 'CENTRE_ADMIN' ? [
    { href: '/staff/dashboard', label: 'Dashboard' },
    { href: '/staff/divisions', label: 'Manage Divisions' },
    { href: '/staff/projects', label: 'Centre Projects' },
    { href: '/staff/staff-directory', label: 'Staff Directory' },
    { href: '/staff/messages', label: 'Messages' },
    { href: '/staff/notifications', label: 'Notifications' },
  ] : role === 'DIVISION_HEAD' || role === 'DEPT_HEAD' ? [
    { href: '/staff/dashboard', label: 'Dashboard' },
    { href: '/staff/divisions', label: 'Manage Units' },
    { href: '/staff/projects', label: 'Projects' },
    { href: '/staff/messages', label: 'Messages' },
    { href: '/staff/notifications', label: 'Notifications' },
  ] : role === 'UNIT_HEAD' ? [
    { href: '/staff/dashboard', label: 'Dashboard' },
    { href: '/staff/projects', label: 'Projects' },
    { href: '/staff/submit', label: 'Submit Work' },
    { href: '/staff/messages', label: 'Messages' },
    { href: '/staff/notifications', label: 'Notifications' },
    { href: '/staff/profile', label: 'My Profile' },
  ] : [
    { href: '/staff/dashboard', label: 'Dashboard' },
    { href: '/staff/projects', label: 'My Projects' },
    { href: '/staff/submit', label: 'Submit Work' },
    { href: '/staff/messages', label: 'Messages' },
    { href: '/staff/notifications', label: 'Notifications' },
    { href: '/staff/profile', label: 'My Profile' },
  ];

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const name = profile?.name || 'User';
  const staffNo = profile?.staff_no || '';

  return (
    <aside className="sidebar">
      <div className="logo-section">
        <div className="logo-icon">NS</div>
        <div>
          <div className="logo-title">NASRDA</div>
          <div className="logo-subtitle">STAFF PORTAL</div>
        </div>
      </div>

      <nav className="nav-section">
        {navItems.map((item) => (
          <Link key={item.href} href={item.href}
            className={`nav-link ${pathname === item.href ? 'active' : ''}`}>
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="user-info">
          <div className="user-avatar">{name.slice(0, 2).toUpperCase()}</div>
          <div>
            <div className="user-name">{name}</div>
            <div className="user-staffno">{staffNo}</div>
          </div>
        </div>
        <button onClick={handleSignOut} className="signout-btn">Sign Out</button>
      </div>
    </aside>
  );
}