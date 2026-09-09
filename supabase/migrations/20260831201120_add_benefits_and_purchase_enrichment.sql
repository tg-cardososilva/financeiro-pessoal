alter table public.accounts drop constraint if exists accounts_account_type_check;
alter table public.accounts add constraint accounts_account_type_check check (account_type in ('checking','credit_card','wallet','savings','investment','virtual','benefit'));

create table public.purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  purchase_date date not null,
  merchant text,
  description text,
  total_amount numeric(14,2) not null check (total_amount > 0),
  primary_category_id uuid references public.categories(id) on delete set null,
  detail_mode text not null default 'summary' check (detail_mode in ('summary','detailed')),
  status text not null default 'confirmed' check (status in ('suggested','confirmed','ignored')),
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.transactions add column if not exists purchase_id uuid references public.purchases(id) on delete set null;
create index if not exists transactions_purchase_idx on public.transactions(purchase_id);

create table public.purchase_receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  purchase_id uuid not null references public.purchases(id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  mime_type text,
  source_type text not null default 'upload' check (source_type in ('upload','nfce_url','xml','pdf','image')),
  merchant text,
  document_number text,
  access_key text,
  receipt_total numeric(14,2),
  issued_at timestamptz,
  parse_status text not null default 'pending' check (parse_status in ('pending','parsed','review','failed')),
  raw_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.purchase_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  purchase_id uuid not null references public.purchases(id) on delete cascade,
  receipt_id uuid references public.purchase_receipts(id) on delete cascade,
  item_order integer,
  description text not null,
  normalized_name text,
  quantity numeric(12,3) not null default 1,
  unit text,
  unit_price numeric(14,4),
  total_amount numeric(14,2) not null check (total_amount >= 0),
  category_id uuid references public.categories(id) on delete set null,
  confidence numeric(5,4) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  raw_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.purchase_allocations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  purchase_id uuid not null references public.purchases(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  amount numeric(14,2) not null check (amount >= 0),
  source text not null default 'manual' check (source in ('manual','receipt','system')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(purchase_id, category_id, source)
);

create table public.purchase_match_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  transaction_a_id uuid not null references public.transactions(id) on delete cascade,
  transaction_b_id uuid not null references public.transactions(id) on delete cascade,
  suggested_total numeric(14,2) not null,
  confidence numeric(5,4) not null check (confidence >= 0 and confidence <= 1),
  reason text,
  status text not null default 'pending' check (status in ('pending','accepted','dismissed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint purchase_match_distinct_transactions check (transaction_a_id <> transaction_b_id),
  unique(user_id, transaction_a_id, transaction_b_id)
);

create trigger purchases_set_updated_at before update on public.purchases for each row execute function public.set_updated_at();
create trigger purchase_items_set_updated_at before update on public.purchase_items for each row execute function public.set_updated_at();
create trigger purchase_allocations_set_updated_at before update on public.purchase_allocations for each row execute function public.set_updated_at();

alter table public.purchases enable row level security;
alter table public.purchase_receipts enable row level security;
alter table public.purchase_items enable row level security;
alter table public.purchase_allocations enable row level security;
alter table public.purchase_match_suggestions enable row level security;

create policy purchases_owner on public.purchases for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy purchase_receipts_owner on public.purchase_receipts for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy purchase_items_owner on public.purchase_items for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy purchase_allocations_owner on public.purchase_allocations for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy purchase_match_suggestions_owner on public.purchase_match_suggestions for all using (auth.uid()=user_id) with check (auth.uid()=user_id);

insert into public.accounts(user_id,name,institution,account_type,include_in_net_worth,metadata)
select p.id,'Cartão Alimentação','beneficio','benefit',false,'{"resource_class":"benefit","purpose":"food_benefit"}'::jsonb
from public.profiles p
on conflict (user_id,name) do update set institution=excluded.institution, account_type=excluded.account_type, include_in_net_worth=excluded.include_in_net_worth, metadata=public.accounts.metadata || excluded.metadata;

insert into public.categories(user_id,name,group_name,kind)
select p.id,'Benefício alimentação','Benefícios','income'
from public.profiles p
on conflict (user_id,kind,group_name,name) do nothing;

create or replace function public.handle_new_user_benefit_setup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.accounts(user_id,name,institution,account_type,include_in_net_worth,metadata)
  values(new.id,'Cartão Alimentação','beneficio','benefit',false,'{"resource_class":"benefit","purpose":"food_benefit"}'::jsonb)
  on conflict (user_id,name) do nothing;

  insert into public.categories(user_id,name,group_name,kind)
  values(new.id,'Benefício alimentação','Benefícios','income')
  on conflict (user_id,kind,group_name,name) do nothing;

  return new;
end;
$$;
revoke execute on function public.handle_new_user_benefit_setup() from public, anon, authenticated;
drop trigger if exists on_auth_user_created_benefit_setup on auth.users;
create trigger on_auth_user_created_benefit_setup after insert on auth.users for each row execute function public.handle_new_user_benefit_setup();

create or replace view public.v_monthly_resources with (security_invoker=true) as
select
  t.user_id,
  date_trunc('month', t.transaction_date)::date as month,
  sum(case when t.flow_type in ('income','yield') and not t.is_internal_transfer and coalesce(a.account_type,'') <> 'benefit' then t.amount else 0 end) as cash_income,
  sum(case when t.flow_type='income' and a.account_type='benefit' then t.amount else 0 end) as benefits_received,
  sum(case when t.flow_type='expense' and not t.is_internal_transfer then abs(t.amount) else 0 end) as expenses,
  sum(case when t.flow_type='yield' then t.amount else 0 end) as yields,
  sum(case when t.flow_type='investment' then abs(t.amount) else 0 end) as investments
from public.transactions t
join public.accounts a on a.id=t.account_id
group by t.user_id, date_trunc('month', t.transaction_date)::date;

create or replace view public.v_purchase_analysis with (security_invoker=true) as
select
  p.user_id,
  p.id as purchase_id,
  p.purchase_date,
  p.merchant,
  p.total_amount,
  p.detail_mode,
  coalesce(sum(pa.amount),0) as allocated_amount,
  p.total_amount - coalesce(sum(pa.amount),0) as unallocated_amount,
  count(distinct t.id) as payment_count,
  count(distinct pi.id) as item_count
from public.purchases p
left join public.purchase_allocations pa on pa.purchase_id=p.id
left join public.transactions t on t.purchase_id=p.id
left join public.purchase_items pi on pi.purchase_id=p.id
group by p.user_id,p.id,p.purchase_date,p.merchant,p.total_amount,p.detail_mode;

