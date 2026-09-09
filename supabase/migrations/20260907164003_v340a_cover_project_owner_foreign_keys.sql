create index if not exists jarvis_tasks_user_project_idx
  on public.jarvis_tasks(user_id, project_id)
  where project_id is not null;

create index if not exists jarvis_notes_user_project_idx
  on public.jarvis_notes(user_id, project_id)
  where project_id is not null;
