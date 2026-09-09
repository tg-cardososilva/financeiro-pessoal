-- Jarvis 1.0 RC: idempotencia canonica, entregaveis, memoria e saude operacional.

alter table public.jarvis_tasks add column if not exists idempotency_key text;
alter table public.jarvis_notes add column if not exists idempotency_key text;
alter table public.jarvis_projects add column if not exists idempotency_key text;

create unique index if not exists jarvis_tasks_user_idempotency_uq
  on public.jarvis_tasks(user_id, idempotency_key) where idempotency_key is not null;
create unique index if not exists jarvis_notes_user_idempotency_uq
  on public.jarvis_notes(user_id, idempotency_key) where idempotency_key is not null;
create unique index if not exists jarvis_projects_user_idempotency_uq
  on public.jarvis_projects(user_id, idempotency_key) where idempotency_key is not null;

create table if not exists public.jarvis_operation_receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  idempotency_key text not null,
  operation text not null,
  status text not null default 'completed' check (status in ('completed','failed')),
  resource_type text,
  resource_id uuid,
  response jsonb not null default '{}'::jsonb,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);
create index if not exists jarvis_operation_receipts_user_created_idx
  on public.jarvis_operation_receipts(user_id, created_at desc);
create trigger jarvis_operation_receipts_set_updated_at
before update on public.jarvis_operation_receipts
for each row execute function public.set_updated_at();
alter table public.jarvis_operation_receipts enable row level security;
revoke all on table public.jarvis_operation_receipts from public, anon, authenticated;
grant select, insert, update on table public.jarvis_operation_receipts to authenticated;
create policy "jarvis_operation_receipts_select_own"
on public.jarvis_operation_receipts for select to authenticated
using ((select auth.uid()) = user_id);
create policy "jarvis_operation_receipts_insert_own"
on public.jarvis_operation_receipts for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy "jarvis_operation_receipts_update_own"
on public.jarvis_operation_receipts for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create table if not exists public.jarvis_deliverable_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  idempotency_key text not null,
  deliverable_type text not null check (deliverable_type in ('google_doc','google_sheet')),
  title text not null,
  project_id uuid,
  status text not null default 'processing' check (status in ('processing','completed','failed')),
  provider_file_id text,
  jarvis_file_id uuid,
  web_view_link text,
  summary text,
  sources jsonb not null default '[]'::jsonb,
  error_code text,
  processing_token uuid,
  lease_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key),
  constraint jarvis_deliverable_requests_project_owner_fkey
    foreign key (user_id, project_id)
    references public.jarvis_projects(user_id, id)
    on delete set null (project_id),
  constraint jarvis_deliverable_requests_file_owner_fkey
    foreign key (user_id, jarvis_file_id)
    references public.jarvis_files(user_id, id)
    on delete set null (jarvis_file_id)
);
create index if not exists jarvis_deliverable_requests_user_status_idx
  on public.jarvis_deliverable_requests(user_id, status, created_at desc);
create index if not exists jarvis_deliverable_requests_project_idx
  on public.jarvis_deliverable_requests(project_id) where project_id is not null;
create trigger jarvis_deliverable_requests_set_updated_at
before update on public.jarvis_deliverable_requests
for each row execute function public.set_updated_at();
alter table public.jarvis_deliverable_requests enable row level security;
revoke all on table public.jarvis_deliverable_requests from public, anon, authenticated;
grant select, insert, update on table public.jarvis_deliverable_requests to authenticated;
create policy "jarvis_deliverable_requests_select_own"
on public.jarvis_deliverable_requests for select to authenticated
using ((select auth.uid()) = user_id);
create policy "jarvis_deliverable_requests_insert_own"
on public.jarvis_deliverable_requests for insert to authenticated
with check (
  (select auth.uid()) = user_id
  and (project_id is null or exists (
    select 1 from public.jarvis_projects p
    where p.id = jarvis_deliverable_requests.project_id
      and p.user_id = (select auth.uid())
  ))
);
create policy "jarvis_deliverable_requests_update_own"
on public.jarvis_deliverable_requests for update to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and (project_id is null or exists (
    select 1 from public.jarvis_projects p
    where p.id = jarvis_deliverable_requests.project_id
      and p.user_id = (select auth.uid())
  ))
);

