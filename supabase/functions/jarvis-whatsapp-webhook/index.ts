import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { adminClient } from '../_shared/auth.ts';
import { executeJarvis } from '../_shared/jarvis-engine.ts';
import { sendWhatsAppText } from '../_shared/whatsapp.ts';
import { createWebhookHandler } from './webhook-core.mjs';
import { createWhatsAppProcessor } from './whatsapp-pipeline.mjs';

const admin = adminClient();
const VERIFY_TOKEN = Deno.env.get('WHATSAPP_VERIFY_TOKEN') || '';
const APP_SECRET = Deno.env.get('WHATSAPP_APP_SECRET') || '';
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const LEASE_MS = 5 * 60 * 1000;

async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function claimEvent({ eventKeyHash, eventKind }: { eventKeyHash: string; eventKind: string }) {
  const { data, error } = await admin.rpc('claim_jarvis_whatsapp_event', {
    p_event_key_hash: eventKeyHash,
    p_event_kind: eventKind,
    p_expires_at: new Date(Date.now() + RETENTION_MS).toISOString(),
    p_lease_expires_at: new Date(Date.now() + LEASE_MS).toISOString(),
  });
  if (error) {
    const failure = new Error('webhook_idempotency_unavailable') as Error & { code?: string };
    failure.code = error.code || 'idempotency_rpc_failed';
    throw failure;
  }
  return data === true ? 'new' : 'duplicate';
}

async function cleanupExpired() {
  const { error } = await admin.from('jarvis_whatsapp_webhook_events')
    .delete().lt('expires_at', new Date().toISOString());
  if (error) throw new Error('idempotency_cleanup_failed');
}

async function lookupBinding(channelUserId: string) {
  const { data, error } = await admin.from('jarvis_identities').select('*')
    .eq('channel', 'whatsapp').eq('channel_user_id', channelUserId).eq('active', true)
    .not('verified_at', 'is', null).maybeSingle();
  if (error) throw error;
  const verified = Boolean(data?.verified_at && ['authenticated_pairing','administrator_verified'].includes(data?.metadata?.binding_method));
  return data ? { id: data.id, userId: data.user_id, verified } : null;
}

async function consumePairingCode(code: string) {
  const hash = await sha256(code);
  const now = new Date().toISOString();
  const { data, error } = await admin.from('jarvis_whatsapp_pairing_codes').update({ used_at: now })
    .eq('code_hash', hash).is('used_at', null).gt('expires_at', now).select('user_id').maybeSingle();
  if (error) throw error;
  return data ? { userId: data.user_id } : null;
}

async function bindIdentity({ userId, channelUserId }: { userId: string; channelUserId: string }) {
  const existing = await admin.from('jarvis_identities').select('id,user_id,verified_at')
    .eq('channel', 'whatsapp').eq('channel_user_id', channelUserId).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data?.verified_at && existing.data.user_id !== userId) throw new Error('identity_already_bound');
  const row = {
    user_id: userId, channel: 'whatsapp', channel_user_id: channelUserId,
    phone_number: null, verified_at: new Date().toISOString(), active: true,
    metadata: { binding_method: 'authenticated_pairing', authorization: 'verified_identity' },
  };
  const result = await admin.from('jarvis_identities').upsert(row, {
    onConflict: 'channel,channel_user_id',
  });
  if (result.error) throw result.error;
}

async function markCompleted(eventKeyHash: string) {
  const { error } = await admin.from('jarvis_whatsapp_webhook_events').update({
    status: 'completed', completed_at: new Date().toISOString(), lease_expires_at: null, last_error_code: null,
  }).eq('event_key_hash', eventKeyHash);
  if (error) throw error;
}

async function markFailed(eventKeyHash: string, code: string) {
  const { error } = await admin.from('jarvis_whatsapp_webhook_events').update({
    status: 'failed', lease_expires_at: null, last_error_code: String(code || 'processing_failed').slice(0, 80),
  }).eq('event_key_hash', eventKeyHash);
  if (error) console.error('WA_MARK_FAILED', { ok: false, db_code: error.code || null });
}

const processEvent = createWhatsAppProcessor({
  lookupBinding,
  consumePairingCode,
  bindIdentity,
  runJarvis: async ({ userId, identityId, message, externalMessageId }: any) =>
    executeJarvis({
      client: admin, admin, userId,
      body: {
        message, channel: 'whatsapp', source: 'meta_webhook',
        identity_id: identityId, external_message_id: externalMessageId,
      },
    }),
  sendReply: sendWhatsAppText,
  markCompleted,
  markFailed,
});

function operationalLog(level: string, event: string, fields: Record<string, unknown>) {
  const line = `${event} ${JSON.stringify(fields)}`;
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

const handleWebhook = createWebhookHandler({
  verifyToken: VERIFY_TOKEN,
  appSecret: APP_SECRET,
  claimEvent,
  cleanupExpired,
  processEvent,
  defer: (promise: Promise<unknown>) => {
    const runtime = (globalThis as any).EdgeRuntime;
    if (runtime?.waitUntil) runtime.waitUntil(promise);
  },
  log: operationalLog,
});

Deno.serve(handleWebhook);
