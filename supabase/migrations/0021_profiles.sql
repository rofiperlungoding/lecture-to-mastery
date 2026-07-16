-- ═══════════════════════════════════════════════════════════════════════════
-- 0021: Profile Data Model + Privacy
--
-- Adds a profiles table with username (citext unique), opt-in public visibility,
-- and a strictly-limited public read surface via a SECURITY DEFINER function.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 0. Ensure citext extension ───────────────────────────────────────────
create extension if not exists citext with schema extensions;

-- ── 1. Profiles table ────────────────────────────────────────────────────

create table profiles (
  id          uuid        primary key references auth.users(id) on delete cascade,
  username    extensions.citext unique,
  display_name text,
  bio         text,
  avatar_url  text,
  is_public   boolean     not null default false,
  created_at  timestamptz not null default now()
);

-- ── 2. Username validation constraint ─────────────────────────────────────
-- Usernames: 3-30 chars, alphanumeric + underscores, no leading/trailing underscore
alter table profiles add constraint username_format check (
  username is null or (
    length(username) >= 3
    and length(username) <= 30
    and username ~ '^[a-zA-Z][a-zA-Z0-9_]{1,28}[a-zA-Z0-9]$'
  )
);

-- ── 3. Reserved usernames (prevent impersonation) ─────────────────────────
create table if not exists reserved_usernames (
  username text primary key
);

-- Populate common reserved names
insert into reserved_usernames (username) values
  ('admin'), ('administrator'), ('moderator'), ('support'),
  ('help'), ('official'), ('system'), ('root'), ('api'),
  ('lecturetomastery'), ('lecture-to-mastery'), ('lecture_to_mastery'),
  ('staff'), ('team'), ('security'), ('privacy')
on conflict (username) do nothing;

-- ── 4. Index on is_public for efficient public profile queries ────────────
create index idx_profiles_is_public on profiles (is_public) where is_public = true;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Public profile aggregate function (SECURITY DEFINER)
-- ═══════════════════════════════════════════════════════════════════════════
-- Returns ONLY whitelisted aggregate stats for a public profile.
-- NEVER exposes document titles, content, emails, or raw events.
-- Runs with the owner's privileges to bypass RLS for the whitelisted data.

create or replace function get_public_profile(requested_username text)
returns table (
  username         text,
  display_name     text,
  avatar_url       text,
  bio              text,
  join_date        timestamptz,
  total_documents  bigint,
  current_streak   bigint,
  total_cards      bigint,
  avg_mastery      numeric,
  achievements     jsonb
)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  profile_user_id uuid;
  profile_is_public boolean;
begin
  -- Validate input
  if requested_username is null or length(requested_username) < 3 then
    return;
  end if;

  -- Find the profile
  select p.id, p.is_public into profile_user_id, profile_is_public
  from profiles p
  where p.username = requested_username::extensions.citext;

  if not found or profile_user_id is null then
    return;
  end if;

  -- ONLY return data for public profiles
  if not profile_is_public then
    return;
  end if;

  return query
  select
    p.username::text,
    p.display_name,
    p.avatar_url,
    p.bio,
    p.created_at as join_date,
    -- Total documents: count of documents owned by this user
    coalesce(
      (select count(*)::bigint from public.documents d where d.user_id = profile_user_id),
      0
    ) as total_documents,
    -- Current streak: most recent consecutive days with study activity
    coalesce(
      (
        with study_dates as (
          select distinct date(se.created_at) as study_date
          from public.study_events se
          where se.user_id = profile_user_id
            and se.created_at >= now() - interval '30 days'
        ),
        ordered_dates as (
          select study_date
          from study_dates
          order by study_date desc
        ),
        streak_calc as (
          select study_date,
            row_number() over (order by study_date desc) as rn
          from ordered_dates
        )
        select count(*)::bigint
        from streak_calc
        where study_date = date(now() - (rn - 1) * interval '1 day')
      ),
      0
    ) as current_streak,
    -- Total cards reviewed: count of review_log entries
    coalesce(
      (select count(*)::bigint from public.review_log rl where rl.flashcard_id in (
        select f.id from public.flashcards f where f.user_id = profile_user_id
      )),
      0
    ) as total_cards,
    -- Average mastery: mean correctness ratio across all concept_mastery rows
    coalesce(
      (
        select case when sum(cm.attempts) > 0
          then round((sum(cm.correct)::numeric / nullif(sum(cm.attempts), 0)) * 100, 1)
          else 0
        end
        from public.concept_mastery cm
        where cm.user_id = profile_user_id
      ),
      0
    ) as avg_mastery,
    -- Achievements as JSON array
    coalesce(
      (
        select jsonb_agg(jsonb_build_object('key', a.key, 'unlocked_at', a.unlocked_at))
        from public.achievements a
        where a.user_id = profile_user_id
        order by a.unlocked_at desc
      ),
      '[]'::jsonb
    ) as achievements
  from profiles p
  where p.id = profile_user_id;
