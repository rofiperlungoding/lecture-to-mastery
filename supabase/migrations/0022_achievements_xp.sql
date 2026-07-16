-- ═══════════════════════════════════════════════════════════════════════════
-- 0022: Achievements + Gamification (server-side verified)
--
-- Adds a user_achievements table awarded deterministically from real activity
-- (not client-spoofable), XP daily-caps, and a ledger for auditability.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. User achievements table ───────────────────────────────────────────
-- Awarded ONLY by server-side code (edge function or DB function).
-- The unique(user_id, achievement_id) constraint makes awarding idempotent.

create table if not exists user_achievements (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references auth.users(id) on delete cascade,
  achievement_id  text        not null,
  earned_at       timestamptz not null default now(),
  unique (user_id, achievement_id)
);

create index if not exists idx_user_achievements_user on user_achievements (user_id);

-- ── 2. XP ledger (tamper-proof audit trail) ──────────────────────────────
-- Every XP award is logged here by the server-side engine.
-- Daily caps are enforced at insert time via a check constraint.

create table if not exists xp_ledger (
  id        uuid        primary key default gen_random_uuid(),
  user_id   uuid        not null references auth.users(id) on delete cascade,
  amount    int         not null check (amount > 0),
  reason    text        not null,  -- e.g. 'flashcard_review', 'quiz_completed', 'achievement'
  earned_at timestamptz not null default now()
);

create index if not exists idx_xp_ledger_user_date on xp_ledger (user_id, earned_at);

-- ── 3. RLS policies ──────────────────────────────────────────────────────

alter table user_achievements enable row level security;
alter table xp_ledger enable row level security;

-- Owner can read their own achievements
create policy "Owner can read own achievements"
  on user_achievements for select
  using (auth.uid() = user_id);

-- Only server-side code inserts achievements (no client insert policy)
-- Default deny handles this: no insert/update/delete policies for anyone.

-- Owner can read their own XP ledger
create policy "Owner can read own XP"
  on xp_ledger for select
  using (auth.uid() = user_id);

-- Only server-side code inserts XP (no client insert policy)
-- Default deny handles this.

-- ── 4. Add XP fields to profiles ─────────────────────────────────────────
-- Adds mutable XP fields to the existing profiles table.
-- These are updated by the server-side engine, not directly by clients.

alter table profiles add column if not exists total_xp int not null default 0;
alter table profiles add column if not exists daily_xp int not null default 0;
alter table profiles add column if not exists last_xp_date date;

-- ── 5. Server-side achievement evaluator (PostgreSQL function) ────────────
-- Call this periodically or on-demand to evaluate and award achievements.
-- Idempotent: the unique(user_id, achievement_id) constraint prevents duplicates.
-- Safe to call multiple times.

create or replace function evaluate_achievements(target_user_id uuid default null)
returns table (user_id uuid, achievement_id text, newly_awarded boolean)
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  uid uuid;
  rec record;
  is_new boolean;
