create table if not exists public.jarvis_connection_secrets (
  connection_id uuid primary key references public.jarvis_connections(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  access_token text,
  refresh_token text,
  token_type text,
  expires_at timestamptz,
  scope text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.jarvis_connection_secrets enable row level security;
revoke all on table public.jarvis_connection_secrets from anon, authenticated;
grant select, insert, update, delete on table public.jarvis_connection_secrets to service_role;

create index if not exists jarvis_connection_secrets_user_idx on public.jarvis_connection_secrets(user_id);

create table if not exists public.jarvis_oauth_states (
  state text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.jarvis_oauth_states enable row level security;
revoke all on table public.jarvis_oauth_states from anon, authenticated;
grant select, insert, update, delete on table public.jarvis_oauth_states to service_role;
create index if not exists jarvis_oauth_states_expiry_idx on public.jarvis_oauth_states(expires_at) where used_at is null;

