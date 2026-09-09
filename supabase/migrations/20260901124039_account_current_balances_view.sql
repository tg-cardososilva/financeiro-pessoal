create or replace view public.account_current_balances with (security_invoker=true) as
with latest as (
  select distinct on (s.account_id)
    s.user_id,
    s.account_id,
    s.balance as confirmed_balance,
    s.balance_date,
    s.source,
    s.created_at as confirmed_at
  from public.account_balance_snapshots s
  where s.is_confirmed = true
  order by s.account_id, s.balance_date desc, s.created_at desc
)
select
  a.user_id,
  a.id as account_id,
  a.name,
  a.account_type,
  l.confirmed_balance,
  l.balance_date,
  l.source,
  case when l.account_id is null then null::numeric
       else l.confirmed_balance + coalesce(sum(t.amount) filter (where t.transaction_date > l.balance_date),0)::numeric
  end as current_balance,
  max(t.transaction_date) filter (where l.account_id is not null and t.transaction_date > l.balance_date) as last_movement_after_balance
from public.accounts a
left join latest l on l.account_id=a.id and l.user_id=a.user_id
left join public.transactions t on t.account_id=a.id and t.user_id=a.user_id
where a.active=true
group by a.user_id,a.id,a.name,a.account_type,l.account_id,l.confirmed_balance,l.balance_date,l.source;
