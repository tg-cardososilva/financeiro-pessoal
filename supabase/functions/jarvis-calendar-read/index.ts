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

function getSecretKey() {
  const raw = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (raw) {
    const parsed = JSON.parse(raw);
    if (parsed.default) return parsed.default;
  }
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (legacy) return legacy;
  throw new Error('Supabase secret key unavailable');
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

const admin = createClient(SUPABASE_URL, getSecretKey(), {
  auth: { persistSession: false, autoRefreshToken: false },
});

function localDateString(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function addDays(dateString: string, days: number) {
  const [y, m, d] = dateString.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days, 12));
  return date.toISOString().slice(0, 10);
}

function zonedMidnightUtcIso(dateString: string) {
  const [y, m, d] = dateString.split('-').map(Number);
  const desired = Date.UTC(y, m - 1, d, 0, 0, 0);
  let guess = desired;
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23',
  });
  for (let i = 0; i < 3; i += 1) {
    const parts = formatter.formatToParts(new Date(guess));
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value || 0);
    const rendered = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
    const delta = desired - rendered;
    guess += delta;
    if (Math.abs(delta) < 1000) break;
  }
  return new Date(guess).toISOString();
}

async function refreshGoogleToken(connectionId: string, current: any) {
  const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID') || '';
  const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET') || '';
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) throw new Error('Google Calendar nao configurado');

  const expiresAt = current?.expires_at ? new Date(current.expires_at).getTime() : 0;
  if (current?.access_token && expiresAt > Date.now() + 120000) return current.access_token as string;
  if (!current?.refresh_token) throw new Error('Conexao Google sem refresh token. Reconecte o calendario.');

  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: current.refresh_token,
      grant_type: 'refresh_token',
    }),
  });
  const payload = await r.json();
  if (!r.ok || !payload.access_token) throw new Error(`Falha ao renovar Google token: ${payload.error || r.status}`);

  const newExpiry = payload.expires_in ? new Date(Date.now() + Number(payload.expires_in) * 1000).toISOString() : null;
  await admin.from('jarvis_connection_secrets').update({
    access_token: payload.access_token,
    token_type: payload.token_type || current.token_type || 'Bearer',
    expires_at: newExpiry,
    scope: payload.scope || current.scope || null,
    updated_at: new Date().toISOString(),
  }).eq('connection_id', connectionId);
  return payload.access_token as string;
}

function normalizeEvent(event: any) {
  const allDay = !!event?.start?.date && !event?.start?.dateTime;
  return {
    id: event.id,
    title: event.summary || 'Sem titulo',
    start: event?.start?.dateTime || event?.start?.date || null,
    end: event?.end?.dateTime || event?.end?.date || null,
    all_day: allDay,
    location: event.location || null,
    description: event.description || null,
    html_link: event.htmlLink || null,
    event_type: event.eventType || 'default',
    recurring_event_id: event.recurringEventId || null,
    status: event.status || 'confirmed',
    source: 'google_calendar',
    calendar_id: 'primary',
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Metodo nao suportado' }, 405);

  try {
    const auth = req.headers.get('Authorization') || '';
    if (!auth) return json({ error: 'Nao autenticado', code: 'not_authenticated' }, 401);

    const userClient = createClient(SUPABASE_URL, getPublishableKey(), {
      global: { headers: { Authorization: auth } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) return json({ error: 'Sessao invalida', code: 'invalid_session' }, 401);
    const userId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const requestedDays = Number(body?.days || 14);
    const days = Math.min(31, Math.max(3, Number.isFinite(requestedDays) ? Math.floor(requestedDays) : 14));
    const requestedAnchor = String(body?.anchor_date || '').trim();
    const anchorDate = /^\d{4}-\d{2}-\d{2}$/.test(requestedAnchor) ? requestedAnchor : localDateString();
    const endDate = addDays(anchorDate, days);
    const timeMin = zonedMidnightUtcIso(anchorDate);
    const timeMax = zonedMidnightUtcIso(endDate);

    const { data: connection, error: connectionError } = await userClient.from('jarvis_connections')
      .select('id,provider,status,display_name,updated_at')
      .eq('provider', 'google_calendar')
      .eq('status', 'connected')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (connectionError) throw connectionError;
    if (!connection) return json({
      error: 'Google Calendar nao conectado',
      code: 'calendar_not_connected',
      connected: false,
      timezone: TIMEZONE,
      events: [],
    }, 409);

    const { data: secret, error: secretError } = await admin.from('jarvis_connection_secrets')
      .select('*')
      .eq('connection_id', connection.id)
      .eq('user_id', userId)
      .maybeSingle();
    if (secretError || !secret) return json({
      error: 'Credenciais do Google Calendar nao encontradas',
      code: 'calendar_credentials_missing',
      connected: true,
      timezone: TIMEZONE,
      events: [],
    }, 409);

    const accessToken = await refreshGoogleToken(connection.id, secret);
    const params = new URLSearchParams({
      singleEvents: 'true',
      orderBy: 'startTime',
      showDeleted: 'false',
      timeZone: TIMEZONE,
      timeMin,
      timeMax,
      maxResults: '100',
      fields: 'items(id,status,summary,description,location,htmlLink,start,end,eventType,recurringEventId),nextPageToken',
    });

    const events: any[] = [];
    let pageToken = '';
    let pages = 0;
    do {
      if (pageToken) params.set('pageToken', pageToken);
      else params.delete('pageToken');
      const googleRes = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const payload = await googleRes.json();
      if (!googleRes.ok) {
        const message = payload?.error?.message || `Google Calendar ${googleRes.status}`;
        return json({ error: message, code: 'calendar_read_failed', connected: true, timezone: TIMEZONE, events: [] }, 502);
      }
      events.push(...(Array.isArray(payload.items) ? payload.items : []));
      pageToken = payload.nextPageToken || '';
      pages += 1;
    } while (pageToken && pages < 5 && events.length < 500);

    const seen = new Set<string>();
    const normalized = events
      .filter((event) => event?.id && event?.status !== 'cancelled')
      .map(normalizeEvent)
      .filter((event) => {
        const key = `${event.id}|${event.start || ''}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

    return json({
      ok: true,
      connected: true,
      timezone: TIMEZONE,
      source: 'google_calendar',
      calendar_id: 'primary',
      display_name: connection.display_name || null,
      anchor_date: anchorDate,
      end_date: endDate,
      events: normalized,
      synced_at: new Date().toISOString(),
    });
  } catch (e) {
    console.error(e);
    return json({
      error: e instanceof Error ? e.message : String(e),
      code: 'calendar_read_unavailable',
      connected: true,
      timezone: TIMEZONE,
      events: [],
    }, 500);
  }
});
