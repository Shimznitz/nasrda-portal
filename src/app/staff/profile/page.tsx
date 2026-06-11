// src/app/staff/profile/page.tsx

'use client';

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import "./profile.css";

interface Profile {
  id: string;
  name: string;
  staff_no: string;
  email: string;
  designation: string;
  role: string;
  centre_id: string | null;
  division_id: string | null;
  unit_id: string | null;
  department_id: string | null;
}

interface ProfileStats {
  totalProjects: number;
  avgCompletion: number;
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [centreName, setCentreName] = useState<string | null>(null);
  const [divisionName, setDivisionName] = useState<string | null>(null);
  const [stats, setStats] = useState<ProfileStats>({ totalProjects: 0, avgCompletion: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: prof } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single();

        if (!prof) return;
        setProfile(prof);

        // Fetch centre name
        if (prof.centre_id) {
          const { data: centre } = await supabase
            .from('centres')
            .select('name')
            .eq('id', prof.centre_id)
            .single();
          if (centre) setCentreName(centre.name);
        }

        // Fetch division name
        if (prof.division_id) {
          const { data: division } = await supabase
            .from('divisions')
            .select('name')
            .eq('id', prof.division_id)
            .single();
          if (division) setDivisionName(division.name);
        }

        // Fetch real project stats via project_members
        const { data: memberships } = await supabase
          .from('project_members')
          .select('project_id, projects(progress)')
          .eq('profile_id', user.id);

        if (memberships && memberships.length > 0) {
          const total = memberships.length;
          const projects = memberships
            .map((m: any) => m.projects)
            .filter(Boolean);
          const avg = projects.length > 0
            ? Math.round(projects.reduce((sum: number, p: any) => sum + (p.progress ?? 0), 0) / projects.length)
            : 0;
          setStats({ totalProjects: total, avgCompletion: avg });
        }
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, []);

  if (loading) return <div className="profile-loading"><span>Loading profile…</span></div>;
  if (!profile) return <div className="profile-empty">Profile not found</div>;

  const initials = profile.name
    ? profile.name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()
    : 'NA';

  const formatRole = (role: string) =>
    role?.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) ?? '—';

  return (
    <div className="profile-page">
      <div className="profile-header">
        <div className="profile-avatar-large">{initials}</div>
        <div className="profile-header-info">
          <h1>{profile.name}</h1>
          <p className="designation">{profile.designation || '—'}</p>
          <p className="staff-no">{profile.staff_no}</p>
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
              <span className="value">
                <span className="role-badge">{formatRole(profile.role)}</span>
              </span>
            </div>
            {centreName && (
              <div className="info-item">
                <span className="label">Centre</span>
                <span className="value">{centreName}</span>
              </div>
            )}
            {divisionName && (
              <div className="info-item">
                <span className="label">Division</span>
                <span className="value">{divisionName}</span>
              </div>
            )}
            <div className="info-item">
              <span className="label">Staff No.</span>
              <span className="value mono">{profile.staff_no}</span>
            </div>
          </div>
        </div>

        <div className="quick-stats">
          <div className="stat-box">
            <div className="stat-number">{stats.totalProjects}</div>
            <div className="stat-label">Projects</div>
          </div>
          <div className="stat-box">
            <div className="stat-number">{stats.avgCompletion}%</div>
            <div className="stat-label">Avg. Completion</div>
          </div>
        </div>
      </div>
    </div>
  );
}