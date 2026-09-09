create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = clock_timestamp();
  return new;
end;
$$;

create or replace function public.enforce_jarvis_task_status_semantics()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'completed'::public.task_status then
    if new.completed_at is null or (tg_op = 'UPDATE' and old.status is distinct from new.status) then
      new.completed_at = coalesce(new.completed_at, clock_timestamp());
    end if;
  else
    new.completed_at = null;
  end if;
  return new;
end;
$$;

create or replace function public.enforce_jarvis_project_status_semantics()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'archived'::public.project_status then
    if new.archived_at is null or (tg_op = 'UPDATE' and old.status is distinct from new.status) then
      new.archived_at = coalesce(new.archived_at, clock_timestamp());
    end if;
  else
    new.archived_at = null;
  end if;
  return new;
end;
$$;