create or replace function public.reserve_jarvis_deliverable(
  p_idempotency_key text,
  p_deliverable_type text,
  p_title text,
  p_project_id uuid,
  p_summary text,
  p_sources jsonb
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_token uuid := gen_random_uuid();
  v_request public.jarvis_deliverable_requests%rowtype;
  v_claimed boolean := false;
begin
  if v_user_id is null then raise exception 'not_authenticated'; end if;
  insert into public.jarvis_deliverable_requests(
    user_id,idempotency_key,deliverable_type,title,project_id,status,summary,sources,
    processing_token,lease_expires_at,error_code
  ) values (
    v_user_id,p_idempotency_key,p_deliverable_type,p_title,p_project_id,'processing',p_summary,
    coalesce(p_sources,'[]'::jsonb),v_token,now()+interval '5 minutes',null
  )
  on conflict (user_id,idempotency_key) do update
  set status='processing',processing_token=v_token,lease_expires_at=now()+interval '5 minutes',
      error_code=null,updated_at=now()
  where jarvis_deliverable_requests.status='failed'
     or (jarvis_deliverable_requests.status='processing'
         and jarvis_deliverable_requests.lease_expires_at < now())
  returning * into v_request;

  if found then
    v_claimed := v_request.processing_token = v_token;
  else
    select * into v_request from public.jarvis_deliverable_requests
    where user_id=v_user_id and idempotency_key=p_idempotency_key;
  end if;
  return jsonb_build_object('claimed',v_claimed,'request',to_jsonb(v_request));
end;
$$;
revoke all on function public.reserve_jarvis_deliverable(text,text,text,uuid,text,jsonb) from public, anon;
grant execute on function public.reserve_jarvis_deliverable(text,text,text,uuid,text,jsonb) to authenticated;

alter table public.jarvis_memories
  drop constraint if exists jarvis_memories_memory_type_check;
alter table public.jarvis_memories
  add constraint jarvis_memories_memory_type_check check (
    memory_type in ('preference','fact','person','context','decision','rule','routine','project_context','other')
  );
alter table public.jarvis_memories add column if not exists memory_key text;
alter table public.jarvis_memories add column if not exists superseded_by uuid;
alter table public.jarvis_memories
  add constraint jarvis_memories_user_id_id_key unique (user_id, id);
alter table public.jarvis_memories
  add constraint jarvis_memories_superseded_by_fkey
  foreign key (superseded_by) references public.jarvis_memories(id) on delete set null;
create unique index if not exists jarvis_memories_user_active_key_uq
  on public.jarvis_memories(user_id, memory_key)
  where active and memory_key is not null;
create index if not exists jarvis_memories_superseded_idx
  on public.jarvis_memories(superseded_by) where superseded_by is not null;

create table if not exists public.jarvis_memory_revisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  memory_id uuid not null,
  previous_memory_type text not null,
  previous_title text,
  previous_content text not null,
  previous_importance integer not null,
  reason text not null default 'updated',
  created_at timestamptz not null default now(),
  constraint jarvis_memory_revisions_owner_fkey
    foreign key (user_id, memory_id)
    references public.jarvis_memories(user_id, id)
    on delete cascade
);
create index if not exists jarvis_memory_revisions_memory_idx
  on public.jarvis_memory_revisions(memory_id, created_at desc);
alter table public.jarvis_memory_revisions enable row level security;
revoke all on table public.jarvis_memory_revisions from public, anon, authenticated;
grant select, insert on table public.jarvis_memory_revisions to authenticated;
create policy "jarvis_memory_revisions_select_own"
on public.jarvis_memory_revisions for select to authenticated
using ((select auth.uid()) = user_id);
create policy "jarvis_memory_revisions_insert_own"
on public.jarvis_memory_revisions for insert to authenticated
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.jarvis_memories m
    where m.id = jarvis_memory_revisions.memory_id
      and m.user_id = (select auth.uid())
  )
);

create table if not exists public.jarvis_health_checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  component text not null check (component in (
    'supabase','openai','google_calendar','google_drive','document_ai','cloud_run','whatsapp_webhook','whatsapp_sender'
  )),
  status text not null check (status in ('healthy','degraded','blocked','unknown')),
  code text not null,
  action_required boolean not null default false,
  message text not null,
  details jsonb not null default '{}'::jsonb,
  checked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, component)
);
create index if not exists jarvis_health_checks_user_action_idx
  on public.jarvis_health_checks(user_id, action_required, status, checked_at desc);
create trigger jarvis_health_checks_set_updated_at
before update on public.jarvis_health_checks
for each row execute function public.set_updated_at();
alter table public.jarvis_health_checks enable row level security;
revoke all on table public.jarvis_health_checks from public, anon, authenticated;
grant select, insert, update on table public.jarvis_health_checks to authenticated;
create policy "jarvis_health_checks_select_own"
on public.jarvis_health_checks for select to authenticated
using ((select auth.uid()) = user_id);
create policy "jarvis_health_checks_insert_own"
on public.jarvis_health_checks for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy "jarvis_health_checks_update_own"
on public.jarvis_health_checks for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

alter table public.jarvis_whatsapp_webhook_events
  add column if not exists status text not null default 'claimed'
    check (status in ('claimed','completed','failed')),
  add column if not exists attempt_count integer not null default 1 check (attempt_count > 0),
  add column if not exists lease_expires_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists last_error_code text;
create index if not exists jarvis_whatsapp_webhook_events_retry_idx
  on public.jarvis_whatsapp_webhook_events(status, lease_expires_at)
  where status in ('claimed','failed');

