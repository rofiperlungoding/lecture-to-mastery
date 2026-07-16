// ═══════════════════════════════════════════════════════════════════════════
// Teardown helpers
//
// Guarantees no data leakage between tests. Two levels:
//   1. Per-test: delete all rows created by a specific seed (by ID prefix/array)
//   2. Global: reset the entire TEST project schema
//
// Design: Functions accept a Supabase client and an array of IDs to delete.
// Deletion order respects foreign key constraints.
// ═══════════════════════════════════════════════════════════════════════════

import type { SupabaseClient } from '@supabase/supabase-js'
import type { SeedDocumentResult } from './seed'

// ── Per-document teardown ─────────────────────────────────────────────────

/**
 * Delete all rows created by a `seedFullDocument()` call.
 * Operates in reverse order of insertion to respect FK constraints.
 */
export async function teardownDocument(
  client: SupabaseClient,
  result: SeedDocumentResult,
): Promise<void> {
  const { docId, chunkIds, flashcardIds, quizQuestionIds, reviewLogIds, studyEventIds, conceptMasteryIds } = result

  const errors: string[] = []

  // Delete review_log first (references flashcards)
  if (reviewLogIds.length > 0) {
    const { error } = await client.from('review_log').delete().in('id', reviewLogIds)
    if (error) errors.push(`review_log: ${error.message}`)
  }

  // Delete concept_mastery (references documents)
  if (conceptMasteryIds.length > 0) {
    const { error } = await client.from('concept_mastery').delete().in('id', conceptMasteryIds)
    if (error) errors.push(`concept_mastery: ${error.message}`)
  }

  // Delete study_events (references documents)
  if (studyEventIds.length > 0) {
    const { error } = await client.from('study_events').delete().in('id', studyEventIds)
    if (error) errors.push(`study_events: ${error.message}`)
  }

  // Delete quiz_questions (references documents)
  if (quizQuestionIds.length > 0) {
    const { error } = await client.from('quiz_questions').delete().in('id', quizQuestionIds)
    if (error) errors.push(`quiz_questions: ${error.message}`)
  }

  // Delete flashcards (references documents)
  if (flashcardIds.length > 0) {
    const { error } = await client.from('flashcards').delete().in('id', flashcardIds)
    if (error) errors.push(`flashcards: ${error.message}`)
  }

  // Delete chunks (references documents)
  if (chunkIds.length > 0) {
    const { error } = await client.from('chunks').delete().in('id', chunkIds)
    if (error) errors.push(`chunks: ${error.message}`)
  }

  // Delete the document itself last
  if (docId) {
    const { error } = await client.from('documents').delete().eq('id', docId)
    if (error) errors.push(`documents: ${error.message}`)
  }

  if (errors.length > 0) {
    throw new Error(`Teardown errors:\n${errors.join('\n')}`)
  }
}

// ── Per-user teardown ─────────────────────────────────────────────────────

/**
 * Delete a test user created by `seedUserStats()` and all their data.
 * Relies on cascade deletes from auth.users.
 */
export async function teardownUser(
  client: SupabaseClient,
  userId: string,
): Promise<void> {
  // Delete from user_stats first (FK to auth.users)
  const { error: statsErr } = await client
    .from('user_stats')
    .delete()
    .eq('user_id', userId)

  const { error: achievementsErr } = await client
    .from('user_achievements')
    .delete()
    .eq('user_id', userId)

  // Delete the user (triggers cascade for most tables)
  const { error: userErr } = await client.auth.admin.deleteUser(userId)

  const errors: string[] = []
  if (statsErr) errors.push(`user_stats: ${statsErr.message}`)
  if (achievementsErr) errors.push(`user_achievements: ${achievementsErr.message}`)
  if (userErr) errors.push(`auth.users: ${userErr.message}`)

  if (errors.length > 0) {
    throw new Error(`Teardown user errors:\n${errors.join('\n')}`)
  }
}

// ── Global cleanup ────────────────────────────────────────────────────────

/**
 * Delete ALL test-prefixed data from the database.
 * Matches rows where title/starts_with test- prefix.
 * DANGER: Only call this on the test database!
 */
export async function globalCleanup(client: SupabaseClient): Promise<void> {
  const errors: string[] = []

  // Delete all test documents (cascade handles children)
  const { error: docErr } = await client
    .from('documents')
    .delete()
    .like('title', '[test-%')

  if (docErr) errors.push(`documents: ${docErr.message}`)

  // Delete orphaned test data (data without a matching document)
  for (const table of ['flashcards', 'quiz_questions', 'study_events', 'concept_mastery']) {
    const { error } = await client
      .from(table as any)
      .delete()
      .not('document_id', 'in', '(select id from documents)')
    if (error) errors.push(`${table}: ${error.message}`)
  }

  // Delete test user_stats
  const { error: statsErr } = await client
    .from('user_stats')
    .delete()
    .like('user_id', 'test-%')
  if (statsErr) errors.push(`user_stats: ${statsErr.message}`)

  if (errors.length > 0) {
    console.warn('Global cleanup had errors:', errors)
  }
}

// ── User teardown (no-lifecycle version) ────────────────────────────────────
//
// For manual use in tests:
//   import { createTestClient } from './seed'
//   import { teardownDocument, teardownUser } from './teardown'
//   const client = createTestClient()
//   const result = await seedFullDocument(client, fixture)
//   // ... assertions ...
//   await teardownDocument(client, result)
