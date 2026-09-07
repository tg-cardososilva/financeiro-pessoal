import { createClient } from 'npm:@supabase/supabase-js@2.115.0';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const APP_URL = Deno.env.get('JARVIS_APP_URL') || 'https://tg-cardososilva.github.io/financeiro-pessoal/';
const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID') || '';
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET') || '';
const REDIRECT_URI = Deno.env.get('GOOGLE_REDIRECT_URI') || `${SUPABASE_URL}/functions/v1/jarvis-google-oauth`;

const CALENDAR_PROVIDER = 'google_calendar';
const DRIVE_PROVIDER = 'google_drive';
const DRIVE_METADATA_SCOPE = 'https://www.googleapis.com/auth/drive.metadata.readonly';
const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const IDENTITY_SCOPES = [
  'openid',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
];
const CALENDAR_SCOPES = [
  ...IDENTITY_SCOPES,
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.freebusy',
];
const DRIVE_SCOPES = [...IDENTITY_SCOPES, DRIVE_METADATA_SCOPE, DRIVE_FILE_SCOPE];
const ALLOWED_PROVIDERS = new Set([CALENDAR_PROVIDER, DRIVE_PROVIDER]);

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

const admin = createClient(SUPABASE_URL, getSecretKey(), {
  auth: { persistSession: false, autoRefreshToken: false },
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

function redirectWith(params: Record<string, string>) {
  const u = new URL(APP_URL);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return Response.redirect(u.toString(), 302);
}

function providerRedirect(provider: string, status: string, reason = '') {
  const key = provider === DRIVE_PROVIDER ? 'jarvis_google_drive' : 'jarvis_google';
  const params: Record<string, string> = { [key]: status };
  if (reason) params.reason = reason;
  return redirectWith(params);
}

function providerLabel(provider: string) {
  return provider === DRIVE_PROVIDER ? 'Google Drive' : 'Google Calendar';
}

function providerScopes(provider: string) {
  return provider === DRIVE_PROVIDER ? DRIVE_SCOPES : CALENDAR_SCOPES;
}

async function currentUser(req: Request) {
  const auth = req.headers.get('Authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

async function startOAuth(req: Request) {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    return json({ error: 'Google Calendar ainda nao configurado no Supabase.' }, 503);
  }
  const user = await currentUser(req);
  if (!user) return json({ error: 'Nao autenticado' }, 401);
  const state = `${crypto.randomUUID().replaceAll('-', '')}${crypto.randomUUID().replaceAll('-', '')}`;
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const { error } = await admin.from('jarvis_oauth_states').insert({
    state,
    user_id: user.id,
    provider: CALENDAR_PROVIDER,
    expires_at: expiresAt,
  });
  if (error) throw error;
  const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  u.searchParams.set('client_id', GOOGLE_CLIENT_ID);
  u.searchParams.set('redirect_uri', REDIRECT_URI);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope', CALENDAR_SCOPES.join(' '));
  u.searchParams.set('access_type', 'offline');
  u.searchParams.set('include_granted_scopes', 'true');
  u.searchParams.set('prompt', 'consent');
  u.searchParams.set('state', state);
  return json({ ok: true, authorization_url: u.toString(), redirect_uri: REDIRECT_URI });
}

async function tokenScopes(accessToken: string, tokenPayload: any) {
  const scopes = new Set<string>(String(tokenPayload?.scope || '').split(' ').filter(Boolean));
  try {
    const r = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`);
    const info = await r.json();
    if (r.ok) for (const scope of String(info?.scope || '').split(' ').filter(Boolean)) scopes.add(scope);
  } catch (e) {
    console.warn('Google tokeninfo unavailable', e);
  }
  return [...scopes];
}

async function driveMetadataProbe(accessToken: string) {
  const params = new URLSearchParams({ pageSize: '1', spaces: 'drive', q: 'trashed = false', fields: 'files(id),nextPageToken' });
  const r = await fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, {
    method: 'GET', headers: { Authorization: `Bearer ${accessToken}` },
  });
  const payload = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`DRIVE_METADATA_PROBE_${r.status}:${payload?.error?.message || `Google Drive ${r.status}`}`);
  return { ok: true, checked_at: new Date().toISOString() };
}

async function markStateUsed(state: string) {
  await admin.from('jarvis_oauth_states').update({ used_at: new Date().toISOString() }).eq('state', state);
}

async function upsertErrorConnection(userId: string, provider: string, info: any, scopes: string[], reason: string) {
  const { data: existing } = await admin.from('jarvis_connections').select('*')
    .eq('user_id', userId).eq('provider', provider).order('updated_at', { ascending: false }).limit(1).maybeSingle();
  const payload = {
    status: 'error',
    external_account_id: String(info.id),
    display_name: info.email || info.name || providerLabel(provider),
    scopes,
    updated_at: new Date().toISOString(),
    metadata: {
      ...(existing?.metadata || {}),
      email: info.email || null,
      picture: info.picture || null,
      oauth_checkpoint: { ok: false, reason, checked_at: new Date().toISOString() },
    },
  };
  if (existing) {
    await admin.from('jarvis_connections').update(payload).eq('id', existing.id);
    return;
  }
  await admin.from('jarvis_connections').insert({ user_id: userId, provider, connected_at: null, ...payload });
}

async function oauthCallback(req: Request) {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) return redirectWith({ jarvis_google: 'error', reason: 'google_not_configured' });
  const url = new URL(req.url);
  const state = url.searchParams.get('state') || '';
  const code = url.searchParams.get('code') || '';
  const oauthError = url.searchParams.get('error') || '';
  if (!state) return redirectWith({ jarvis_google: 'error', reason: 'missing_state' });

  const { data: stateRow, error: stateError } = await admin.from('jarvis_oauth_states').select('*')
    .eq('state', state).is('used_at', null).gt('expires_at', new Date().toISOString()).maybeSingle();
  const provider = String(stateRow?.provider || '');
  if (stateError || !stateRow || !ALLOWED_PROVIDERS.has(provider)) return redirectWith({ jarvis_google: 'error', reason: 'invalid_state' });
  if (oauthError || !code) {
    await markStateUsed(state);
    return providerRedirect(provider, 'cancelled');
  }

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET, redirect_uri: REDIRECT_URI, grant_type: 'authorization_code' }),
  });
  const tokens = await tokenRes.json();
  if (!tokenRes.ok || !tokens.access_token) {
    console.error('Google token exchange failed', tokens);
    await markStateUsed(state);
    return providerRedirect(provider, 'error', 'token_exchange');
  }

  const infoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', { headers: { Authorization: `Bearer ${tokens.access_token}` } });
  const info = await infoRes.json();
  if (!infoRes.ok || !info.id) {
    console.error('Google userinfo failed', info);
    await markStateUsed(state);
    return providerRedirect(provider, 'error', 'userinfo');
  }

  const userId = stateRow.user_id;
  const grantedScopes = await tokenScopes(tokens.access_token, tokens);
  const allowedScopeSet = new Set(providerScopes(provider));
  const storedScopes = grantedScopes.filter((scope) => allowedScopeSet.has(scope));
  const { data: existing } = await admin.from('jarvis_connections').select('*')
    .eq('user_id', userId).eq('provider', provider).order('updated_at', { ascending: false }).limit(1).maybeSingle();
  const { data: oldSecret } = existing
    ? await admin.from('jarvis_connection_secrets').select('refresh_token').eq('connection_id', existing.id).maybeSingle()
    : { data: null };
  const refreshToken = tokens.refresh_token || oldSecret?.refresh_token || null;

  if (provider === DRIVE_PROVIDER) {
    if (!grantedScopes.includes(DRIVE_METADATA_SCOPE)) {
      await upsertErrorConnection(userId, provider, info, storedScopes, 'drive_metadata_scope_missing');
      await markStateUsed(state);
      return providerRedirect(provider, 'error', 'drive_metadata_scope_missing');
    }
    if (!grantedScopes.includes(DRIVE_FILE_SCOPE)) {
      await markStateUsed(state);
      return providerRedirect(provider, 'error', 'drive_file_scope_missing');
    }
    if (!refreshToken) {
      await upsertErrorConnection(userId, provider, info, storedScopes, 'refresh_token_missing');
      await markStateUsed(state);
      return providerRedirect(provider, 'error', 'refresh_token_missing');
    }
    try {
      await driveMetadataProbe(tokens.access_token);
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      console.error('Google Drive metadata probe failed', reason);
      await upsertErrorConnection(userId, provider, info, storedScopes, reason);
      await markStateUsed(state);
      return providerRedirect(provider, 'error', reason.startsWith('DRIVE_METADATA_PROBE_') ? 'drive_metadata_probe' : 'drive_probe');
    }
  }

  let connection;
  const connectionPayload = {
    status: 'connected',
    external_account_id: String(info.id),
    display_name: info.email || info.name || providerLabel(provider),
    scopes: storedScopes,
    connected_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    metadata: {
      ...(existing?.metadata || {}),
      email: info.email || null,
      picture: info.picture || null,
      oauth_checkpoint: provider === DRIVE_PROVIDER
        ? { ok: true, drive_metadata_readonly: true, drive_file: true, checked_at: new Date().toISOString() }
        : existing?.metadata?.oauth_checkpoint || null,
    },
  };
  if (existing) {
    const { data, error } = await admin.from('jarvis_connections').update(connectionPayload).eq('id', existing.id).select('*').single();
    if (error) throw error;
    connection = data;
  } else {
    const { data, error } = await admin.from('jarvis_connections').insert({ user_id: userId, provider, ...connectionPayload }).select('*').single();
    if (error) throw error;
    connection = data;
  }
  const expiresAt = tokens.expires_in ? new Date(Date.now() + Number(tokens.expires_in) * 1000).toISOString() : null;
  const { error: secretError } = await admin.from('jarvis_connection_secrets').upsert({
    connection_id: connection.id,
    user_id: userId,
    access_token: tokens.access_token,
    refresh_token: refreshToken,
    token_type: tokens.token_type || 'Bearer',
    expires_at: expiresAt,
    scope: storedScopes.join(' '),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'connection_id' });
  if (secretError) throw secretError;
  await markStateUsed(state);
  return providerRedirect(provider, 'connected');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const url = new URL(req.url);
    if (req.method === 'GET' && (url.searchParams.has('code') || url.searchParams.has('error') || url.searchParams.has('state'))) return await oauthCallback(req);
    if (req.method === 'POST') return await startOAuth(req);
    return json({ error: 'Metodo nao suportado' }, 405);
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
