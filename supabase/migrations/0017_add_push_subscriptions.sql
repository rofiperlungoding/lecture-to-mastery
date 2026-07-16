-- 0017: Push notification subscriptions for PWA daily reminders
-- Idempotent: each statement uses IF [NOT] EXISTS / OR REPLACE.

-- ── 1. push_subscriptions table ──────────────────────────────────────────

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh_key text not null,
  auth_key text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  unique(endpoint)
);

create index if not exists idx_push_subscriptions_user
  on push_subscriptions (user_id);

-- ── 2. Enable RLS ───────────────────────────────────────────────────────

alter table push_subscriptions enable row level security;

-- ── 3. RLS policies (user can only manage their own subscriptions) ───────

create policy "Users can view their own subscriptions"
  on push_subscriptions for select
  using (user_id = auth.uid());

create policy "Users can insert their own subscriptions"
  on push_subscriptions for insert
  with check (user_id = auth.uid());

create policy "Users can delete their own subscriptions"
  on push_subscriptions for delete
  using (user_id = auth.uid());

-- Only the service-role can send (edge functions), but the user owns CRUD.

-- ── Rollback ─────────────────────────────────────────────────────────────
-- drop table if exists push_subscriptions;
-- drop index if exists idx_push_subscriptions_user;
