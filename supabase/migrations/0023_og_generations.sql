-- ═══════════════════════════════════════════════════════════════════════════
-- 0023: OG Image Generation Tracking (rate limiting)
--
-- Tracks OG image generations for abuse prevention.
-- Queried by the og-image Supabase Edge Function to enforce per-user
-- rate limits (max 10 generations per user per hour).
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists og_generations (
  id            uuid        primary key default gen_random_uuid(),
  user_id       text        not null,   -- username (string identifier)
  generated_at  timestamptz not null default now()
);

-- Index for rate-limit queries: "count generations per user in last hour"
create index if not exists idx_og_generations_user_time
  on og_generations (user_id, generated_at);

-- Auto-clean old records (keep 48 hours)
create index if not exists idx_og_generations_cleanup
  on og_generations (generated_at);

-- ── RLS: no direct client access needed (edge function uses service_role) ─
alter table og_generations enable row level security;

-- No public/authenticated access to this table.
-- The Edge Function uses the service_role key, which bypasses RLS.
-- These policies are the default deny — no explicit policies needed.

-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK
-- ═══════════════════════════════════════════════════════════════════════════
-- To revert this migration:
--
--   drop table if exists og_generations cascade;
