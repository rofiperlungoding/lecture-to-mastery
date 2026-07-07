-- Migration: Practice exam attempts with topic-level tracking

create table if not exists exam_attempts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade default auth.uid(),
  doc_ids     jsonb not null default '[]'::jsonb,
  score       int not null default 0,
  total       int not null default 0,
  per_topic   jsonb not null default '[]'::jsonb,
  taken_at    timestamptz not null default now()
);

create index if not exists idx_exam_attempts_user_id on exam_attempts (user_id);
create index if not exists idx_exam_attempts_taken_at on exam_attempts (taken_at desc);

alter table exam_attempts enable row level security;

create policy "Users can view their own exam_attempts"
  on exam_attempts for select
  using (user_id = auth.uid());

create policy "Users can insert their own exam_attempts"
  on exam_attempts for insert
  with check (user_id = auth.uid());

create policy "Users can update their own exam_attempts"
  on exam_attempts for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users can delete their own exam_attempts"
  on exam_attempts for delete
  using (user_id = auth.uid());
