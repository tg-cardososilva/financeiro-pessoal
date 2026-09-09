create table if not exists public.account_balance_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  balance numeric not null,
  balance_date date not null,
  source text not null default 'manual' check (source in ('manual','statement','document','system')),
  is_confirmed boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(account_id, balance_date, source)
);
create index if not exists account_balance_snapshots_user_account_date_idx on public.account_balance_snapshots(user_id, account_id, balance_date desc, created_at desc);
alter table public.account_balance_snapshots enable row level security;
drop policy if exists account_balance_snapshots_owner on public.account_balance_snapshots;
create policy account_balance_snapshots_owner on public.account_balance_snapshots for all using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

