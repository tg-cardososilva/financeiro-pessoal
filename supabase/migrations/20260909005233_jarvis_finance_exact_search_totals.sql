-- Retornar totais exatos do recorte pesquisado sem alterar ou duplicar transacoes.

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
  matched as (
    select * from scoped
    where p_search is null or btrim(p_search)=''
      or concat_ws(' ',description,display_description,merchant,category_name,account_name)
        ilike '%' || replace(replace(p_search,'%','\%'),'_','\_') || '%' escape '\'
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
  matched_totals as (
    select
      coalesce(sum(abs(amount)) filter (where flow_type='expense' and not is_internal_transfer and include_in_budget),0) as expenses,
      coalesce(sum(abs(amount)) filter (where flow_type='income' and not is_internal_transfer),0) as income,
      coalesce(sum(amount) filter (where not is_internal_transfer),0) as net,
      count(*) as transaction_count,
      count(*) filter (where review_status in ('auto','needs_review')) as review_count
    from matched
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
    select * from matched
    order by transaction_date desc,id desc
    limit 50
  )
  select jsonb_build_object(
    'totals',(select to_jsonb(totals) from totals),
    'matched_totals',(select to_jsonb(matched_totals) from matched_totals),
    'categories',coalesce((select jsonb_agg(to_jsonb(category_rows)) from category_rows),'[]'::jsonb),
    'transactions',coalesce((select jsonb_agg(to_jsonb(matching_rows)) from matching_rows),'[]'::jsonb)
  );
$$;
revoke all on function public.jarvis_finance_summary(date,date,text) from public, anon;
grant execute on function public.jarvis_finance_summary(date,date,text) to authenticated;
