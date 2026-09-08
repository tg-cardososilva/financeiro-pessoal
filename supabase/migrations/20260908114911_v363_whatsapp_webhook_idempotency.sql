create table public.jarvis_whatsapp_webhook_events (
  event_key_hash text primary key,
  event_kind text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  constraint jarvis_whatsapp_webhook_events_key_hash_check check (event_key_hash ~ '^[0-9a-f]{64}$'),
  constraint jarvis_whatsapp_webhook_events_kind_check check (event_kind in ('message','status','event')),
  constraint jarvis_whatsapp_webhook_events_expiry_check check (expires_at > created_at)
);

comment on table public.jarvis_whatsapp_webhook_events is
  'Backend-only WhatsApp webhook idempotency receipts. Stores SHA-256 event-key hashes only; no message content, phone numbers, tokens, signatures, or payload bodies.';

alter table public.jarvis_whatsapp_webhook_events enable row level security;

revoke all on table public.jarvis_whatsapp_webhook_events from public, anon, authenticated;
grant select, insert, delete on table public.jarvis_whatsapp_webhook_events to service_role;

create index jarvis_whatsapp_webhook_events_expires_idx
  on public.jarvis_whatsapp_webhook_events (expires_at);
