import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { adminClient, authenticatedContext } from '../_shared/auth.ts';
import { corsHeaders, json } from '../_shared/http.ts';

const admin = adminClient();

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  try {
    const { client, userId } = await authenticatedContext(req);
    const body = await req.json().catch(() => ({}));
    if (body.action === 'status') {
      const { data, error } = await client.from('jarvis_identities')
        .select('id,channel,display_name,verified_at,active,created_at,metadata')
        .eq('user_id', userId).eq('channel', 'whatsapp').eq('active', true).maybeSingle();
      if (error) throw error;
      return json({ ok: true, paired: Boolean(data?.verified_at), identity: data || null });
    }
    if (body.action !== 'start' || body.explicit !== true) return json({ error: 'explicit_confirmation_required' }, 400);
    const bytes = crypto.getRandomValues(new Uint8Array(6));
    const code = [...bytes].map((byte) => byte.toString(36).padStart(2, '0')).join('').slice(0, 10).toUpperCase();
    const hash = await sha256(code);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    await admin.from('jarvis_whatsapp_pairing_codes').delete().eq('user_id', userId);
    const { error } = await admin.from('jarvis_whatsapp_pairing_codes').insert({
      code_hash: hash, user_id: userId, expires_at: expiresAt,
    });
    if (error) throw error;
    return json({
      ok: true, code, expires_at: expiresAt,
      instruction: `Envie “VINCULAR ${code}” para o número oficial do Jarvis no WhatsApp.`,
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'pairing_failed';
    return json({ error: ['not_authenticated','invalid_session'].includes(code) ? code : 'pairing_failed' },
      ['not_authenticated','invalid_session'].includes(code) ? 401 : 500);
  }
});
