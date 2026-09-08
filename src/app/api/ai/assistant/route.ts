// src/app/api/ai/assistant/route.ts

import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
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

interface StaffRecord {
  id: string;
  name: string;
  designation: string | null;
  title: string | null;
  role: UserRole | null;
  skills: unknown;
  qualification: unknown;
  department_id: string | null;
  division_id: string | null;
  unit_id: string | null;
}

export async function POST(req: Request) {
  try {
    // ============================================================
    // 1. ENVIRONMENT / AI CONFIGURATION
    // ============================================================

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            'Server configuration error: Missing Gemini API Key',
        },
        { status: 500 }
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey =
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const supabaseServiceRoleKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json(
        {
          error:
            'Server configuration error: Missing Supabase configuration',
        },
        { status: 500 }
      );
    }

    /*
     * The service-role key is required for the server-side
     * staff directory query so that RLS does not accidentally
     * make a SUPER_ADMIN/DG see an empty staff directory.
     *
     * IMPORTANT:
     * SUPABASE_SERVICE_ROLE_KEY must NEVER use NEXT_PUBLIC_.
     */
    if (!supabaseServiceRoleKey) {
      console.error(
        'Missing SUPABASE_SERVICE_ROLE_KEY'
      );

      return NextResponse.json(
        {
          error:
            'Server configuration error: Missing SUPABASE_SERVICE_ROLE_KEY',
        },
        { status: 500 }
      );
    }

    const ai = new GoogleGenAI({
      apiKey,
    });

    // ============================================================
    // 2. AUTHENTICATED SUPABASE CLIENT
    // ============================================================

    const cookieStore = await cookies();

    const supabase = createServerClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },

          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(
                ({ name, value, options }) =>
                  cookieStore.set(
                    name,
                    value,
                    options
                  )
              );
            } catch {
              // Safe to ignore cookie write failures
              // in this server execution context.
            }
          },
        },
      }
    );

    // ============================================================
    // 3. SERVER-ONLY PRIVILEGED SUPABASE CLIENT
    // ============================================================

    const supabaseAdmin = createClient(
      supabaseUrl,
      supabaseServiceRoleKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // ============================================================
    // 4. AUTHENTICATE CURRENT USER
    // ============================================================

    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json(
        {
          error: 'Unauthorized',
        },
        { status: 401 }
      );
    }

    // ============================================================
    // 5. REQUEST BODY
    // ============================================================

    const body = await req.json();

    const {
      action,
      message,
      periodType,
      startDate,
      endDate,
    } = body;

    // ============================================================
    // 6. GET CURRENT USER PROFILE
    // ============================================================

    const {
      data: profileData,
      error: profileError,
    } = await supabase
      .from('profiles')
      .select(
        'id, name, designation, title, role, department_id, division_id, unit_id'
      )
      .eq('id', user.id)
      .single();

    if (profileError) {
      console.error(
        'Profile lookup error:',
        profileError
      );

      return NextResponse.json(
        {
          error:
            'Unable to retrieve user profile',
          details: profileError.message,
        },
        { status: 500 }
      );
    }

    if (!profileData) {
      return NextResponse.json(
        {
          error: 'Profile not found',
        },
        { status: 404 }
      );
    }

    const profile =
      profileData as Profile;

    // ============================================================
    // MODE 1: INTERACTIVE CHAT ASSISTANT
    // ============================================================

    if (action === 'chat') {
      if (
        !message ||
        typeof message !== 'string'
      ) {
        return NextResponse.json(
          {
            error:
              'Message payload required for chat action',
          },
          { status: 400 }
        );
      }

      // ==========================================================
      // TASKS QUERY
      //
      // Continue using the authenticated client so the existing
      // task RLS policies remain responsible for task visibility.
      // ==========================================================

      let tasksQuery = supabase
        .from('tasks')
        .select(
          'id, title, status, priority, due_date, project_id, assigned_to'
        )
        .is('deleted_at', null);

      // ==========================================================
      // FILE ROUTES QUERY
      // ==========================================================

      let routesQuery = supabase
        .from('file_routes')
        .select(
          'id, file_name, status, created_at, created_by'
        )
        .is('deleted_at', null);

      // ==========================================================
      // STAFF DIRECTORY QUERY
      //
      // IMPORTANT:
      // This uses the server-only service-role client.
      //
      // We still enforce organizational scope ourselves below.
      // ==========================================================

      let staffQuery = supabaseAdmin
        .from('profiles')
        .select(
          'id, name, designation, title, role, skills, qualification, department_id, division_id, unit_id'
        );

      // ==========================================================
      // ROLE-BASED ACCESS SCOPE
      // ==========================================================

      switch (profile.role) {
        // --------------------------------------------------------
        // SUPER ADMIN / DG
        //
        // Full agency-wide staff visibility.
        // --------------------------------------------------------

        case 'SUPER_ADMIN':
        case 'DG':
          break;

        // --------------------------------------------------------
        // DEPARTMENT ADMIN
        // --------------------------------------------------------

        case 'DEPT_ADMIN':
          if (profile.department_id) {
            tasksQuery =
              tasksQuery.eq(
                'department_id',
                profile.department_id
              );

            routesQuery =
              routesQuery.eq(
                'department_id',
                profile.department_id
              );

            staffQuery =
              staffQuery.eq(
                'department_id',
                profile.department_id
              );
          } else {
            /*
             * If the user has no department assigned,
             * do not expose other personnel.
             */
            staffQuery =
              staffQuery.eq(
                'id',
                '__NO_MATCHING_PROFILE__'
              );
          }

          break;

        // --------------------------------------------------------
        // DIVISION HEAD
        // --------------------------------------------------------

        case 'DIVISION_HEAD':
          if (profile.division_id) {
            tasksQuery =
              tasksQuery.eq(
                'division_id',
                profile.division_id
              );

            routesQuery =
              routesQuery.eq(
                'division_id',
                profile.division_id
              );

            staffQuery =
              staffQuery.eq(
                'division_id',
                profile.division_id
              );
          } else {
            staffQuery =
              staffQuery.eq(
                'id',
                '__NO_MATCHING_PROFILE__'
              );
          }

          break;

        // --------------------------------------------------------
        // UNIT HEAD
        // --------------------------------------------------------

        case 'UNIT_HEAD':
          if (profile.unit_id) {
            tasksQuery =
              tasksQuery.eq(
                'unit_id',
                profile.unit_id
              );

            routesQuery =
              routesQuery.eq(
                'unit_id',
                profile.unit_id
              );

            staffQuery =
              staffQuery.eq(
                'unit_id',
                profile.unit_id
              );
          } else {
            staffQuery =
              staffQuery.eq(
                'id',
                '__NO_MATCHING_PROFILE__'
              );
          }

          break;

        // --------------------------------------------------------
        // STAFF
        //
        // Staff users can only see their own personnel record.
        // --------------------------------------------------------

        case 'STAFF':
        default:
          tasksQuery =
            tasksQuery.eq(
              'assigned_to',
              user.id
            );

          routesQuery =
            routesQuery.eq(
              'created_by',
              user.id
            );

          staffQuery =
            staffQuery.eq(
              'id',
              user.id
            );

          break;
      }

      // ==========================================================
      // 7. FETCH DATA
      //
      // IMPORTANT:
      // We removed the problematic:
      //
      // .select('*', { count: 'exact', head: true })
      //
      // The staff records themselves are used to calculate the
      // personnel count.
      // ==========================================================

      const [
        tasksRes,
        routesRes,
        staffRes,
      ] = await Promise.all([
        tasksQuery.limit(25),

        routesQuery.limit(15),

        /*
         * 1000 is deliberately higher than the previous 100.
         * This prevents a normal-sized staff directory from being
         * incorrectly truncated.
         */
        staffQuery.limit(1000),
      ]);

      // ==========================================================
      // 8. CHECK DATABASE ERRORS
      //
      // NEVER silently convert a database error into [].
      // ==========================================================

      if (tasksRes.error) {
        console.error(
          'Tasks query error:',
          tasksRes.error
        );

        return NextResponse.json(
          {
            error:
              'Unable to retrieve task data',
            details:
              tasksRes.error.message,
          },
          { status: 500 }
        );
      }

      if (routesRes.error) {
        console.error(
          'File routes query error:',
          routesRes.error
        );

        return NextResponse.json(
          {
            error:
              'Unable to retrieve file route data',
            details:
              routesRes.error.message,
          },
          { status: 500 }
        );
      }

      if (staffRes.error) {
        console.error(
          'Staff directory query error:',
          staffRes.error
        );

        return NextResponse.json(
          {
            error:
              'Unable to retrieve staff directory',
            details:
              staffRes.error.message,
          },
          { status: 500 }
        );
      }

      // ==========================================================
      // 9. NORMALIZE STAFF DATA
      // ==========================================================

      const staff =
        (staffRes.data || []) as StaffRecord[];

      /*
       * The backend is now the source of truth for the personnel
       * count. Gemini does NOT have to count the records itself.
       */
      const totalPersonnel =
        staff.length;

      // ==========================================================
      // 10. CALCULATE DISTRIBUTION BY DESIGNATION
      // ==========================================================

      const byDesignation =
        staff.reduce<
          Record<string, number>
        >((acc, person) => {
          const designation =
            person.designation?.trim() ||
            'Unspecified';

          acc[designation] =
            (acc[designation] || 0) + 1;

          return acc;
        }, {});

      // ==========================================================
      // 11. CALCULATE DISTRIBUTION BY ROLE
      // ==========================================================

      const byRole =
        staff.reduce<
          Record<string, number>
        >((acc, person) => {
          const role =
            person.role?.trim() ||
            'Unspecified';

          acc[role] =
            (acc[role] || 0) + 1;

          return acc;
        }, {});

      // ==========================================================
      // 12. CALCULATE DISTRIBUTION BY DEPARTMENT
      // ==========================================================

      const byDepartment =
        staff.reduce<
          Record<string, number>
        >((acc, person) => {
          const department =
            person.department_id ||
            'Unassigned';

          acc[department] =
            (acc[department] || 0) + 1;

          return acc;
        }, {});

      // ==========================================================
      // 13. CALCULATE DISTRIBUTION BY DIVISION
      // ==========================================================

      const byDivision =
        staff.reduce<
          Record<string, number>
        >((acc, person) => {
          const division =
            person.division_id ||
            'Unassigned';

          acc[division] =
            (acc[division] || 0) + 1;

          return acc;
        }, {});

      // ==========================================================
      // 14. CALCULATE DISTRIBUTION BY UNIT
      // ==========================================================

      const byUnit =
        staff.reduce<
          Record<string, number>
        >((acc, person) => {
          const unit =
            person.unit_id ||
            'Unassigned';

          acc[unit] =
            (acc[unit] || 0) + 1;

          return acc;
        }, {});

      // ==========================================================
      // 15. VERIFIED STAFF STATISTICS
      // ==========================================================

      const staffStatistics = {
        /*
         * Exact number of staff records returned for this user's
         * authorized organizational scope.
         */
        totalPersonnel,

        /*
         * Number of individual personnel records being supplied
         * to Gemini.
         */
        recordsProvidedToAI:
          staff.length,

        /*
         * We currently request up to 1000 records, so this remains
         * false for directories up to 1000 records.
         */
        contextLimited:
          staff.length >= 1000,

        byDesignation,
        byRole,
        byDepartment,
        byDivision,
        byUnit,
      };

      // ==========================================================
      // 16. BUILD CONTEXT FOR GEMINI
      // ==========================================================

      const contextData = {
        userProfile: {
          id: profile.id,
          name: profile.name,
          designation:
            profile.designation,
          title: profile.title,
          role: profile.role,
          department_id:
            profile.department_id,
          division_id:
            profile.division_id,
          unit_id: profile.unit_id,
        },

        /*
         * Backend-calculated personnel statistics.
         */
        staffStatistics,

        /*
         * Individual staff records.
         */
        subordinateStaff: staff,

        /*
         * Existing workspace information.
         */
        scopedTasks:
          tasksRes.data || [],

        scopedFileRoutes:
          routesRes.data || [],
      };

      // ==========================================================
      // 17. GEMINI SYSTEM INSTRUCTION
      // ==========================================================

      const systemInstruction = `
You are an AI Workspace Assistant for NASRDA / ESS.

USER ROLE:
${profile.role}

IMPORTANT SECURITY AND DATA RULES:

1. You may ONLY use information contained in the Context Data below for database-related questions.

2. Never invent personnel, departments, divisions, units, designations, roles, tasks, or file routes.

3. The backend has already applied the user's organizational access scope.

4. Never reveal records outside the user's authorized scope.

5. For personnel counts and distributions, STAFF STATISTICS is authoritative.

6. Do NOT independently estimate or guess personnel counts.

7. If staffStatistics.totalPersonnel is greater than 0, NEVER state that there are zero personnel.

8. If staffStatistics.totalPersonnel is 0, state that zero personnel records were returned within the user's authorized scope.

9. Do not claim that the staff directory is unavailable merely because some individual staff details are absent.

10. Use subordinateStaff for individual personnel information when needed.

11. If contextLimited is true, explain that the total count is based on the records retrieved, while individual records supplied to the AI may be limited.

12. When asked for personnel distribution by designation, use staffStatistics.byDesignation.

13. When asked for personnel distribution by role, use staffStatistics.byRole.

14. When asked for personnel distribution by department, use staffStatistics.byDepartment.

15. When asked for personnel distribution by division, use staffStatistics.byDivision.

16. When asked for personnel distribution by unit, use staffStatistics.byUnit.

17. Department, division, and unit values may currently be UUIDs because the current database context contains IDs. NEVER invent human-readable organizational names for UUIDs.

18. If the user asks for an individual staff member's details, use subordinateStaff.

19. If the user asks about tasks or file routes, use scopedTasks and scopedFileRoutes.

20. For non-database questions, you may provide normal professional assistance such as drafting memos, explaining technical concepts, or providing operational advice.

21. If the user asks for information outside their authorized organizational scope, state that access is restricted to their assigned organizational level.

22. Do not confuse an empty subordinateStaff array with a database failure. The backend checks database errors separately.

23. Do not make up missing information.

24. Be concise, professional, and suitable for an executive/workplace environment.

25. For personnel statistics questions, prioritize exact backend-calculated numbers over assumptions.

CONTEXT DATA:
${JSON.stringify(contextData)}
`;

      // ==========================================================
      // 18. SEND REQUEST TO GEMINI
      // ==========================================================

      const response =
        await ai.models.generateContent({
          model: 'gemini-3.5-flash',
          contents: message,
          config: {
            systemInstruction,
          },
        });

      return NextResponse.json({
        text:
          response.text ||
          'Unable to generate an assistant response.',
      });
    }

    // ============================================================
    // MODE 2: ACTIVITY & PERFORMANCE REPORT GENERATION
    // ============================================================

    if (
      action === 'generate-report'
    ) {
      const start = startDate
        ? new Date(startDate)
        : new Date(
            Date.now() -
              30 *
                24 *
                60 *
                60 *
                1000
          );

      const end = endDate
        ? new Date(endDate)
        : new Date();

      // ==========================================================
      // FETCH REPORT DATA
      // ==========================================================

      const [
        tasksRes,
        createdRoutesRes,
        routeEventsRes,
      ] = await Promise.all([
        supabase
          .from('tasks')
          .select(
            'id, title, description, status, priority, completed_at, created_at'
          )
          .eq(
            'assigned_to',
            user.id
          )
          .gte(
            'created_at',
            start.toISOString()
          )
          .lte(
            'created_at',
            end.toISOString()
          )
          .is(
            'deleted_at',
            null
          ),

        supabase
          .from('file_routes')
          .select(
            'id, file_name, status, created_at'
          )
          .eq(
            'created_by',
            user.id
          )
          .gte(
            'created_at',
            start.toISOString()
          )
          .lte(
            'created_at',
            end.toISOString()
          )
          .is(
            'deleted_at',
            null
          ),

        supabase
          .from('file_route_events')
          .select(
            'id, action, note, created_at'
          )
          .eq(
            'actor_id',
            user.id
          )
          .gte(
            'created_at',
            start.toISOString()
          )
          .lte(
            'created_at',
            end.toISOString()
          ),
      ]);

      // ==========================================================
      // CHECK REPORT QUERY ERRORS
      // ==========================================================

      if (tasksRes.error) {
        console.error(
          'Report tasks query error:',
          tasksRes.error
        );

        return NextResponse.json(
          {
            error:
              'Unable to retrieve report task data',
            details:
              tasksRes.error.message,
          },
          { status: 500 }
        );
      }

      if (createdRoutesRes.error) {
        console.error(
          'Report routes query error:',
          createdRoutesRes.error
        );

        return NextResponse.json(
          {
            error:
              'Unable to retrieve report route data',
            details:
              createdRoutesRes.error.message,
          },
          { status: 500 }
        );
      }

      if (routeEventsRes.error) {
        console.error(
          'Report route events query error:',
          routeEventsRes.error
        );

        return NextResponse.json(
          {
            error:
              'Unable to retrieve report workflow activity',
            details:
              routeEventsRes.error.message,
          },
          { status: 500 }
        );
      }

      const tasks =
        tasksRes.data || [];

      const routes =
        createdRoutesRes.data || [];

      const events =
        routeEventsRes.data || [];

      // ==========================================================
      // CALCULATE REPORT METRICS
      // ==========================================================

      const metrics = {
        total_tasks:
          tasks.length,

        completed_tasks:
          tasks.filter(
            (t) =>
              t.status === 'DONE' ||
              t.completed_at !== null
          ).length,

        in_progress_tasks:
          tasks.filter(
            (t) =>
              t.status ===
              'IN_PROGRESS'
          ).length,

        routes_initiated:
          routes.length,

        total_actions_logged:
          events.length,
      };

      // ==========================================================
      // BUILD REPORT PROMPT
      // ==========================================================

      const prompt = `
You are an Executive Activity Reporting Engine.

Generate a formal ${
        periodType || 'PERIODIC'
      } performance report for this user based strictly on their metrics and logs below.

Staff Profile:
${JSON.stringify({
  name: profile.name,
  designation:
    profile.designation,
  role: profile.role,
})}

Reporting Window:
${start.toLocaleDateString()} to ${end.toLocaleDateString()}

Metrics:
${JSON.stringify(metrics)}

Task Logs:
${JSON.stringify(tasks)}

Document Workflow Activity:
${JSON.stringify(events)}

Do not invent activities, achievements, or metrics.

Structure the Markdown report strictly into these sections:

1. Executive Summary & Highlights
2. Deliverables & Task Progress
3. Document Workflows & Routing Activity
4. Performance Metrics Summary
`;

      // ==========================================================
      // GENERATE REPORT
      // ==========================================================

      const response =
        await ai.models.generateContent({
          model: 'gemini-3.5-flash',
          contents: prompt,
        });

      const summaryMarkdown =
        response.text ||
        'Unable to generate report content.';

      // ==========================================================
      // SAVE REPORT
      // ==========================================================

      const {
        data: savedReport,
        error: saveReportError,
      } = await supabase
        .from('user_reports')
        .insert({
          profile_id: user.id,
          period_type:
            periodType ||
            'MONTHLY',
          date_start:
            start.toISOString(),
          date_end:
            end.toISOString(),
          summary_markdown:
            summaryMarkdown,
          metrics,
        })
        .select()
        .single();

      if (saveReportError) {
        console.error(
          'Save report error:',
          saveReportError
        );

        /*
         * The report was generated successfully,
         * so return it even if persistence failed.
         */
        return NextResponse.json({
          report: {
            summary_markdown:
              summaryMarkdown,
            metrics,
          },

          warning:
            'Report generated successfully, but could not be saved.',

          saveError:
            saveReportError.message,
        });
      }

      return NextResponse.json({
        report:
          savedReport || {
            summary_markdown:
              summaryMarkdown,
            metrics,
          },
      });
    }

    // ============================================================
    // INVALID ACTION
    // ============================================================

    return NextResponse.json(
      {
        error: 'Invalid action',
      },
      { status: 400 }
    );
  } catch (err: any) {
    console.error(
      'AI Assistant Error:',
      err
    );

    return NextResponse.json(
      {
        error:
          err?.message ||
          'Internal error',
      },
      { status: 500 }
    );
  }
}