// src/app/api/ai/assistant/route.ts
import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { GoogleGenAI } from '@google/genai';

export type UserRole = 
  | 'SUPER_ADMIN'
  | 'DG'
  | 'DEPT_ADMIN'
  | 'DIVISION_HEAD'
  | 'UNIT_HEAD'
  | 'STAFF';

interface Profile {
  id: string;
  name: string;
  designation: string;
  title: string;
  role: UserRole;
  department_id: string | null;
  division_id: string | null;
  unit_id: string | null;
}

export async function POST(req: Request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Server configuration error: Missing Gemini API Key' }, { status: 500 });
    }

    const ai = new GoogleGenAI({ apiKey });

    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll(); },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch {}
          },
        },
      }
    );

    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { action, message, periodType, startDate, endDate } = body;

    const { data: profileData } = await supabase
      .from('profiles')
      .select('id, name, designation, title, role, department_id, division_id, unit_id')
      .eq('id', user.id)
      .single();

    if (!profileData) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const profile = profileData as Profile;

    // ── Mode 1: Interactive Chat Assistant ──
    if (action === 'chat') {
      if (!message) {
        return NextResponse.json({ error: 'Message payload required for chat action' }, { status: 400 });
      }

      let tasksQuery = supabase
        .from('tasks')
        .select('id, title, status, priority, due_date, project_id, assigned_to')
        .is('deleted_at', null);

      let routesQuery = supabase
        .from('file_routes')
        .select('id, file_name, status, created_at, created_by')
        .is('deleted_at', null);

      // STRICT SCOPE ENFORCEMENT
      switch (profile.role) {
        case 'SUPER_ADMIN':
        case 'DG':
          break;

        case 'DEPT_ADMIN':
          if (profile.department_id) {
            tasksQuery = tasksQuery.eq('department_id', profile.department_id);
            routesQuery = routesQuery.eq('department_id', profile.department_id);
          }
          break;

        case 'DIVISION_HEAD':
          if (profile.division_id) {
            tasksQuery = tasksQuery.eq('division_id', profile.division_id);
            routesQuery = routesQuery.eq('division_id', profile.division_id);
          }
          break;

        case 'UNIT_HEAD':
          if (profile.unit_id) {
            tasksQuery = tasksQuery.eq('unit_id', profile.unit_id);
            routesQuery = routesQuery.eq('unit_id', profile.unit_id);
          }
          break;

        case 'STAFF':
        default:
          tasksQuery = tasksQuery.eq('assigned_to', user.id);
          routesQuery = routesQuery.eq('created_by', user.id);
          break;
      }

      const [tasksRes, routesRes] = await Promise.all([
        tasksQuery.limit(25),
        routesQuery.limit(15),
      ]);

      const contextData = {
        userProfile: {
          name: profile.name,
          designation: profile.designation,
          role: profile.role,
        },
        scopedTasks: tasksRes.data || [],
        scopedFileRoutes: routesRes.data || [],
      };

      const systemInstruction = `
        You are an AI Workspace Assistant for NASRDA / ESS.
        User Role: ${profile.role}
        
        STRICT SECURITY BOUNDARIES:
        1. You only have visibility into records explicitly provided in Context Data.
        2. If the user asks about records outside their role scope, inform them that access is restricted to their assigned organizational level (${profile.role}).
        3. You may freely answer non-database workspace queries (e.g., drafting memos, technical concepts, operational advice).

        Context Data: ${JSON.stringify(contextData)}
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: message,
        config: {
          systemInstruction,
        },
      });

      return NextResponse.json({ text: response.text });
    }

    // ── Mode 2: Activity & Performance Report Generation ──
    if (action === 'generate-report') {
      const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const end = endDate ? new Date(endDate) : new Date();

      const [tasksRes, createdRoutesRes, routeEventsRes] = await Promise.all([
        supabase
          .from('tasks')
          .select('id, title, description, status, priority, completed_at, created_at')
          .eq('assigned_to', user.id)
          .gte('created_at', start.toISOString())
          .lte('created_at', end.toISOString())
          .is('deleted_at', null),
        supabase
          .from('file_routes')
          .select('id, file_name, status, created_at')
          .eq('created_by', user.id)
          .gte('created_at', start.toISOString())
          .lte('created_at', end.toISOString())
          .is('deleted_at', null),
        supabase
          .from('file_route_events')
          .select('id, action, note, created_at')
          .eq('actor_id', user.id)
          .gte('created_at', start.toISOString())
          .lte('created_at', end.toISOString()),
      ]);

      const tasks = tasksRes.data || [];
      const routes = createdRoutesRes.data || [];
      const events = routeEventsRes.data || [];

      const metrics = {
        total_tasks: tasks.length,
        completed_tasks: tasks.filter(t => t.status === 'DONE' || t.completed_at !== null).length,
        in_progress_tasks: tasks.filter(t => t.status === 'IN_PROGRESS').length,
        routes_initiated: routes.length,
        total_actions_logged: events.length,
      };

      const prompt = `
        You are an Executive Activity Reporting Engine.
        Generate a formal ${periodType || 'PERIODIC'} performance report for this user based on their metrics and logs below.

        Staff Profile: ${JSON.stringify({ name: profile.name, designation: profile.designation, role: profile.role })}
        Reporting Window: ${start.toLocaleDateString()} to ${end.toLocaleDateString()}
        Metrics: ${JSON.stringify(metrics)}
        Task Logs: ${JSON.stringify(tasks)}
        Document Workflow Activity: ${JSON.stringify(events)}

        Structure the Markdown report strictly into these sections:
        1. Executive Summary & Highlights
        2. Deliverables & Task Progress
        3. Document Workflows & Routing Activity
        4. Performance Metrics Summary
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: prompt,
      });

      const summaryMarkdown = response.text || 'Unable to generate report content.';

      const { data: savedReport } = await supabase
        .from('user_reports')
        .insert({
          profile_id: user.id,
          period_type: periodType || 'MONTHLY',
          date_start: start.toISOString(),
          date_end: end.toISOString(),
          summary_markdown: summaryMarkdown,
          metrics,
        })
        .select()
        .single();

      return NextResponse.json({
        report: savedReport || { summary_markdown: summaryMarkdown, metrics },
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err: any) {
    console.error('AI Assistant Error:', err);
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}