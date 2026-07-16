-- Migration 0013: Server-side weak-concept detection
-- Returns concepts with mastery < 70% ordered by mastery ascending (weakest first).
-- Uses correct::float / nullif(attempts, 0) for proper server-side calculation,
-- replacing the old client-side approximation that sorted by raw correct count.

-- ============================================================================
-- 1. Function: get_weak_concepts
-- ============================================================================
create or replace function get_weak_concepts(p_document_id uuid)
returns table (
  concept   text,
  attempts  int,
  correct   int,
  mastery   numeric
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  select
    cm.concept,
    cm.attempts,
    cm.correct,
    round(
      (cm.correct::numeric / nullif(cm.attempts, 0)) * 100,
      1
    ) as mastery
  from concept_mastery cm
  where cm.document_id = p_document_id
    and cm.user_id = auth.uid()
    -- only rows that have been attempted
    and cm.attempts > 0
    -- weak = mastery < 70%
    and (cm.correct::numeric / nullif(cm.attempts, 0)) < 0.7
  order by (cm.correct::numeric / nullif(cm.attempts, 0)) asc
  limit 5;
end;
$$;
