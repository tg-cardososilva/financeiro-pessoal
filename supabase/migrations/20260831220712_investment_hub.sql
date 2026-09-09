create table public.investment_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  target_amount numeric(14,2) not null check (target_amount > 0),
  target_date date,
  priority integer not null default 3 check (priority between 1 and 5),
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.investment_positions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  goal_id uuid references public.investment_goals(id) on delete set null,
  name text not null,
  asset_type text not null default 'fixed_income' check (asset_type in ('cash_reserve','fixed_income','fund','stock','reit','crypto','pension','other')),
  ticker text,
  benchmark text,
  quantity numeric(20,8),
  average_unit_cost numeric(18,8),
  invested_amount numeric(14,2) not null default 0 check (invested_amount >= 0),
  current_value numeric(14,2) not null default 0 check (current_value >= 0),
  liquidity_label text,
  maturity_date date,
  active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, account_id, name)
);

create table public.investment_movements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  position_id uuid references public.investment_positions(id) on delete set null,
  account_id uuid not null references public.accounts(id) on delete cascade,
  transaction_id uuid references public.transactions(id) on delete set null,
  movement_date date not null,
  movement_type text not null check (movement_type in ('contribution','withdrawal','income','fee','valuation_adjustment','transfer_in','transfer_out')),
  amount numeric(14,2) not null check (amount > 0),
  quantity numeric(20,8),
  unit_price numeric(18,8),
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.investment_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  position_id uuid not null references public.investment_positions(id) on delete cascade,
  snapshot_date date not null,
  invested_principal numeric(14,2) not null default 0 check (invested_principal >= 0),
  market_value numeric(14,2) not null default 0 check (market_value >= 0),
  created_at timestamptz not null default now(),
  unique(position_id, snapshot_date)
);

create index investment_positions_user_idx on public.investment_positions(user_id, active);
create index investment_movements_user_date_idx on public.investment_movements(user_id, movement_date desc);
create index investment_snapshots_user_date_idx on public.investment_snapshots(user_id, snapshot_date desc);

create trigger investment_goals_set_updated_at before update on public.investment_goals for each row execute function public.set_updated_at();
create trigger investment_positions_set_updated_at before update on public.investment_positions for each row execute function public.set_updated_at();

alter table public.investment_goals enable row level security;
alter table public.investment_positions enable row level security;
alter table public.investment_movements enable row level security;
alter table public.investment_snapshots enable row level security;

create policy investment_goals_owner on public.investment_goals for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy investment_positions_owner on public.investment_positions for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy investment_movements_owner on public.investment_movements for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy investment_snapshots_owner on public.investment_snapshots for all using (auth.uid()=user_id) with check (auth.uid()=user_id);

insert into public.accounts(user_id,name,institution,account_type,include_in_net_worth,metadata)
select u.id,'Investimentos','manual','investment',true,'{"purpose":"investment_hub"}'::jsonb
from auth.users u
on conflict (user_id,name) do nothing;

create or replace function public.ensure_default_investment_account()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  insert into public.accounts(user_id,name,institution,account_type,include_in_net_worth,metadata)
  values(new.id,'Investimentos','manual','investment',true,'{"purpose":"investment_hub"}'::jsonb)
  on conflict (user_id,name) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created_investments after insert on auth.users for each row execute function public.ensure_default_investment_account();

create or replace function public.record_investment_contribution(
  p_date date,
  p_amount numeric,
  p_source_account_id uuid,
  p_investment_account_id uuid,
  p_position_id uuid default null,
  p_notes text default null
)
returns uuid
language plpgsql
security invoker
set search_path=public
as $$
declare
  v_user uuid := auth.uid();
  v_transfer_category uuid;
  v_group uuid := gen_random_uuid();
  v_destination_tx uuid;
  v_position public.investment_positions%rowtype;
begin
  if v_user is null then raise exception 'not_authenticated'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'invalid_amount'; end if;
  if not exists(select 1 from public.accounts where id=p_source_account_id and user_id=v_user) then raise exception 'invalid_source_account'; end if;
  if not exists(select 1 from public.accounts where id=p_investment_account_id and user_id=v_user) then raise exception 'invalid_investment_account'; end if;

  select id into v_transfer_category from public.categories
  where user_id=v_user and name='Transferência interna' and kind='transfer' limit 1;

  insert into public.transactions(user_id,account_id,category_id,transaction_date,description,amount,flow_type,is_internal_transfer,include_in_budget,transaction_source,notes,metadata)
  values(v_user,p_source_account_id,v_transfer_category,p_date,'Aporte para investimento',-p_amount,'transfer',true,false,'manual',p_notes,jsonb_build_object('investment_transfer_id',v_group,'leg','source'));

  insert into public.transactions(user_id,account_id,category_id,transaction_date,description,amount,flow_type,is_internal_transfer,include_in_budget,transaction_source,notes,metadata)
  values(v_user,p_investment_account_id,v_transfer_category,p_date,'Aporte recebido',p_amount,'investment',true,false,'manual',p_notes,jsonb_build_object('investment_transfer_id',v_group,'leg','destination'))
  returning id into v_destination_tx;

  if p_position_id is not null then
    select * into v_position from public.investment_positions where id=p_position_id and user_id=v_user;
    if not found then raise exception 'invalid_position'; end if;

    insert into public.investment_movements(user_id,position_id,account_id,transaction_id,movement_date,movement_type,amount,notes,metadata)
    values(v_user,p_position_id,p_investment_account_id,v_destination_tx,p_date,'contribution',p_amount,p_notes,jsonb_build_object('investment_transfer_id',v_group));

    update public.investment_positions
      set invested_amount=invested_amount+p_amount,
          current_value=current_value+p_amount
      where id=p_position_id and user_id=v_user;
  else
    insert into public.investment_movements(user_id,position_id,account_id,transaction_id,movement_date,movement_type,amount,notes,metadata)
    values(v_user,null,p_investment_account_id,v_destination_tx,p_date,'contribution',p_amount,p_notes,jsonb_build_object('investment_transfer_id',v_group));
  end if;

  return v_group;
