create table if not exists public.financial_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid references public.accounts(id) on delete set null,
  file_name text not null,
  storage_path text not null,
  mime_type text,
  document_type text not null default 'other' check (document_type in ('third_party','cofrinho','benefit','receipt','bank_pdf','other')),
  parse_status text not null default 'uploaded' check (parse_status in ('uploaded','parsed','review','confirmed','failed')),
  extracted_text text,
  extracted_data jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger financial_documents_set_updated_at before update on public.financial_documents for each row execute function public.set_updated_at();
alter table public.financial_documents enable row level security;
create policy financial_documents_owner on public.financial_documents for all using (auth.uid()=user_id) with check (auth.uid()=user_id);
create index financial_documents_user_created_idx on public.financial_documents(user_id, created_at desc);

