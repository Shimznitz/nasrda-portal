// src/app/login/page.tsx
'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import './login.css';

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [staffNo, setStaffNo] = useState('');
  const [designation, setDesignation] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    if (isLogin) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setError(error.message);
      } else {
        window.location.href = '/staff/dashboard';
      }
    } else {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            name: name.trim(),
            staffNo: staffNo.trim(),
            designation: designation.trim(),
            role: 'STAFF',
          },
        },
      });
      if (error) {
        setError(error.message);
      } else {
        setSuccess('Account created! You can now sign in.');
        setIsLogin(true);
        setEmail('');
        setPassword('');
      }
    }
    setLoading(false);
  };

  return (
    <div className="auth-page">
      <div className="auth-bg">
        <div className="auth-bg-circle circle-1"></div>
        <div className="auth-bg-circle circle-2"></div>
        <div className="auth-bg-circle circle-3"></div>
      </div>

      <div className="auth-container">
        <div className="auth-left">
          <div className="auth-brand">
            <div className="brand-logo">NS</div>
            <div className="brand-text">
              <div className="brand-name">NASRDA</div>
              <div className="brand-sub">National Space Research and Development Agency</div>
            </div>
          </div>
          <div className="auth-tagline">
            <h1>Nigeria's Gateway to Space</h1>
            <p>Staff Portal — Manage projects, teams and deliverables across all centres and labs nationwide.</p>
          </div>
          <div className="auth-stats">
            <div className="auth-stat">
              <div className="auth-stat-value">15+</div>
              <div className="auth-stat-label">Centres & Labs</div>
            </div>
            <div className="auth-stat">
              <div className="auth-stat-value">500+</div>
              <div className="auth-stat-label">Staff Members</div>
            </div>
            <div className="auth-stat">
              <div className="auth-stat-value">100+</div>
              <div className="auth-stat-label">Active Projects</div>
            </div>
          </div>
        </div>

        <div className="auth-right">
          <div className="auth-card">
            <div className="auth-card-header">
              <h2>{isLogin ? 'Sign In' : 'Create Account'}</h2>
              <p>{isLogin ? 'Welcome back. Enter your credentials.' : 'Register your staff account.'}</p>
            </div>

            <div className="auth-tabs">
              <button className={`auth-tab ${isLogin ? 'active' : ''}`} onClick={() => { setIsLogin(true); setError(''); setSuccess(''); }}>
                Sign In
              </button>
              <button className={`auth-tab ${!isLogin ? 'active' : ''}`} onClick={() => { setIsLogin(false); setError(''); setSuccess(''); }}>
                Register
              </button>
            </div>

            <form onSubmit={handleSubmit} className="auth-form">
              {!isLogin && (
                <>
                  <div className="field-group">
                    <label>Full Name</label>
                    <input type="text" placeholder="e.g. Amaka Okonkwo"
                      value={name} onChange={(e) => setName(e.target.value)} required />
                  </div>
                  <div className="field-row">
                    <div className="field-group">
                      <label>Staff / File No.</label>
                      <input type="text" placeholder="e.g. NASRDA/001"
                        value={staffNo} onChange={(e) => setStaffNo(e.target.value)} required />
                    </div>
                    <div className="field-group">
                      <label>Designation</label>
                      <input type="text" placeholder="e.g. Senior Engineer"
                        value={designation} onChange={(e) => setDesignation(e.target.value)} required />
                    </div>
                  </div>
                </>
              )}

              <div className="field-group">
                <label>Official Email</label>
                <input type="email" placeholder="you@nasrda.gov.ng"
                  value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>

              <div className="field-group">
                <label>Password</label>
                <input type="password" placeholder="••••••••"
                  value={password} onChange={(e) => setPassword(e.target.value)} required />
              </div>

              {error && <div className="auth-error">⚠ {error}</div>}
              {success && <div className="auth-success">✓ {success}</div>}

              <button type="submit" className="auth-submit" disabled={loading}>
                {loading ? 'Please wait...' : isLogin ? 'Sign In' : 'Create Account'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}