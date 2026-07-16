import { supabase } from './supabase'
import { showToast } from '../components/Toast'
import { ACHIEVEMENT_DEFS, getAchievementDef, type UserStats, type AchievementId } from '../types/db'

// ============================================================================
// XP constants (modest, anti-inflation)
// ============================================================================
const XP_FLASHCARD_REVIEW = 10
const XP_QUIZ_COMPLETED = 25
const XP_CHAT_QUESTION = 5
const XP_DOCUMENT_STUDIED = 50
const DAILY_XP_CAP = 150  // Anti-inflation: max XP per day

// ============================================================================
// Level formula: level = floor(sqrt(xp / 100)) + 1
// ============================================================================
export function calcLevel(xp: number): number {
  return Math.floor(Math.sqrt(xp / 100)) + 1
}

export function xpForLevel(level: number): number {
  return (level - 1) ** 2 * 100
}

export function xpToNextLevel(xp: number): number {
  const currentLevel = calcLevel(xp)
  const currentLevelMin = xpForLevel(currentLevel)
  const nextLevelMin = xpForLevel(currentLevel + 1)
  return nextLevelMin - currentLevelMin
}

export function xpProgressInLevel(xp: number): number {
  const currentLevel = calcLevel(xp)
  const currentLevelMin = xpForLevel(currentLevel)
  const nextLevelMin = xpForLevel(currentLevel + 1)
  if (nextLevelMin === currentLevelMin) return 1
  return (xp - currentLevelMin) / (nextLevelMin - currentLevelMin)
}

// ============================================================================
// Database helpers (new user_achievements table + user_stats)
// ============================================================================

export async function fetchUserStats(): Promise<UserStats | null> {
  const { data } = await supabase
    .from('user_stats')
    .select('*')
    .single()
  return data
}

/**
 * Fetch achievements from the server-verified user_achievements table.
 * Returns a set of achievement IDs the user has earned.
 */
export async function fetchEarnedAchievements(): Promise<Set<string>> {
  const { data } = await supabase
    .from('user_achievements')
    .select('achievement_id')
  return new Set((data ?? []).map((r: any) => r.achievement_id))
}

/**
 * Trigger the server-side achievement evaluator and return newly earned IDs.
 * Called after meaningful study actions.
 */
export async function checkAchievements(): Promise<string[]> {
  try {
    const { data: userData } = await supabase.auth.getUser()
    const userId = userData.user?.id
    if (!userId) return []

    const { data, error } = await supabase.rpc('evaluate_achievements', { target_user_id: userId })
    if (error) {
      // Function may not exist yet (migration not run) — fall back silently
      return []
    }
    // Return only newly awarded achievements
    const rows = (data ?? []) as Array<{ user_id: string; achievement_id: string; newly_awarded: boolean }>
    const newlyEarned = rows.filter((r) => r.newly_awarded).map((r) => r.achievement_id)

    // Show toast for each newly earned achievement
    for (const id of newlyEarned) {
      const def = getAchievementDef(id)
      const label = def?.label || id
      showToast('success', `🏅 Achievement unlocked: ${label}!`)
    }

    return newlyEarned
  } catch {
    return []
  }
}

// ============================================================================
// Core: Award XP with daily cap (anti-inflation)
// ============================================================================