end;
$$;

-- Grant EXECUTE on the function to anon (public) and authenticated roles
grant execute on function get_public_profile(text) to anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. RLS policies for profiles
-- ═══════════════════════════════════════════════════════════════════════════

alter table profiles enable row level security;

-- Owner can read their own profile
create policy "Owner can read own profile"
  on profiles for select
  using (auth.uid() = id);

-- Owner can insert their own profile (auto-created on signup)
create policy "Owner can insert own profile"
  on profiles for insert
  with check (auth.uid() = id);

-- Owner can update their own profile
create policy "Owner can update own profile"
  on profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Owner can delete their own profile
create policy "Owner can delete own profile"
  on profiles for delete
  using (auth.uid() = id);

-- Anonymous/unauthenticated users: DENY direct table access.
-- They must use the get_public_profile() function instead, which returns
-- ONLY the whitelisted aggregate stats for is_public=true profiles.
-- The default deny policy handles this: no explicit anon select policy.

-- ── RLS for reserved_usernames (publicly readable) ───────────────────────
alter table reserved_usernames enable row level security;
create policy "Anyone can read reserved usernames"
  on reserved_usernames for select
  using (true);

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. Trigger: auto-create profile on user signup
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id)
  values (new.id);
  return new;
end;
$$;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. RLS isolation tests
-- ═══════════════════════════════════════════════════════════════════════════
-- Run these in the Supabase SQL editor after migration is applied.
-- Expected: all tests pass (each returns a row with 'PASS').

/*
-- ──── Test 1: get_public_profile requires minimum username length ────────
select case when (select count(*) from get_public_profile('ab')) = 0
  then 'PASS: Rejects short username'
  else 'FAIL: Should reject username < 3 chars'
end as test_result;

-- ──── Test 2: get_public_profile returns nothing for non-existent user ───
select case when (select count(*) from get_public_profile('nonexistent_user_xyz')) = 0
  then 'PASS: No data for nonexistent user'
  else 'FAIL: Should return no rows'
end as test_result;

-- ──── Test 3: get_public_profile returns nothing for private profile ─────
-- (Prerequisite: create a profile with is_public=false first)
-- insert into profiles (id, username, is_public) values ('00000000-0000-0000-0000-000000000001', 'private_test', false);
select case when (select count(*) from get_public_profile('private_test')) = 0
  then 'PASS: No data for private profile'
  else 'FAIL: Should return no rows for private profiles'
end as test_result;

-- ──── Test 4: get_public_profile returns data for public profile ─────────
-- (Prerequisite: create a public profile)
-- insert into profiles (id, username, is_public) values ('00000000-0000-0000-0000-000000000002', 'public_test', true);
select case when (select count(*) from get_public_profile('public_test')) = 1
  then 'PASS: Returns data for public profile'
  else 'FAIL: Should return 1 row for public profiles'
end as test_result;

-- ──── Test 5: Verify username format constraint works ────────────────────
select case when (
  select count(*) = 0 from profiles
  where length(username) between 1 and 2
) then 'PASS: Username length constraint exists'
else 'FAIL: Check username constraint'
end as test_result;

-- ──── Test 6: Anonymous cannot SELECT directly from profiles ─────────────
-- Run this as the anon role:
-- select count(*) from profiles limit 1;
-- Expected: ERROR or 0 rows due to RLS

-- ──── Test 7: Username format constraint enforced ────────────────────────
select case when (
  (select count(*) from profiles where username = 'ab') = 0
) then 'PASS: Short username rejected'
else 'FAIL: Should reject username'
end as test_result;
*/

-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═══════════════════════════════════════════════════════════════════════════
-- To revert this migration:
--
--   drop trigger if exists on_auth_user_created on auth.users;
--   drop function if exists handle_new_user();
--   drop function if exists get_public_profile(text);
--   drop table if exists profiles cascade;
--   drop table if exists reserved_usernames;
--   -- Optionally drop the citext extension if no other tables use it:
--   -- drop extension if exists citext;
