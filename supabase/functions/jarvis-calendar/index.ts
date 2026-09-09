import { createClient } from 'npm:@supabase/supabase-js@2.115.0';
import { executeCalendarBatchItems, summarizeCalendarBatchResults } from '../_shared/calendar-batch.mjs';

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

async function calendarAccessToken(userClient: any, userId: string) {
  const { data: connection, error: connectionError } = await userClient.from('jarvis_connections')
    .select('*').eq('provider', 'google_calendar').eq('status', 'connected')
    .order('updated_at', { ascending: false }).limit(1).maybeSingle();
  if (connectionError) throw connectionError;
  if (!connection) throw new Error('Google Calendar nao conectado');
  const { data: secret, error: secretError } = await admin.from('jarvis_connection_secrets')
    .select('*').eq('connection_id', connection.id).eq('user_id', userId).maybeSingle();
  if (secretError || !secret) throw new Error('Credenciais do Google Calendar nao encontradas');
  return refreshGoogleToken(connection.id, secret);
}

async function loadActions(userClient: any, body: any) {
  const actionId = String(body?.action_id || '').trim();
  const batchId = String(body?.batch_id || '').trim();
  if (!actionId && !batchId) throw new Error('action_id_ou_batch_id_obrigatorio');
  let query = userClient.from('jarvis_actions').select('*').eq('action_type', 'calendar_create');
  query = batchId
    ? query.eq('batch_id', batchId).order('batch_index', { ascending: true })
    : query.eq('id', actionId);
  const { data, error } = await query;
  if (error) throw error;
  if (!data?.length) throw new Error('Acao nao encontrada');
  return data;
}

async function cancelOne(userClient: any, action: any) {
  if (action.status === 'cancelled' || action.status === 'executed' || action.status === 'executing') {
    return { action_id: action.id, title: action.payload?.title || 'Evento', status: action.status };
  }
  const { data, error } = await userClient.from('jarvis_actions').update({
    status: 'cancelled', updated_at: new Date().toISOString(), error_message: null,
  }).eq('id', action.id).in('status', ['proposed', 'confirmed', 'failed']).select('*').maybeSingle();
  if (error) throw error;
  return { action_id: action.id, title: action.payload?.title || 'Evento', status: data ? 'cancelled' : 'in_progress' };
}

async function persistExecutedAction(userClient: any, userId: string, action: any, googleEvent: any) {
  const p = action.payload || {};
  const mergedPayload = {
    ...p, google_event_id: googleEvent.id,
    google_event_link: googleEvent.htmlLink || null, calendar_id: 'primary',
  };
  const { data: updatedAction, error: updateError } = await userClient.from('jarvis_actions').update({
    status: 'executed', executed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    payload: mergedPayload, error_message: null,
  }).eq('id', action.id).select('*').single();
  if (updateError) throw updateError;

  const messageResult = await userClient.from('jarvis_messages').insert({
    user_id: userId, channel: 'web', direction: 'outbound', message_type: 'text',
    body: `Agendado: ${p.title}.`, intent: 'calendar', confidence: 1, status: 'processed',
    raw_data: {
      engine: 'calendar_executor', action_id: action.id, batch_id: action.batch_id,
      batch_index: action.batch_index, google_event_id: googleEvent.id,
    },
    processed_at: new Date().toISOString(),
  });
  if (messageResult.error) {
    console.error(JSON.stringify({
      component: 'jarvis-calendar', operation: 'save_outbound_audit',
      action_id: action.id, error: String(messageResult.error.message || 'database_error').slice(0, 160),
    }));
  }
  return {
    action_id: action.id, title: p.title, status: 'executed', action: updatedAction,
    event: { id: googleEvent.id, htmlLink: googleEvent.htmlLink || null },
  };
}

