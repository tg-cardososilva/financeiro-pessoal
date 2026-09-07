import { createClient } from 'npm:@supabase/supabase-js@2.115.0';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID') || '';
const GOOGLE_REDIRECT_URI = Deno.env.get('GOOGLE_REDIRECT_URI') || `${SUPABASE_URL}/functions/v1/jarvis-google-oauth`;
const PROVIDER = 'google_drive';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.metadata.readonly';
const SCOPES = [
  'openid',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  DRIVE_SCOPE,
];

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

async function currentUser(req: Request) {
  const auth = req.headers.get('Authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

function authorizationUrl(state: string) {
  const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  u.searchParams.set('client_id', GOOGLE_CLIENT_ID);
  u.searchParams.set('redirect_uri', GOOGLE_REDIRECT_URI);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope', SCOPES.join(' '));
  u.searchParams.set('access_type', 'offline');
  u.searchParams.set('include_granted_scopes', 'true');
  u.searchParams.set('prompt', 'consent');
  u.searchParams.set('state', state);
  return u.toString();
}

async function createStateForUser(userId: string) {
  const state = `${crypto.randomUUID().replaceAll('-', '')}${crypto.randomUUID().replaceAll('-', '')}`;
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const { error } = await admin.from('jarvis_oauth_states').insert({
    state,
    user_id: userId,
    provider: PROVIDER,
    expires_at: expiresAt,
  });
  if (error) throw error;
  return { state, expiresAt };
}

async function validateState(state: string) {
  const { data, error } = await admin
    .from('jarvis_oauth_states')
    .select('state,user_id,provider,expires_at,used_at')
    .eq('state', state)
    .eq('provider', PROVIDER)
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();
  if (error) throw error;
  return data;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    if (!GOOGLE_CLIENT_ID) return json({ error: 'Google OAuth nao configurado.' }, 503);
    const url = new URL(req.url);

    if (req.method === 'GET') {
      const state = String(url.searchParams.get('state') || '').trim();
      if (!state) return json({ error: 'State OAuth ausente.' }, 400);
      const stateRow = await validateState(state);
      if (!stateRow) return json({ error: 'State OAuth invalido ou expirado.' }, 400);
      return Response.redirect(authorizationUrl(state), 302);
    }

    if (req.method === 'POST') {
      const user = await currentUser(req);
      if (!user) return json({ error: 'Nao autenticado' }, 401);
      const { state, expiresAt } = await createStateForUser(user.id);
      return json({
        ok: true,
        provider: PROVIDER,
        authorization_url: authorizationUrl(state),
        redirect_uri: GOOGLE_REDIRECT_URI,
        requested_scopes: SCOPES,
        expires_at: expiresAt,
      });
    }

    return json({ error: 'Metodo nao suportado' }, 405);
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
