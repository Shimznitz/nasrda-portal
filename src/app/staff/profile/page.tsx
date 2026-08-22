// src/app/staff/profile/page.tsx

'use client';

import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabase";
import "./profile.css";

const DEGREE_LEVELS = ['BSc', 'MSc', 'PhD', 'HND', 'OND', 'Other'];

const COURSES = [
  'Electrical Engineering',
  'Mechanical Engineering',
  'Mechatronics Engineering',
  'Computer Science',
  'Information Technology',
  'Physics',
  'Mathematics',
  'Aerospace Engineering',
  'Civil Engineering',
  'Chemical Engineering',
  'Systems Engineering',
  'Software Engineering',
  'Electronics Engineering',
  'Telecommunications Engineering',
  'Remote Sensing & GIS',
  'Geography',
  'Environmental Science',
  'Business Administration',
  'Public Administration',
  'Economics',
  'Law',
  'Mass Communication',
  'Other',
];

const SKILLS_LIST = [
  'Project Management',
  'Data Analysis',
  'Software Development',
  'Systems Engineering',
  'Satellite Operations',
  'Remote Sensing',
  'GIS & Mapping',
  'Embedded Systems',
  'RF & Communications',
  'Mechanical Design',
  'Electrical Design',
  'Research & Development',
  'Technical Writing',
  'Budget Management',
  'Team Leadership',
  'Policy Development',
  'Procurement',
  'Quality Assurance',
  'Network Administration',
  'Cybersecurity',
];

