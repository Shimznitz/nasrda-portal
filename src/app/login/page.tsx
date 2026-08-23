// src/app/login/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import './login.css';

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [staffNo, setStaffNo] = useState('');
  const [designation, setDesignation] = useState('');
  const [deptId, setDeptId] = useState(''); // NEW: Selected Dept
  const [departments, setDepartments] = useState<any[]>([]); // NEW: List of depts
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const router = useRouter();

  // Fetch departments for the dropdown
  useEffect(() => {
    const fetchDepts = async () => {
      const { data } = await supabase.from('departments').select('id, name');
      if (data) setDepartments(data);
    };
    fetchDepts();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  setLoading(true);
  setError('');
  setSuccess('');

  if (isLogin) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    else window.location.href = '/staff/dashboard';
  } else {
    // Standardize staff number input to format: NASRDA/PF/NUMBER
    let formattedStaffNo = staffNo.trim().toUpperCase();
    if (!formattedStaffNo.startsWith('NASRDA/PF/')) {
      // If user only typed numbers (e.g., '1234'), prefix it automatically
      const digitsOnly = formattedStaffNo.replace(/[^0-9]/g, '');
      if (digitsOnly) {
        formattedStaffNo = `NASRDA/PF/${digitsOnly}`;
      } else {
        setError('Please enter a valid Staff File Number (e.g. NASRDA/PF/1234)');
        setLoading(false);
        return;
      }
    }

    // 1. Pass user metadata so auth trigger picks up full name
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name: name.trim(),
          full_name: name.trim(),
        },
      },
    });

    if (signUpError) {
      setError(signUpError.message);
    } else if (data.user) {
      // 2. Upsert profile with formatted NASRDA/PF number
      const { error: profileError } = await supabase.from('profiles').upsert(
        {
          id: data.user.id,
          email: email.trim(),
          name: name.trim(),
          staff_no: formattedStaffNo,
          designation: designation.trim(),
          role: 'STAFF',
          department_id: deptId && deptId !== "" ? deptId : null, 
        },
        { onConflict: 'id' }
      );

      if (profileError) {
        setError(profileError.message);
      } else {
        setSuccess('Account created! Please wait for DG clearance.');
        setIsLogin(true);
      }
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
            <div className="login-logo-wrapper">
              <Image src="/nasrdalogo.png" alt="NASRDA Logo" width={90} height={90} className="login-logo" />
            </div>
            <div className="brand-text">
              <div className="brand-name">ESS, NASRDA</div>
              <div className="brand-sub">Engineering and Space Systems, National Space Research and Development Agency</div>
            </div>
          </div>
          <div className="auth-tagline">
            <h1>Nigeria's Gateway to Space</h1>
            <p>Manage projects, teams and deliverables across all centres and labs nationwide.</p>
          </div>
        </div>

        <div className="auth-right">
          <div className="auth-card">
            <div className="auth-card-header">
              <h2>{isLogin ? 'Sign In' : 'Create Account'}</h2>
              <p>{isLogin ? 'Welcome back. Enter your credentials.' : 'Register your staff account.'}</p>
            </div>

            <div className="auth-tabs">
              <button className={`auth-tab ${isLogin ? 'active' : ''}`} onClick={() => { setIsLogin(true); setError(''); setSuccess(''); }}>Sign In</button>
              <button className={`auth-tab ${!isLogin ? 'active' : ''}`} onClick={() => { setIsLogin(false); setError(''); setSuccess(''); }}>Register</button>
            </div>

            <form onSubmit={handleSubmit} className="auth-form">
              {!isLogin && (
                <>
                  <div className="field-group">
                    <label>Full Name</label>
                    <input type="text" placeholder="e.g. Amaka Okonkwo" value={name} onChange={(e) => setName(e.target.value)} required />
                  </div>
                  <div className="field-row">
                    <div className="field-group">
  <label>Staff / File No.</label>
  <input 
    type="text" 
    placeholder="NASRDA/PF/1001" 
    value={staffNo} 
    onChange={(e) => setStaffNo(e.target.value)} 
    required 
  />
  <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '4px', display: 'block' }}>
    Format: NASRDA/PF/XXXX
  </span>
</div>
                    <div className="field-group">
                      <label>Designation</label>
                      <input type="text" placeholder="e.g. Senior Engineer" value={designation} onChange={(e) => setDesignation(e.target.value)} required />
                    </div>
                  </div>
                  <div className="field-group">
                    <label>Assign Department (Optional)</label>
                    <select 
                      value={deptId} 
                      onChange={(e) => setDeptId(e.target.value)}
                      style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: '10px', padding: '13px 16px', color: 'var(--text)', width: '100%' }}
                    >
                      <option value="">-- No Department Assigned --</option>
                      {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </div>
                </>
              )}

              <div className="field-group">
                <label>Official Email</label>
                <input type="email" placeholder="you@nasrda.gov.ng" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>

              <div className="field-group">
                <label>Password</label>
                <input type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required />
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