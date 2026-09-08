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
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch {
              // Server component may not always allow cookie mutation.
            }
          },
        },
      }
    );

    // ---------------------------------------------------------
    // 1. Authenticate sender
    // ---------------------------------------------------------
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // ---------------------------------------------------------
    // 2. Validate request
    // ---------------------------------------------------------
    const {
      recipientId,
      reportMarkdown,
      periodType,
    } = await req.json();

    if (!recipientId || !reportMarkdown) {
      return NextResponse.json(
        { error: 'Recipient and report content required' },
        { status: 400 }
      );
    }

    if (
      typeof recipientId !== 'string' ||
      typeof reportMarkdown !== 'string'
    ) {
      return NextResponse.json(
        { error: 'Invalid recipient or report content' },
        { status: 400 }
      );
    }

    // ---------------------------------------------------------
    // 3. Fetch sender profile
    // ---------------------------------------------------------
    const {
      data: senderProfile,
      error: senderProfileErr,
    } = await supabase
      .from('profiles')
      .select('name, title')
      .eq('id', user.id)
      .single();

    if (senderProfileErr) {
      throw senderProfileErr;
    }

    const senderDisplayName = displayName(senderProfile);

    // ---------------------------------------------------------
    // 4. Verify recipient exists
    // ---------------------------------------------------------
    const {
      data: recipientProfile,
      error: recipientErr,
    } = await supabase
      .from('profiles')
      .select('id, name, title, role')
      .eq('id', recipientId)
      .single();

    if (recipientErr || !recipientProfile) {
      return NextResponse.json(
        { error: 'Recipient not found' },
        { status: 404 }
      );
    }

    // Prevent sending a report to yourself.
    if (recipientId === user.id) {
      return NextResponse.json(
        { error: 'You cannot dispatch a report to yourself' },
        { status: 400 }
      );
    }

    // ---------------------------------------------------------
    // 5. Store report in user_reports
    // ---------------------------------------------------------
    const {
      data: reportRecord,
      error: reportErr,
    } = await supabase
      .from('user_reports')
      .insert({
        profile_id: user.id,
        recipient_id: recipientId,
        period_type: periodType,
        summary_markdown: reportMarkdown,
      })
      .select()
      .single();

    if (reportErr) {
      throw reportErr;
    }

    // ---------------------------------------------------------
    // 6. Create file route for document tracking
    // ---------------------------------------------------------
    const reportFileName =
      `Performance_Report_${periodType}_${new Date()
        .toISOString()
        .split('T')[0]}.md`;

    const {
      data: fileRoute,
      error: fileRouteErr,
    } = await supabase
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

    if (fileRouteErr) {
      throw fileRouteErr;
    }

    // ---------------------------------------------------------
    // 7. Create recipient + tracking event
    // ---------------------------------------------------------
    const [
      recipientRouteResult,
      routeEventResult,
    ] = await Promise.all([
      supabase
        .from('file_route_recipients')
        .insert({
          route_id: fileRoute.id,
          profile_id: recipientId,
          added_by: user.id,
          status: 'PENDING',
        }),

      supabase
        .from('file_route_events')
        .insert({
          route_id: fileRoute.id,
          recipient_id: recipientId,
          actor_id: user.id,
          action: 'DISPATCHED',
          note: `Performance report generated and dispatched by ${senderDisplayName}`,
        }),
    ]);

    if (recipientRouteResult.error) {
      throw recipientRouteResult.error;
    }

    if (routeEventResult.error) {
      throw routeEventResult.error;
    }

    // ---------------------------------------------------------
    // 8. Create notification message
    //
    // Do not use Markdown here. The report itself remains
    // Markdown, but the normal message should remain clean
    // regardless of whether the messaging UI supports Markdown.
    // ---------------------------------------------------------
    const messageContent =
      `New Performance Report Received\n\n` +
      `Period: ${periodType}\n` +
      `Sender: ${senderDisplayName}\n\n` +
      `The report has been stored in your reports and document records.`;

    // ---------------------------------------------------------
    // 9. Create message + notification
    //
    // These are related but independent operations. If one
    // fails, we report the failure instead of silently ignoring it.
    // ---------------------------------------------------------
    const [
      messageResult,
      notificationResult,
    ] = await Promise.all([
      supabase
        .from('messages')
        .insert({
          sender_id: user.id,
          receiver_id: recipientId,
          content: messageContent,
        }),

      supabase
        .from('notifications')
        .insert({
          user_id: recipientId,
          type: 'REPORT_RECEIVED',
          title: 'New Performance Report',
          body: `${senderDisplayName} dispatched a ${periodType} performance report to you.`,
          link: '/staff/documents',
          read: false,
        }),
    ]);

    if (messageResult.error) {
      throw messageResult.error;
    }

    if (notificationResult.error) {
      throw notificationResult.error;
    }

    // ---------------------------------------------------------
    // 10. Return successful dispatch
    // ---------------------------------------------------------
    return NextResponse.json({
      success: true,
      report: reportRecord,
      fileRoute,
    });

  } catch (err: any) {
    console.error('Dispatch Report Error:', err);

    return NextResponse.json(
      {
        error:
          err?.message ||
          'Failed to dispatch report',
      },
      { status: 500 }
    );
  }
}