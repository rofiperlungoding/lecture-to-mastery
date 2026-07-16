// ═══════════════════════════════════════════════════════════════════════════
// Seeding helpers — programmatic data insertion for isolated tests
//
// Uses a Supabase service client (service_role key) to bypass RLS and
// insert deterministic test data. Each function returns the inserted row's
// ID for use in assertions and teardown.
//
// USAGE (in a test):
//   const { userId, docId } = await seedFullDocument(client, fixture)
//   // ... run assertions ...
//   await teardownDocument(client, docId)
// ═══════════════════════════════════════════════════════════════════════════

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { type FixtureDocument, PHOTOSYNTHESIS_LECTURE } from './fixtures/documents'
import { FIXED_EMBEDDING_1024 } from './embeddings'

// ── Types ─────────────────────────────────────────────────────────────────

export interface SeedDocumentResult {
  docId: string
  chunkIds: string[]
  flashcardIds: string[]
  quizQuestionIds: string[]
  reviewLogIds: string[]
  studyEventIds: string[]
  conceptMasteryIds: string[]
}

export interface SeedConfig {
  /** Override for the document's created_at */
  now?: Date
  /** Seed flashcard due_at relative to now (days: negative=overdue, positive=future) */
  flashcardDueOffsets?: number[]
  /** Create quiz questions with these concepts */
  quizConcepts?: string[]
  /** Number of study events to seed */
  studyEventCount?: number
  /** Streak length: creates N consecutive daily study events */
  streakLength?: number
}

// ── Test Supabase client factory ─────────────────────────────────────────

/**
 * Create a Supabase client with the service_role key for seeding.
 * Reads credentials from environment variables.
 */
export function createTestClient(): SupabaseClient {
  const url = process.env.VITE_SUPABASE_URL || 'http://127.0.0.1:54321'
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  return createClient(url, key)
}

// ── Helpers ───────────────────────────────────────────────────────────────

function isoDate(date: Date, offsetDays = 0): string {
  const d = new Date(date)
  d.setDate(d.getDate() + offsetDays)
  return d.toISOString()
}

// ── Seed a complete document with all related data ─────────────────────────

/**
 * Seed a complete document: document row → chunks (with fixed embeddings) →
 * flashcards (with explicit due_at) → quiz questions → study events →
 * concept mastery rows.
 */
