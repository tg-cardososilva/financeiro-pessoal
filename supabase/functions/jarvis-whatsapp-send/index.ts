import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { authenticatedContext } from '../_shared/auth.ts';
import { corsHeaders, json } from '../_shared/http.ts';
import { sendWhatsAppText } from '../_shared/whatsapp.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  try {
    const { client, userId } = await authenticatedContext(req);
    const body = await req.json().catch(() => ({}));
    const actionId = String(body.action_id || '');
    if (!actionId) return json({ error: 'action_id_required' }, 400);
    const actionResult = await client.from('jarvis_actions').select('*')
      .eq('user_id', userId).eq('id', actionId).maybeSingle();
    if (actionResult.error) throw actionResult.error;
    const action = actionResult.data;
    if (!action || action.action_type !== 'whatsapp_send') return json({ error: 'action_not_found' }, 404);
    if (action.status === 'executed') return json({ ok: true, already_executed: true });
    if (action.status !== 'confirmed' || action.confirmation_required !== true) {
      return json({ error: 'confirmation_required' }, 409);
    }
    const identityId = String(action.payload?.identity_id || '');
    const message = String(action.payload?.message || '').trim();
    const identityResult = await client.from('jarvis_identities').select('*')
      .eq('user_id', userId).eq('id', identityId).eq('channel', 'whatsapp')
      .eq('active', true).not('verified_at', 'is', null).maybeSingle();
    if (identityResult.error) throw identityResult.error;
    const identity = identityResult.data;
    if (!identity || !['authenticated_pairing','administrator_verified'].includes(identity.metadata?.binding_method)) {
      return json({ error: 'verified_identity_required' }, 409);
    }
    const claim = await client.from('jarvis_actions').update({
      status: 'executing', error_message: null,
    }).eq('user_id', userId).eq('id', action.id).eq('status', 'confirmed').select('id').maybeSingle();
    if (claim.error) throw claim.error;
    if (!claim.data) return json({ error: 'action_in_progress' }, 409);
    let sent;
    try {
      sent = await sendWhatsAppText(identity.channel_user_id, message);
    } catch (error) {
      const providerCode = String((error as any)?.providerCode || 'send_failed').slice(0, 40);
      await client.from('jarvis_actions').update({
        status: 'failed', error_message: providerCode,
      }).eq('user_id', userId).eq('id', action.id).eq('status', 'executing');
      throw error;
    }
    const { error: updateError } = await client.from('jarvis_actions').update({
      status: 'executed', executed_at: new Date().toISOString(), error_message: null,
      payload: { ...action.payload, external_message_id: sent.external_message_id },
    }).eq('user_id', userId).eq('id', action.id).eq('status', 'executing');
    if (updateError) throw updateError;
    return json({ ok: true, external_message_id: sent.external_message_id });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'whatsapp_send_failed';
    const safe = ['not_authenticated','invalid_session','whatsapp_sender_not_configured','whatsapp_send_failed'].includes(code)
      ? code : 'whatsapp_send_failed';
    return json({ error: safe }, ['not_authenticated','invalid_session'].includes(safe) ? 401 : 502);
  }
});
