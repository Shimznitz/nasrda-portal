// supabase/functions/notify-user/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_KEY     = Deno.env.get('RESEND_API_KEY');
const TWILIO_ACCOUNT_SID = Deno.env.get('TWILIO_ACCOUNT_SID');
const TWILIO_AUTH_TOKEN  = Deno.env.get('TWILIO_AUTH_TOKEN');
const TWILIO_PHONE_NUM   = Deno.env.get('TWILIO_PHONE_NUMBER');
const SUPABASE_URL       = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_KEY       = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    let payload: any;
    try {
      payload = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid JSON payload' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const record = payload?.record;

    if (!record || payload.type !== 'INSERT') {
      return new Response(
        JSON.stringify({ status: 'ignored', reason: 'Not an INSERT event' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (!record.user_id) {
      return new Response(
        JSON.stringify({ status: 'ignored', reason: 'No user_id on record' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    // 1. Fetch profile safely using maybeSingle
    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('name, email, whatsapp')
      .eq('id', record.user_id)
      .maybeSingle();

    if (profileErr) {
      console.error('Profile fetch error:', profileErr.message);
    }

    // 2. Fallback email from auth.users
    let targetEmail = profile?.email ?? null;
    if (!targetEmail) {
      const { data: authUser } = await supabase.auth.admin.getUserById(record.user_id);
      targetEmail = authUser?.user?.email ?? null;
    }

    const firstName  = profile?.name?.split(' ')[0] || 'Staff';
    const notifTitle = record.title || 'NASRDA Update';
    const notifBody  = record.body  || 'Please log in to the NASRDA Staff Portal for details.';
    const siteUrl    = Deno.env.get('NEXT_PUBLIC_SITE_URL') || 'http://localhost:3000';

    const dispatchResults: Record<string, string> = {};

    // ── CHANNEL 1: EMAIL via Resend ───────────────────────────
    if (RESEND_API_KEY && targetEmail) {
      try {
        const resEmail = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${RESEND_API_KEY}`,
          },
          body: JSON.stringify({
            from:    'NASRDA Portal <onboarding@resend.dev>',
            to:      [targetEmail],
            subject: `[NASRDA Portal] ${notifTitle}`,
            html: `
              <div style="font-family:Arial,sans-serif;padding:24px;color:#1a1a1a;max-width:600px;border:1px solid #e5e7eb;border-radius:8px;">
                <h2 style="color:#0066cc;margin-top:0;">NASRDA Staff Portal</h2>
                <p>Hello <strong>${firstName}</strong>,</p>
                <p>You have a new notification:</p>
                <div style="background:#f8fafc;padding:16px;border-left:4px solid #0066cc;margin:20px 0;border-radius:4px;">
                  <h4 style="margin:0 0 8px;color:#0f172a;">${notifTitle}</h4>
                  <p style="margin:0;color:#334155;">${notifBody}</p>
                </div>
                <a href="${siteUrl}/staff/notifications"
                   style="display:inline-block;background:#0066cc;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:bold;">
                  View in Portal
                </a>
                <p style="font-size:13px;color:#64748b;margin-top:20px;">
                  This is an automated notification from the NASRDA Staff Portal.
                </p>
              </div>
            `,
          }),
        });

        const emailJson = await resEmail.json();
        console.log("Resend API Response:", JSON.stringify(emailJson));
        dispatchResults.email = resEmail.ok ? 'sent' : `failed: ${JSON.stringify(emailJson)}`;
      } catch (e: any) {
        dispatchResults.email = `error: ${e.message}`;
      }
    } else {
      dispatchResults.email = 'skipped (no API key or email)';
    }

    // ── CHANNEL 2: SMS via Twilio (using whatsapp column) ─────
    const targetPhone = profile?.whatsapp;
    if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_PHONE_NUM && targetPhone) {
      try {
        let phone = targetPhone.replace(/[\s\-\(\)\.]/g, '');
        
        // Handle all common Nigerian number formats
        if (phone.startsWith('+234')) {
          // Already correct
        } else if (phone.startsWith('234')) {
          phone = '+' + phone;
        } else if (phone.startsWith('0')) {
          phone = '+234' + phone.slice(1);
        } else if (!phone.startsWith('+')) {
          phone = '+234' + phone;
        }

        if (!/^\+\d{10,15}$/.test(phone)) {
          dispatchResults.sms = `skipped: invalid phone number format (${phone})`;
        } else {
          const credentials = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);
          const resSMS = await fetch(
            `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Basic ${credentials}`,
                'Content-Type':  'application/x-www-form-urlencoded',
              },
              body: new URLSearchParams({
                To:   phone,
                From: TWILIO_PHONE_NUM.trim(),
                Body: `[NASRDA Portal] ${notifTitle}: ${notifBody}. View: ${siteUrl}/staff/notifications`,
              }),
            }
          );

          const smsJson = await resSMS.json();
          console.log("Twilio SMS Response:", JSON.stringify(smsJson));
          dispatchResults.sms = resSMS.ok ? 'sent' : `failed: ${JSON.stringify(smsJson)}`;
        }
      } catch (e: any) {
        dispatchResults.sms = `error: ${e.message}`;
      }
    } else {
      dispatchResults.sms = 'skipped (missing credentials or whatsapp number)';
    }

    return new Response(
      JSON.stringify({ status: 'processed', dispatchResults }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (err: any) {
    console.error('Edge Function Exception:', err);
    return new Response(
      JSON.stringify({ error: err.message || 'Internal error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});