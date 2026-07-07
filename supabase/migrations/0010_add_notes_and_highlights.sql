-- Migration: Add personal notes and highlights tables

-- Notes: per-document personal notes
create table if not exists notes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade default auth.uid(),
  document_id uuid not null references documents(id) on delete cascade,
  body        text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_notes_user_id on notes (user_id);
create index if not exists idx_notes_document_id on notes (document_id);

-- Highlights: saved text selections from document content
create table if not exists highlights (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade default auth.uid(),
  document_id uuid not null references documents(id) on delete cascade,
  quote       text not null,
  note        text not null default '',
  created_at  timestamptz not null default now()
);

create index if not exists idx_highlights_user_id on highlights (user_id);
create index if not exists idx_highlights_document_id on highlights (document_id);

-- RLS for notes
alter table notes enable row level security;

create policy "Users can view their own notes"
  on notes for select
  using (user_id = auth.uid());

create policy "Users can insert their own notes"
  on notes for insert
  with check (user_id = auth.uid());

create policy "Users can update their own notes"
  on notes for update
  using (user_id = auth.uid());

create policy "Users can delete their own notes"
  on notes for delete
  using (user_id = auth.uid());

-- RLS for highlights
alter table highlights enable row level security;

create policy "Users can view their own highlights"
  on highlights for select
  using (user_id = auth.uid());

create policy "Users can insert their own highlights"
  on highlights for insert
  with check (user_id = auth.uid());

create policy "Users can update their own highlights"
  on highlights for update
  using (user_id = auth.uid());

create policy "Users can delete their own highlights"
  on highlights for delete
  using (user_id = auth.uid());
