-- 0018: Add source_meta JSONB column for import sources expansion
-- Stores origin URL, duration, image count, etc. per source type.

alter table documents add column if not exists source_meta jsonb;

-- Rollback:
-- alter table documents drop column source_meta;
