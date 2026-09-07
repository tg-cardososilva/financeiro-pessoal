alter table public.jarvis_files
  add constraint jarvis_files_user_id_id_key unique (user_id, id);

create table public.jarvis_document_processing (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  jarvis_file_id uuid not null,
  processing_status text not null default 'pending'
    check (processing_status in ('pending','processing','completed','failed')),
  document_type text not null default 'unknown'
    check (document_type in (
      'unknown',
      'financial_invoice','financial_receipt','financial_proof',
      'contract','administrative',
      'travel_reservation','travel_ticket','travel_lodging','travel_other'
    )),
  processor text not null default 'document_ai_ocr_openai_v1'
    check (processor in ('document_ai_ocr_openai_v1')),
  extracted_text text null,
  extracted_data jsonb null,
  confidence numeric(5,4) null check (confidence is null or (confidence >= 0 and confidence <= 1)),
  processed_at timestamptz null,
  error_code text null,
  error_message text null,
  processing_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint jarvis_document_processing_user_file_key unique (user_id, jarvis_file_id),
  constraint jarvis_document_processing_file_owner_fkey
    foreign key (user_id, jarvis_file_id)
    references public.jarvis_files(user_id, id)
    on delete cascade
);

create index jarvis_document_processing_user_status_idx
  on public.jarvis_document_processing(user_id, processing_status, updated_at desc);
create index jarvis_document_processing_user_type_idx
  on public.jarvis_document_processing(user_id, document_type, processed_at desc);

create trigger jarvis_document_processing_set_updated_at
before update on public.jarvis_document_processing
for each row execute function public.set_updated_at();

alter table public.jarvis_document_processing enable row level security;

revoke all on table public.jarvis_document_processing from anon;
revoke all on table public.jarvis_document_processing from authenticated;
grant select, insert, update, delete on table public.jarvis_document_processing to authenticated;

create policy "jarvis_document_processing_select_own"
on public.jarvis_document_processing for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "jarvis_document_processing_insert_own"
on public.jarvis_document_processing for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.jarvis_files f
    where f.id = jarvis_document_processing.jarvis_file_id
      and f.user_id = (select auth.uid())
  )
);

create policy "jarvis_document_processing_update_own"
on public.jarvis_document_processing for update
to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.jarvis_files f
    where f.id = jarvis_document_processing.jarvis_file_id
      and f.user_id = (select auth.uid())
  )
);

create policy "jarvis_document_processing_delete_own"
on public.jarvis_document_processing for delete
to authenticated
using ((select auth.uid()) = user_id);
