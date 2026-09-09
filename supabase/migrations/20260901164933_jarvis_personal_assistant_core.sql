create table if not exists public.jarvis_identities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  channel text not null check (channel in ('whatsapp','web','other')),
  channel_user_id text not null,
  phone_number text,
  display_name text,
  verified_at timestamptz,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (channel, channel_user_id)
);

create table if not exists public.jarvis_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  identity_id uuid references public.jarvis_identities(id) on delete set null,
  channel text not null default 'web' check (channel in ('whatsapp','web','system','other')),
  direction text not null default 'inbound' check (direction in ('inbound','outbound','system')),
  message_type text not null default 'text' check (message_type in ('text','audio','image','document','event')),
  body text,
  transcript text,
  external_message_id text,
  intent text check (intent is null or intent in ('financial','note','reminder','calendar','project','query','conversation','unknown')),
  confidence numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),
  status text not null default 'received' check (status in ('received','processing','processed','needs_confirmation','failed')),
  reply_to_id uuid references public.jarvis_messages(id) on delete set null,
  raw_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  processed_at timestamptz
);

create table if not exists public.jarvis_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_message_id uuid references public.jarvis_messages(id) on delete set null,
  name text not null,
  project_type text not null default 'other' check (project_type in ('travel','content','work','personal','finance','other')),
  status text not null default 'planning' check (status in ('planning','active','paused','completed','archived')),
  description text,
  start_date date,
  target_date date,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.jarvis_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.jarvis_projects(id) on delete set null,
  source_message_id uuid references public.jarvis_messages(id) on delete set null,
  note_type text not null default 'note' check (note_type in ('note','idea','reference','list','other')),
  title text,
  content text not null,
  tags text[] not null default '{}'::text[],
  pinned boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.jarvis_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_message_id uuid references public.jarvis_messages(id) on delete set null,
  memory_type text not null default 'context' check (memory_type in ('preference','fact','person','context','other')),
  title text,
  content text not null,
  importance integer not null default 3 check (importance between 1 and 5),
  active boolean not null default true,
  expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.jarvis_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.jarvis_projects(id) on delete set null,
  source_message_id uuid references public.jarvis_messages(id) on delete set null,
  title text not null,
  description text,
  status text not null default 'pending' check (status in ('pending','completed','cancelled')),
  priority integer not null default 3 check (priority between 1 and 5),
  due_at timestamptz,
  remind_at timestamptz,
  timezone text not null default 'America/Sao_Paulo',
  recurrence_rule text,
  last_notified_at timestamptz,
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.jarvis_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_message_id uuid references public.jarvis_messages(id) on delete set null,
  action_type text not null,
  status text not null default 'proposed' check (status in ('proposed','confirmed','executing','executed','cancelled','failed')),
  confirmation_required boolean not null default true,
  payload jsonb not null default '{}'::jsonb,
  confirmed_at timestamptz,
  executed_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.jarvis_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('whatsapp','google_calendar','google_drive','other')),
  status text not null default 'pending' check (status in ('pending','connected','disconnected','revoked','error')),
  external_account_id text,
  display_name text,
  scopes text[] not null default '{}'::text[],
  metadata jsonb not null default '{}'::jsonb,
  connected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider, external_account_id)
);

create table if not exists public.financial_annotations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_message_id uuid references public.jarvis_messages(id) on delete set null,
  account_id uuid references public.accounts(id) on delete set null,
  category_id uuid references public.categories(id) on delete set null,
  matched_transaction_id uuid references public.transactions(id) on delete set null,
  occurred_at timestamptz not null default now(),
  direction text not null check (direction in ('expense','income','transfer','investment','yield','adjustment')),
  amount numeric not null check (amount > 0),
  merchant text,
  counterparty text,
  description text,
  payment_method text,
  account_hint text,
  category_hint text,
  notes text,
  reconciliation_status text not null default 'pending' check (reconciliation_status in ('pending','matched','ambiguous','ignored')),
  match_confidence numeric check (match_confidence is null or (match_confidence >= 0 and match_confidence <= 1)),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists jarvis_identities_user_idx on public.jarvis_identities(user_id, active);
create index if not exists jarvis_messages_user_created_idx on public.jarvis_messages(user_id, created_at desc);
create unique index if not exists jarvis_messages_external_unique_idx on public.jarvis_messages(user_id, channel, external_message_id) where external_message_id is not null;
create index if not exists jarvis_projects_user_status_idx on public.jarvis_projects(user_id, status, updated_at desc);
create index if not exists jarvis_notes_user_created_idx on public.jarvis_notes(user_id, created_at desc);
create index if not exists jarvis_notes_tags_idx on public.jarvis_notes using gin(tags);
create index if not exists jarvis_memories_user_active_idx on public.jarvis_memories(user_id, active, importance desc);
create index if not exists jarvis_tasks_user_due_idx on public.jarvis_tasks(user_id, status, due_at);
create index if not exists jarvis_tasks_user_remind_idx on public.jarvis_tasks(user_id, status, remind_at) where status='pending';
create index if not exists jarvis_actions_user_status_idx on public.jarvis_actions(user_id, status, created_at desc);
create index if not exists jarvis_connections_user_provider_idx on public.jarvis_connections(user_id, provider, status);
create index if not exists financial_annotations_user_status_idx on public.financial_annotations(user_id, reconciliation_status, occurred_at desc);
create index if not exists financial_annotations_match_idx on public.financial_annotations(user_id, matched_transaction_id) where matched_transaction_id is not null;

alter table public.jarvis_identities enable row level security;
alter table public.jarvis_messages enable row level security;
alter table public.jarvis_projects enable row level security;
alter table public.jarvis_notes enable row level security;
alter table public.jarvis_memories enable row level security;
alter table public.jarvis_tasks enable row level security;
alter table public.jarvis_actions enable row level security;
alter table public.jarvis_connections enable row level security;
alter table public.financial_annotations enable row level security;

create policy jarvis_identities_owner on public.jarvis_identities for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy jarvis_messages_owner on public.jarvis_messages for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy jarvis_projects_owner on public.jarvis_projects for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy jarvis_notes_owner on public.jarvis_notes for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy jarvis_memories_owner on public.jarvis_memories for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy jarvis_tasks_owner on public.jarvis_tasks for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy jarvis_actions_owner on public.jarvis_actions for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy jarvis_connections_owner on public.jarvis_connections for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy financial_annotations_owner on public.financial_annotations for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create trigger jarvis_identities_set_updated_at before update on public.jarvis_identities for each row execute function public.set_updated_at();
create trigger jarvis_messages_set_updated_at before update on public.jarvis_messages for each row execute function public.set_updated_at();
create trigger jarvis_projects_set_updated_at before update on public.jarvis_projects for each row execute function public.set_updated_at();
create trigger jarvis_notes_set_updated_at before update on public.jarvis_notes for each row execute function public.set_updated_at();
create trigger jarvis_memories_set_updated_at before update on public.jarvis_memories for each row execute function public.set_updated_at();
create trigger jarvis_tasks_set_updated_at before update on public.jarvis_tasks for each row execute function public.set_updated_at();
create trigger jarvis_actions_set_updated_at before update on public.jarvis_actions for each row execute function public.set_updated_at();
create trigger jarvis_connections_set_updated_at before update on public.jarvis_connections for each row execute function public.set_updated_at();
create trigger financial_annotations_set_updated_at before update on public.financial_annotations for each row execute function public.set_updated_at();
