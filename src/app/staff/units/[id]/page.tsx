// src/app/staff/units/[id]/page.tsx
// src/app/staff/units/[id]/page.tsx
'use client';

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useParams, useRouter } from "next/navigation";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import "./unit-detail.css";

const COLORS = ['#c9a84c', '#4caf50', '#ff9800', '#f44336'];

export default function UnitDetail() {
  const params = useParams();
  const router = useRouter();
  const unitId = params.id as string;

  const [unit, setUnit] = useState<any>(null);
  const [staff, setStaff] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUnitData();
  }, [unitId]);

  const fetchUnitData = async () => {
    setLoading(true);

    // Unit Info
    const { data: unitData } = await supabase
      .from('units')
      .select(`
        *,
        division:divisions(name),
        unit_head:profiles!units_head_id_fkey(id, name, designation)
      `)
      .eq('id', unitId)
      .single();

    setUnit(unitData);

    // Staff
    const { data: staffData } = await supabase
      .from('profiles')
      .select('id, name, designation, role')
      .eq('unit_id', unitId)
      .order('name');

    setStaff(staffData || []);

    // Tasks with status
    const { data: taskData } = await supabase
      .from('tasks')
      .select(`
        *,
        assignee:profiles!assigned_to (name)
      `)
      .eq('unit_id', unitId)
      .order('created_at', { ascending: false });

    setTasks(taskData || []);
    setLoading(false);
  };

  const completedTasks = tasks.filter(t => t.status === 'COMPLETED').length;
  const pendingTasks = tasks.filter(t => t.status === 'PENDING').length;
  const underReview = tasks.filter(t => t.status === 'UNDER_REVIEW').length;

  const taskData = [
    { name: 'Completed', value: completedTasks, fill: '#4caf50' },
    { name: 'Pending', value: pendingTasks, fill: '#ff9800' },
    { name: 'Under Review', value: underReview, fill: '#c9a84c' },
  ];

  const productivity = tasks.length > 0 
    ? Math.round((completedTasks / tasks.length) * 100) 
    : 0;

  if (loading) return <div className="loading-full">Loading unit details...</div>;
  if (!unit) return <div>Unit not found</div>;

  return (
    <div className="unit-detail-page">
      <button className="back-btn" onClick={() => router.back()}>← Back to Units</button>

      <div className="detail-header">
        <h1>{unit.name}</h1>
        {unit.unit_head && (
          <div className="head-info">
            Head: <strong>{unit.unit_head.name}</strong>
          </div>
        )}
      </div>

      <div className="detail-grid">
        {/* Unit Info */}
        <div className="detail-card">
          <h3>Unit Information</h3>
          {unit.description && <p>{unit.description}</p>}
          {unit.division && <p><strong>Division:</strong> {unit.division.name}</p>}
          <p><strong>Total Staff:</strong> {staff.length}</p>
        </div>

        {/* Productivity Overview */}
        <div className="detail-card">
          <h3>Productivity Overview</h3>
          <div className="stat-big">
            {productivity}% <span style={{fontSize: '1rem'}}>Overall</span>
          </div>
          <ResponsiveContainer width="100%" height={140}>
            <PieChart>
              <Pie
                data={taskData}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={65}
                dataKey="value"
              >
                {taskData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Task Stats */}
      <div className="detail-card full-width">
        <h3>Task Statistics</h3>
        <div className="stats-row">
          <div className="stat-box">
            <div className="stat-number">{tasks.length}</div>
            <div className="stat-label">Total Tasks</div>
          </div>
          <div className="stat-box">
            <div className="stat-number completed">{completedTasks}</div>
            <div className="stat-label">Completed</div>
          </div>
          <div className="stat-box">
            <div className="stat-number pending">{pendingTasks}</div>
            <div className="stat-label">Pending</div>
          </div>
          <div className="stat-box">
            <div className="stat-number review">{underReview}</div>
            <div className="stat-label">Under Review</div>
          </div>
        </div>
      </div>

      {/* Staff List */}
      <div className="staff-list">
        <h3>Unit Members ({staff.length})</h3>
        {staff.length === 0 ? (
          <p className="no-staff">No staff assigned yet.</p>
        ) : (
          staff.map((member: any) => (
            <div key={member.id} className="staff-row">
              <div className="staff-avatar">
                {member.name.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <div className="staff-name">{member.name}</div>
                <div className="staff-designation">{member.designation}</div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Recent Tasks */}
      <div className="tasks-section">
        <h3>Recent Tasks ({tasks.length})</h3>
        {tasks.length === 0 ? (
          <p className="no-tasks">No tasks yet.</p>
        ) : (
          tasks.slice(0, 10).map((task: any) => (
            <div key={task.id} className="task-row">
              <div className={`task-check ${task.status === 'COMPLETED' ? 'checked' : ''}`}>
                {task.status === 'COMPLETED' ? '✓' : ''}
              </div>
              <div className="task-content">
                <div className="task-title">{task.title}</div>
                <div className="task-meta">
                  Assigned to: {task.assignee?.name || 'Unassigned'} 
                  • {task.due_date ? new Date(task.due_date).toLocaleDateString() : ''}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}