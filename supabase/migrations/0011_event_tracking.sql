-- Migration 0011: Event tracking + mastery model
-- Tables: study_events, concept_mastery
-- Column: quiz_questions.concept

-- ============================================================================
-- 1. study_events — fire-and-forget event log for analytics
-- ============================================================================
create table if not exists study_events (
  id          uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade default auth.uid(),
  event_type  text not null check (event_type in (
    'quiz_answer', 'quiz_completed', 'flashcard_review', 'summary_view', 'chat_query'
  )),
  event_data  jsonb not null default '{}',
  created_at  timestamptz not null default now()
);

create index if not exists idx_study_events_doc_created
  on study_events (document_id, created_at);

create index if not exists idx_study_events_type
  on study_events (event_type);

-- RLS: users see only their own events
alter table study_events enable row level security;

create policy "Users can view their own study events"
  on study_events for select
  using (user_id = auth.uid());

create policy "Users can insert their own study events"
  on study_events for insert
  with check (user_id = auth.uid());

-- ============================================================================
-- 2. concept_mastery — per-document, per-concept rollup
-- ============================================================================
create table if not exists concept_mastery (
  id          uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade default auth.uid(),
  concept     text not null,
  attempts    int not null default 0,
  correct     int not null default 0,
  last_seen   timestamptz,
  unique (document_id, user_id, concept)
);

-- RLS for concept_mastery
alter table concept_mastery enable row level security;

create policy "Users can view their own concept mastery"
  on concept_mastery for select
  using (user_id = auth.uid());

create policy "Users can upsert their own concept mastery"
  on concept_mastery for insert
  with check (user_id = auth.uid());

create policy "Users can update their own concept mastery"
  on concept_mastery for update
  using (user_id = auth.uid());

-- ============================================================================
-- 3. Add concept column to quiz_questions
-- ============================================================================
alter table quiz_questions
  add column if not exists concept text not null default '';
