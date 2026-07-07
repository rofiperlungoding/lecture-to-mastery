-- Migration: Document artifacts (cached summary modes + concept maps)

create table if not exists doc_artifacts (
  id              uuid primary key default gen_random_uuid(),
  document_id     uuid not null references documents(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade default auth.uid(),
  artifact_type   text not null,
  content         jsonb not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index if not exists idx_doc_artifacts_doc_type on doc_artifacts (document_id, artifact_type);
create index if not exists idx_doc_artifacts_user_id on doc_artifacts (user_id);

alter table doc_artifacts enable row level security;

create policy "Users can view their own doc_artifacts"
  on doc_artifacts for select
  using (user_id = auth.uid());

create policy "Users can insert their own doc_artifacts"
  on doc_artifacts for insert
  with check (user_id = auth.uid());

create policy "Users can update their own doc_artifacts"
  on doc_artifacts for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users can delete their own doc_artifacts"
  on doc_artifacts for delete
  using (user_id = auth.uid());
