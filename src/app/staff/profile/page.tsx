// src/app/staff/profile/page.tsx

'use client';

import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabase";
import "./profile.css";

export default function ProfilePage() {
  const [profile, setProfile]       = useState<any>(null);
  const [loading, setLoading]       = useState(true);
  const [centreName, setCentreName] = useState<string | null>(null);
  const [divisionName, setDivisionName] = useState<string | null>(null);
  const [stats, setStats]           = useState({ totalProjects: 0, avgCompletion: 0 });
  const [uploading, setUploading]   = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: prof } = await supabase
          .from('profiles').select('*').eq('id', user.id).single();

        if (!prof) return;
        setProfile(prof);

        if (prof.centre_id) {
          const { data: centre } = await supabase
            .from('centres').select('name').eq('id', prof.centre_id).single();
          if (centre) setCentreName(centre.name);
        }

        if (prof.division_id) {
          const { data: division } = await supabase
            .from('divisions').select('name').eq('id', prof.division_id).single();
          if (division) setDivisionName(division.name);
        }

        const { data: memberships } = await supabase
          .from('project_members').select('project_id').eq('profile_id', user.id);

        if (memberships && memberships.length > 0) {
          const total = memberships.length;
          const { data: projects } = await supabase
            .from('projects').select('progress')
            .in('id', memberships.map((m: any) => m.project_id));
          const avg = projects && projects.length > 0
            ? Math.round(projects.reduce((sum, p) => sum + (p.progress ?? 0), 0) / projects.length)
            : 0;
          setStats({ totalProjects: total, avgCompletion: avg });
        }
      } finally {
        setLoading(false);
      }
    };
    loadProfile();
  }, []);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;

    setUploadError('');
    setUploadSuccess(false);

    // Validate size — max 500KB
    if (file.size > 500 * 1024) {
      setUploadError('Image must be under 500KB. Please compress it and try again.');
      return;
    }

    // Validate type
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setUploadError('Only JPG, PNG, or WebP images are allowed.');
      return;
    }

    setUploading(true);

    try {
      const ext = file.name.split('.').pop();
      const path = `${profile.id}/avatar.${ext}`;

      // Remove old avatar if exists
      await supabase.storage.from('avatars').remove([path]);

      const { error: uploadErr } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true });

      if (uploadErr) {
        setUploadError('Upload failed: ' + uploadErr.message);
        return;
      }

      const { data: urlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(path);

      // Add cache buster to force refresh
      const avatarUrl = urlData.publicUrl + '?t=' + Date.now();

      const { error: updateErr } = await supabase
        .from('profiles')
        .update({ avatar_url: avatarUrl })
        .eq('id', profile.id);

      if (updateErr) {
        setUploadError('Failed to save avatar: ' + updateErr.message);
        return;
      }

      setProfile((prev: any) => ({ ...prev, avatar_url: avatarUrl }));
      setUploadSuccess(true);
      setTimeout(() => setUploadSuccess(false), 3000);
    } finally {
      setUploading(false);
    }
  };

  const removeAvatar = async () => {
    if (!profile) return;
    setUploading(true);
    try {
      const ext = profile.avatar_url?.split('.').pop()?.split('?')[0];
      if (ext) {
        await supabase.storage.from('avatars').remove([`${profile.id}/avatar.${ext}`]);
      }
      await supabase.from('profiles').update({ avatar_url: null }).eq('id', profile.id);
      setProfile((prev: any) => ({ ...prev, avatar_url: null }));
    } finally {
      setUploading(false);
    }
  };

  const formatRole = (role: string) =>
    role?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) ?? '—';

  if (loading) return <div className="profile-loading"><span>Loading profile…</span></div>;
  if (!profile) return <div className="profile-empty">Profile not found</div>;

  const initials = profile.name
    ? profile.name.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()
    : 'NA';

  return (
    <div className="profile-page">
      <div className="profile-header">
        {/* Avatar with upload */}
        <div className="profile-avatar-wrap">
          <div className="profile-avatar-large">
            {profile.avatar_url ? (
              <img src={profile.avatar_url} alt={profile.name} className="profile-avatar-img" />
            ) : (
              <span className="profile-avatar-initials">{initials}</span>
            )}
            {/* Upload overlay */}
            <button
              className="profile-avatar-edit"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              title="Change profile picture"
            >
              {uploading ? '⏳' : '📷'}
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleAvatarUpload}
            style={{ display: 'none' }}
          />
          {profile.avatar_url && (
            <button className="profile-avatar-remove" onClick={removeAvatar} disabled={uploading}>
              Remove photo
            </button>
          )}
          {uploadError && <div className="profile-upload-error">{uploadError}</div>}
          {uploadSuccess && <div className="profile-upload-success">✓ Photo updated</div>}
          <div className="profile-avatar-hint">Max 500KB · JPG, PNG, WebP</div>
        </div>

        <div className="profile-header-info">
          <h1>{profile.name}</h1>
          <p className="designation">{profile.designation || '—'}</p>
          <p className="staff-no">{profile.staff_no}</p>
          <span className="role-badge-header">{formatRole(profile.role)}</span>
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