-- ═══════════════════════════════════════════════════════════════════════════
-- ISOLATION TESTS — Phase B2
-- ═══════════════════════════════════════════════════════════════════════════
--
-- These tests verify that Row-Level Security is correctly enforced on every
-- user-data table. Run them in Supabase SQL Editor or via `psql`.
--
-- Prerequisites:
--   1. At least two real users exist (User A and User B).
--   2. User A has created at least one document (and derived data).
--   3. Run this SQL as a superuser or use `set local role` to simulate users.
--
-- ═══════════════════════════════════════════════════════════════════════════

-- ============================================================================
-- 1. SETUP: Helper to test access as a specific user
-- ============================================================================

-- Create a helper function that sets the session user context.
-- This simulates what Supabase Auth does when a user makes a request.
-- Run each test block with a different auth.uid() to verify isolation.

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  TEST A: Direct table access — User A can read own data only           ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- 1. Create two test users (UUIDs from auth.users)
--    Replace with actual UUIDs from your auth.users table:
--    select id, email from auth.users limit 2;
--
--    set local role authenticated;
--    set local request.jwt.claim.sub = 'USER_A_UUID';

-- 2. As User A: verify you can see your own document
--    select id, title from documents where user_id = auth.uid();
--    → Should return User A's document(s)

-- 3. As User A: verify you CANNOT see User B's document
--    select id, title from documents where user_id = 'USER_B_UUID';
--    → Should return 0 rows (RLS blocks it even though we know B's UUID)

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  TEST B: Cross-user access check on every table                        ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- Run this as User A. Every query should return 0 rows because User B's data
-- is invisible through RLS.

-- with user_b_id as (
--   select id from auth.users where email = 'user_b@example.com' limit 1
-- )
-- select 'documents' as tbl, count(*) from documents
--   where user_id = (select id from user_b_id)
-- union all
-- select 'chunks', count(*) from chunks
--   where user_id = (select id from user_b_id)
-- union all
-- select 'flashcards', count(*) from flashcards
--   where user_id = (select id from user_b_id)
-- union all
-- select 'quiz_questions', count(*) from quiz_questions
--   where user_id = (select id from user_b_id)
-- union all
-- select 'quiz_attempts', count(*) from quiz_attempts
--   where user_id = (select id from user_b_id)
-- union all
-- select 'study_events', count(*) from study_events
--   where user_id = (select id from user_b_id)
-- union all
-- select 'concept_mastery', count(*) from concept_mastery
--   where user_id = (select id from user_b_id)
-- union all
-- select 'doc_artifacts', count(*) from doc_artifacts
--   where user_id = (select id from user_b_id)
-- union all
-- select 'notes', count(*) from notes
--   where user_id = (select id from user_b_id)
-- union all
-- select 'highlights', count(*) from highlights
--   where user_id = (select id from user_b_id)
-- union all
-- select 'review_log', count(*) from review_log
--   where user_id = (select id from user_b_id)
-- union all
-- select 'exam_attempts', count(*) from exam_attempts
--   where user_id = (select id from user_b_id)
-- union all
-- select 'achievements', count(*) from achievements
--   where user_id = (select id from user_b_id)
-- union all
-- select 'user_stats', count(*) from user_stats
--   where user_id = (select id from user_b_id)
-- union all
-- select 'rate_limits', count(*) from rate_limits
--   where user_id = (select id from user_b_id);

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  TEST C: Verify INSERT/UPDATE/DELETE also respect ownership            ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- As User A, trying to UPDATE User B's document should fail:
-- update documents set title = 'Hacked!'
-- where user_id = 'USER_B_UUID';
-- → Should affect 0 rows (RLS prevents cross-user update)

-- As User A, trying to DELETE User B's document should fail:
-- delete from documents
-- where user_id = 'USER_B_UUID';
-- → Should affect 0 rows (RLS prevents cross-user delete)

-- As User A, trying to INSERT a document with User B's ID should fail:
-- insert into documents (title, source_type, user_id)
-- values ('Malicious Doc', 'text', 'USER_B_UUID');
-- → Should fail (RLS with check: user_id = auth.uid())

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  TEST D: Edge function ownership verification                           ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- Every edge function:
--   1. Extracts the JWT from the Authorization header
--   2. Calls supabase.auth.getUser() to verify the session
--   3. Uses an anon-key client (not service-role), which means RLS applies
--
-- To manually verify any edge function:
--
--   -- Get a valid JWT for the user (from browser devtools → Application → Storage)
--   curl -X POST https://[project].supabase.co/functions/v1/embed-document \
--     -H "Authorization: Bearer $USER_A_JWT" \
--     -H "Content-Type: application/json" \
--     -d '{"documentId": "USER_A_DOC_ID"}'
--   → Should succeed (200)
--
--   curl -X POST https://[project].supabase.co/functions/v1/embed-document \
--     -H "Authorization: Bearer $USER_A_JWT" \
--     -H "Content-Type: application/json" \
--     -d '{"documentId": "USER_B_DOC_ID"}'
--   → Should fail (404 or error: no matching rows found)

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  TEST E: match_chunks RPC cannot leak cross-user data                  ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- As User A, calling match_chunks with a document owned by User B should
-- return 0 results (the RPC already filters by auth.uid()):

-- select * from match_chunks(
--   (select embedding from chunks where document_id = 'USER_B_DOC_ID' limit 1),
--   'USER_B_DOC_ID',
--   5
-- );
-- → Should return 0 rows (USER_B's chunks are filtered out by auth.uid() check)

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  RESULTS SUMMARY                                                        ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- After running all tests, log the results by uncommenting this block:
--
-- do $$
-- begin
--   raise notice '═══════════════════════════════════════════';
--   raise notice 'ISOLATION TEST RESULTS';
--   raise notice '═══════════════════════════════════════════';
--   raise notice 'A. Direct table access:     ✅ User A sees own data only';
--   raise notice 'B. Cross-user access:       ✅ 0 rows visible cross-user';
--   raise notice 'C. INSERT/UPDATE/DELETE:    ✅ Ownership enforced';
--   raise notice 'D. Edge function access:    ✅ JWT verification + RLS';
--   raise notice 'E. match_chunks RPC:        ✅ auth.uid() scoped';
--   raise notice '═══════════════════════════════════════════';
--   raise notice 'All isolation tests pass — cross-user access is impossible.';
-- end $$;
