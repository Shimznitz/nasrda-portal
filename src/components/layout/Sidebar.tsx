/* src/components/layout/Sidebar.tsx */

'use client';

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import Image from "next/image";
import Avatar from "@/components/Avatar";
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
  const [unreadNotif, setUnreadNotif] = useState(0);
  const [pendingDocs, setPendingDocs] = useState(0);

  useEffect(() => {
    let mounted = true;
    let interval: any;

    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !mounted) return;

      const { data: prof } = await supabase
        .from('profiles').select('*').eq('id', user.id).single();
      if (!mounted) return;
      setProfile(prof);

      if (prof?.role === 'DEPT_ADMIN') {
        const { data: dept } = await supabase
          .from('departments').select('name').eq('head_id', user.id).single();
        if (dept && mounted) {
          const name = dept.name?.toUpperCase();
          setIsESS(
            name?.includes('ESS') ||
            name?.includes('ENGINEERING') ||
            name?.includes('SPACE SYSTEMS')
          );
        }
      }

      const fetchBadges = async () => {
        if (!mounted) return;
        try {
          // Unread notifications
          const { count: notifCount } = await supabase
            .from('notifications')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .eq('read', false);
          if (mounted) setUnreadNotif(notifCount ?? 0);

          // Pending file routes
          const { data: myRecipients } = await supabase
            .from('file_route_recipients')
            .select('id')
            .eq('profile_id', user.id)
            .eq('status', 'PENDING');
          if (mounted) setPendingDocs((myRecipients || []).length);
        } catch { /* ignore */ }
      };

      await fetchBadges();
      interval = setInterval(fetchBadges, 30000);
    };

    init();
    return () => {
      mounted = false;
      if (interval) clearInterval(interval);
    };
  }, []);

  const role = profile?.role;

  const getNavItems = (): NavItem[] => {
    /* ──────────────────────────────────────────────────────────────
       UNIFIED MODERN ICON SET
       All items share the same sleek, minimalist geometric family
    ────────────────────────────────────────────────────────────── */
    const dashboard:   NavItem = { href: '/staff/dashboard',        label: 'Dashboard',       icon: '⬡' };
    const triage:      NavItem = { href: '/staff/directory',        label: 'Staff Triage',    icon: '⚡' };
    const departments: NavItem = { href: '/staff/departments',      label: 'Departments',     icon: '▦' };
    const divisions:   NavItem = { href: '/staff/divisions',        label: 'Divisions',       icon: '▧' };
    const units:       NavItem = { href: '/staff/units',            label: 'Units',           icon: '▨' };
    const centres:     NavItem = { href: '/staff/centres',          label: 'Centres',         icon: '◫' };
    const labs:        NavItem = { href: '/staff/labs',             label: 'Labs',            icon: '⬢' };
    
    const tasks:       NavItem = { href: '/staff/tasks',            label: 'Tasks',           icon: '◈' };
    const activity:    NavItem = { href: '/staff/activity',         label: 'Activity Log',    icon: '∿' };
    const documents:   NavItem = { href: '/staff/documents',        label: 'Documents',       icon: '▤' };
    
    const directory:   NavItem = { href: '/staff/staff-directory', label: 'Staff Directory', icon: '◓' };
    const messages:    NavItem = { href: '/staff/messages',        label: 'Messages',        icon: '💬' };
    const notifications: NavItem = { href: '/staff/notifications', label: 'Notifications',   icon: '🔔' };
    const profileLink: NavItem = { href: '/staff/profile',         label: 'My Profile',      icon: '◯' };

    const allProjects:  NavItem = { href: '/staff/projects', label: 'All Projects',         icon: '❖' };
    const deptProjects: NavItem = { href: '/staff/projects', label: 'Department Projects',  icon: '❖' };
    const divProjects:  NavItem = { href: '/staff/projects', label: 'Division Projects',    icon: '❖' };
    const unitProjects: NavItem = { href: '/staff/projects', label: 'Unit Projects',        icon: '❖' };
    const myProjects:   NavItem = { href: '/staff/projects', label: 'My Projects',          icon: '❖' };

    switch (role) {
      case 'SUPER_ADMIN':
      case 'DG':
        return [
          dashboard, triage, departments, centres,
          allProjects, tasks, activity,
          documents, directory, messages, notifications, profileLink,
        ];

      case 'DEPT_ADMIN':
        return [
          dashboard, triage, divisions, units,
          ...(isESS ? [centres, labs] : []),
          deptProjects, tasks, activity,
          documents, directory, messages, notifications, profileLink,
        ];

      case 'DIVISION_HEAD':
        return [
          dashboard, units, triage,
          divProjects, tasks, activity,
          documents, directory, messages, notifications, profileLink,
        ];

      case 'UNIT_HEAD':
        return [
          dashboard, triage,
          unitProjects, tasks, activity,
          documents, directory, messages, notifications, profileLink,
        ];

      case 'CENTRE_ADMIN':
      case 'CENTRE_HEAD':
        return [
          dashboard, labs,
          { href: '/staff/projects', label: 'Centre Projects', icon: '❖' },
          tasks, activity,
          documents, directory, messages, notifications, profileLink,
        ];

      default: // STAFF
        return [
          dashboard,
          myProjects, tasks, activity,
          documents, directory, messages, notifications, profileLink,
        ];
    }
  };

  const navItems = getNavItems();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const name = profile?.name || 'User';
  const avatarInitials = name
    .split(' ')
    .map((n: string) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const getBadge = (href: string) => {
    if (href === '/staff/notifications' && unreadNotif > 0) return unreadNotif;
    if (href === '/staff/documents' && pendingDocs > 0) return pendingDocs;
    return null;
  };

  return (
    <aside className="sidebar">
      <div className="logo-section">
        <div className="logo-icon">
          <Image src="/nasrdalogo.png" alt="NASRDA" width={44} height={44}
            className="official-logo" priority />
        </div>
        <div>
          <div className="logo-title">ESS</div>
          <div className="logo-subtitle">ECO-SYSTEM</div>
        </div>
      </div>

      <nav className="nav-section">
        {navItems.map((item) => {
          const active = pathname === item.href;
          const badge = getBadge(item.href);
          return (
            <Link
              key={`${item.href}-${item.label}`}
              href={item.href}
              className={`nav-link ${active ? 'active' : ''}`}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
              {badge ? (
                <span className="nav-badge">
                  {badge > 99 ? '99+' : badge}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <div className="user-info">
          <Avatar name={profile?.name} avatarUrl={profile?.avatar_url} size="sm" />
          <div className="user-details">
            <div className="user-name">{name}</div>
            <div className="user-staffno">
              {profile?.staff_no || formatRole(profile?.role || '')}
            </div>
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