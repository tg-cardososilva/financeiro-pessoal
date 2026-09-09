-- Jarvis 1.0: a mensagem pode preparar um lote de compromissos, mas cada
-- compromisso continua sendo uma acao independente, rastreavel e idempotente.

alter table public.jarvis_actions
  add column if not exists idempotency_key text,
  add column if not exists batch_id uuid,
  add column if not exists batch_index integer,
  add column if not exists batch_size integer;

update public.jarvis_actions
set
  batch_id = coalesce(source_message_id, id),
  batch_index = 0,
  batch_size = 1
where action_type = 'calendar_create'
  and batch_id is null;

create unique index if not exists jarvis_actions_user_idempotency_uq
  on public.jarvis_actions(user_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists jarvis_actions_user_batch_idx
  on public.jarvis_actions(user_id, batch_id, batch_index)
  where batch_id is not null;

alter table public.jarvis_actions
  drop constraint if exists jarvis_actions_idempotency_key_check,
  add constraint jarvis_actions_idempotency_key_check
    check (idempotency_key is null or length(btrim(idempotency_key)) between 8 and 300),
  drop constraint if exists jarvis_actions_batch_shape_check,
  add constraint jarvis_actions_batch_shape_check check (
    (batch_id is null and batch_index is null and batch_size is null)
    or (
      batch_id is not null
      and batch_index is not null
      and batch_size is not null
      and batch_size between 1 and 10
      and batch_index between 0 and batch_size - 1
    )
  );

create or replace function public.reserve_jarvis_calendar_action_batch(
  p_source_message_id uuid,
  p_events jsonb
)
returns setof public.jarvis_actions
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_event jsonb;
  v_index integer;
  v_size integer;
  v_key text;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
begin
  if v_user_id is null then
    raise exception 'not_authenticated';
  end if;

  if not exists (
    select 1
    from public.jarvis_messages
    where id = p_source_message_id
      and user_id = v_user_id
      and direction = 'inbound'
  ) then
    raise exception 'source_message_not_found';
  end if;

  if jsonb_typeof(p_events) <> 'array' then
    raise exception 'invalid_calendar_batch';
  end if;
  v_size := jsonb_array_length(p_events);
  if v_size < 1 or v_size > 10 then
    raise exception 'calendar_batch_size_invalid';
  end if;

  for v_event, v_index in
    select value, ordinality::integer - 1
    from jsonb_array_elements(p_events) with ordinality
  loop
    if nullif(btrim(v_event->>'title'), '') is null
       or nullif(btrim(v_event->>'starts_at'), '') is null
       or nullif(btrim(v_event->>'ends_at'), '') is null then
      raise exception 'calendar_details_missing';
    end if;

    begin
      v_starts_at := (v_event->>'starts_at')::timestamptz;
      v_ends_at := (v_event->>'ends_at')::timestamptz;
    exception when others then
      raise exception 'calendar_time_invalid';
    end;
    if v_ends_at <= v_starts_at then
      raise exception 'calendar_end_before_start';
    end if;

    v_key := format('jarvis-core:%s:calendar:%s', p_source_message_id, v_index + 1);
    insert into public.jarvis_actions(
      user_id, source_message_id, action_type, status, confirmation_required,
      idempotency_key, batch_id, batch_index, batch_size, payload
    ) values (
      v_user_id, p_source_message_id, 'calendar_create', 'proposed', true,
      v_key, p_source_message_id, v_index, v_size,
      jsonb_build_object(
        'title', btrim(v_event->>'title'),
        'starts_at', v_starts_at,
        'ends_at', v_ends_at,
        'location', nullif(btrim(v_event->>'location'), ''),
        'notes', nullif(btrim(v_event->>'notes'), ''),
        'duration_defaulted', coalesce((v_event->>'duration_defaulted')::boolean, false),
        'idempotency_key', v_key,
        'batch_id', p_source_message_id,
        'batch_index', v_index,
        'batch_size', v_size
      )
    )
    on conflict (user_id, idempotency_key) where idempotency_key is not null
    do nothing;
  end loop;

  return query
  select a.*
  from public.jarvis_actions a
  where a.user_id = v_user_id
    and a.batch_id = p_source_message_id
    and a.action_type = 'calendar_create'
  order by a.batch_index;
end;
$$;

revoke all on function public.reserve_jarvis_calendar_action_batch(uuid,jsonb)
  from public, anon;
grant execute on function public.reserve_jarvis_calendar_action_batch(uuid,jsonb)
  to authenticated;

comment on column public.jarvis_actions.idempotency_key is
  'Chave canonica unica por usuario para retries seguros de uma acao.';
comment on column public.jarvis_actions.batch_id is
  'Identifica o pedido de origem; cada linha do lote permanece uma acao independente.';
comment on function public.reserve_jarvis_calendar_action_batch(uuid,jsonb) is
  'Reserva atomicamente de 1 a 10 propostas de Calendar para o usuario autenticado.';
