// src/app/staff/kobo/page.tsx
'use client';

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import "./kobo.css";

export default function KoboToolbox() {
  const [profile, setProfile] = useState<any>(null);
  const [forms, setForms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single();
      setProfile(prof);

      if (['SUPER_ADMIN', 'CENTRE_ADMIN'].includes(prof?.role)) {
        await fetchForms();
      } else {
        setError("Only admins can access this page.");
        setLoading(false);
      }
    };
    load();
  }, []);

  const fetchForms = async () => {
    try {
      const res = await fetch('/api/kobo/forms');
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to load forms");
      } else {
        setForms(data);
      }
    } catch (err) {
      setError("Failed to connect to KoboToolbox");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="kobo-page">
      <div className="page-header">
        <h1>KoboToolbox Integration</h1>
        <p>Manage your surveys and data collection</p>
      </div>

      {error && <p className="error-msg">{error}</p>}

      <div className="kobo-actions">
        <a href="https://kf.kobotoolbox.org/" target="_blank" rel="noopener noreferrer" className="kobo-btn primary">
          Open KoboToolbox Dashboard
        </a>
      </div>

      <div className="forms-section">
        <h3>Your Forms</h3>
        {loading ? <p>Loading forms...</p> : forms.length === 0 ? (
          <p>No forms found.</p>
        ) : (
          <div className="forms-grid">
            {forms.map((form: any) => (
              <div key={form.uid} className="form-card">
                <h4>{form.name}</h4>
                <a href={form.url} target="_blank" rel="noopener noreferrer" className="btn small">Open Form</a>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}