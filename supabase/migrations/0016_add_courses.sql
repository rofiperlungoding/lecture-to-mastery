-- Migration 0016: Courses — group lectures into study courses
--
-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║  Courses let users group related lectures and study across all of   ║
-- ║  them (cross-document RAG, aggregate mastery, combined practice).   ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- ============================================================================
-- 1. courses
-- ============================================================================
create table if not exists courses (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade default auth.uid(),
  title       text        not null,
  description text        not null default '',
  created_at  timestamptz not null default now()
);

create index if not exists idx_courses_user_id on courses (user_id);

alter table courses enable row level security;

create policy "Users can view their own courses"
  on courses for select
  using (user_id = auth.uid());

create policy "Users can create their own courses"
  on courses for insert
  with check (user_id = auth.uid());

create policy "Users can update their own courses"
  on courses for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users can delete their own courses"
  on courses for delete
  using (user_id = auth.uid());

-- ============================================================================
-- 2. course_documents — membership join table
-- ============================================================================
create table if not exists course_documents (
  course_id    uuid not null references courses(id) on delete cascade,
  document_id  uuid not null references documents(id) on delete cascade,
  added_at     timestamptz not null default now(),
  primary key (course_id, document_id)
);

create index if not exists idx_course_documents_course on course_documents (course_id);
create index if not exists idx_course_documents_document on course_documents (document_id);

-- RLS: membership follows course ownership. Users can see/modify membership
-- rows for courses they own. We verify via the course's user_id.
alter table course_documents enable row level security;

create policy "Users can view course_documents for their own courses"
  on course_documents for select
  using (
    exists (
      select 1 from courses
      where courses.id = course_documents.course_id
        and courses.user_id = auth.uid()
    )
  );

create policy "Users can add documents to their own courses"
  on course_documents for insert
  with check (
    exists (
      select 1 from courses
      where courses.id = course_documents.course_id
        and courses.user_id = auth.uid()
    )
  );

create policy "Users can remove documents from their own courses"
  on course_documents for delete
  using (
    exists (
      select 1 from courses
      where courses.id = course_documents.course_id
        and courses.user_id = auth.uid()
    )
  );

-- No UPDATE on course_documents — membership is add/remove only.
create policy "No one can update course_documents"
  on course_documents for update
  using (false);

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- drop table if exists course_documents cascade;
-- drop table if exists courses cascade;