export async function seedFullDocument(
  client: SupabaseClient,
  fixture: FixtureDocument = PHOTOSYNTHESIS_LECTURE,
  config: SeedConfig = {},
): Promise<SeedDocumentResult> {
  const now = config.now || new Date()
  const docTitle = `[test-${Date.now()}] ${fixture.title}`

  // ── 1. Insert document ─────────────────────────────────────────
  const { data: doc, error: docErr } = await client
    .from('documents')
    .insert({
      title: docTitle,
      source_type: fixture.sourceType,
      language: fixture.language,
      created_at: now.toISOString(),
    })
    .select('id')
    .single()

  if (docErr) throw new Error(`Seed: document insert failed: ${docErr.message}`)
  const docId = doc.id

  // ── 2. Insert chunks with fixed embeddings ─────────────────────
  // Use chunkText to split the fixture content
  const { chunkText } = await import('../lib/chunk')
  const chunkContents = chunkText(fixture.content)
  const chunkIds: string[] = []

  for (let i = 0; i < chunkContents.length; i++) {
    const { data: chunk, error: chunkErr } = await client
      .from('chunks')
      .insert({
        document_id: docId,
        content: chunkContents[i],
        chunk_index: i,
        embedding: FIXED_EMBEDDING_1024.slice(0, 1024), // deterministic 1024-dim vector
      })
      .select('id')
      .single()

    if (chunkErr) throw new Error(`Seed: chunk insert failed: ${chunkErr.message}`)
    chunkIds.push(chunk.id)
  }

  // ── 3. Insert flashcards with explicit due_at ──────────────────
  const dueOffsets = config.flashcardDueOffsets || [0, 1, 7, -1, -3]
  const flashcardIds: string[] = []

  const flashcardData = [
    { front: 'What is photosynthesis?', back: 'Plants convert light energy to chemical energy', ease: 2.5, interval_days: 1 },
    { front: 'Where does photosynthesis occur?', back: 'In the chloroplasts', ease: 2.5, interval_days: 1 },
    { front: 'What are the two stages of photosynthesis?', back: 'Light-dependent reactions and Calvin cycle', ease: 2.5, interval_days: 1 },
    { front: 'What does ATP stand for?', back: 'Adenosine Triphosphate', ease: 2.5, interval_days: 1 },
    { front: 'What factors affect photosynthesis?', back: 'Light intensity, CO₂ concentration, and temperature', ease: 2.5, interval_days: 1 },
  ]

  for (let i = 0; i < flashcardData.length; i++) {
    const fc = flashcardData[i]
    const offset = dueOffsets[i % dueOffsets.length]
    const { data: card, error: cardErr } = await client
      .from('flashcards')
      .insert({
        document_id: docId,
        front: fc.front,
        back: fc.back,
        ease: fc.ease,
        interval_days: fc.interval_days,
        due_at: isoDate(now, offset),
      })
      .select('id')
      .single()

    if (cardErr) throw new Error(`Seed: flashcard insert failed: ${cardErr.message}`)
    flashcardIds.push(card.id)
  }

  // ── 4. Insert quiz questions ───────────────────────────────────
  const concepts = config.quizConcepts || ['photosynthesis', 'chloroplasts', 'Calvin cycle', 'ATP']
  const quizQuestionIds: string[] = []

  const quizData = [
    { question: 'What do plants convert light energy into?', options: ['Chemical energy', 'Heat', 'Sound', 'Motion'], correct_index: 0, explanation: 'Photosynthesis converts light energy to chemical energy stored in glucose.', concept: 'photosynthesis' },
    { question: 'Where does photosynthesis take place?', options: ['Mitochondria', 'Chloroplasts', 'Nucleus', 'Ribosomes'], correct_index: 1, explanation: 'Chloroplasts contain chlorophyll and are the site of photosynthesis.', concept: 'chloroplasts' },
    { question: 'What are the products of the Calvin cycle?', options: ['ATP', 'Glucose', 'Oxygen', 'Water'], correct_index: 1, explanation: 'The Calvin cycle fixes carbon dioxide into glucose.', concept: 'Calvin cycle' },
  ]

  for (const q of quizData) {
    const { data: quiz, error: quizErr } = await client
      .from('quiz_questions')
      .insert({
        document_id: docId,
        question: q.question,
        options: q.options,
        correct_index: q.correct_index,
        explanation: q.explanation,
        concept: q.concept,
      })
      .select('id')
      .single()

    if (quizErr) throw new Error(`Seed: quiz question insert failed: ${quizErr.message}`)
    quizQuestionIds.push(quiz.id)
  }

  // ── 5. Insert study events ─────────────────────────────────────
  const eventCount = config.studyEventCount || 3
  const studyEventIds: string[] = []

  for (let i = 0; i < eventCount; i++) {
    // If streakLength is set, spread events across consecutive days going backward
    const eventDate = config.streakLength
      ? isoDate(now, -(config.streakLength - 1 - i))
      : isoDate(now, -i)

    const { data: event, error: eventErr } = await client
      .from('study_events')
      .insert({
        document_id: docId,
        event_type: i % 2 === 0 ? 'flashcard_review' : 'quiz_completed',
        event_data: i % 2 === 0 ? {} : { score: Math.ceil(Math.random() * 5), total: 5 },
        created_at: eventDate,
      })
      .select('id')
      .single()

    if (eventErr) throw new Error(`Seed: study event insert failed: ${eventErr.message}`)
    studyEventIds.push(event.id)
  }

  // ── 6. Insert concept mastery rows ─────────────────────────────
  const conceptMasteryIds: string[] = []

  for (const concept of concepts) {
    const { data: cm, error: cmErr } = await client
      .from('concept_mastery')
      .insert({
        document_id: docId,
        concept,
        attempts: 10,
        correct: concept === 'ATP' ? 10 : concept === 'calvin_cycle' ? 5 : 8,
        last_seen: isoDate(now, -1),
      })
      .select('id')
      .single()

    if (cmErr) throw new Error(`Seed: concept mastery insert failed: ${cmErr.message}`)
    conceptMasteryIds.push(cm.id)
  }

  // ── 7. Insert review log entries ───────────────────────────────
  const reviewLogIds: string[] = []

  for (const fcId of flashcardIds) {
    const { data: log, error: logErr } = await client
      .from('review_log')
      .insert({
        flashcard_id: fcId,
        rating: 'good',
        created_at: isoDate(now, -1),
      })
      .select('id')
      .single()

    if (logErr) throw new Error(`Seed: review log insert failed: ${logErr.message}`)
    reviewLogIds.push(log.id)
  }

  return {
    docId,
    chunkIds,
    flashcardIds,
    quizQuestionIds,
    reviewLogIds,
    studyEventIds,
    conceptMasteryIds,
  }
}

// ── Seed a user_stats row (for XP/streak tests) ───────────────────────────

export interface SeedUserStatsResult {
  userId: string
}

export async function seedUserStats(
  client: SupabaseClient,
  overrides: Partial<{
    xp: number
    level: number
    current_streak: number
    longest_streak: number
    last_active: string
  }> = {},
): Promise<SeedUserStatsResult> {
  const { data: user } = await client.auth.admin.createUser({
    email: `test-${Date.now()}@example.com`,
    password: 'test-password-123',
    email_confirm: true,
  })

  const userId = user?.user?.id
  if (!userId) throw new Error('Seed: failed to create test user')

  const { error: statsErr } = await client
    .from('user_stats')
    .insert({
      user_id: userId,
      xp: overrides.xp ?? 0,
      level: overrides.level ?? 1,
      current_streak: overrides.current_streak ?? 0,
      longest_streak: overrides.longest_streak ?? 0,
      last_active: overrides.last_active ?? new Date().toISOString().split('T')[0],
    })

  if (statsErr) throw new Error(`Seed: user_stats insert failed: ${statsErr.message}`)

  return { userId }
}

// ── Seed a user_achievement row ──────────────────────────────────────────

export async function seedAchievement(
  client: SupabaseClient,
  userId: string,
  achievementId: string,
): Promise<void> {
  const { error } = await client
    .from('user_achievements')
    .insert({
      user_id: userId,
      achievement_id: achievementId,
    })

  if (error) throw new Error(`Seed: achievement insert failed: ${error.message}`)
}
