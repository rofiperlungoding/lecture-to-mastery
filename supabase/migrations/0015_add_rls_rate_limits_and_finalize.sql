-- Migration 0015: Finalize RLS coverage + ownership backfill
--
-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║  PHASE B2: Row-Level Security + Data Ownership                      ║
-- ║                                                                     ║
-- ║  Earlier migrations (0003, 0005–0013) already added user_id columns ║
-- ║  and RLS to most tables. This migration fills the remaining gap     ║
-- ║  (rate_limits) and provides ownership audit/backfill utilities.     ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- ============================================================================
-- 1. RLS for rate_limits
-- ============================================================================

-- rate_limits is queried/written only by edge functions using the user's JWT
-- (anon client). Without RLS, any authenticated user could read another user's
-- rate-limit data. Add RLS to close this gap.
alter table if exists rate_limits enable row level security;

create policy "Users can view their own rate limits"
  on rate_limits for select
  using (user_id = auth.uid());

create policy "Users can insert their own rate limits"
  on rate_limits for insert
  with check (user_id = auth.uid());

create policy "Rate limits rows are immutable (no update)"
  on rate_limits for update
  using (false);

create policy "Rate limits are managed by the system (no delete)"
  on rate_limits for delete
  using (false);

-- ============================================================================
-- 2. RLS coverage verification (run after migration to confirm completeness)
-- ============================================================================

-- This query lists every table that SHOULD have RLS and its status.
-- Expected: all rows show relrowsecurity = true.
--
-- select
--   c.oid::regclass::text as table_name,
--   c.relrowsecurity as rls_enabled
-- from pg_class c
-- join pg_namespace n on n.oid = c.relnamespace
-- where n.nspname = 'public'
--   and c.relkind = 'r'  -- ordinary tables only (not views, etc.)
--   and c.relname <> 'spatial_ref_sys'  -- exclude postgis metadata
--   and c.relname not like 'pg_%'
--   and c.relname not like '_prisma_%'
-- order by c.relname;

-- ============================================================================
-- 3. Ownership backfill (SAFE — DRY-RUN FIRST)
-- ============================================================================
--
-- ⚠️  BEFORE RUNNING THE BACKFILL, run the dry-run query below to see how many
--     rows would be affected.
--
-- ──── DRY-RUN: count orphan rows ──────────────────────────────────────────
-- Run this first to check for any rows missing user_id:
--
-- select 'documents' as tbl, count(*) from documents where user_id is null
-- union all
-- select 'chunks', count(*) from chunks where user_id is null
-- union all
-- select 'flashcards', count(*) from flashcards where user_id is null
-- union all
-- select 'quiz_questions', count(*) from quiz_questions where user_id is null
-- union all
-- select 'quiz_attempts', count(*) from quiz_attempts where user_id is null
-- union all
-- select 'study_events', count(*) from study_events where user_id is null
-- union all
-- select 'concept_mastery', count(*) from concept_mastery where user_id is null
-- union all
-- select 'doc_artifacts', count(*) from doc_artifacts where user_id is null
-- union all
-- select 'notes', count(*) from notes where user_id is null
-- union all
-- select 'highlights', count(*) from highlights where user_id is null
-- union all
-- select 'review_log', count(*) from review_log where user_id is null
-- union all
-- select 'exam_attempts', count(*) from exam_attempts where user_id is null
-- union all
-- select 'achievements', count(*) from achievements where user_id is null
-- union all
-- select 'user_stats', count(*) from user_stats where user_id is null
-- union all
-- select 'rate_limits', count(*) from rate_limits where user_id is null;
--
-- ──── BACKFILL ─────────────────────────────────────────────────────────────
-- This assigns any orphan rows to the oldest real (non-anonymous) user.
-- Safe to re-run: idempotent.
--
-- do $$
-- declare
--   owner_id uuid;
-- begin
--   -- Pick the first non-anonymous auth user as the owner of orphan data
--   select id into owner_id
--   from auth.users
--   where email is not null  -- real users have email; anonymous users don't
--   order by created_at asc
--   limit 1;
--
--   if owner_id is null then
--     raise notice 'No real user found — orphan rows will remain unowned.';
--     return;
--   end if;
--
--   update documents       set user_id = owner_id where user_id is null;
--   update chunks          set user_id = owner_id where user_id is null;
--   update flashcards      set user_id = owner_id where user_id is null;
--   update quiz_questions  set user_id = owner_id where user_id is null;
--   update quiz_attempts   set user_id = owner_id where user_id is null;
--   update study_events    set user_id = owner_id where user_id is null;
--   update concept_mastery set user_id = owner_id where user_id is null;
--   update doc_artifacts   set user_id = owner_id where user_id is null;
--   update notes           set user_id = owner_id where user_id is null;
--   update highlights      set user_id = owner_id where user_id is null;
--   update review_log      set user_id = owner_id where user_id is null;
--   update exam_attempts   set user_id = owner_id where user_id is null;
--   update achievements    set user_id = owner_id where user_id is null;
--   update user_stats      set user_id = owner_id where user_id is null;
--   update rate_limits     set user_id = owner_id where user_id is null;
--
--   raise notice 'Backfill complete. All orphan rows assigned to user %', owner_id;
-- end $$;

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- To revert this migration:
--
-- 1. Drop RLS policies on rate_limits:
--    drop policy if exists "Users can view their own rate limits" on rate_limits;
--    drop policy if exists "Users can insert their own rate limits" on rate_limits;
--    drop policy if exists "Rate limits rows are immutable (no update)" on rate_limits;
--    drop policy if exists "Rate limits are managed by the system (no delete)" on rate_limits;
--    alter table if exists rate_limits disable row level security;
--
-- 2. No schema changes were made — no table alterations to revert.