export default function ProfilePage() {
  const [profile, setProfile]           = useState<any>(null);
  const [loading, setLoading]           = useState(true);
  const [editing, setEditing]           = useState(false);
  const [saving, setSaving]             = useState(false);
  const [saveSuccess, setSaveSuccess]   = useState(false);
  const [orgNames, setOrgNames]         = useState<any>({});
  const [stats, setStats]               = useState({ totalProjects: 0, avgCompletion: 0, openTasks: 0 });

  // Security state
  const [showEmailForm, setShowEmailForm]       = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [newEmail, setNewEmail]                 = useState('');
  const [newPassword, setNewPassword]           = useState('');
  const [confirmPassword, setConfirmPassword]   = useState('');
  const [authSaving, setAuthSaving]             = useState(false);
  const [authError, setAuthError]               = useState('');
  const [authSuccess, setAuthSuccess]           = useState('');

  // Edit form
  const [editForm, setEditForm] = useState({
    designation:    '',
    degree_level:   '',
    course_of_study: '',
    qualification:  '',
    whatsapp:       '',
    bio:            '',
    skills:         [] as string[],
  });

  // Avatar
  const [uploading, setUploading]         = useState(false);
  const [uploadError, setUploadError]     = useState('');
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { loadProfile(); }, []);

  const loadProfile = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: prof } = await supabase
        .from('profiles').select('*').eq('id', user.id).single();
      if (!prof) return;

      setProfile(prof);
      setEditForm({
        designation:     prof.designation     || '',
        degree_level:    prof.degree_level    || '',
        course_of_study: prof.course_of_study || '',
        qualification:   prof.qualification   || '',
        whatsapp:        prof.whatsapp        || '',
        bio:             prof.bio             || '',
        skills:          prof.skills          || [],
      });

      // Fetch org names
      const names: any = {};
      if (prof.department_id) {
        const { data } = await supabase.from('departments').select('name').eq('id', prof.department_id).maybeSingle();
        if (data) names.department = data.name;
      }
      if (prof.division_id) {
        const { data } = await supabase.from('divisions').select('name').eq('id', prof.division_id).maybeSingle();
        if (data) names.division = data.name;
      }
      if (prof.unit_id) {
        const { data } = await supabase.from('units').select('name').eq('id', prof.unit_id).maybeSingle();
        if (data) names.unit = data.name;
      }
      if (prof.centre_id) {
        const { data } = await supabase.from('centres').select('name').eq('id', prof.centre_id).maybeSingle();
        if (data) names.centre = data.name;
      }
      setOrgNames(names);

      // Stats
      const { data: memberships } = await supabase
        .from('project_members').select('project_id').eq('profile_id', user.id);
      const ids = memberships?.map((m: any) => m.project_id) || [];

      if (ids.length > 0) {
        const { data: projects } = await supabase
          .from('projects').select('progress').in('id', ids);
        const avg = projects?.length
          ? Math.round(projects.reduce((s, p) => s + (p.progress ?? 0), 0) / projects.length)
          : 0;
        const { count: openTasks } = await supabase
          .from('tasks').select('id', { count: 'exact', head: true })
          .eq('assigned_to', user.id).neq('status', 'COMPLETED');
        setStats({ totalProjects: ids.length, avgCompletion: avg, openTasks: openTasks ?? 0 });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!profile) return;
    setSaving(true);

    const whatsapp = editForm.whatsapp.replace(/\s/g, '');

    // Build qualification string from degree + course
    const qualStr = editForm.degree_level && editForm.course_of_study
      ? `${editForm.degree_level} ${editForm.course_of_study}`
      : editForm.qualification || null;

    const { error } = await supabase.from('profiles').update({
      designation:     editForm.designation.trim()    || null,
      degree_level:    editForm.degree_level          || null,
      course_of_study: editForm.course_of_study       || null,
      qualification:   qualStr,
      whatsapp:        whatsapp                       || null,
      bio:             editForm.bio.trim()            || null,
      skills:          editForm.skills.length > 0 ? editForm.skills : null,
    }).eq('id', profile.id);

    if (!error) {
      await loadProfile();
      setEditing(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    }
    setSaving(false);
  };

  const toggleSkill = (skill: string) => {
    setEditForm(prev => ({
      ...prev,
      skills: prev.skills.includes(skill)
        ? prev.skills.filter(s => s !== skill)
        : [...prev.skills, skill],
    }));
  };

  const handleEmailChange = async () => {
    if (!newEmail.trim()) return;
    setAuthSaving(true); setAuthError(''); setAuthSuccess('');
    const { error } = await supabase.auth.updateUser({ email: newEmail.trim() });
    if (error) {
      setAuthError(error.message);
    } else {
      // Also update profiles table
      await supabase.from('profiles').update({ email: newEmail.trim() }).eq('id', profile.id);
      setAuthSuccess(`Confirmation sent to ${newEmail}. Check your inbox to confirm the change.`);
      setNewEmail('');
      setShowEmailForm(false);
    }
    setAuthSaving(false);
  };

  const handlePasswordChange = async () => {
    if (!newPassword) { setAuthError('Enter a new password.'); return; }
    if (newPassword !== confirmPassword) { setAuthError('Passwords do not match.'); return; }
    if (newPassword.length < 6) { setAuthError('Password must be at least 6 characters.'); return; }
    setAuthSaving(true); setAuthError(''); setAuthSuccess('');
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      setAuthError(error.message);
    } else {
      setAuthSuccess('Password updated successfully. Use your new password next time you log in.');
      setNewPassword(''); setConfirmPassword('');
      setShowPasswordForm(false);
    }
    setAuthSaving(false);
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;
    setUploadError(''); setUploadSuccess(false);

    if (file.size > 500 * 1024) { setUploadError('Image must be under 500KB.'); return; }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setUploadError('Only JPG, PNG or WebP allowed.'); return;
    }

    setUploading(true);
    try {
      const ext  = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
      const path = `${profile.id}/avatar.${ext}`;

      const { error: upErr } = await supabase.storage
        .from('avatars').upload(path, file, { upsert: true, contentType: file.type });

      if (upErr) { setUploadError('Upload failed: ' + upErr.message); return; }

      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
      const avatarUrl = urlData.publicUrl + '?t=' + Date.now();

      await supabase.from('profiles').update({ avatar_url: avatarUrl }).eq('id', profile.id);
      setProfile((p: any) => ({ ...p, avatar_url: avatarUrl }));
      setUploadSuccess(true);
      setTimeout(() => setUploadSuccess(false), 3000);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeAvatar = async () => {
    if (!profile) return;
    setUploading(true);
    try {
      const url  = profile.avatar_url?.split('?')[0];
      const path = url?.split('/avatars/')[1];
      if (path) await supabase.storage.from('avatars').remove([path]);
      await supabase.from('profiles').update({ avatar_url: null }).eq('id', profile.id);
      setProfile((p: any) => ({ ...p, avatar_url: null }));
    } finally {
      setUploading(false);
    }
  };

  const fmt = (role: string) =>
    role?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) ?? '—';

  const inits = profile?.name
    ? profile.name.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase()
    : 'NA';

  if (loading) return <div className="pf-loading"><div className="pf-loading-bar" /></div>;
  if (!profile) return <div className="pf-empty">Profile not found.</div>;

  const qualDisplay = profile.degree_level && profile.course_of_study
    ? `${profile.degree_level} ${profile.course_of_study}`
    : profile.qualification || null;

  return (
    <div className="pf-page">

      {/* ── Header ── */}
      <div className="pf-header">
        <div className="pf-avatar-section">
          <div className="pf-avatar-ring">
            {profile.avatar_url ? (
              <img src={profile.avatar_url} alt={profile.name} className="pf-avatar-img" />
            ) : (
              <span className="pf-avatar-initials">{inits}</span>
            )}
            <button className="pf-avatar-camera"
              onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              {uploading ? '⏳' : '📷'}
            </button>
          </div>
          <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp"
            onChange={handleAvatarUpload} style={{ display: 'none' }} />
          <div className="pf-avatar-meta">
            {uploadError   && <div className="pf-msg error">{uploadError}</div>}
            {uploadSuccess && <div className="pf-msg success">✓ Photo updated</div>}
            <div className="pf-avatar-hint">Max 500KB · JPG / PNG / WebP</div>
            {profile.avatar_url && (
              <button className="pf-remove-photo" onClick={removeAvatar} disabled={uploading}>
                Remove photo
              </button>
            )}
          </div>
        </div>

        <div className="pf-header-info">
          <h1 className="pf-name">{profile.name}</h1>
          {profile.designation && <p className="pf-designation">{profile.designation}</p>}
          {profile.staff_no    && <p className="pf-staffno">{profile.staff_no}</p>}
          <div className="pf-role-badge">{fmt(profile.role)}</div>
          {qualDisplay && <div className="pf-qualification">{qualDisplay}</div>}
          {profile.skills?.length > 0 && (
            <div className="pf-skills-preview">
              {profile.skills.slice(0, 4).map((s: string) => (
                <span key={s} className="pf-skill-chip">{s}</span>
              ))}
              {profile.skills.length > 4 && (
                <span className="pf-skill-chip more">+{profile.skills.length - 4} more</span>
              )}
            </div>
          )}
          {profile.bio && <p className="pf-bio">{profile.bio}</p>}

          {/* Org breadcrumb */}
          <div className="pf-org-row">
            {orgNames.department && <span className="pf-org-chip">🏛 {orgNames.department}</span>}
            {orgNames.division   && <span className="pf-org-chip">▧ {orgNames.division}</span>}
            {orgNames.unit       && <span className="pf-org-chip">▨ {orgNames.unit}</span>}
            {orgNames.centre     && <span className="pf-org-chip">◫ {orgNames.centre}</span>}
          </div>
        </div>

        <div className="pf-header-actions">
          {!editing ? (
            <button className="pf-btn-outline" onClick={() => setEditing(true)}>✏️ Edit Profile</button>
          ) : (
            <div className="pf-action-row">
              <button className="pf-btn-outline" onClick={() => setEditing(false)}>Cancel</button>
              <button className="pf-btn-gold" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          )}
          {saveSuccess && <div className="pf-msg success pf-save-msg">✓ Profile updated</div>}
        </div>
      </div>

      <div className="pf-content">
        {/* ── Edit / View card ── */}
        <div className="pf-card">
          <h3>{editing ? 'Edit Profile' : 'Personal Information'}</h3>

          {editing ? (
            <div className="pf-edit-form">

              <div className="pf-form-group">
                <label>Designation / Job Title</label>
                <input className="pf-input" value={editForm.designation}
                  onChange={e => setEditForm({ ...editForm, designation: e.target.value })}
                  placeholder="e.g. Senior Space Systems Engineer" />
              </div>

              <div className="pf-form-row">
                <div className="pf-form-group">
                  <label>Degree Level</label>
                  <select className="pf-input" value={editForm.degree_level}
                    onChange={e => setEditForm({ ...editForm, degree_level: e.target.value })}>
                    <option value="">Select…</option>
                    {DEGREE_LEVELS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
                <div className="pf-form-group">
                  <label>Course of Study</label>
                  <select className="pf-input" value={editForm.course_of_study}
                    onChange={e => setEditForm({ ...editForm, course_of_study: e.target.value })}>
                    <option value="">Select…</option>
                    {COURSES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              <div className="pf-form-group">
                <label>WhatsApp Number (with country code)</label>
                <div className="pf-input-row">
                  <span className="pf-input-prefix">+</span>
                  <input className="pf-input pf-input-with-prefix" type="tel"
                    value={editForm.whatsapp}
                    onChange={e => setEditForm({ ...editForm, whatsapp: e.target.value })}
                    placeholder="2348012345678" />
                </div>
                <div className="pf-field-hint">Nigeria: 234 then number without leading 0</div>
              </div>

              <div className="pf-form-group">
                <label>Bio (optional)</label>
                <textarea className="pf-input" rows={3} value={editForm.bio}
                  onChange={e => setEditForm({ ...editForm, bio: e.target.value })}
                  placeholder="Brief description of your expertise…" />
              </div>

              <div className="pf-form-group">
                <label>Skills — select all that apply</label>
                <div className="pf-skills-grid">
                  {SKILLS_LIST.map(skill => (
                    <button key={skill} type="button"
                      className={`pf-skill-toggle ${editForm.skills.includes(skill) ? 'active' : ''}`}
                      onClick={() => toggleSkill(skill)}>
                      {skill}
                    </button>
                  ))}
                </div>
              </div>

            </div>
          ) : (
            <div className="pf-info-grid">
              <div className="pf-info-item">
                <span className="pf-label">Email</span>
                <span className="pf-value">{profile.email}</span>
              </div>
              <div className="pf-info-item">
                <span className="pf-label">WhatsApp</span>
                <span className="pf-value">
                  {profile.whatsapp ? (
                    <a href={`https://wa.me/${profile.whatsapp.replace(/\D/g, '')}`}
                      target="_blank" rel="noreferrer" className="pf-wa-link">
                      💬 +{profile.whatsapp}
                    </a>
                  ) : (
                    <span className="pf-empty-field" onClick={() => setEditing(true)}>
                      + Add WhatsApp number
                    </span>
                  )}
                </span>
              </div>
              <div className="pf-info-item">
                <span className="pf-label">Role</span>
                <span className="pf-value">
                  <span className="pf-role-pill">{fmt(profile.role)}</span>
                </span>
              </div>
              {qualDisplay && (
                <div className="pf-info-item">
                  <span className="pf-label">Qualification</span>
                  <span className="pf-value">{qualDisplay}</span>
                </div>
              )}
              {orgNames.department && (
                <div className="pf-info-item">
                  <span className="pf-label">Department</span>
                  <span className="pf-value">{orgNames.department}</span>
                </div>
              )}
              {orgNames.division && (
                <div className="pf-info-item">
                  <span className="pf-label">Division</span>
                  <span className="pf-value">{orgNames.division}</span>
                </div>
              )}
              {orgNames.unit && (
                <div className="pf-info-item">
                  <span className="pf-label">Unit</span>
                  <span className="pf-value">{orgNames.unit}</span>
                </div>
              )}
              {profile.staff_no && (
                <div className="pf-info-item">
                  <span className="pf-label">Staff No.</span>
                  <span className="pf-value pf-mono">{profile.staff_no}</span>
                </div>
              )}
              {profile.skills?.length > 0 && (
                <div className="pf-info-item pf-info-item-col">
                  <span className="pf-label">Skills</span>
                  <div className="pf-skills-preview" style={{ marginTop: 6 }}>
                    {profile.skills.map((s: string) => (
                      <span key={s} className="pf-skill-chip">{s}</span>
                    ))}
                  </div>
                </div>
              )}
              {profile.bio && (
                <div className="pf-info-item pf-info-item-col">
                  <span className="pf-label">Bio</span>
                  <span className="pf-value" style={{ textAlign: 'left', marginTop: 4 }}>{profile.bio}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Security card ── */}
        <div className="pf-card pf-security-card">
          <h3>Security</h3>

          {authError   && <div className="pf-msg error"   style={{ marginBottom: 12 }}>{authError}</div>}
          {authSuccess && <div className="pf-msg success" style={{ marginBottom: 12 }}>{authSuccess}</div>}

          {/* Email */}
          <div className="pf-security-section">
            <div className="pf-security-label">Email Address</div>
            <div className="pf-security-current">{profile.email}</div>
            {!showEmailForm ? (
              <button className="pf-btn-outline pf-security-btn"
                onClick={() => { setShowEmailForm(true); setAuthError(''); setAuthSuccess(''); }}>
                Change Email
              </button>
            ) : (
              <div className="pf-security-form">
                <input className="pf-input" type="email" value={newEmail}
                  onChange={e => setNewEmail(e.target.value)}
                  placeholder="new@email.com" />
                <div className="pf-field-hint">
                  A confirmation link will be sent to your new email. Your email won't change until you click it.
                </div>
                <div className="pf-action-row" style={{ marginTop: 10 }}>
                  <button className="pf-btn-outline"
                    onClick={() => { setShowEmailForm(false); setNewEmail(''); setAuthError(''); }}>
                    Cancel
                  </button>
                  <button className="pf-btn-gold" onClick={handleEmailChange}
                    disabled={authSaving || !newEmail.trim()}>
                    {authSaving ? 'Sending…' : 'Send Confirmation'}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="pf-security-divider" />

          {/* Password */}
          <div className="pf-security-section">
            <div className="pf-security-label">Password</div>
            {!showPasswordForm ? (
              <button className="pf-btn-outline pf-security-btn"
                onClick={() => { setShowPasswordForm(true); setAuthError(''); setAuthSuccess(''); }}>
                Change Password
              </button>
            ) : (
              <div className="pf-security-form">
                <input className="pf-input" type="password" value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="New password (min. 6 characters)" />
                <input className="pf-input" style={{ marginTop: 8 }} type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password" />
                <div className="pf-action-row" style={{ marginTop: 10 }}>
                  <button className="pf-btn-outline"
                    onClick={() => {
                      setShowPasswordForm(false);
                      setNewPassword(''); setConfirmPassword(''); setAuthError('');
                    }}>
                    Cancel
                  </button>
                  <button className="pf-btn-gold" onClick={handlePasswordChange} disabled={authSaving}>
                    {authSaving ? 'Updating…' : 'Update Password'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Stats ── */}
        <div className="pf-stats">
          <div className="pf-stat-box">
            <div className="pf-stat-num">{stats.totalProjects}</div>
            <div className="pf-stat-label">Projects</div>
          </div>
          <div className="pf-stat-box">
            <div className="pf-stat-num">{stats.openTasks}</div>
            <div className="pf-stat-label">Open Tasks</div>
          </div>
          <div className="pf-stat-box">
            <div className="pf-stat-num">{stats.avgCompletion}%</div>
            <div className="pf-stat-label">Avg. Completion</div>
          </div>
        </div>
      </div>
    </div>
  );
}