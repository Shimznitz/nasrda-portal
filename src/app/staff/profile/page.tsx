// src/app/staff/profile/page.tsx
'use client';

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import "./profile.css";

export default function ProfilePage() {
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: prof } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      setProfile(prof);
      setLoading(false);
    };

    loadProfile();
  }, []);

  if (loading) return <div className="loading">Loading profile...</div>;
  if (!profile) return <div className="empty-state">Profile not found</div>;

  return (
    <div className="profile-page">
      <div className="profile-header">
        <div className="profile-avatar-large">
          {(profile.name?.slice(0, 2).toUpperCase()) || 'NA'}
        </div>

        <div>
          <h1>{profile.name}</h1>
          <p className="designation">{profile.designation}</p>
          <p className="staff-no">Staff No: {profile.staff_no}</p>
        </div>
      </div>

      <div className="profile-content">
        <div className="info-card">
          <h3>Personal Information</h3>

          <div className="info-grid">
            <div className="info-item">
              <span className="label">Email</span>
              <span className="value">{profile.email}</span>
            </div>

            <div className="info-item">
              <span className="label">Role</span>
              <span className="value role-badge">{profile.role}</span>
            </div>

            {profile.centre_name && (
              <div className="info-item">
                <span className="label">Centre</span>
                <span className="value">{profile.centre_name}</span>
              </div>
            )}

            {profile.division_name && (
              <div className="info-item">
                <span className="label">Division</span>
                <span className="value">{profile.division_name}</span>
              </div>
            )}
          </div>
        </div>

        <div className="quick-stats">
          <div className="stat-box">
            <div className="stat-number">12</div>
            <div className="stat-label">Projects</div>
          </div>

          <div className="stat-box">
            <div className="stat-number">87%</div>
            <div className="stat-label">Completion</div>
          </div>
        </div>
      </div>
    </div>
  );
}