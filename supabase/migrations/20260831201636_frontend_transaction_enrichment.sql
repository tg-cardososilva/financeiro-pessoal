alter table public.profiles add column if not exists preferences jsonb not null default '{"use_purchase_details":false}'::jsonb;
alter table public.transactions add column if not exists display_description text;
alter table public.transactions add column if not exists review_status text not null default 'reviewed';
alter table public.transactions add column if not exists tags text[] not null default '{}'::text[];

do $$ begin
  alter table public.transactions add constraint transactions_review_status_check check (review_status in ('auto','needs_review','reviewed'));
exception when duplicate_object then null;
end $$;

create or replace function public.group_transactions_into_purchase(
  p_transaction_ids uuid[],
  p_description text default null,
  p_primary_category_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_count integer;
  v_date date;
  v_total numeric(14,2);
  v_merchant text;
  v_purchase uuid;
begin
  if v_user is null then raise exception 'not_authenticated'; end if;
  if p_transaction_ids is null or cardinality(p_transaction_ids) < 1 then raise exception 'no_transactions'; end if;

  select count(*), min(transaction_date), sum(abs(amount)),
         case when count(distinct coalesce(merchant, description)) = 1 then min(coalesce(merchant, description)) else null end
    into v_count, v_date, v_total, v_merchant
  from public.transactions
  where user_id = v_user
    and id = any(p_transaction_ids)
    and flow_type = 'expense'
    and purchase_id is null;

  if v_count <> cardinality(p_transaction_ids) then
    raise exception 'invalid_transactions';
  end if;

  insert into public.purchases(user_id, purchase_date, merchant, description, total_amount, primary_category_id, detail_mode, status)
  values(v_user, v_date, v_merchant, nullif(trim(p_description),''), v_total, p_primary_category_id, 'summary', 'confirmed')
  returning id into v_purchase;

  update public.transactions
  set purchase_id = v_purchase,
      updated_at = now()
  where user_id = v_user and id = any(p_transaction_ids);

  return v_purchase;
end;
$$;

create or replace function public.save_purchase_allocations(
  p_purchase_id uuid,
  p_allocations jsonb
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_total numeric(14,2);
  v_sum numeric(14,2) := 0;
  v_item jsonb;
begin
  if v_user is null then raise exception 'not_authenticated'; end if;
  select total_amount into v_total from public.purchases where id=p_purchase_id and user_id=v_user;
  if v_total is null then raise exception 'purchase_not_found'; end if;
  if jsonb_typeof(p_allocations) <> 'array' then raise exception 'invalid_allocations'; end if;

  for v_item in select * from jsonb_array_elements(p_allocations)
  loop
    v_sum := v_sum + coalesce((v_item->>'amount')::numeric,0);
  end loop;

  if abs(v_sum - v_total) > 0.01 then raise exception 'allocation_total_mismatch'; end if;

  delete from public.purchase_allocations where purchase_id=p_purchase_id and user_id=v_user;

  insert into public.purchase_allocations(user_id,purchase_id,category_id,amount,source)
  select v_user, p_purchase_id, (x->>'category_id')::uuid, (x->>'amount')::numeric, coalesce(nullif(x->>'source',''),'manual')
  from jsonb_array_elements(p_allocations) x
  where coalesce((x->>'amount')::numeric,0) > 0;

  update public.purchases set detail_mode='detailed', updated_at=now() where id=p_purchase_id and user_id=v_user;
end;
$$;

grant execute on function public.group_transactions_into_purchase(uuid[],text,uuid) to authenticated;
grant execute on function public.save_purchase_allocations(uuid,jsonb) to authenticated;
