// src/app/staff/profile/page.tsx
'use client';

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function ProfilePage() {
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
    });
  }, []);

  const name = user?.user_metadata?.name || user?.email || 'N/A';
  const designation = user?.user_metadata?.designation || 'N/A';
  const staffNo = user?.user_metadata?.staffNo || 'N/A';
  const email = user?.email || 'N/A';
  const role = user?.user_metadata?.role || 'STAFF';

  return (
    <div className="profile-page">
      <h1>My Profile</h1>

      <div className="profile-card">
        <div className="profile-avatar">
          {name.slice(0, 2).toUpperCase()}
        </div>

        <div className="profile-info">
          <h2>{name}</h2>
          <p className="designation">{designation}</p>
          <p className="staffno">Staff No: {staffNo}</p>
          <p className="email">{email}</p>
        </div>

        <div className="role-badge">
          {role === 'SUPER_ADMIN' ? 'Super Admin (ESS Director)' : role}
        </div>
      </div>
    </div>
  );
}