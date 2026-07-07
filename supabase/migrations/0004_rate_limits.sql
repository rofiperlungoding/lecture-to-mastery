-- 0004: Rate limiting table for per-user endpoint throttling

create table if not exists rate_limits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  window_start timestamptz not null default now(),
  call_count int not null default 1
);

create index if not exists idx_rate_limits_lookup
  on rate_limits (user_id, endpoint, window_start);
