create table public.jarvis_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'google_drive' check (provider = 'google_drive'),
  provider_file_id text not null,
  name text not null,
  mime_type text not null,
  web_view_link text null,
  modified_at_provider timestamptz null,
  size_bytes bigint null check (size_bytes is null or size_bytes >= 0),
  project_id uuid null,
  source public.record_source not null default 'imported'::public.record_source,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint jarvis_files_user_provider_file_key unique (user_id, provider, provider_file_id),
  constraint jarvis_files_project_owner_fkey foreign key (user_id, project_id)
    references public.jarvis_projects(user_id, id)
    on delete set null (project_id)
);

create index jarvis_files_user_project_idx on public.jarvis_files(user_id, project_id);
create index jarvis_files_user_modified_idx on public.jarvis_files(user_id, modified_at_provider desc);

create trigger jarvis_files_set_updated_at
before update on public.jarvis_files
for each row execute function public.set_updated_at();

alter table public.jarvis_files enable row level security;

revoke all on table public.jarvis_files from anon;
revoke all on table public.jarvis_files from authenticated;
grant select, insert, update, delete on table public.jarvis_files to authenticated;

create policy "jarvis_files_select_own"
on public.jarvis_files for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "jarvis_files_insert_own"
on public.jarvis_files for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and (
    project_id is null
    or exists (
      select 1 from public.jarvis_projects p
      where p.id = jarvis_files.project_id
        and p.user_id = (select auth.uid())
    )
  )
);

create policy "jarvis_files_update_own"
on public.jarvis_files for update
to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and (
    project_id is null
    or exists (
      select 1 from public.jarvis_projects p
      where p.id = jarvis_files.project_id
        and p.user_id = (select auth.uid())
    )
  )
);

create policy "jarvis_files_delete_own"
on public.jarvis_files for delete
to authenticated
using ((select auth.uid()) = user_id);
