-- Drop the old function first, then recreate with chunk_index in the return table
drop function if exists match_chunks(vector(1024), uuid, int);

create function match_chunks(
  query_embedding vector(1024),
  doc_id uuid,
  match_count int default 5
)
returns table (id uuid, content text, chunk_index int, similarity float)
language sql stable
as $$
  select
    id,
    content,
    chunk_index,
    1 - (embedding <=> query_embedding) as similarity
  from chunks
  where document_id = doc_id
  order by embedding <=> query_embedding
  limit match_count;
$$;
