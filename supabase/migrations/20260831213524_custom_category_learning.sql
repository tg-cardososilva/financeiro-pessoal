delete from public.categorization_rules
where pattern = 'EDNA DA SILVA AGRIPINO';

create or replace function public.create_category_rule_and_reclassify(
  p_group_name text,
  p_category_name text,
  p_kind text,
  p_institution text,
  p_match_field text,
  p_pattern text,
  p_flow_type text default null,
  p_set_internal_transfer boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_category uuid;
  v_rule uuid;
  v_updated integer := 0;
  v_pattern text := trim(coalesce(p_pattern,''));
  v_group text := trim(coalesce(p_group_name,'Outros'));
  v_name text := trim(coalesce(p_category_name,''));
begin
  if v_user is null then raise exception 'not_authenticated'; end if;
  if v_name = '' then raise exception 'category_name_required'; end if;
  if p_kind not in ('expense','income','transfer','investment') then raise exception 'invalid_kind'; end if;
  if p_match_field not in ('description','merchant','counterparty') then raise exception 'invalid_match_field'; end if;
  if v_pattern = '' then raise exception 'pattern_required'; end if;

  insert into public.categories(user_id,name,group_name,kind)
  values(v_user,v_name,v_group,p_kind)
  on conflict (user_id,kind,group_name,name)
  do update set active=true
  returning id into v_category;

  if v_category is null then
    select id into v_category from public.categories
    where user_id=v_user and kind=p_kind and group_name=v_group and name=v_name limit 1;
  end if;

  insert into public.categorization_rules(user_id,institution,match_field,pattern,category_id,flow_type,set_internal_transfer,priority,active)
  values(v_user,nullif(p_institution,''),p_match_field,v_pattern,v_category,p_flow_type,p_set_internal_transfer,25,true)
  on conflict (user_id,institution,match_field,pattern)
  do update set category_id=excluded.category_id, flow_type=excluded.flow_type,
                set_internal_transfer=excluded.set_internal_transfer, priority=25, active=true
  returning id into v_rule;

  if p_match_field='merchant' then
    update public.transactions
       set category_id=v_category,
           flow_type=coalesce(p_flow_type,flow_type),
           is_internal_transfer=coalesce(p_set_internal_transfer,false),
           review_status='reviewed'
     where user_id=v_user
       and merchant is not null
       and lower(trim(merchant)) = lower(v_pattern);
  elsif p_match_field='counterparty' then
    update public.transactions
       set category_id=v_category,
           flow_type=coalesce(p_flow_type,flow_type),
           is_internal_transfer=coalesce(p_set_internal_transfer,false),
           review_status='reviewed'
     where user_id=v_user
       and counterparty is not null
       and lower(trim(counterparty)) = lower(v_pattern);
  else
    update public.transactions
       set category_id=v_category,
           flow_type=coalesce(p_flow_type,flow_type),
           is_internal_transfer=coalesce(p_set_internal_transfer,false),
           review_status='reviewed'
     where user_id=v_user
       and lower(trim(description)) = lower(v_pattern);
  end if;
  get diagnostics v_updated = row_count;

  return jsonb_build_object('category_id',v_category,'rule_id',v_rule,'updated_count',v_updated);
end;
$$;
