-- Migration: Gamification (XP, streaks, achievements)

-- ============================================================================
-- Table: user_stats
-- ============================================================================
create table if not exists user_stats (
  user_id    uuid primary key references auth.users(id) on delete cascade default auth.uid(),
  xp         int not null default 0,
  level      int not null default 1,
  current_streak int not null default 0,
  longest_streak int not null default 0,
  last_active    date
);

create index if not exists idx_user_stats_user_id on user_stats (user_id);

alter table user_stats enable row level security;

-- Per-user RLS policies for user_stats
create policy "Users can view their own stats"
  on user_stats for select
  using (user_id = auth.uid());

create policy "Users can insert their own stats"
  on user_stats for insert
  with check (user_id = auth.uid());

create policy "Users can update their own stats"
  on user_stats for update
  using (user_id = auth.uid());

create policy "Users can delete their own stats"
  on user_stats for delete
  using (user_id = auth.uid());

-- ============================================================================
-- Table: achievements
-- ============================================================================
create table if not exists achievements (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade default auth.uid(),
  key         text not null,
  unlocked_at timestamptz not null default now()
);

create index if not exists idx_achievements_user_id on achievements (user_id);
create unique index if not exists idx_achievements_user_key on achievements (user_id, key);

alter table achievements enable row level security;

-- Per-user RLS policies for achievements
create policy "Users can view their own achievements"
  on achievements for select
  using (user_id = auth.uid());

create policy "Users can insert their own achievements"
  on achievements for insert
  with check (user_id = auth.uid());

create policy "Users can update their own achievements"
  on achievements for update
  using (user_id = auth.uid());

create policy "Users can delete their own achievements"
  on achievements for delete
  using (user_id = auth.uid());
