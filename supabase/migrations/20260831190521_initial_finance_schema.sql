create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  institution text not null,
  account_type text not null check (account_type in ('checking','credit_card','wallet','savings','investment','virtual')),
  currency text not null default 'BRL',
  color text,
  icon text,
  active boolean not null default true,
  include_in_net_worth boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, name)
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  group_name text not null,
  kind text not null check (kind in ('expense','income','transfer','investment')),
  icon text,
  color text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(user_id, kind, group_name, name)
);

create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid references public.accounts(id) on delete set null,
  file_name text not null,
  file_hash text not null,
  institution text,
  source_format text not null,
  status text not null default 'parsed' check (status in ('uploaded','parsed','review','confirmed','failed')),
  row_count integer not null default 0,
  duplicate_count integer not null default 0,
  review_count integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  unique(user_id, file_hash)
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  import_batch_id uuid references public.import_batches(id) on delete set null,
  transaction_date date not null,
  posted_at timestamptz,
  description text not null,
  merchant text,
  counterparty text,
  amount numeric(14,2) not null check (amount <> 0),
  flow_type text not null check (flow_type in ('expense','income','transfer','investment','yield','adjustment')),
  is_internal_transfer boolean not null default false,
  include_in_budget boolean not null default true,
  transaction_source text not null default 'manual' check (transaction_source in ('manual','import','recurring','receipt','system')),
  source_record_id text,
  source_fingerprint text,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index transactions_user_fingerprint_uq
  on public.transactions(user_id, source_fingerprint)
  where source_fingerprint is not null;
create index transactions_user_date_idx on public.transactions(user_id, transaction_date desc);
create index transactions_account_date_idx on public.transactions(account_id, transaction_date desc);
create index transactions_category_date_idx on public.transactions(category_id, transaction_date desc);

create table public.import_rows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  batch_id uuid not null references public.import_batches(id) on delete cascade,
  row_number integer not null,
  transaction_date date not null,
  description text not null,
  merchant text,
  amount numeric(14,2) not null check (amount <> 0),
  flow_type text not null check (flow_type in ('expense','income','transfer','investment','yield','adjustment')),
  category_id uuid references public.categories(id) on delete set null,
  is_internal_transfer boolean not null default false,
  include_in_budget boolean not null default true,
  source_record_id text,
  fingerprint text not null,
  duplicate_transaction_id uuid references public.transactions(id) on delete set null,
  review_reason text,
  status text not null default 'pending' check (status in ('pending','accepted','ignored')),
  raw_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(batch_id, row_number)
);
create index import_rows_batch_idx on public.import_rows(batch_id, row_number);
create index import_rows_fingerprint_idx on public.import_rows(user_id, fingerprint);

create table public.categorization_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  institution text,
  match_field text not null default 'description' check (match_field in ('description','merchant','counterparty')),
  pattern text not null,
  category_id uuid references public.categories(id) on delete cascade,
  flow_type text check (flow_type in ('expense','income','transfer','investment','yield','adjustment')),
  set_internal_transfer boolean,
  priority integer not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(user_id, institution, match_field, pattern)
);

