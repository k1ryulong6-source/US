// Weekly reminder: called once an hour by pg_cron. Sends at most one push
// per subscription per week, at the weekday/hour the person chose, in their
// own time zone. Never a follow-up: if it is ignored, nothing else happens.
//
// Secrets: CRON_SECRET, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
// (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase).
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

interface Subscription {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  weekday: number;
  hour: number;
  tz: string;
  last_sent_week: number | null;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const EPOCH_MONDAY = Date.UTC(2024, 0, 1);

/** Local weekday, hour and week number (weeks start Monday) in a time zone. */
export function localTime(now: Date, tz: string) {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      weekday: 'short',
      hour: 'numeric',
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    }).formatToParts(now);
  } catch {
    return localTime(now, 'Asia/Shanghai');
  }
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const localDay = Date.UTC(Number(get('year')), Number(get('month')) - 1, Number(get('day')));
  return {
    weekday: WEEKDAYS.indexOf(get('weekday')),
    hour: Number(get('hour')),
    week: Math.floor((localDay - EPOCH_MONDAY) / (7 * 86_400_000)),
  };
}

Deno.serve(async (req) => {
  if (req.headers.get('x-cron-secret') !== Deno.env.get('CRON_SECRET')) {
    return new Response('forbidden', { status: 403 });
  }

  webpush.setVapidDetails(
    Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com',
    Deno.env.get('VAPID_PUBLIC_KEY')!,
    Deno.env.get('VAPID_PRIVATE_KEY')!,
  );
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  const { data, error } = await db.from('push_subscriptions').select('*');
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const now = new Date();
  let sent = 0;
  let removed = 0;
  for (const sub of (data ?? []) as Subscription[]) {
    const local = localTime(now, sub.tz);
    if (local.weekday !== sub.weekday || local.hour !== sub.hour || sub.last_sent_week === local.week) continue;

    // Mark first, so a retry or overlapping run can never send twice.
    await db.from('push_subscriptions').update({ last_sent_week: local.week }).eq('id', sub.id);
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify({ type: 'weekly' }),
        { TTL: 6 * 3600, urgency: 'low' },
      );
      sent++;
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      console.error('push failed', status ?? (e as Error).message);
      if (status === 404 || status === 410) {
        await db.from('push_subscriptions').delete().eq('id', sub.id);
        removed++;
      }
    }
  }
  return Response.json({ sent, removed });
});
