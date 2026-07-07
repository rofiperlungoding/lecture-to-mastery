-- Migration: Add match_chunks_all RPC for global search across all user documents

-- match_chunks_all returns relevant chunks across ALL documents for a user.
-- Relies on RLS (chunks table has user_id policies) AND explicitly filters
-- by auth.uid() for defense-in-depth, matching the pattern of match_chunks.

create or replace function match_chunks_all(
  query_embedding vector(1024),
  match_count int default 10
)
returns table (id uuid, document_id uuid, content text, chunk_index int, similarity float)
language sql stable
security invoker
as $$
  select
    id,
    document_id,
    content,
    chunk_index,
    1 - (embedding <=> query_embedding) as similarity
  from chunks
  where user_id = auth.uid()
  order by embedding <=> query_embedding
  limit match_count;
$$;

-- Grant execute permission
revoke execute on function match_chunks_all(vector(1024), int) from public;
grant execute on function match_chunks_all(vector(1024), int) to authenticated;
