import { createClient } from 'npm:@supabase/supabase-js@2.115.0';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const TIMEZONE = 'America/Sao_Paulo';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

function getPublishableKey() {
  const raw = Deno.env.get('SUPABASE_PUBLISHABLE_KEYS');
  if (raw) {
    const parsed = JSON.parse(raw);
    if (parsed.default) return parsed.default;
  }
  const legacy = Deno.env.get('SUPABASE_ANON_KEY');
  if (legacy) return legacy;
  throw new Error('Supabase publishable key unavailable');
}

function normalize(text: string) {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function dateKey(value = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(value);
  const get = (type: string) => parts.find((p) => p.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function addDays(key: string, days: number) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days, 12)).toISOString().slice(0, 10);
}

function eventDateKey(event: any) {
  if (event?.all_day && /^\d{4}-\d{2}-\d{2}$/.test(String(event.start || ''))) return event.start;
  const d = new Date(event?.start || '');
  return Number.isNaN(d.getTime()) ? '' : dateKey(d);
}

function eventTime(event: any) {
  if (event?.all_day) return 'dia inteiro';
  const d = new Date(event?.start || '');
  if (Number.isNaN(d.getTime())) return 'horario indefinido';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: TIMEZONE,
    hour: '2-digit', minute: '2-digit',
  }).format(d);
}

function eventDate(event: any) {
  if (event?.all_day && /^\d{4}-\d{2}-\d{2}$/.test(String(event.start || ''))) {
    const [y, m, d] = event.start.split('-').map(Number);
    return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(new Date(y, m - 1, d, 12));
  }
  const d = new Date(event?.start || '');
  if (Number.isNaN(d.getTime())) return 'data indefinida';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: TIMEZONE,
    day: '2-digit', month: 'short',
  }).format(d);
}

function chooseWindow(message: string, today: string) {
  const t = normalize(message);
  if (/\bamanha\b/.test(t)) return { label: 'amanha', start: addDays(today, 1), end: addDays(today, 2) };
  if (/\bhoje\b/.test(t)) return { label: 'hoje', start: today, end: addDays(today, 1) };
  if (/\b(semana|proximos dias|proximas datas|agenda)\b/.test(t)) return { label: 'nos proximos 7 dias', start: today, end: addDays(today, 7) };
  return { label: 'nos proximos dias', start: today, end: addDays(today, 7) };
}

function buildReply(message: string, events: any[]) {
  const today = dateKey();
  const window = chooseWindow(message, today);
  const selected = events.filter((event) => {
    const key = eventDateKey(event);
    return key && key >= window.start && key < window.end;
  });
  if (!selected.length) return `Nao encontrei compromissos no Google Calendar ${window.label}.`;

  const lines = selected.slice(0, 8).map((event) => {
    const location = event.location ? `, ${event.location}` : '';
    return `${eventDate(event)} as ${eventTime(event)} - ${event.title || 'Compromisso'}${location}`;
  });
  const more = selected.length > 8 ? ` Ha mais ${selected.length - 8} compromisso(s) nesse periodo.` : '';
  return `No Google Calendar, ${window.label}: ${lines.join('; ')}.${more}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Metodo nao suportado' }, 405);

  try {
    const auth = req.headers.get('Authorization') || '';
    if (!auth) return json({ error: 'Nao autenticado' }, 401);
    const publishable = getPublishableKey();
    const userClient = createClient(SUPABASE_URL, publishable, {
      global: { headers: { Authorization: auth } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) return json({ error: 'Sessao invalida' }, 401);
    const userId = userData.user.id;

    const body = await req.json();
    const message = String(body?.message || '').trim();
    if (!message) return json({ error: 'Mensagem vazia' }, 400);
    const channel = ['web','whatsapp','other'].includes(body?.channel) ? body.channel : 'web';

    const { data: inbound, error: inboundError } = await userClient.from('jarvis_messages').insert({
      user_id: userId,
      channel,
      direction: 'inbound',
      message_type: 'text',
      body: message,
      intent: 'query',
      confidence: 1,
      status: 'processing',
      raw_data: { source: body?.source || 'jarvis-calendar-query', engine: 'calendar_real' },
    }).select('*').single();
    if (inboundError) throw inboundError;

    let reply = '';
    let calendarError: string | null = null;
    let events: any[] = [];
    try {
      const calendarRes = await fetch(`${SUPABASE_URL}/functions/v1/jarvis-calendar-read`, {
        method: 'POST',
        headers: {
          Authorization: auth,
          apikey: publishable,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ days: 14 }),
      });
      const calendarData = await calendarRes.json();
      if (!calendarRes.ok || calendarData?.error) throw new Error(calendarData?.error || `Calendar ${calendarRes.status}`);
      events = Array.isArray(calendarData?.events) ? calendarData.events : [];
      reply = buildReply(message, events);
    } catch (e) {
      calendarError = e instanceof Error ? e.message : String(e);
      reply = `Nao consegui consultar seu Google Calendar agora. ${calendarError}`;
    }

    await userClient.from('jarvis_messages').update({
      intent: 'query',
      confidence: 1,
      status: 'processed',
      processed_at: new Date().toISOString(),
      raw_data: {
        source: body?.source || 'jarvis-calendar-query',
        engine: 'calendar_real',
        calendar_error: calendarError,
        event_count: events.length,
      },
    }).eq('id', inbound.id);

    const { data: outbound, error: outboundError } = await userClient.from('jarvis_messages').insert({
      user_id: userId,
      channel,
      direction: 'outbound',
      message_type: 'text',
      body: reply,
      intent: 'query',
      confidence: 1,
      status: 'processed',
      reply_to_id: inbound.id,
      processed_at: new Date().toISOString(),
      raw_data: {
        engine: 'calendar_real',
        source: 'google_calendar',
        calendar_error: calendarError,
      },
    }).select('*').single();
    if (outboundError) throw outboundError;

    return json({
      ok: true,
      engine: 'calendar_real',
      intent: 'query',
      confidence: 1,
      reply,
      confirmation_required: false,
      created: {},
      inbound_message_id: inbound.id,
      outbound_message_id: outbound.id,
      calendar_error: calendarError,
    });
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 400);
  }
});