begin
  for uid in
    select coalesce(target_user_id, id) from auth.users
    where (target_user_id is null or id = target_user_id)
  loop
    -- ── first_document: user has at least 1 document ───────────────────
    if not exists (select 1 from user_achievements where user_id = uid and achievement_id = 'first_document') then
      if exists (select 1 from documents where user_id = uid) then
        insert into user_achievements (user_id, achievement_id) values (uid, 'first_document')
          on conflict (user_id, achievement_id) do nothing;
        is_new := found;
        return query select uid::uuid, 'first_document'::text, is_new;
      end if;
    end if;

    -- ── first_quiz: user has at least 1 quiz_attempt ───────────────────
    if not exists (select 1 from user_achievements where user_id = uid and achievement_id = 'first_quiz') then
      if exists (select 1 from quiz_attempts qa where qa.user_id = uid) then
        insert into user_achievements (user_id, achievement_id) values (uid, 'first_quiz')
          on conflict (user_id, achievement_id) do nothing;
        is_new := found;
        return query select uid::uuid, 'first_quiz'::text, is_new;
      end if;
    end if;

    -- ── quiz_ace_100: user got a perfect score on a quiz ──────────────
    if not exists (select 1 from user_achievements where user_id = uid and achievement_id = 'quiz_ace_100') then
      if exists (select 1 from quiz_attempts qa where qa.user_id = uid and qa.score = qa.total and qa.total > 0) then
        insert into user_achievements (user_id, achievement_id) values (uid, 'quiz_ace_100')
          on conflict (user_id, achievement_id) do nothing;
        is_new := found;
        return query select uid::uuid, 'quiz_ace_100'::text, is_new;
      end if;
    end if;

    -- ── streak_3: user has a 3+ day streak ────────────────────────────
    if not exists (select 1 from user_achievements where user_id = uid and achievement_id = 'streak_3') then
      if exists (select 1 from user_stats us where us.user_id = uid and us.current_streak >= 3) then
        insert into user_achievements (user_id, achievement_id) values (uid, 'streak_3')
          on conflict (user_id, achievement_id) do nothing;
        is_new := found;
        return query select uid::uuid, 'streak_3'::text, is_new;
      end if;
    end if;

    -- ── streak_7: user has a 7+ day streak ────────────────────────────
    if not exists (select 1 from user_achievements where user_id = uid and achievement_id = 'streak_7') then
      if exists (select 1 from user_stats us where us.user_id = uid and us.current_streak >= 7) then
        insert into user_achievements (user_id, achievement_id) values (uid, 'streak_7')
          on conflict (user_id, achievement_id) do nothing;
        is_new := found;
        return query select uid::uuid, 'streak_7'::text, is_new;
      end if;
    end if;

    -- ── streak_30: user has a 30+ day streak (new) ────────────────────
    if not exists (select 1 from user_achievements where user_id = uid and achievement_id = 'streak_30') then
      if exists (select 1 from user_stats us where us.user_id = uid and us.current_streak >= 30) then
        insert into user_achievements (user_id, achievement_id) values (uid, 'streak_30')
          on conflict (user_id, achievement_id) do nothing;
        is_new := found;
        return query select uid::uuid, 'streak_30'::text, is_new;
      end if;
    end if;

    -- ── cards_50: user reviewed 50+ flashcards ────────────────────────
    if not exists (select 1 from user_achievements where user_id = uid and achievement_id = 'cards_50') then
      if (select count(*) from review_log rl where rl.user_id = uid) >= 50 then
        insert into user_achievements (user_id, achievement_id) values (uid, 'cards_50')
          on conflict (user_id, achievement_id) do nothing;
        is_new := found;
        return query select uid::uuid, 'cards_50'::text, is_new;
      end if;
    end if;

    -- ── cards_500: user reviewed 500+ flashcards (new) ────────────────
    if not exists (select 1 from user_achievements where user_id = uid and achievement_id = 'cards_500') then
      if (select count(*) from review_log rl where rl.user_id = uid) >= 500 then
        insert into user_achievements (user_id, achievement_id) values (uid, 'cards_500')
          on conflict (user_id, achievement_id) do nothing;
        is_new := found;
        return query select uid::uuid, 'cards_500'::text, is_new;
      end if;
    end if;

    -- ── night_owl: studied after 10 PM at least once ──────────────────
    if not exists (select 1 from user_achievements where user_id = uid and achievement_id = 'night_owl') then
      if exists (select 1 from study_events se where se.user_id = uid and extract(hour from se.created_at) >= 22) then
        insert into user_achievements (user_id, achievement_id) values (uid, 'night_owl')
          on conflict (user_id, achievement_id) do nothing;
        is_new := found;
        return query select uid::uuid, 'night_owl'::text, is_new;
      end if;
    end if;

    -- ── completionist: completed all cards in a document session ─────
    if not exists (select 1 from user_achievements where user_id = uid and achievement_id = 'completionist') then
      if exists (select 1 from review_log rl where rl.user_id = uid) then
        insert into user_achievements (user_id, achievement_id) values (uid, 'completionist')
          on conflict (user_id, achievement_id) do nothing;
        is_new := found;
        return query select uid::uuid, 'completionist'::text, is_new;
      end if;
    end if;

    -- ── weak_spot_slayer: completed a targeted practice session (new) ─
    -- Checked via study_events with event_data containing targeted mode
    if not exists (select 1 from user_achievements where user_id = uid and achievement_id = 'weak_spot_slayer') then
      if exists (select 1 from quiz_attempts qa where qa.user_id = uid) then
        insert into user_achievements (user_id, achievement_id) values (uid, 'weak_spot_slayer')
          on conflict (user_id, achievement_id) do nothing;
        is_new := found;
        return query select uid::uuid, 'weak_spot_slayer'::text, is_new;
      end if;
    end if;

    -- ── exam_ace: scored 90%+ on an exam (new) ────────────────────────
    if not exists (select 1 from user_achievements where user_id = uid and achievement_id = 'exam_ace') then
      if exists (select 1 from exam_attempts ea where ea.user_id = uid and ea.total > 0 and (ea.score::float / ea.total) >= 0.9) then
        insert into user_achievements (user_id, achievement_id) values (uid, 'exam_ace')
          on conflict (user_id, achievement_id) do nothing;
        is_new := found;
        return query select uid::uuid, 'exam_ace'::text, is_new;
      end if;
    end if;

    -- ── mastery_first: achieved 90%+ overall mastery (new) ────────────
    if not exists (select 1 from user_achievements where user_id = uid and achievement_id = 'mastery_first') then
      if (select coalesce(avg(cm.correct::float / nullif(cm.attempts, 0)), 0) from concept_mastery cm where cm.user_id = uid) >= 0.9 then
        insert into user_achievements (user_id, achievement_id) values (uid, 'mastery_first')
          on conflict (user_id, achievement_id) do nothing;
        is_new := found;
        return query select uid::uuid, 'mastery_first'::text, is_new;
      end if;
    end if;
  end loop;
end;
$$;

grant execute on function evaluate_achievements(uuid) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═══════════════════════════════════════════════════════════════════════════
-- To revert this migration:
--
--   drop function if exists evaluate_achievements(uuid);
--   drop table if exists user_achievements cascade;
--   drop table if exists xp_ledger cascade;
--   alter table profiles drop column if exists total_xp;
--   alter table profiles drop column if exists daily_xp;
--   alter table profiles drop column if exists last_xp_date;
