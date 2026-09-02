// src/app/api/ai/report/dispatch/route.ts
import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { displayName } from '@/lib/utils';

export async function POST(req: Request) {
  try {
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

    const { recipientId, reportMarkdown, periodType } = await req.json();

    if (!recipientId || !reportMarkdown) {
      return NextResponse.json({ error: 'Recipient and report content required' }, { status: 400 });
    }

    // 1. Fetch Sender Profile
    const { data: senderProfile } = await supabase
      .from('profiles')
      .select('name, title')
      .eq('id', user.id)
      .single();

    const senderDisplayName = displayName(senderProfile);

    // 2. Insert into user_reports table
    const { data: reportRecord, error: reportErr } = await supabase
      .from('user_reports')
      .insert({
        profile_id: user.id,
        recipient_id: recipientId,
        period_type: periodType,
        summary_markdown: reportMarkdown,
      })
      .select()
      .single();

    if (reportErr) throw reportErr;

    // 3. Create entry in file_routes for Document tracking
    const reportFileName = `Performance_Report_${periodType}_${new Date().toISOString().split('T')[0]}.md`;
    const { data: fileRoute } = await supabase
      .from('file_routes')
      .insert({
        file_name: reportFileName,
        file_type: 'REPORT',
        file_type_detail: `Performance Report (${periodType})`,
        created_by: user.id,
        status: 'DISPATCHED',
      })
      .select()
      .single();

    if (fileRoute) {
      await Promise.allSettled([
        supabase.from('file_route_recipients').insert({
          route_id: fileRoute.id,
          profile_id: recipientId,
          added_by: user.id,
          status: 'PENDING',
        }),
        supabase.from('file_route_events').insert({
          route_id: fileRoute.id,
          recipient_id: recipientId,
          actor_id: user.id,
          action: 'DISPATCHED',
          note: `Performance report generated and dispatched by ${senderDisplayName}`,
        }),
      ]);
    }

    // 4. Fire-and-forget notification tasks
    await Promise.allSettled([
      supabase.from('messages').insert({
        sender_id: user.id,
        receiver_id: recipientId,
        content: `📋 **New Performance Report Received**\n\nPeriod: **${periodType}**\nSender: **${senderDisplayName}**\n\n*This report is stored in your user_reports and file_routes tables.*`,
      }),
      supabase.from('notifications').insert({
        user_id: recipientId,
        type: 'REPORT_RECEIVED',
        title: 'New Performance Report',
        body: `${senderDisplayName} dispatched a ${periodType} performance report to you.`,
        link: '/staff/documents',
        read: false,
      }),
    ]);

    return NextResponse.json({ success: true, report: reportRecord, fileRoute });
  } catch (err: any) {
    console.error('Dispatch Report Error:', err);
    return NextResponse.json({ error: err.message || 'Failed to dispatch report' }, { status: 500 });
  }
}