export async function awardXp(amount: number): Promise<UserStats | null> {
  const user = await supabase.auth.getUser()
  const userId = user.data.user?.id
  if (!userId) return null

  const stats = await fetchUserStats()
  const today = new Date().toISOString().split('T')[0]
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]

  // ── Daily XP cap check ──────────────────────────────────────────────
  // Query today's XP from the ledger (server-verified data)
  const { data: todayXpData } = await supabase
    .from('xp_ledger')
    .select('amount')
    .eq('user_id', userId)
    .gte('earned_at', today)
  const todayXp = (todayXpData ?? []).reduce((sum: number, r: any) => sum + r.amount, 0)
  const cappedAmount = Math.min(amount, Math.max(0, DAILY_XP_CAP - todayXp))
  const actualAmount = cappedAmount > 0 ? cappedAmount : 0

  // ── Streak calculation ───────────────────────────────────────────────
  let newStreak = 0
  let newLongest = 0

  if (!stats) {
    newStreak = 1
    newLongest = 1
  } else {
    const lastActive = stats.last_active
    if (lastActive === today) {
      newStreak = stats.current_streak
    } else if (lastActive === yesterday) {
      newStreak = stats.current_streak + 1
    } else {
      newStreak = 1
    }
    newLongest = Math.max(stats.longest_streak, newStreak)
  }

  // ── Award XP (only if within cap) ────────────────────────────────────
  let newXp = stats?.xp ?? 0
  let newLevel = stats?.level ?? 1

  if (actualAmount > 0) {
    newXp += actualAmount
    newLevel = calcLevel(newXp)

    // Record in XP ledger (fire-and-forget, never throws)
    void supabase.from('xp_ledger').insert({
      user_id: userId,
      amount: actualAmount,
      reason: 'flashcard_review',
    })

    // Update profile XP (fire-and-forget, never throws)
    void supabase.from('profiles').update({
      total_xp: newXp,
      daily_xp: todayXp + actualAmount,
      last_xp_date: today,
    }).eq('id', userId)
  }

  // ── Update user_stats (streak always updates even if XP capped) ─────
  const { data } = await supabase
    .from('user_stats')
    .upsert({
      user_id: userId,
      xp: newXp,
      level: newLevel,
      current_streak: newStreak,
      longest_streak: newLongest,
      last_active: today,
    })
    .select()
    .single()

  // Level up toast
  if (stats && newLevel > stats.level) {
    showToast('success', `🎉 Level up! You are now level ${newLevel}!`)
  }

  // Daily cap warning
  if (actualAmount < amount && amount > 0) {
    showToast('warning', `Daily XP limit reached (${DAILY_XP_CAP}/${DAILY_XP_CAP}). Come back tomorrow!`)
  }

  return data
}

// ============================================================================
// Action handlers (called from study action points)
// ============================================================================

export async function onFlashcardReviewed(): Promise<void> {
  await awardXp(XP_FLASHCARD_REVIEW)
  // Check achievements after meaningful action
  await checkAchievements()
}

export async function onSessionCompleted(_totalCards: number, _reviewedCount: number): Promise<void> {
  await checkAchievements()
}

export async function onQuizCompleted(_score: number, _total: number): Promise<void> {
  await awardXp(XP_QUIZ_COMPLETED)
  await checkAchievements()
}

export async function onChatQuestion(): Promise<void> {
  await awardXp(XP_CHAT_QUESTION)
}

export async function onDocumentStudied(): Promise<void> {
  await awardXp(XP_DOCUMENT_STUDIED)
  await checkAchievements()
}

export async function checkNightOwl(): Promise<void> {
  await checkAchievements()
}

/**
 * Get the next achievement the user can unlock (one they don't have yet).
 */
export function getNextAchievement(
  earned: Set<string>,
  stats?: UserStats | null,
): { id: AchievementId; def: (typeof ACHIEVEMENT_DEFS)[number]; progress: number } | null {
  const unearned = ACHIEVEMENT_DEFS.filter((a) => !earned.has(a.id))
  if (unearned.length === 0) return null

  // Pick the earliest available achievement (bronze first, then by order)
  const tierOrder = ['bronze', 'silver', 'gold']
  unearned.sort((a, b) => tierOrder.indexOf(a.tier) - tierOrder.indexOf(b.tier) || ACHIEVEMENT_DEFS.indexOf(a) - ACHIEVEMENT_DEFS.indexOf(b))

  const next = unearned[0]
  let progress = 0

  // Compute approximate progress based on stats
  if (stats) {
    switch (next.id) {
      case 'first_document':
        break // binary
      case 'first_quiz':
        break // binary
      case 'streak_3':
        progress = Math.min(1, (stats.current_streak || 0) / 3)
        break
      case 'streak_7':
        progress = Math.min(1, (stats.current_streak || 0) / 7)
        break
      case 'streak_30':
        progress = Math.min(1, (stats.current_streak || 0) / 30)
        break
      case 'quiz_ace_100':
        break // binary
      case 'cards_50':
        break // computed from review_log
      case 'cards_500':
        break // computed from review_log
      default:
        progress = 0
    }
  }

  return { id: next.id as AchievementId, def: next, progress }
}
