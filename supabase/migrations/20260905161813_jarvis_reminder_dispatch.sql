create extension if not exists pg_cron;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.dispatch_due_jarvis_reminders()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer := 0;
begin
  with due as (
    select id, user_id, title, description, remind_at
    from public.jarvis_tasks
    where status = 'pending'
      and remind_at is not null
      and remind_at <= now()
      and last_notified_at is null
    order by remind_at
    for update skip locked
  ), inserted as (
    insert into public.jarvis_messages (
      user_id,
      channel,
      direction,
      message_type,
      body,
      intent,
      confidence,
      status,
      raw_data,
      processed_at
    )
    select
      d.user_id,
      'web',
      'outbound',
      'text',
      'Lembrete: ' || d.title,
      'reminder',
      1,
      'queued',
      jsonb_build_object(
        'kind', 'scheduled_reminder',
        'task_id', d.id,
        'remind_at', d.remind_at,
        'delivery_status', 'pending_channel'
      ),
      now()
    from due d
    returning (raw_data->>'task_id')::uuid as task_id
  )
  update public.jarvis_tasks t
  set last_notified_at = now(), updated_at = now()
  from inserted i
  where t.id = i.task_id;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function private.dispatch_due_jarvis_reminders() from public, anon, authenticated;

select cron.schedule(
  'jarvis-reminder-dispatch',
  '* * * * *',
  'select private.dispatch_due_jarvis_reminders();'
)
where not exists (
  select 1 from cron.job where jobname = 'jarvis-reminder-dispatch'
);