create table if not exists public.jarvis_whatsapp_pairing_codes (
  code_hash text primary key check (code_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);
create index if not exists jarvis_whatsapp_pairing_codes_user_idx
  on public.jarvis_whatsapp_pairing_codes(user_id, expires_at desc);
alter table public.jarvis_whatsapp_pairing_codes enable row level security;
revoke all on table public.jarvis_whatsapp_pairing_codes from public, anon, authenticated;
grant select, insert, update, delete on table public.jarvis_whatsapp_pairing_codes to service_role;

create or replace function public.claim_jarvis_whatsapp_event(
  p_event_key_hash text,
  p_event_kind text,
  p_expires_at timestamptz,
  p_lease_expires_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_inserted integer;
begin
  insert into public.jarvis_whatsapp_webhook_events(
    event_key_hash,event_kind,expires_at,status,attempt_count,lease_expires_at
  )
  values(p_event_key_hash,p_event_kind,p_expires_at,'claimed',1,p_lease_expires_at)
  on conflict (event_key_hash) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 1 then return true; end if;

  update public.jarvis_whatsapp_webhook_events
  set status='claimed',
      attempt_count=attempt_count+1,
      lease_expires_at=p_lease_expires_at,
      expires_at=p_expires_at,
      last_error_code=null
  where event_key_hash=p_event_key_hash
    and (
      status='failed'
      or (status='claimed' and lease_expires_at < now())
    );
  get diagnostics v_inserted = row_count;
  return v_inserted = 1;
end;
$$;
revoke all on function public.claim_jarvis_whatsapp_event(text,text,timestamptz,timestamptz) from public, anon, authenticated;
grant execute on function public.claim_jarvis_whatsapp_event(text,text,timestamptz,timestamptz) to service_role;

-- FKs mais usadas nas telas e nos novos fluxos. Os demais indices legados sao
-- avaliados separadamente para evitar criar indices sem evidencia de carga.
create index if not exists jarvis_files_project_idx
  on public.jarvis_files(project_id) where project_id is not null;
create index if not exists jarvis_tasks_project_idx
  on public.jarvis_tasks(project_id) where project_id is not null;
create index if not exists jarvis_notes_project_idx
  on public.jarvis_notes(project_id) where project_id is not null;
create index if not exists jarvis_messages_reply_to_idx
  on public.jarvis_messages(reply_to_id) where reply_to_id is not null;
create index if not exists jarvis_actions_source_message_idx
  on public.jarvis_actions(source_message_id) where source_message_id is not null;

comment on table public.jarvis_deliverable_requests is
  'Pedidos idempotentes de criacao de Google Docs ou Sheets dentro da arvore JARVIS.';
comment on table public.jarvis_health_checks is
  'Ultimo estado operacional sanitizado por componente e usuario; nunca armazena secrets ou payloads privados.';
comment on column public.jarvis_memories.memory_key is
  'Chave canonica normalizada usada para deduplicar memoria util, nao historico de conversa.';

create or replace function public.jarvis_finance_summary(
  p_start date,
  p_end_exclusive date,
  p_search text default null
)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with scoped as (
    select
      t.id,t.transaction_date,t.description,t.display_description,t.merchant,t.amount,
      t.flow_type,t.is_internal_transfer,t.include_in_budget,t.transaction_source,t.review_status,
      a.name as account_name,c.name as category_name,c.group_name as category_group
    from public.transactions t
    join public.accounts a on a.id=t.account_id and a.user_id=t.user_id
    left join public.categories c on c.id=t.category_id and c.user_id=t.user_id
    where t.user_id=(select auth.uid())
      and t.transaction_date >= p_start
      and t.transaction_date < p_end_exclusive
  ),
  totals as (
    select
      coalesce(sum(abs(amount)) filter (where flow_type='expense' and not is_internal_transfer and include_in_budget),0) as expenses,
      coalesce(sum(abs(amount)) filter (where flow_type='income' and not is_internal_transfer),0) as income,
      coalesce(sum(amount) filter (where not is_internal_transfer),0) as net,
      count(*) as transaction_count,
      count(*) filter (where review_status in ('auto','needs_review')) as review_count
    from scoped
  ),
  category_rows as (
    select coalesce(category_name,'Sem categoria') as name,sum(abs(amount)) as amount
    from scoped
    where flow_type='expense' and not is_internal_transfer and include_in_budget
    group by coalesce(category_name,'Sem categoria')
    order by amount desc
    limit 20
  ),
  matching_rows as (
    select *
    from scoped
    where p_search is null or btrim(p_search)=''
      or concat_ws(' ',description,display_description,merchant,category_name,account_name) ilike '%' || replace(replace(p_search,'%','\%'),'_','\_') || '%' escape '\'
    order by transaction_date desc,id desc
    limit 50
  )
  select jsonb_build_object(
    'totals',(select to_jsonb(totals) from totals),
    'categories',coalesce((select jsonb_agg(to_jsonb(category_rows)) from category_rows),'[]'::jsonb),
    'transactions',coalesce((select jsonb_agg(to_jsonb(matching_rows)) from matching_rows),'[]'::jsonb)
  );
$$;
revoke all on function public.jarvis_finance_summary(date,date,text) from public, anon;
grant execute on function public.jarvis_finance_summary(date,date,text) to authenticated;