create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  month date not null,
  category_id uuid references public.categories(id) on delete cascade,
  amount numeric(14,2) not null check (amount >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index budgets_overall_month_uq on public.budgets(user_id, month) where category_id is null;
create unique index budgets_category_month_uq on public.budgets(user_id, month, category_id) where category_id is not null;

create table public.recurring_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('expense','income')),
  category_id uuid references public.categories(id) on delete set null,
  account_id uuid references public.accounts(id) on delete set null,
  amount numeric(14,2) not null check (amount > 0),
  frequency text not null default 'monthly' check (frequency in ('weekly','monthly','yearly')),
  day_of_month integer check (day_of_month between 1 and 31),
  funding_mode text not null default 'direct' check (funding_mode in ('direct','third_party')),
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.transaction_attachments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  transaction_id uuid references public.transactions(id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  mime_type text,
  created_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger accounts_set_updated_at before update on public.accounts for each row execute function public.set_updated_at();
create trigger transactions_set_updated_at before update on public.transactions for each row execute function public.set_updated_at();
create trigger budgets_set_updated_at before update on public.budgets for each row execute function public.set_updated_at();
create trigger recurring_items_set_updated_at before update on public.recurring_items for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  c_alimentacao_mercado uuid;
  c_alimentacao_delivery uuid;
  c_transporte uuid;
  c_saude_farmacia uuid;
  c_pet uuid;
  c_moradia_luz uuid;
  c_moradia_internet uuid;
  c_compras uuid;
  c_vestuario uuid;
  c_impostos uuid;
  c_rendimento uuid;
  c_outras_receitas uuid;
  c_transferencia uuid;
begin
  insert into public.profiles(id, display_name) values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;

  insert into public.accounts(user_id,name,institution,account_type,include_in_net_worth,metadata) values
    (new.id,'Inter - Conta Corrente','inter','checking',true,'{"import_profile":"inter_checking"}'::jsonb),
    (new.id,'Inter - Cartão','inter','credit_card',true,'{"import_profile":"inter_card"}'::jsonb),
    (new.id,'Inter - Poupança','inter','savings',true,'{"paired_with":"Inter - Conta Corrente"}'::jsonb),
    (new.id,'Mercado Pago - Saldo','mercado_pago','wallet',true,'{}'::jsonb),
    (new.id,'Mercado Pago - Cofrinho','mercado_pago','savings',true,'{}'::jsonb),
    (new.id,'Pagamentos por terceiros','virtual','virtual',false,'{"purpose":"third_party_expenses"}'::jsonb)
  on conflict (user_id,name) do nothing;

  insert into public.categories(user_id,name,group_name,kind) values
    (new.id,'Mercado','Alimentação','expense'),
    (new.id,'Delivery / Restaurante','Alimentação','expense'),
    (new.id,'Transporte','Transporte','expense'),
    (new.id,'Farmácia','Saúde','expense'),
    (new.id,'Atividade física','Saúde','expense'),
    (new.id,'Pets','Pets','expense'),
    (new.id,'Aluguel + condomínio','Moradia','expense'),
    (new.id,'Energia elétrica','Moradia','expense'),
    (new.id,'Internet','Moradia','expense'),
    (new.id,'Compras gerais','Compras','expense'),
    (new.id,'Vestuário','Compras','expense'),
    (new.id,'Assinaturas e serviços','Assinaturas','expense'),
    (new.id,'Impostos e taxas','Impostos','expense'),
    (new.id,'Educação','Educação','expense'),
    (new.id,'Lazer','Lazer','expense'),
    (new.id,'Outras despesas','Outros','expense'),
    (new.id,'Rendimentos','Rendimentos','income'),
    (new.id,'Receita via terceiro','Rendimentos','income'),
    (new.id,'Outras receitas','Outros','income'),
    (new.id,'Transferência interna','Transferências','transfer'),
    (new.id,'Aporte / investimento','Investimentos','investment')
  on conflict (user_id,kind,group_name,name) do nothing;

  select id into c_alimentacao_mercado from public.categories where user_id=new.id and name='Mercado' and group_name='Alimentação';
  select id into c_alimentacao_delivery from public.categories where user_id=new.id and name='Delivery / Restaurante';
  select id into c_transporte from public.categories where user_id=new.id and name='Transporte';
  select id into c_saude_farmacia from public.categories where user_id=new.id and name='Farmácia';
  select id into c_pet from public.categories where user_id=new.id and name='Pets';
  select id into c_moradia_luz from public.categories where user_id=new.id and name='Energia elétrica';
  select id into c_moradia_internet from public.categories where user_id=new.id and name='Internet';
  select id into c_compras from public.categories where user_id=new.id and name='Compras gerais';
  select id into c_vestuario from public.categories where user_id=new.id and name='Vestuário';
  select id into c_impostos from public.categories where user_id=new.id and name='Impostos e taxas';
  select id into c_rendimento from public.categories where user_id=new.id and name='Rendimentos';
  select id into c_outras_receitas from public.categories where user_id=new.id and name='Outras receitas';
  select id into c_transferencia from public.categories where user_id=new.id and name='Transferência interna';

  insert into public.categorization_rules(user_id,institution,pattern,category_id,flow_type,set_internal_transfer,priority) values
    (new.id,'inter','IFOOD',c_alimentacao_delivery,'expense',false,10),
    (new.id,'inter','99 FOOD',c_alimentacao_delivery,'expense',false,10),
    (new.id,'inter','EDNA DA SILVA AGRIPINO',c_alimentacao_mercado,'expense',false,20),
    (new.id,'inter','ASSAI ATACADISTA',c_alimentacao_mercado,'expense',false,20),
    (new.id,'inter','SUPERMERCADO GUANABARA',c_alimentacao_mercado,'expense',false,20),
    (new.id,'inter','DAQUI MESMO',c_alimentacao_mercado,'expense',false,20),
    (new.id,'inter','UBER DO BRASIL',c_transporte,'expense',false,10),
    (new.id,'inter','METRO RJ',c_transporte,'expense',false,10),
    (new.id,'inter','BARCAS RIO',c_transporte,'expense',false,10),
    (new.id,'inter','DROGARIA',c_saude_farmacia,'expense',false,10),
    (new.id,'inter','SPEED FARMA',c_saude_farmacia,'expense',false,10),
    (new.id,'inter','PETZ',c_pet,'expense',false,10),
    (new.id,'inter','PET CENTER',c_pet,'expense',false,10),
    (new.id,'inter','COBASI',c_pet,'expense',false,10),
    (new.id,'inter','CLINICA VET',c_pet,'expense',false,10),
    (new.id,'inter','ENEL DISTRIBUICAO',c_moradia_luz,'expense',false,10),
    (new.id,'inter','PREDLINK',c_moradia_internet,'expense',false,10),
    (new.id,'inter','SHEIN',c_vestuario,'expense',false,20),
    (new.id,'inter','SHOPEE',c_compras,'expense',false,20),
    (new.id,'inter','MERCADOLIVRE',c_compras,'expense',false,20),
    (new.id,'inter','GPS',c_impostos,'expense',false,10),
    (new.id,'inter','Pagamento fatura cartao Inter',c_transferencia,'transfer',true,1),
    (new.id,'inter','Aplicacao Poupanca',c_transferencia,'transfer',true,1),
    (new.id,'inter','Resgate Poupanca',c_transferencia,'transfer',true,1)
  on conflict do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.record_third_party_expense(
  p_date date,
  p_amount numeric,
  p_description text,
  p_category_id uuid,
  p_notes text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_account uuid;
  v_income_category uuid;
  v_pair uuid := gen_random_uuid();
begin
  if v_user is null then raise exception 'not_authenticated'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'invalid_amount'; end if;

  select id into v_account from public.accounts where user_id=v_user and name='Pagamentos por terceiros' limit 1;
  select id into v_income_category from public.categories where user_id=v_user and name='Receita via terceiro' and kind='income' limit 1;
  if v_account is null then raise exception 'virtual_account_not_found'; end if;

  insert into public.transactions(user_id,account_id,category_id,transaction_date,description,amount,flow_type,is_internal_transfer,include_in_budget,transaction_source,notes,metadata)
  values(v_user,v_account,v_income_category,p_date,'Receita destinada diretamente a ' || p_description,p_amount,'income',false,false,'manual',p_notes,jsonb_build_object('third_party_pair_id',v_pair,'leg','income'));

  insert into public.transactions(user_id,account_id,category_id,transaction_date,description,amount,flow_type,is_internal_transfer,include_in_budget,transaction_source,notes,metadata)
  values(v_user,v_account,p_category_id,p_date,p_description,-p_amount,'expense',false,true,'manual',p_notes,jsonb_build_object('third_party_pair_id',v_pair,'leg','expense'));

  return v_pair;
end;
$$;

create view public.v_monthly_summary with (security_invoker=true) as
select
  user_id,
  date_trunc('month', transaction_date)::date as month,
  sum(case when flow_type in ('income','yield') and not is_internal_transfer then amount else 0 end) as income,
  sum(case when flow_type='expense' and not is_internal_transfer then abs(amount) else 0 end) as expenses,
  sum(case when flow_type='yield' then amount else 0 end) as yields,
  sum(case when flow_type='investment' then abs(amount) else 0 end) as investments,
  sum(case when flow_type not in ('transfer') then amount else 0 end) as net_financial_flow
from public.transactions
group by user_id, date_trunc('month', transaction_date)::date;

create view public.v_category_spend with (security_invoker=true) as
select
  t.user_id,
  date_trunc('month', t.transaction_date)::date as month,
  c.group_name,
  c.name as category,
  sum(abs(t.amount)) as amount
from public.transactions t
left join public.categories c on c.id=t.category_id
where t.flow_type='expense' and not t.is_internal_transfer
group by t.user_id, date_trunc('month', t.transaction_date)::date, c.group_name, c.name;

alter table public.profiles enable row level security;
alter table public.accounts enable row level security;
alter table public.categories enable row level security;
alter table public.import_batches enable row level security;
alter table public.transactions enable row level security;
alter table public.import_rows enable row level security;
alter table public.categorization_rules enable row level security;
alter table public.budgets enable row level security;
alter table public.recurring_items enable row level security;
alter table public.transaction_attachments enable row level security;

create policy profiles_owner on public.profiles for all using (auth.uid()=id) with check (auth.uid()=id);
create policy accounts_owner on public.accounts for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy categories_owner on public.categories for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy import_batches_owner on public.import_batches for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy transactions_owner on public.transactions for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy import_rows_owner on public.import_rows for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy categorization_rules_owner on public.categorization_rules for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy budgets_owner on public.budgets for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy recurring_items_owner on public.recurring_items for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy transaction_attachments_owner on public.transaction_attachments for all using (auth.uid()=user_id) with check (auth.uid()=user_id);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('finance-files','finance-files',false,10485760,array['text/csv','application/vnd.intu.qfx','application/x-ofx','text/plain','application/pdf','image/jpeg','image/png'])
on conflict (id) do nothing;

create policy finance_files_select on storage.objects for select to authenticated
using (bucket_id='finance-files' and (storage.foldername(name))[1]=auth.uid()::text);
create policy finance_files_insert on storage.objects for insert to authenticated
with check (bucket_id='finance-files' and (storage.foldername(name))[1]=auth.uid()::text);
create policy finance_files_update on storage.objects for update to authenticated
using (bucket_id='finance-files' and (storage.foldername(name))[1]=auth.uid()::text)
with check (bucket_id='finance-files' and (storage.foldername(name))[1]=auth.uid()::text);
create policy finance_files_delete on storage.objects for delete to authenticated
using (bucket_id='finance-files' and (storage.foldername(name))[1]=auth.uid()::text);

