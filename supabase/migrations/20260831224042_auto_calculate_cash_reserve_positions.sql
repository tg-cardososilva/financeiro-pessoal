create or replace function public.recalculate_auto_cash_reserve_position(p_position_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_asset_type text;
  v_auto boolean := false;
  v_principal numeric := 0;
  v_current numeric := 0;
begin
  select asset_type, coalesce((metadata->>'auto_calculate_from_movements')::boolean,false)
    into v_asset_type, v_auto
  from public.investment_positions
  where id=p_position_id;

  if not found or v_asset_type <> 'cash_reserve' or not v_auto then return; end if;

  select
    coalesce(sum(case when movement_type in ('contribution','transfer_in') then amount when movement_type in ('withdrawal','transfer_out') then -amount else 0 end),0),
    coalesce(sum(case when movement_type in ('contribution','transfer_in','income') then amount when movement_type in ('withdrawal','transfer_out','fee') then -amount else 0 end),0)
  into v_principal, v_current
  from public.investment_movements
  where position_id=p_position_id;

  update public.investment_positions
     set invested_amount=greatest(v_principal,0),
         current_value=greatest(v_current,0),
         updated_at=now()
   where id=p_position_id;
end;
$$;

revoke all on function public.recalculate_auto_cash_reserve_position(uuid) from public, anon, authenticated;

create or replace function public.trg_recalculate_auto_cash_reserve()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('UPDATE','DELETE') and old.position_id is not null then
    perform public.recalculate_auto_cash_reserve_position(old.position_id);
  end if;
  if tg_op in ('INSERT','UPDATE') and new.position_id is not null then
    perform public.recalculate_auto_cash_reserve_position(new.position_id);
  end if;
  return coalesce(new,old);
end;
$$;

revoke all on function public.trg_recalculate_auto_cash_reserve() from public, anon, authenticated;

drop trigger if exists investment_movements_recalculate_auto_reserve on public.investment_movements;
create trigger investment_movements_recalculate_auto_reserve
after insert or update or delete on public.investment_movements
for each row execute function public.trg_recalculate_auto_cash_reserve();

update public.investment_positions
set metadata=coalesce(metadata,'{}'::jsonb) || '{"auto_calculate_from_movements":true}'::jsonb
where name='Mercado Pago · Cofrinho' and asset_type='cash_reserve';

select public.recalculate_auto_cash_reserve_position(id)
from public.investment_positions
where name='Mercado Pago · Cofrinho' and asset_type='cash_reserve';

create or replace function public.record_investment_contribution(p_date date, p_amount numeric, p_source_account_id uuid, p_investment_account_id uuid, p_position_id uuid default null, p_notes text default null)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_transfer_category uuid;
  v_group uuid := gen_random_uuid();
  v_destination_tx uuid;
  v_auto boolean := false;
begin
  if v_user is null then raise exception 'not_authenticated'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'invalid_amount'; end if;
  if p_source_account_id = p_investment_account_id then raise exception 'same_source_and_destination'; end if;
  if not exists(select 1 from public.accounts where id=p_source_account_id and user_id=v_user) then raise exception 'invalid_source_account'; end if;
  if not exists(select 1 from public.accounts where id=p_investment_account_id and user_id=v_user and account_type in ('investment','savings')) then raise exception 'invalid_investment_account'; end if;
  if p_position_id is not null and not exists(select 1 from public.investment_positions where id=p_position_id and user_id=v_user and account_id=p_investment_account_id) then raise exception 'invalid_position'; end if;

  select id into v_transfer_category from public.categories where user_id=v_user and name='Transferência interna' and kind='transfer' limit 1;
  if p_position_id is not null then select coalesce((metadata->>'auto_calculate_from_movements')::boolean,false) into v_auto from public.investment_positions where id=p_position_id; end if;

  insert into public.transactions(user_id,account_id,category_id,transaction_date,description,amount,flow_type,is_internal_transfer,include_in_budget,transaction_source,notes,metadata)
  values(v_user,p_source_account_id,v_transfer_category,p_date,'Aporte para investimento',-p_amount,'transfer',true,false,'manual',p_notes,jsonb_build_object('investment_transfer_id',v_group,'leg','source'));

  insert into public.transactions(user_id,account_id,category_id,transaction_date,description,amount,flow_type,is_internal_transfer,include_in_budget,transaction_source,notes,metadata)
  values(v_user,p_investment_account_id,v_transfer_category,p_date,'Aporte recebido',p_amount,'investment',true,false,'manual',p_notes,jsonb_build_object('investment_transfer_id',v_group,'leg','destination'))
  returning id into v_destination_tx;

  insert into public.investment_movements(user_id,position_id,account_id,transaction_id,movement_date,movement_type,amount,notes,metadata)
  values(v_user,p_position_id,p_investment_account_id,v_destination_tx,p_date,'contribution',p_amount,p_notes,jsonb_build_object('investment_transfer_id',v_group));

  if p_position_id is not null and not v_auto then
    update public.investment_positions set invested_amount=invested_amount+p_amount,current_value=current_value+p_amount where id=p_position_id and user_id=v_user;
  end if;
  return v_group;
end;
$$;

create or replace function public.record_investment_withdrawal(p_date date, p_amount numeric, p_investment_account_id uuid, p_destination_account_id uuid, p_position_id uuid default null, p_notes text default null)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_transfer_category uuid;
  v_group uuid := gen_random_uuid();
  v_source_tx uuid;
  v_auto boolean := false;
begin
  if v_user is null then raise exception 'not_authenticated'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'invalid_amount'; end if;
  if p_investment_account_id = p_destination_account_id then raise exception 'same_source_and_destination'; end if;
  if not exists(select 1 from public.accounts where id=p_investment_account_id and user_id=v_user and account_type in ('investment','savings')) then raise exception 'invalid_investment_account'; end if;
  if not exists(select 1 from public.accounts where id=p_destination_account_id and user_id=v_user) then raise exception 'invalid_destination_account'; end if;
  if p_position_id is not null and not exists(select 1 from public.investment_positions where id=p_position_id and user_id=v_user and account_id=p_investment_account_id) then raise exception 'invalid_position'; end if;

  select id into v_transfer_category from public.categories where user_id=v_user and name='Transferência interna' and kind='transfer' limit 1;
  if p_position_id is not null then select coalesce((metadata->>'auto_calculate_from_movements')::boolean,false) into v_auto from public.investment_positions where id=p_position_id; end if;

  insert into public.transactions(user_id,account_id,category_id,transaction_date,description,amount,flow_type,is_internal_transfer,include_in_budget,transaction_source,notes,metadata)
  values(v_user,p_investment_account_id,v_transfer_category,p_date,'Resgate de investimento',-p_amount,'transfer',true,false,'manual',p_notes,jsonb_build_object('investment_transfer_id',v_group,'leg','source'))
  returning id into v_source_tx;

  insert into public.transactions(user_id,account_id,category_id,transaction_date,description,amount,flow_type,is_internal_transfer,include_in_budget,transaction_source,notes,metadata)
  values(v_user,p_destination_account_id,v_transfer_category,p_date,'Resgate recebido',p_amount,'transfer',true,false,'manual',p_notes,jsonb_build_object('investment_transfer_id',v_group,'leg','destination'));

  insert into public.investment_movements(user_id,position_id,account_id,transaction_id,movement_date,movement_type,amount,notes,metadata)
  values(v_user,p_position_id,p_investment_account_id,v_source_tx,p_date,'withdrawal',p_amount,p_notes,jsonb_build_object('investment_transfer_id',v_group));

  if p_position_id is not null and not v_auto then
    update public.investment_positions set invested_amount=greatest(0,invested_amount-least(invested_amount,p_amount)),current_value=greatest(0,current_value-p_amount) where id=p_position_id and user_id=v_user;
  end if;
  return v_group;
end;
$$;

create or replace function public.record_investment_income(p_date date, p_amount numeric, p_account_id uuid, p_position_id uuid default null, p_notes text default null)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_movement uuid;
  v_auto boolean := false;
begin
  if v_user is null then raise exception 'not_authenticated'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'invalid_amount'; end if;
  if not exists(select 1 from public.accounts where id=p_account_id and user_id=v_user and account_type in ('investment','savings')) then raise exception 'invalid_account'; end if;
  if p_position_id is not null and not exists(select 1 from public.investment_positions where id=p_position_id and user_id=v_user and account_id=p_account_id) then raise exception 'invalid_position'; end if;
  if p_position_id is not null then select coalesce((metadata->>'auto_calculate_from_movements')::boolean,false) into v_auto from public.investment_positions where id=p_position_id; end if;

  insert into public.investment_movements(user_id,position_id,account_id,movement_date,movement_type,amount,notes)
  values(v_user,p_position_id,p_account_id,p_date,'income',p_amount,p_notes)
  returning id into v_movement;

  if p_position_id is not null and not v_auto then update public.investment_positions set current_value=current_value+p_amount where id=p_position_id and user_id=v_user; end if;
  return v_movement;
end;
$$;
