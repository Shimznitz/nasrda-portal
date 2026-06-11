/* src/components/layout/Sidebar.tsx */
'use client';

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import Image from "next/image";
import "./Sidebar.css";

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [profile, setProfile] = useState<any>(null);
  const [userDept, setUserDept] = useState<any>(null);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      const { data: profileData } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      setProfile(profileData);

      if (profileData && profileData.role === 'DEPT_ADMIN') {
        const { data: deptData } = await supabase
          .from('departments')
          .select('*')
          .eq('head_id', user.id)
          .single();
        setUserDept(deptData);
      }
    };
    load();
  }, []);

  const role = profile?.role;

  const getNavItems = () => {
    // Define the triage link
    const triageLink = { href: '/staff/directory', label: 'Staff Triage' };

    switch (role) {
      case 'SUPER_ADMIN':
      case 'ADMIN':
      case 'DG':
        return [
          { href: '/staff/dashboard', label: 'Dashboard' },
          triageLink,
          { href: '/staff/departments', label: 'Manage Departments' }, 
          { href: '/staff/centres', label: 'Manage Centres & Labs' },
          { href: '/staff/projects', label: 'All Projects' },
          { href: '/staff/staff-directory', label: 'Global Directory' },
          { href: '/staff/messages', label: 'Messages' },
          { href: '/staff/notifications', label: 'Notifications' },
          { href: '/staff/profile', label: 'My Profile' },
        ];

      case 'DEPT_ADMIN': 
        const isESS = userDept?.name?.toUpperCase().includes('ESS') || 
                     userDept?.name?.toUpperCase().includes('ENGINEERING AND SPACE SYSTEMS');
        
        return [
          { href: '/staff/dashboard', label: 'Dashboard' },
          triageLink, // Added Triage for Directors
          { href: '/staff/divisions', label: 'Manage Divisions' },
          { href: '/staff/units', label: 'Manage Units' },
          ...(isESS ? [{ href: '/staff/centres', label: 'Manage Centres' }, { href: '/staff/labs', label: 'Manage Labs' }] : []),
          { href: '/staff/projects', label: 'Department Projects and Activities' },
          { href: '/staff/staff-directory', label: 'Staff Directory' },
          { href: '/staff/messages', label: 'Messages' },
          { href: '/staff/profile', label: 'My Profile' },
        ];

      case 'DIVISION_HEAD':
        return [
          { href: '/staff/dashboard', label: 'Dashboard' },
          { href: '/staff/units', label: 'Manage Units' },
          { href: '/staff/projects', label: 'Division Projects or Activities' },
          { href: '/staff/staff-directory', label: 'Staff Directory' },
          { href: '/staff/messages', label: 'Messages' },
          { href: '/staff/notifications', label: 'Notifications' },
          { href: '/staff/profile', label: 'My Profile' },
        ];

      case 'UNIT_HEAD':
        return [
          { href: '/staff/dashboard', label: 'Dashboard' },
          { href: '/staff/projects', label: 'Unit Projects or Activities' },
          { href: '/staff/staff-directory', label: 'Staff Directory' },
          { href: '/staff/messages', label: 'Messages' },
          { href: '/staff/notifications', label: 'Notifications' },
          { href: '/staff/profile', label: 'My Profile' },
        ];

      case 'CENTRE_ADMIN':
        return [
          { href: '/staff/dashboard', label: 'Dashboard' },
          { href: '/staff/labs', label: 'Manage Labs' },
          { href: '/staff/projects', label: 'Centre Projects' },
          { href: '/staff/staff-directory', label: 'Staff Directory' },
          { href: '/staff/messages', label: 'Messages' },
          { href: '/staff/notifications', label: 'Notifications' },
          { href: '/staff/profile', label: 'My Profile' },
        ];

      case 'STAFF':
      default:
        return [
          { href: '/staff/dashboard', label: 'Dashboard' },
          { href: '/staff/projects', label: 'My Projects' },
          { href: '/staff/messages', label: 'Messages' },
          { href: '/staff/notifications', label: 'Notifications' },
          { href: '/staff/profile', label: 'My Profile' },
        ];
    }
  };

  const navItems = getNavItems();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const name = profile?.name || 'User';
  const staffNo = profile?.staff_no || '';

  return (
    <aside className="sidebar">
      <div className="logo-section">
        <div className="logo-icon">
          <Image src="/nasrdalogo.png" alt="NASRDA Logo" width={48} height={48} className="official-logo" priority />
        </div>
        <div>
          <div className="logo-title">NASRDA</div>
          <div className="logo-subtitle">STAFF PORTAL</div>
        </div>
      </div>

      <nav className="nav-section">
        {navItems.map((item) => (
          <Link 
            key={item.href} 
            href={item.href}
            className={`nav-link ${pathname === item.href ? 'active' : ''}`}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="user-info">
          <div className="user-avatar">{name.slice(0, 2).toUpperCase()}</div>
          <div>
            <div className="user-name">{name}</div>
            <div className="user-staffno">{role === 'DEPT_ADMIN' ? 'DIR • ' : ''}{staffNo}</div>
          </div>
        </div>
        <button onClick={handleSignOut} className="signout-btn">Sign Out</button>
      </div>
    </aside>
  );
}