async function executeOne(userClient: any, userId: string, accessToken: string, action: any) {
  const p = action.payload || {};
  const title = p.title || 'Evento';
  if (!p.title || !p.starts_at || !p.ends_at) {
    return { action_id: action.id, title, status: 'failed', error: 'Evento incompleto' };
  }
  if (action.status === 'executed') {
    return {
      action_id: action.id, title, status: 'executed', already_executed: true,
      event: { id: p.google_event_id || null, htmlLink: p.google_event_link || null },
    };
  }
  const googleEventId = `jarvis${String(action.id).replace(/-/g, '')}`;
  let currentStatus = action.status;
  if (currentStatus === 'executing') {
    const existingRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(googleEventId)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (existingRes.ok) return persistExecutedAction(userClient, userId, action, await existingRes.json());
    const claimAge = Date.now() - new Date(action.updated_at || action.created_at).getTime();
    if (existingRes.status !== 404 || claimAge < 120000) {
      return {
        action_id: action.id, title, status: 'in_progress',
        error: existingRes.status === 404 ? undefined : `Google Calendar ${existingRes.status}`,
      };
    }
    const recovery = await userClient.from('jarvis_actions').update({
      status: 'failed', error_message: 'stale_claim_recovered', updated_at: new Date().toISOString(),
    }).eq('id', action.id).eq('status', 'executing').eq('updated_at', action.updated_at)
      .select('id').maybeSingle();
    if (recovery.error) throw recovery.error;
    if (!recovery.data) return { action_id: action.id, title, status: 'in_progress' };
    currentStatus = 'failed';
  }
  if (!['proposed', 'confirmed', 'failed'].includes(currentStatus)) {
    return { action_id: action.id, title, status: currentStatus, error: `Acao em estado ${currentStatus}` };
  }

  const claimResult = await userClient.from('jarvis_actions').update({
    status: 'executing', confirmed_at: action.confirmed_at || new Date().toISOString(),
    updated_at: new Date().toISOString(), error_message: null,
  }).eq('id', action.id).in('status', ['proposed', 'confirmed', 'failed']).select('id').maybeSingle();
  if (claimResult.error) throw claimResult.error;
  if (!claimResult.data) return { action_id: action.id, title, status: 'in_progress' };

  const eventBody: any = {
    id: googleEventId,
    summary: p.title,
    start: { dateTime: p.starts_at, timeZone: 'America/Sao_Paulo' },
    end: { dateTime: p.ends_at, timeZone: 'America/Sao_Paulo' },
  };
  if (p.location) eventBody.location = p.location;
  if (p.notes) eventBody.description = p.notes;

  try {
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
      await userClient.from('jarvis_actions').update({
        status: 'failed', error_message: message, updated_at: new Date().toISOString(),
      }).eq('id', action.id);
      return { action_id: action.id, title, status: 'failed', error: message };
    }

    return persistExecutedAction(userClient, userId, action, googleEvent);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao executar evento';
    await userClient.from('jarvis_actions').update({
      status: 'failed', error_message: message.slice(0, 500), updated_at: new Date().toISOString(),
    }).eq('id', action.id);
    return { action_id: action.id, title, status: 'failed', error: message };
  }
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
    if (body?.explicit_confirmation !== true) return json({ error: 'confirmacao explicita obrigatoria' }, 400);

    const actions = await loadActions(userClient, body);
    const operation = String(body?.operation || 'execute');
    if (operation === 'cancel') {
      const results = await executeCalendarBatchItems(actions, (action: any) => cancelOne(userClient, action));
      const summary = summarizeCalendarBatchResults(results);
      return json({ ok: true, operation, batch_id: actions[0].batch_id || actions[0].id, results, summary });
    }
    if (operation !== 'execute') return json({ error: 'Operacao nao suportada' }, 400);

    const needsGoogle = actions.some((action: any) => ['proposed', 'confirmed', 'failed', 'executing'].includes(action.status));
    const accessToken = needsGoogle ? await calendarAccessToken(userClient, userId) : '';
    const results = await executeCalendarBatchItems(
      actions,
      (action: any) => executeOne(userClient, userId, accessToken, action),
    );
    const summary = summarizeCalendarBatchResults(results);
    const response = {
      ok: summary.ok,
      partial_success: summary.partial_success,
      operation,
      batch_id: actions[0].batch_id || actions[0].id,
      results,
      summary,
    };
    if (body?.action_id && results.length === 1 && results[0].status === 'failed') {
      return json({ ...response, error: results[0].error || 'Falha ao executar evento' }, 502);
    }
    return json(response);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const status = /obrigatorio|obrigatoria|suportad|Evento incompleto/.test(message) ? 400
      : /nao encontrada/.test(message) ? 404
      : /nao conectado|Credenciais/.test(message) ? 409 : 500;
    console.error(JSON.stringify({ component: 'jarvis-calendar', error: message.slice(0, 240) }));
    return json({ error: message }, status);
  }
});
