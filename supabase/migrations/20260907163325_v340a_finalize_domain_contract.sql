-- v3.4.0a etapa 2: fechar o schema oficial e semântica de estado

-- Remover índices/constraints legados que dependem dos tipos antigos.
drop index if exists public.jarvis_tasks_user_remind_idx;
alter table public.jarvis_tasks drop constraint if exists jarvis_tasks_status_check;
alter table public.jarvis_tasks drop constraint if exists jarvis_tasks_priority_check;
alter table public.jarvis_notes drop constraint if exists jarvis_notes_note_type_check;
alter table public.jarvis_projects drop constraint if exists jarvis_projects_status_check;
alter table public.jarvis_projects drop constraint if exists jarvis_projects_project_type_check;

alter table public.jarvis_tasks alter column status drop default;
alter table public.jarvis_tasks alter column priority drop default;
alter table public.jarvis_notes alter column note_type drop default;
alter table public.jarvis_projects alter column status drop default;

alter table public.jarvis_tasks
  alter column status type public.task_status
    using (case status when 'pending' then 'open' when 'completed' then 'completed' else 'cancelled' end)::public.task_status,
  alter column priority type public.task_priority
    using (case when priority <= 1 then 'low' when priority <= 3 then 'normal' when priority = 4 then 'high' else 'urgent' end)::public.task_priority;

alter table public.jarvis_notes
  alter column note_type type public.note_type
    using (case when note_type in ('idea','reference') then note_type else 'note' end)::public.note_type;

alter table public.jarvis_projects
  alter column status type public.project_status
    using (case status when 'paused' then 'paused' when 'completed' then 'completed' when 'archived' then 'archived' else 'active' end)::public.project_status;

alter table public.jarvis_tasks
  alter column status set default 'open'::public.task_status,
  alter column priority set default 'normal'::public.task_priority,
  alter column source drop default;

alter table public.jarvis_notes
  alter column note_type set default 'note'::public.note_type,
  alter column source drop default;

alter table public.jarvis_projects
  alter column status set default 'active'::public.project_status,
  alter column source drop default;

-- Título de nota passa a ser obrigatório; se houvesse legado sem título, deriva do próprio conteúdo.
update public.jarvis_notes
set title = left(regexp_replace(btrim(content), '\s+', ' ', 'g'), 120)
where title is null or btrim(title) = '';
alter table public.jarvis_notes alter column title set not null;

-- Remover campos do modelo antigo que não fazem parte do contrato v3.4.0.
alter table public.jarvis_tasks drop constraint if exists jarvis_tasks_source_message_id_fkey;
drop index if exists public.jarvis_tasks_source_message_idx;
alter table public.jarvis_tasks
  drop column if exists source_message_id,
  drop column if exists remind_at,
  drop column if exists timezone,
  drop column if exists last_notified_at,
  drop column if exists metadata;

alter table public.jarvis_notes drop constraint if exists jarvis_notes_source_message_id_fkey;
drop index if exists public.jarvis_notes_source_message_idx;
alter table public.jarvis_notes
  drop column if exists source_message_id,
  drop column if exists pinned,
  drop column if exists metadata;

alter table public.jarvis_projects drop constraint if exists jarvis_projects_source_message_id_fkey;
drop index if exists public.jarvis_projects_source_message_idx;
alter table public.jarvis_projects
  drop column if exists source_message_id,
  drop column if exists project_type,
  drop column if exists start_date,
  drop column if exists target_date,
  drop column if exists metadata;

-- Semântica de conclusão/reabertura de tarefa.
create or replace function public.enforce_jarvis_task_status_semantics()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'completed'::public.task_status then
    if new.completed_at is null or (tg_op = 'UPDATE' and old.status is distinct from new.status) then
      new.completed_at = coalesce(new.completed_at, now());
    end if;
  else
    new.completed_at = null;
  end if;
  return new;
end;
$$;

drop trigger if exists jarvis_tasks_status_semantics on public.jarvis_tasks;
create trigger jarvis_tasks_status_semantics
before insert or update of status, completed_at on public.jarvis_tasks
for each row execute function public.enforce_jarvis_task_status_semantics();

-- Semântica de arquivamento/reabertura de projeto.
create or replace function public.enforce_jarvis_project_status_semantics()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'archived'::public.project_status then
    if new.archived_at is null or (tg_op = 'UPDATE' and old.status is distinct from new.status) then
      new.archived_at = coalesce(new.archived_at, now());
    end if;
  else
    new.archived_at = null;
  end if;
  return new;
end;
$$;

drop trigger if exists jarvis_projects_status_semantics on public.jarvis_projects;
create trigger jarvis_projects_status_semantics
before insert or update of status, archived_at on public.jarvis_projects
for each row execute function public.enforce_jarvis_project_status_semantics();

-- Índices alinhados aos novos estados e às políticas por user_id.
drop index if exists public.jarvis_tasks_user_due_idx;
create index jarvis_tasks_user_status_due_idx on public.jarvis_tasks(user_id, status, due_at);

-- O índice existente de projetos é recriado para fixar a tipagem nova e manter leitura operacional eficiente.
drop index if exists public.jarvis_projects_user_status_idx;
create index jarvis_projects_user_status_idx on public.jarvis_projects(user_id, status, updated_at desc);