end;
$$;

create or replace function public.record_investment_withdrawal(
  p_date date,
  p_amount numeric,
  p_investment_account_id uuid,
  p_destination_account_id uuid,
  p_position_id uuid default null,
  p_notes text default null
)
returns uuid
language plpgsql
security invoker
set search_path=public
as $$
declare
  v_user uuid := auth.uid();
  v_transfer_category uuid;
  v_group uuid := gen_random_uuid();
  v_source_tx uuid;
begin
  if v_user is null then raise exception 'not_authenticated'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'invalid_amount'; end if;
  if not exists(select 1 from public.accounts where id=p_investment_account_id and user_id=v_user) then raise exception 'invalid_investment_account'; end if;
  if not exists(select 1 from public.accounts where id=p_destination_account_id and user_id=v_user) then raise exception 'invalid_destination_account'; end if;

  select id into v_transfer_category from public.categories
  where user_id=v_user and name='Transferência interna' and kind='transfer' limit 1;

  insert into public.transactions(user_id,account_id,category_id,transaction_date,description,amount,flow_type,is_internal_transfer,include_in_budget,transaction_source,notes,metadata)
  values(v_user,p_investment_account_id,v_transfer_category,p_date,'Resgate de investimento',-p_amount,'transfer',true,false,'manual',p_notes,jsonb_build_object('investment_transfer_id',v_group,'leg','source'))
  returning id into v_source_tx;

  insert into public.transactions(user_id,account_id,category_id,transaction_date,description,amount,flow_type,is_internal_transfer,include_in_budget,transaction_source,notes,metadata)
  values(v_user,p_destination_account_id,v_transfer_category,p_date,'Resgate recebido',p_amount,'transfer',true,false,'manual',p_notes,jsonb_build_object('investment_transfer_id',v_group,'leg','destination'));

  insert into public.investment_movements(user_id,position_id,account_id,transaction_id,movement_date,movement_type,amount,notes,metadata)
  values(v_user,p_position_id,p_investment_account_id,v_source_tx,p_date,'withdrawal',p_amount,p_notes,jsonb_build_object('investment_transfer_id',v_group));

  if p_position_id is not null then
    update public.investment_positions
      set invested_amount=greatest(0,invested_amount-least(invested_amount,p_amount)),
          current_value=greatest(0,current_value-p_amount)
      where id=p_position_id and user_id=v_user;
  end if;

  return v_group;
end;
$$;

create or replace function public.record_investment_income(
  p_date date,
  p_amount numeric,
  p_account_id uuid,
  p_position_id uuid default null,
  p_notes text default null
)
returns uuid
language plpgsql
security invoker
set search_path=public
as $$
declare
  v_user uuid := auth.uid();
  v_movement uuid;
begin
  if v_user is null then raise exception 'not_authenticated'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'invalid_amount'; end if;
  if not exists(select 1 from public.accounts where id=p_account_id and user_id=v_user) then raise exception 'invalid_account'; end if;

  insert into public.investment_movements(user_id,position_id,account_id,movement_date,movement_type,amount,notes)
  values(v_user,p_position_id,p_account_id,p_date,'income',p_amount,p_notes)
  returning id into v_movement;

  if p_position_id is not null then
    update public.investment_positions set current_value=current_value+p_amount where id=p_position_id and user_id=v_user;
  end if;

  return v_movement;
end;
$$;

create or replace view public.v_investment_overview with (security_invoker=true) as
select
  p.user_id,
  coalesce(sum(p.invested_amount),0)::numeric(14,2) as invested_principal,
  coalesce(sum(p.current_value),0)::numeric(14,2) as current_value,
  coalesce(sum(p.current_value-p.invested_amount),0)::numeric(14,2) as accumulated_result,
  case when coalesce(sum(p.invested_amount),0) > 0
    then round((sum(p.current_value-p.invested_amount)/sum(p.invested_amount))*100,2)
    else 0 end as accumulated_return_pct
from public.investment_positions p
where p.active
group by p.user_id;

create or replace view public.v_investment_monthly_flow with (security_invoker=true) as
select
  m.user_id,
  date_trunc('month',m.movement_date)::date as month,
  sum(case when m.movement_type='contribution' then m.amount else 0 end)::numeric(14,2) as contributions,
  sum(case when m.movement_type='withdrawal' then m.amount else 0 end)::numeric(14,2) as withdrawals,
  sum(case when m.movement_type='income' then m.amount else 0 end)::numeric(14,2) as income,
  sum(case when m.movement_type='fee' then m.amount else 0 end)::numeric(14,2) as fees
from public.investment_movements m
group by m.user_id,date_trunc('month',m.movement_date)::date;

create or replace view public.v_monthly_summary with (security_invoker=true) as
select
  user_id,
  date_trunc('month', transaction_date)::date as month,
  sum(case when flow_type in ('income','yield') and not is_internal_transfer then amount else 0 end) as income,
  sum(case when flow_type='expense' and not is_internal_transfer then abs(amount) else 0 end) as expenses,
  sum(case when flow_type='yield' and not is_internal_transfer then amount else 0 end) as yields,
  sum(case when flow_type='investment' and is_internal_transfer then abs(amount) else 0 end) as investments,
  sum(case when not is_internal_transfer and flow_type <> 'transfer' then amount else 0 end) as net_financial_flow
from public.transactions
group by user_id, date_trunc('month', transaction_date)::date;

