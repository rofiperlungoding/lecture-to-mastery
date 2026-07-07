-- 0005: Progress tracking tables for dashboard metrics
-- Idempotent: each statement uses IF [NOT] EXISTS / OR REPLACE.

-- ── 1. Review log for flashcard SM-2 ratings ────────────────────────────

create table if not exists review_log (
  id uuid primary key default gen_random_uuid(),
  flashcard_id uuid not null references flashcards(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  rating text not null check (rating in ('again', 'hard', 'good', 'easy')),
  reviewed_at timestamptz not null default now()
);

create index if not exists idx_review_log_flashcard
  on review_log (flashcard_id, reviewed_at desc);

create index if not exists idx_review_log_user
  on review_log (user_id, reviewed_at desc);

-- ── 2. Quiz attempt history ─────────────────────────────────────────────

create table if not exists quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  score int not null,
  total int not null,
  completed_at timestamptz not null default now()
);

create index if not exists idx_quiz_attempts_doc
  on quiz_attempts (document_id, completed_at desc);

create index if not exists idx_quiz_attempts_user
  on quiz_attempts (user_id, completed_at desc);

-- ── 3. Enable RLS ───────────────────────────────────────────────────────

alter table review_log enable row level security;
alter table quiz_attempts enable row level security;

-- ── 4. RLS policies (user can only see/modify their own rows) ────────────

create policy "Users can view their own review_log"
  on review_log for select
  using (user_id = auth.uid());

create policy "Users can insert their own review_log"
  on review_log for insert
  with check (user_id = auth.uid());

create policy "Users can view their own quiz_attempts"
  on quiz_attempts for select
  using (user_id = auth.uid());

create policy "Users can insert their own quiz_attempts"
  on quiz_attempts for insert
  with check (user_id = auth.uid());
