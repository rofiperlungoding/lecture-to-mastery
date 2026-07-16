-- Migration 0014: Client-side error tracking
--
-- Stores unhandled errors and promise rejections reported by the browser-side
-- error monitor (src/lib/errorMonitor.ts). Rows are inserted by the client
-- via the anon key with RLS restricted to INSERT only.
--
-- ╔═══════════════════════════════════════════════════════════════════════╗
-- ║  WARNING: This table accumulates data. No automatic TTL is set —   ║
-- ║  add a cron or retention policy if this becomes large.              ║
-- ╚═══════════════════════════════════════════════════════════════════════╝

-- ============================================================================
-- 1. Create table
-- ============================================================================
create table if not exists client_errors (
  id          uuid        primary key default gen_random_uuid(),
  message     text        not null,
  stack       text        not null default '',
  url         text        not null default '',
  user_agent  text        not null default '',
  context     text        not null default '',
  created_at  timestamptz not null default now()
);

-- Index for querying recent errors
create index if not exists idx_client_errors_created_at
  on client_errors (created_at desc);

-- ============================================================================
-- 2. RLS: allow INSERT for anon users (authenticated with the anon key),
--    but prevent SELECT/UPDATE/DELETE from the client.
-- ============================================================================
alter table client_errors enable row level security;

create policy "Anyone can insert client errors (fire-and-forget)"
  on client_errors
  for insert
  to anon, authenticated
  with check (true);

-- Block all other operations from the client
create policy "No one can select client errors from the client"
  on client_errors
  for select
  to anon, authenticated
  using (false);

create policy "No one can update client errors from the client"
  on client_errors
  for update
  to anon, authenticated
  with check (false);

create policy "No one can delete client errors from the client"
  on client_errors
  for delete
  to anon, authenticated
  using (false);

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- drop table if exists client_errors cascade;
