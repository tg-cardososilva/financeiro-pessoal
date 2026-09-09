-- Cobrir as FKs compostas adicionadas no RC seguindo o padrao real de consulta por ownership.

drop index if exists public.jarvis_deliverable_requests_project_idx;
drop index if exists public.jarvis_memory_revisions_memory_idx;

create index if not exists jarvis_deliverable_requests_user_project_idx
  on public.jarvis_deliverable_requests(user_id, project_id)
  where project_id is not null;

create index if not exists jarvis_deliverable_requests_user_file_idx
  on public.jarvis_deliverable_requests(user_id, jarvis_file_id)
  where jarvis_file_id is not null;

create index if not exists jarvis_memory_revisions_user_memory_idx
  on public.jarvis_memory_revisions(user_id, memory_id);
