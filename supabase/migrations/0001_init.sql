-- Enable the pgvector extension (in public schema so tables can use vector type)
create extension if not exists vector;

-- Documents: top-level lecture material
create table documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  source_type text not null default 'pdf',
  created_at timestamptz not null default now()
);

-- Chunks: vector-embedded segments of a document
create table chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  content text not null,
  chunk_index int not null,
  embedding vector(1024)
);

-- Flashcards: spaced-repetition cards
create table flashcards (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  front text not null,
  back text not null,
  ease real not null default 2.5,
  interval_days int not null default 0,
  due_at timestamptz not null default now()
);

-- Quiz questions: multiple-choice
create table quiz_questions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  question text not null,
  options jsonb not null,
  correct_index int not null,
  explanation text
);

-- IVFFlat index on chunk embeddings for similarity search
create index idx_chunks_embedding on chunks
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- Cosine-similarity match function for RAG
create function match_chunks(
  query_embedding vector(1024),
  doc_id uuid,
  match_count int default 5
)
returns table (id uuid, content text, similarity float)
language sql stable
as $$
  select
    id,
    content,
    1 - (embedding <=> query_embedding) as similarity
  from chunks
  where document_id = doc_id
  order by embedding <=> query_embedding
  limit match_count;
$$;
