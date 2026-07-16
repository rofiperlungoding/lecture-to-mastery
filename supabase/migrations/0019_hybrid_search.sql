-- 0019: Hybrid search — add full-text search (tsvector + GIN) to chunks
-- Enables keyword + vector hybrid retrieval with Reciprocal Rank Fusion.

-- Increase maintenance_work_mem for large table operations
set session maintenance_work_mem = '128MB';

-- ── 1. Add tsvector column for full-text search ─────────────────────────

alter table chunks add column if not exists fts tsvector
  generated always as (to_tsvector('english', coalesce(content, ''))) stored;

-- ── 2. GIN index on the tsvector column ─────────────────────────────────
-- Increase maintenance_work_mem temporarily to handle large table indexing
set session maintenance_work_mem = '128MB';

create index if not exists idx_chunks_fts
  on chunks using gin (fts);

reset maintenance_work_mem;

-- ── 3. Keyword search function ──────────────────────────────────────────
-- Returns top-k chunks by ts_rank for a given document (or all user docs if doc_id is null).
-- Respects RLS via security invoker.

create or replace function keyword_search(
  query_text text,
  doc_id uuid default null,
  match_count int default 10
)
returns table (id uuid, document_id uuid, content text, chunk_index int, rank float)
language sql stable
security invoker
as $$
  select
    id,
    document_id,
    content,
    chunk_index,
    ts_rank(fts, plainto_tsquery('english', query_text)) as rank
  from chunks
  where
    (doc_id is null or document_id = doc_id)
    and fts @@ plainto_tsquery('english', query_text)
  order by rank desc
  limit match_count;
$$;

-- Grant execute permission
revoke execute on function keyword_search(text, uuid, int) from public;
grant execute on function keyword_search(text, uuid, int) to authenticated;

-- ── Rollback ─────────────────────────────────────────────────────────────
-- drop function keyword_search(text, uuid, int);
-- drop index idx_chunks_fts;
-- alter table chunks drop column fts;
