-- Migration 0012: Auto-rollup concept_mastery from quiz_answer events
-- Creates a trigger on study_events that:
--   When a quiz_answer event is inserted, upserts the corresponding
--   concept_mastery row (incrementing attempts/correct, updating last_seen).

-- ============================================================================
-- 1. Trigger function: upsert concept_mastery on quiz_answer
-- ============================================================================
create or replace function fn_upsert_concept_mastery()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_concept    text;
  v_is_correct boolean;
begin
  -- Only process quiz_answer events
  if new.event_type <> 'quiz_answer' then
    return new;
  end if;

  -- Extract fields from event_data JSONB
  v_concept    := trim(new.event_data ->> 'concept');
  v_is_correct := (new.event_data ->> 'is_correct')::boolean;

  -- Skip if concept is empty/null
  if v_concept is null or v_concept = '' then
    return new;
  end if;

  -- Upsert: insert or update the concept_mastery row
  insert into concept_mastery (document_id, user_id, concept, attempts, correct, last_seen)
  values (
    new.document_id,
    new.user_id,
    v_concept,
    1,
    case when v_is_correct then 1 else 0 end,
    new.created_at
  )
  on conflict (document_id, user_id, concept)
  do update set
    attempts = concept_mastery.attempts + 1,
    correct  = case when v_is_correct then concept_mastery.correct + 1 else concept_mastery.correct end,
    last_seen = new.created_at;

  return new;
end;
$$;

-- ============================================================================
-- 2. Attach the trigger to study_events (idempotent)
-- ============================================================================
drop trigger if exists trg_study_events_upsert_concept_mastery on study_events;

create trigger trg_study_events_upsert_concept_mastery
  after insert on study_events
  for each row
  execute function fn_upsert_concept_mastery();
