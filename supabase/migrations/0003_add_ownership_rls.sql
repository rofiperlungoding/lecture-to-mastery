-- 0003: Per-row ownership + Row-Level Security
-- This migration is idempotent: each statement uses IF [NOT] EXISTS / OR REPLACE.

-- ── 1. Add user_id columns (nullable first) ──────────────────────────────

alter table documents
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

alter table chunks
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

alter table flashcards
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

alter table quiz_questions
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

-- ── 2. Backfill existing rows ────────────────────────────────────────────
-- This is a fresh hackathon DB. Any existing rows lacking a user_id are
-- orphan demo rows. We assign them to a sentinel user so they remain
-- visible to future admin queries. For production, you would DELETE them
-- or link them to the first real admin.
-- We use a sub-select to find the first real or anonymous user, or fall
-- back to a well-known UUID if no users exist yet.

do $$
declare
  demo_owner uuid;
begin
  -- Pick the oldest existing auth user, or use a placeholder
  select id into demo_owner from auth.users order by created_at asc limit 1;

  if demo_owner is null then
    demo_owner := '00000000-0000-0000-0000-000000000000'::uuid;
  end if;

  update documents set user_id = demo_owner where user_id is null;
  update chunks    set user_id = demo_owner where user_id is null;
  update flashcards set user_id = demo_owner where user_id is null;
  update quiz_questions set user_id = demo_owner where user_id is null;
end $$;

-- ── 3. Make user_id NOT NULL and set default ────────────────────────────

alter table documents
  alter column user_id set not null,
  alter column user_id set default auth.uid();

alter table chunks
  alter column user_id set not null,
  alter column user_id set default auth.uid();

alter table flashcards
  alter column user_id set not null,
  alter column user_id set default auth.uid();

alter table quiz_questions
  alter column user_id set not null,
  alter column user_id set default auth.uid();

-- ── 4. Indexes on user_id ───────────────────────────────────────────────

create index if not exists idx_documents_user_id on documents (user_id);
create index if not exists idx_chunks_user_id on chunks (user_id);
create index if not exists idx_flashcards_user_id on flashcards (user_id);
create index if not exists idx_quiz_questions_user_id on quiz_questions (user_id);

-- ── 5. Enable RLS on every table ────────────────────────────────────────

alter table documents     enable row level security;
alter table chunks        enable row level security;
alter table flashcards    enable row level security;
alter table quiz_questions enable row level security;

-- ── 6. RLS policies (one policy per operation per table) ─────────────────

-- Documents
create policy "Users can view their own documents"
  on documents for select
  using (user_id = auth.uid());

create policy "Users can insert their own documents"
  on documents for insert
  with check (user_id = auth.uid());

create policy "Users can update their own documents"
  on documents for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users can delete their own documents"
  on documents for delete
  using (user_id = auth.uid());

-- Chunks
create policy "Users can view their own chunks"
  on chunks for select
  using (user_id = auth.uid());

create policy "Users can insert their own chunks"
  on chunks for insert
  with check (user_id = auth.uid());

create policy "Users can update their own chunks"
  on chunks for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users can delete their own chunks"
  on chunks for delete
  using (user_id = auth.uid());

-- Flashcards
create policy "Users can view their own flashcards"
  on flashcards for select
  using (user_id = auth.uid());

create policy "Users can insert their own flashcards"
  on flashcards for insert
  with check (user_id = auth.uid());

create policy "Users can update their own flashcards"
  on flashcards for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users can delete their own flashcards"
  on flashcards for delete
  using (user_id = auth.uid());

-- Quiz Questions
create policy "Users can view their own quiz_questions"
  on quiz_questions for select
  using (user_id = auth.uid());

create policy "Users can insert their own quiz_questions"
  on quiz_questions for insert
  with check (user_id = auth.uid());

create policy "Users can update their own quiz_questions"
  on quiz_questions for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users can delete their own quiz_questions"
  on quiz_questions for delete
  using (user_id = auth.uid());

-- ── 7. Update match_chunks RPC ──────────────────────────────────────────
-- Add user_id filter so similarity search is scoped to the caller's chunks.

drop function if exists match_chunks(vector(1024), uuid, int);

create function match_chunks(
  query_embedding vector(1024),
  doc_id uuid,
  match_count int default 5
)
returns table (id uuid, content text, chunk_index int, similarity float)
language sql stable
as $$
  select
    id,
    content,
    chunk_index,
    1 - (embedding <=> query_embedding) as similarity
  from chunks
  where document_id = doc_id
    and user_id = auth.uid()
  order by embedding <=> query_embedding
  limit match_count;
$$;
