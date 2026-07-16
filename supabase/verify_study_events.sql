-- ============================================================================
-- Verify study_events are flowing correctly
-- Run each section separately in the Supabase SQL editor.
-- ============================================================================

-- ============================================================================
-- 1. HEALTH CHECK: Any events at all?
-- ============================================================================
select
  count(*)                                         as total_events,
  count(distinct document_id)                      as distinct_docs,
  count(distinct user_id)                          as distinct_users,
  count(*) filter (where created_at >= now() - interval '24 hours') as last_24h
from study_events;

-- ============================================================================
-- 2. EVENT TYPE BREAKDOWN
-- ============================================================================
select
  event_type,
  count(*)                                          as count,
  min(created_at)::text                             as first_seen,
  max(created_at)::text                             as last_seen
from study_events
group by event_type
order by count desc;

-- ============================================================================
-- 3. SAMPLE ROWS — one per event type, with full event_data
-- ============================================================================
select
  se.event_type,
  se.document_id,
  se.user_id,
  se.event_data,
  se.created_at::text
from study_events se
where se.id in (
  select distinct on (event_type) id
  from study_events
  order by event_type, created_at desc
)
order by se.event_type;

-- ============================================================================
-- 4. EVENTS PER DOCUMENT (most active first)
-- ============================================================================
select
  d.id            as document_id,
  d.title         as document_title,
  count(se.id)    as event_count,
  min(se.created_at)::text as first_event,
  max(se.created_at)::text as last_event
from documents d
left join study_events se on se.document_id = d.id
group by d.id, d.title
order by event_count desc;

-- ============================================================================
-- 5. EVENT DATA VERIFICATION — check JSON structure per type
-- ============================================================================
-- quiz_answer should have: question, concept, is_correct, selected_index, correct_index
select
  se.event_data->>'question'        as question,
  se.event_data->>'concept'         as concept,
  se.event_data->>'is_correct'      as is_correct,
  se.event_data->>'selected_index'  as selected_index,
  se.event_data->>'correct_index'   as correct_index,
  se.created_at::text
from study_events se
where se.event_type = 'quiz_answer'
order by se.created_at desc
limit 10;

-- quiz_completed should have: score, total
select
  se.event_data->>'score'  as score,
  se.event_data->>'total'  as total,
  se.created_at::text
from study_events se
where se.event_type = 'quiz_completed'
order by se.created_at desc
limit 10;

-- flashcard_review should have: flashcardId, rating
select
  se.event_data->>'flashcardId' as flashcard_id,
  se.event_data->>'rating'      as rating,
  se.created_at::text
from study_events se
where se.event_type = 'flashcard_review'
order by se.created_at desc
limit 10;

-- chat_query should have: question
select
  se.event_data->>'question' as question,
  se.created_at::text
from study_events se
where se.event_type = 'chat_query'
order by se.created_at desc
limit 10;

-- summary_view should have: mode
select
  se.event_data->>'mode' as mode,
  se.created_at::text
from study_events se
where se.event_type = 'summary_view'
order by se.created_at desc
limit 10;

-- ============================================================================
-- 6. CONCEPT MASTERY CHECK (if any upserts have happened)
-- ============================================================================
select
  cm.concept,
  cm.attempts,
  cm.correct,
  round(cm.correct::numeric / nullif(cm.attempts, 0) * 100, 1) as accuracy_pct,
  cm.last_seen::text
from concept_mastery cm
order by cm.last_seen desc nulls last
limit 20;

-- ============================================================================
-- 7. QUIZ QUESTIONS — verify concept column is populated
-- ============================================================================
select
  qq.id,
  left(qq.question, 60) as question_preview,
  qq.concept,
  qq.document_id
from quiz_questions qq
where qq.concept != ''
order by qq.id
limit 20;

-- ============================================================================
-- 8. RECENT ACTIVITY TIMELINE (last 50 events)
-- ============================================================================
select
  se.created_at::text       as timestamp,
  se.event_type,
  left(se.event_data::text, 120) as data_preview,
  se.document_id
from study_events se
order by se.created_at desc
limit 50;
