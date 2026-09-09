-- v3.4.0a etapa 1: tipos, origem, ownership estrutural e RLS explícita

create type public.task_status as enum ('open','completed','cancelled');
create type public.task_priority as enum ('low','normal','high','urgent');
create type public.project_status as enum ('active','paused','completed','archived');
create type public.record_source as enum ('manual_web','jarvis_web','whatsapp','imported','system');
create type public.note_type as enum ('note','idea','reference');

alter table public.jarvis_tasks
  add column source public.record_source not null default 'system';

alter table public.jarvis_notes
  add column source public.record_source not null default 'system';

alter table public.jarvis_projects
  add column source public.record_source not null default 'system',
  add column due_at timestamptz,
  add column archived_at timestamptz;

update public.jarvis_projects
set due_at = (target_date::timestamp at time zone 'America/Sao_Paulo')
where target_date is not null and due_at is null;

-- O par (user_id,id) vira alvo de FK composta para impedir associação entre tenants.
alter table public.jarvis_projects
  add constraint jarvis_projects_user_id_id_key unique (user_id, id);

alter table public.jarvis_tasks drop constraint jarvis_tasks_project_id_fkey;
alter table public.jarvis_tasks
  add constraint jarvis_tasks_project_owner_fkey
  foreign key (user_id, project_id)
  references public.jarvis_projects(user_id, id)
  on delete set null (project_id);

alter table public.jarvis_notes drop constraint jarvis_notes_project_id_fkey;
alter table public.jarvis_notes
  add constraint jarvis_notes_project_owner_fkey
  foreign key (user_id, project_id)
  references public.jarvis_projects(user_id, id)
  on delete set null (project_id);

-- RLS explícita por operação.
drop policy if exists jarvis_tasks_owner on public.jarvis_tasks;
drop policy if exists jarvis_notes_owner on public.jarvis_notes;
drop policy if exists jarvis_projects_owner on public.jarvis_projects;

create policy jarvis_tasks_select_own on public.jarvis_tasks
for select to authenticated
using ((select auth.uid()) = user_id);

create policy jarvis_tasks_insert_own on public.jarvis_tasks
for insert to authenticated
with check (
  (select auth.uid()) = user_id
  and (
    project_id is null
    or exists (
      select 1 from public.jarvis_projects p
      where p.id = project_id
        and p.user_id = (select auth.uid())
    )
  )
);

create policy jarvis_tasks_update_own on public.jarvis_tasks
for update to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and (
    project_id is null
    or exists (
      select 1 from public.jarvis_projects p
      where p.id = project_id
        and p.user_id = (select auth.uid())
    )
  )
);

create policy jarvis_tasks_delete_own on public.jarvis_tasks
for delete to authenticated
using ((select auth.uid()) = user_id);

create policy jarvis_notes_select_own on public.jarvis_notes
for select to authenticated
using ((select auth.uid()) = user_id);

create policy jarvis_notes_insert_own on public.jarvis_notes
for insert to authenticated
with check (
  (select auth.uid()) = user_id
  and (
    project_id is null
    or exists (
      select 1 from public.jarvis_projects p
      where p.id = project_id
        and p.user_id = (select auth.uid())
    )
  )
);

create policy jarvis_notes_update_own on public.jarvis_notes
for update to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and (
    project_id is null
    or exists (
      select 1 from public.jarvis_projects p
      where p.id = project_id
        and p.user_id = (select auth.uid())
    )
  )
);

create policy jarvis_notes_delete_own on public.jarvis_notes
for delete to authenticated
using ((select auth.uid()) = user_id);

create policy jarvis_projects_select_own on public.jarvis_projects
for select to authenticated
using ((select auth.uid()) = user_id);

create policy jarvis_projects_insert_own on public.jarvis_projects
for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy jarvis_projects_update_own on public.jarvis_projects
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy jarvis_projects_delete_own on public.jarvis_projects
for delete to authenticated
using ((select auth.uid()) = user_id);

revoke all on table public.jarvis_tasks, public.jarvis_notes, public.jarvis_projects from anon;
revoke all on table public.jarvis_tasks, public.jarvis_notes, public.jarvis_projects from authenticated;
grant select, insert, update, delete on table public.jarvis_tasks, public.jarvis_notes, public.jarvis_projects to authenticated;

