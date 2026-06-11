/*src/app/staff/divisions/[id]/page.tsx*/
'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import './division-detail.css';

export default function DivisionStats() {
  const params = useParams();
  const id = params.id as string;
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;

    const fetchData = async () => {
      setLoading(true);
      // 1. Core Data
      const { data: div } = await supabase.from('divisions').select('id, name, code, head_id').eq('id', id).single();
      
      // 2. Parallel Fetches for related data
      const [head, staff, projects] = await Promise.all([
        div?.head_id ? supabase.from('profiles').select('name').eq('id', div.head_id).single() : { data: null },
        supabase.from('profiles').select('id, name, designation').eq('division_id', id),
        supabase.from('projects').select('id, title, status, updated_at').eq('division_id', id)
      ]);

      // 3. Process Productivity Data
      const finished = (projects.data || []).filter((p: any) => p.status === 'FINISHED');
      const monthlyData = finished.reduce((acc: any, p: any) => {
        const month = new Date(p.updated_at).toLocaleString('default', { month: 'short' });
        acc[month] = (acc[month] || 0) + 1;
        return acc;
      }, {});

      const chartData = Object.keys(monthlyData).map(m => ({ month: m, count: monthlyData[m] }));

      setData({ ...div, head: head.data, staff: staff.data || [], projects: projects.data || [], chartData });
      setLoading(false);
    };

    fetchData();
  }, [id]);

  if (loading) return <div className="loading">Loading dashboard...</div>;
  if (!data) return <div className="error">Division not found.</div>;

  return (
    <div className="stats-page">
      <header className="stats-header">
        <h1>{data.name}</h1>
        <p>Code: <strong>{data.code}</strong></p>
      </header>

      <div className="dashboard-grid">
        <div className="stat-card"><span>Staff</span><strong>{data.staff.length}</strong></div>
        <div className="stat-card"><span>Active</span><strong>{data.projects.filter((p: any) => p.status === 'ACTIVE').length}</strong></div>
        <div className="stat-card"><span>Head</span><strong>{data.head?.name || 'Vacant'}</strong></div>
      </div>

      <section className="chart-card">
        <h2>Productivity (Finished Projects)</h2>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={data.chartData}>
            <XAxis dataKey="month" />
            <YAxis />
            <Tooltip />
            <Bar dataKey="count" fill="#EAB308" />
          </BarChart>
        </ResponsiveContainer>
      </section>

      <div className="content-grid">
        <section className="card">
          <h2>Recent Projects</h2>
          <ul>{data.projects.slice(0,5).map((p: any) => <li key={p.id}>{p.title} - {p.status}</li>)}</ul>
        </section>
        <section className="card">
          <h2>Staff</h2>
          <ul>{data.staff.map((s: any) => <li key={s.id}>{s.name}</li>)}</ul>
        </section>
      </div>
    </div>
  );
}