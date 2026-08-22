// supabase/functions/notify-whatsapp/index.ts

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const WHATSAPP_TOKEN    = Deno.env.get('WHATSAPP_TOKEN')!;
const WHATSAPP_PHONE_ID = Deno.env.get('WHATSAPP_PHONE_ID')!;
const TEMPLATE_NAME     = Deno.env.get('WHATSAPP_TEMPLATE') || 'nasrda_notification';
const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_KEY      = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req) => {
  try {
    const payload = await req.json();

    // Supabase webhook sends { type, table, record, old_record }
    const record = payload.record;
    if (!record || payload.type !== 'INSERT') {
      return new Response('Not an insert', { status: 200 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

    // Get the user's WhatsApp number
    const { data: profile } = await supabase
      .from('profiles')
      .select('name, whatsapp')
      .eq('id', record.user_id)
      .single();

    if (!profile?.whatsapp) {
      // No WhatsApp number — skip silently
      return new Response('No WhatsApp number', { status: 200 });
    }

    // Clean the number — remove spaces, dashes, leading zeros
    // Add country code if missing (Nigeria default: +234)
    let number = profile.whatsapp.replace(/[\s\-\(\)]/g, '');
    if (number.startsWith('0')) {
      number = '234' + number.slice(1);
    }
    if (number.startsWith('+')) {
      number = number.slice(1);
    }

    // Build the notification body
    const notifTitle = record.title || 'New notification';
    const notifBody  = record.body  || '';
    const firstName  = profile.name?.split(' ')[0] || 'Staff';

    // Send via Meta Cloud API using template
    const response = await fetch(
      `https://graph.facebook.com/v18.0/${WHATSAPP_PHONE_ID}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: number,
          type: 'template',
          template: {
            name: TEMPLATE_NAME,
            language: { code: 'en_US' },
            components: [
              {
                type: 'body',
                parameters: [
                  { type: 'text', text: firstName },
                  { type: 'text', text: notifTitle },
                  { type: 'text', text: notifBody || 'Check the NASRDA Staff Portal for details.' },
                ],
              },
            ],
          },
        }),
      }
    );

    const result = await response.json();

    if (!response.ok) {
      console.error('WhatsApp API error:', JSON.stringify(result));
    }

    return new Response(JSON.stringify({ success: response.ok, result }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Edge function error:', err);
    return new Response('Error', { status: 500 });
  }
});