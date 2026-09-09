insert into public.categories (user_id,name,group_name,kind)
select u.id,'Mercado local / condomínio','Alimentação','expense'
from auth.users u
where not exists (
  select 1 from public.categories c
  where c.user_id=u.id and c.kind='expense' and c.group_name='Alimentação' and c.name='Mercado local / condomínio'
);

update public.categorization_rules r
set category_id = c.id,
    flow_type = 'expense',
    set_internal_transfer = false,
    priority = least(r.priority, 5),
    active = true
from public.categories c
where r.user_id = c.user_id
  and r.pattern = 'EDNA DA SILVA AGRIPINO'
  and c.kind='expense'
  and c.group_name='Alimentação'
  and c.name='Mercado local / condomínio';

insert into public.categorization_rules (user_id,institution,match_field,pattern,category_id,flow_type,set_internal_transfer,priority,active)
select u.id,'inter','description','EDNA DA SILVA AGRIPINO',c.id,'expense',false,5,true
from auth.users u
join public.categories c on c.user_id=u.id and c.kind='expense' and c.group_name='Alimentação' and c.name='Mercado local / condomínio'
where not exists (
  select 1 from public.categorization_rules r
  where r.user_id=u.id and r.institution='inter' and r.match_field='description' and r.pattern='EDNA DA SILVA AGRIPINO'
);

create or replace function public.seed_local_market_tracking()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_category uuid;
begin
  insert into public.categories(user_id,name,group_name,kind)
  values(new.id,'Mercado local / condomínio','Alimentação','expense')
  on conflict (user_id,kind,group_name,name) do nothing;

  select id into v_category
  from public.categories
  where user_id=new.id and kind='expense' and group_name='Alimentação' and name='Mercado local / condomínio'
  limit 1;

  insert into public.categorization_rules(user_id,institution,match_field,pattern,category_id,flow_type,set_internal_transfer,priority,active)
  values(new.id,'inter','description','EDNA DA SILVA AGRIPINO',v_category,'expense',false,5,true)
  on conflict (user_id,institution,match_field,pattern)
  do update set category_id=excluded.category_id, flow_type='expense', set_internal_transfer=false, priority=5, active=true;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_local_market on auth.users;
create trigger on_auth_user_created_local_market
after insert on auth.users
for each row execute function public.seed_local_market_tracking();
