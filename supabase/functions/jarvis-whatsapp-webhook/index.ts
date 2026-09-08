import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.115.0";
import { createWebhookHandler } from "./webhook-core.mjs";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const VERIFY_TOKEN = Deno.env.get("WHATSAPP_VERIFY_TOKEN") || "";
const APP_SECRET = Deno.env.get("WHATSAPP_APP_SECRET") || "";
const IDEMPOTENCY_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

function getSecretKey() {
  const raw = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (raw) {
    const parsed = JSON.parse(raw);
    if (parsed.default) return parsed.default;
  }
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  throw new Error("Supabase secret key unavailable");
}

const admin = createClient(SUPABASE_URL, getSecretKey(), {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function claimEvent({ eventKeyHash, eventKind }: { eventKeyHash: string; eventKind: string }) {
  const expiresAt = new Date(Date.now() + IDEMPOTENCY_RETENTION_MS).toISOString();
  const { error } = await admin.from("jarvis_whatsapp_webhook_events").insert({
    event_key_hash: eventKeyHash,
    event_kind: eventKind,
    expires_at: expiresAt,
  });

  if (!error) return "new";
  if (error.code === "23505") return "duplicate";

  const err = new Error("webhook idempotency unavailable") as Error & { code?: string };
  err.code = error.code || "idempotency_insert_failed";
  throw err;
}

async function cleanupExpired() {
  const { error } = await admin
    .from("jarvis_whatsapp_webhook_events")
    .delete()
    .lt("expires_at", new Date().toISOString());
  if (error) {
    const err = new Error("webhook idempotency cleanup failed") as Error & { code?: string };
    err.code = error.code || "idempotency_cleanup_failed";
    throw err;
  }
}

function operationalLog(level: string, event: string, fields: Record<string, unknown>) {
  const line = `${event} ${JSON.stringify(fields)}`;
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

const handleWebhook = createWebhookHandler({
  verifyToken: VERIFY_TOKEN,
  appSecret: APP_SECRET,
  claimEvent,
  cleanupExpired,
  log: operationalLog,
});

Deno.serve(handleWebhook);
