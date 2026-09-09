import { createClient } from 'npm:@supabase/supabase-js@2.115.0';

export function supabaseUrl() {
  const value = Deno.env.get('SUPABASE_URL');
  if (!value) throw new Error('supabase_configuration_missing');
  return value;
}

function keyFromJson(name: string) {
  const raw = Deno.env.get(name);
  if (!raw) return '';
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed?.default === 'string' ? parsed.default : '';
  } catch {
    return '';
  }
}

export function publishableKey() {
  const value = keyFromJson('SUPABASE_PUBLISHABLE_KEYS') || Deno.env.get('SUPABASE_ANON_KEY');
  if (!value) throw new Error('supabase_publishable_key_missing');
  return value;
}

export function secretKey() {
  const value = keyFromJson('SUPABASE_SECRET_KEYS') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!value) throw new Error('supabase_secret_key_missing');
  return value;
}

export function adminClient() {
  return createClient(supabaseUrl(), secretKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function authenticatedContext(req: Request) {
  const authorization = req.headers.get('Authorization') || '';
  if (!authorization) throw new Error('not_authenticated');
  const client = createClient(supabaseUrl(), publishableKey(), {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new Error('invalid_session');
  return { authorization, client, userId: data.user.id };
}
