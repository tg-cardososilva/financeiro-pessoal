import { createClient } from 'npm:@supabase/supabase-js@2.115.0';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;

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

const admin = createClient(SUPABASE_URL, getSecretKey(), { auth: { persistSession: false, autoRefreshToken: false } });

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Metodo nao suportado' }, 405);
  try {
    const auth = req.headers.get('Authorization') || '';
    if (!auth) return json({ error: 'Nao autenticado' }, 401);
    const userClient = createClient(SUPABASE_URL, getPublishableKey(), { global: { headers: { Authorization: auth } } });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) return json({ error: 'Sessao invalida' }, 401);
    const userId = userData.user.id;

    const body = await req.json();
    const actionId = String(body?.action_id || '').trim();
    if (!actionId) return json({ error: 'action_id obrigatorio' }, 400);
    if (body?.explicit_confirmation !== true) {
      return json({ error: 'confirmacao explicita obrigatoria' }, 400);
    }

    const { data: action, error: actionError } = await userClient.from('jarvis_actions').select('*').eq('id', actionId).maybeSingle();
    if (actionError || !action) return json({ error: 'Acao nao encontrada' }, 404);
    if (action.action_type !== 'calendar_create') return json({ error: 'Tipo de acao nao suportado' }, 400);
    if (action.status === 'executed') return json({ ok: true, already_executed: true, action });
    if (!['proposed', 'confirmed', 'failed'].includes(action.status)) return json({ error: `Acao em estado ${action.status}` }, 409);

    const p = action.payload || {};
    if (!p.title || !p.starts_at || !p.ends_at) return json({ error: 'Evento incompleto' }, 400);

    const { data: connection } = await userClient.from('jarvis_connections')
      .select('*').eq('provider', 'google_calendar').eq('status', 'connected')
      .order('updated_at', { ascending: false }).limit(1).maybeSingle();
    if (!connection) return json({ error: 'Google Calendar nao conectado' }, 409);

    const { data: secret, error: secretError } = await admin.from('jarvis_connection_secrets')
      .select('*').eq('connection_id', connection.id).eq('user_id', userId).maybeSingle();
    if (secretError || !secret) return json({ error: 'Credenciais do Google Calendar nao encontradas' }, 409);
    const accessToken = await refreshGoogleToken(connection.id, secret);

    const claimResult = await userClient.from('jarvis_actions').update({
      status: 'executing', confirmed_at: action.confirmed_at || new Date().toISOString(), updated_at: new Date().toISOString(), error_message: null,
    }).eq('id', action.id).in('status', ['proposed', 'confirmed', 'failed']).select('id').maybeSingle();
    if (claimResult.error) throw claimResult.error;
    if (!claimResult.data) return json({ error: 'Acao ja esta em processamento' }, 409);

    const eventBody: any = {
      id: `jarvis${String(action.id).replace(/-/g, '')}`,
      summary: p.title,
      start: { dateTime: p.starts_at, timeZone: 'America/Sao_Paulo' },
      end: { dateTime: p.ends_at, timeZone: 'America/Sao_Paulo' },
    };
    if (p.location) eventBody.location = p.location;
    if (p.notes) eventBody.description = p.notes;

    const googleRes = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(eventBody),
    });
    let googleEvent = await googleRes.json();
    if (googleRes.status === 409) {
      const existingRes = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventBody.id)}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      googleEvent = await existingRes.json();
      if (!existingRes.ok) googleEvent = { error: { message: `Google Calendar ${existingRes.status}` } };
    }
    if ((!googleRes.ok && googleRes.status !== 409) || !googleEvent.id) {
      const message = googleEvent?.error?.message || `Google Calendar ${googleRes.status}`;
      await userClient.from('jarvis_actions').update({ status: 'failed', error_message: message, updated_at: new Date().toISOString() }).eq('id', action.id);
      return json({ error: message }, 502);
    }

    const mergedPayload = { ...p, google_event_id: googleEvent.id, google_event_link: googleEvent.htmlLink || null, calendar_id: 'primary' };
    const { data: updatedAction, error: updateError } = await userClient.from('jarvis_actions').update({
      status: 'executed', executed_at: new Date().toISOString(), updated_at: new Date().toISOString(), payload: mergedPayload, error_message: null,
    }).eq('id', action.id).select('*').single();
    if (updateError) throw updateError;

    await userClient.from('jarvis_messages').insert({
      user_id: userId,
      channel: 'web',
      direction: 'outbound',
      message_type: 'text',
      body: `Agendado: ${p.title}.`,
      intent: 'calendar',
      confidence: 1,
      status: 'processed',
      raw_data: { engine: 'calendar_executor', action_id: action.id, google_event_id: googleEvent.id },
      processed_at: new Date().toISOString(),
    });

    return json({ ok: true, action: updatedAction, event: { id: googleEvent.id, htmlLink: googleEvent.htmlLink || null } });
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
