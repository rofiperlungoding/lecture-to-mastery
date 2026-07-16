// ═══════════════════════════════════════════════════════════════════════════
// OG Image — Supabase Edge Function
//
// Generates rich Open Graph PNG images for profile/achievement share links.
// Uses @resvg/resvg-wasm (lightweight WASM, ~200KB) to render HTML → SVG → PNG.
//
// Endpoints:
//   GET /og-image?username=<username>
//   GET /og-image?username=<username>&achievement_id=<id>
//
// Cache: 24h CDN, 1h stale-while-revalidate
// Auth: Public (called by crawlers via OG meta tags)
// Rate limit: Tracked in og_generations table; max 10/user/hour
// Safety: All user input sanitized; only public aggregate data used
// ═══════════════════════════════════════════════════════════════════════════

import { Resvg } from 'jsr:@resvg/resvg-wasm@2.6.2'
import { serve } from 'https://deno.land/std@0.210.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.0'

// ── CORS headers (allow any origin for social crawlers) ────────────────────
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

// ── Constants ──────────────────────────────────────────────────────────────
const OG_WIDTH = 1200
const OG_HEIGHT = 630
const RATE_LIMIT_MAX = 10       // max OG generations per user per hour
const RATE_LIMIT_WINDOW_MS = 3600_000

// ── Supabase client (uses service role for database access) ────────────────
function getSupabase() {
  const url = Deno.env.get('SUPABASE_URL') ?? ''
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  return createClient(url, key)
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Escape HTML special characters (injection guard) */
function esc(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Truncate string to max length with ellipsis */
function truncate(str: string, max: number): string {
  if (str.length <= max) return str
  return str.slice(0, max - 1) + '…'
}

// ── Rate limit check ───────────────────────────────────────────────────────
async function checkRateLimit(userId: string): Promise<boolean> {
  try {
    const supabase = getSupabase()
    const cutoff = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString()
    const { count } = await supabase
      .from('og_generations')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('generated_at', cutoff)
    return (count ?? 0) < RATE_LIMIT_MAX
  } catch {
    // If table doesn't exist yet, allow the request
    return true
  }
}

async function recordGeneration(userId: string): Promise<void> {
  try {
    const supabase = getSupabase()
    await supabase.from('og_generations').insert({ user_id: userId }).then()
  } catch {
    // Non-critical; ignore failures
  }
}

// ── Fetch profile data ─────────────────────────────────────────────────────
interface ProfileData {
  username: string
  display_name: string | null
  avatar_url: string | null
  bio: string | null
  join_date: string
  total_documents: number
  current_streak: number
  total_cards: number
  avg_mastery: number
  achievements: Array<{ key: string; unlocked_at: string }>
  is_public: boolean
}

async function fetchProfile(username: string): Promise<ProfileData | null> {
  const supabase = getSupabase()
  try {
    const { data, error } = await supabase
      .rpc('get_public_profile', { username })

    if (error || !data) return null

    return {
      username: data.username,
      display_name: data.display_name ?? null,
      avatar_url: data.avatar_url ?? null,
      bio: data.bio ?? null,
      join_date: data.join_date,
      total_documents: data.total_documents ?? 0,
      current_streak: data.current_streak ?? 0,
      total_cards: data.total_cards ?? 0,
      avg_mastery: data.avg_mastery ?? 0,
      achievements: data.achievements ?? [],
      is_public: data.is_public !== false,
    }
  } catch {
    return null
  }
}

// ── OG Image rendering (HTML → SVG → PNG) ─────────────────────────────────

interface OGRenderOptions {
  username: string
  displayName: string | null
  bio: string | null
  totalDocuments: number
  currentStreak: number
  totalCards: number
  avgMastery: number
  achievementsCount: number
  /** Optional achievement highlight */
  achievement?: {
    icon: string
    label: string
    description: string
    tier: string
  }
}

function buildOGImageHTML(opts: OGRenderOptions): string {
  const {
    username, displayName, bio, totalDocuments,
    currentStreak, totalCards, avgMastery,
    achievementsCount, achievement,
  } = opts

  const name = truncate(esc(displayName || username), 40)
  const bioText = bio ? truncate(esc(bio), 120) : ''
  const initial = esc((displayName || username).charAt(0).toUpperCase())
  const pctColor = avgMastery >= 80 ? '#22C55E' : avgMastery >= 50 ? '#F59E0B' : '#EF4444'

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      width: ${OG_WIDTH}px;
      height: ${OG_HEIGHT}px;
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #1E1B4B 0%, #312E81 30%, #3730A3 60%, #1E40AF 100%);
      color: #FFFFFF;
      overflow: hidden;
    }

    .card {
      width: 1100px;
      height: 530px;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 32px;
      padding: 48px 56px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      backdrop-filter: blur(20px);
      position: relative;
    }

    /* Decorative gradient blobs */
    .blob-1 {
      position: absolute;
      top: -80px;
      right: -80px;
      width: 300px;
      height: 300px;
      background: radial-gradient(circle, rgba(99, 102, 241, 0.3), transparent 70%);
      border-radius: 50%;
    }
    .blob-2 {
      position: absolute;
      bottom: -60px;
      left: -60px;
      width: 250px;
      height: 250px;
      background: radial-gradient(circle, rgba(139, 92, 246, 0.2), transparent 70%);
      border-radius: 50%;
    }

    .top { display: flex; align-items: flex-start; gap: 40px; position: relative; z-index: 1; }

    .avatar {
      width: 120px;
      height: 120px;
      border-radius: 50%;
      background: linear-gradient(135deg, #6366F1, #8B5CF6);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 48px;
      font-weight: 800;
      color: white;
      flex-shrink: 0;
      box-shadow: 0 8px 32px rgba(99, 102, 241, 0.4);
    }

    .identity { flex: 1; min-width: 0; padding-top: 8px; }

    .name {
      font-size: 42px;
      font-weight: 800;
      line-height: 1.1;
      letter-spacing: -0.02em;
      margin-bottom: 8px;
      color: #FFFFFF;
    }

    .username {
      font-size: 22px;
      font-weight: 500;
      color: rgba(255, 255, 255, 0.6);
      margin-bottom: ${bioText ? '12px' : '0'};
    }

    .bio {
      font-size: 18px;
      font-weight: 400;
      color: rgba(255, 255, 255, 0.75);
      line-height: 1.4;
      max-width: 600px;
    }

    /* Stats row */
    .stats {
      display: flex;
      gap: 32px;
      margin-top: 32px;
      position: relative;
      z-index: 1;
    }

    .stat {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .stat-ring {
      width: 56px;
      height: 56px;
      position: relative;
      flex-shrink: 0;
    }

    .stat-ring svg {
      width: 56px;
      height: 56px;
      transform: rotate(-90deg);
    }

    .stat-ring .bg {
      fill: none;
      stroke: rgba(255, 255, 255, 0.1);
      stroke-width: 4;
    }

    .stat-ring .fg {
      fill: none;
      stroke: ${pctColor};
      stroke-width: 4;
      stroke-linecap: round;
      stroke-dasharray: ${2 * Math.PI * 26};
      stroke-dashoffset: ${2 * Math.PI * 26 * (1 - Math.min(avgMastery, 100) / 100)};
    }

    .stat-ring .pct {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      font-weight: 700;
      color: white;
    }

    .stat-info { }

    .stat-value {
      font-size: 26px;
      font-weight: 700;
      line-height: 1.1;
      color: #FFFFFF;
    }

    .stat-label {
      font-size: 14px;
      font-weight: 400;
      color: rgba(255, 255, 255, 0.5);
      margin-top: 2px;
    }

    /* Footer */
    .footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      position: relative;
      z-index: 1;
    }

    .brand {
      font-size: 16px;
      font-weight: 600;
      color: rgba(255, 255, 255, 0.4);
      letter-spacing: 0.05em;
    }

    .badge {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 16px;
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 100px;
      font-size: 14px;
      font-weight: 500;
      color: rgba(255, 255, 255, 0.7);
    }

    .badge-icon { font-size: 18px; }

    /* Achievement variant */
    .achievement-hero {
      display: flex;
      align-items: center;
      gap: 24px;
      margin-top: 16px;
      padding: 20px 24px;
      background: rgba(251, 191, 36, 0.1);
      border: 1px solid rgba(251, 191, 36, 0.2);
      border-radius: 16px;
    }

    .achievement-icon {
      font-size: 48px;
      flex-shrink: 0;
    }

    .achievement-info { }

    .achievement-label {
      font-size: 28px;
      font-weight: 700;
      color: #FCD34D;
      line-height: 1.2;
    }

    .achievement-desc {
      font-size: 16px;
      color: rgba(255, 255, 255, 0.6);
      margin-top: 4px;
    }

    .achievement-tier {
      font-size: 13px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: rgba(251, 191, 36, 0.6);
      margin-bottom: 4px;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="blob-1"></div>
    <div class="blob-2"></div>

    <div class="top">
      <div class="avatar">${initial}</div>
      <div class="identity">
        <div class="name">${name}</div>
        <div class="username">@${esc(username)}</div>
        ${bioText ? `<div class="bio">${bioText}</div>` : ''}

        ${achievement ? `
        <div class="achievement-hero">
          <div class="achievement-icon">${achievement.icon}</div>
          <div class="achievement-info">
            <div class="achievement-tier">${esc(achievement.tier)} Achievement</div>
            <div class="achievement-label">${esc(achievement.label)}</div>
            <div class="achievement-desc">${esc(achievement.description)}</div>
          </div>
        </div>
        ` : ''}
      </div>
    </div>

    <div class="stats">
      <!-- Mastery Ring -->
      <div class="stat">
        <div class="stat-ring">
          <svg viewBox="0 0 56 56">
            <circle class="bg" cx="28" cy="28" r="26"/>
            <circle class="fg" cx="28" cy="28" r="26"/>
          </svg>
          <div class="pct">${Math.round(avgMastery)}%</div>
        </div>
        <div class="stat-info">
          <div class="stat-value">${Math.round(avgMastery)}%</div>
          <div class="stat-label">Avg mastery</div>
        </div>
      </div>

      <!-- Streak -->
      ${currentStreak > 0 ? `
      <div class="stat">
        <div style="font-size: 32px; width: 56px; text-align: center;">🔥</div>
        <div class="stat-info">
          <div class="stat-value">${currentStreak}</div>
          <div class="stat-label">Day streak</div>
        </div>
      </div>
      ` : ''}

      <!-- Cards -->
      <div class="stat">
        <div style="font-size: 32px; width: 56px; text-align: center;">🏆</div>
        <div class="stat-info">
          <div class="stat-value">${totalCards}</div>
          <div class="stat-label">Cards reviewed</div>
        </div>
      </div>

      <!-- Documents -->
      <div class="stat">
        <div style="font-size: 32px; width: 56px; text-align: center;">📚</div>
        <div class="stat-info">
          <div class="stat-value">${totalDocuments}</div>
          <div class="stat-label">Documents</div>
        </div>
      </div>

      <!-- Achievements count -->
      <div class="stat">
        <div style="font-size: 32px; width: 56px; text-align: center;">🏅</div>
        <div class="stat-info">
          <div class="stat-value">${achievementsCount}</div>
          <div class="stat-label">Achievements</div>
        </div>
      </div>
    </div>

    <div class="footer">
      <div class="brand">LECTURE TO MASTERY</div>
      ${achievement ? '<div class="badge"><span class="badge-icon">⭐</span> Milestone unlocked</div>' : '<div class="badge"><span class="badge-icon">📖</span> Learning profile</div>'}
    </div>
  </div>
</body>
</html>`
}

async function renderOGImage(html: string): Promise<Uint8Array> {
  // The JSR module auto-loads WASM — no manual init needed
  const resvg = new Resvg(html, {
    fitTo: { mode: 'original' },
    dpi: 144,
  })
  const pngData = resvg.render()
  return pngData.asPng()
}

// ═══════════════════════════════════════════════════════════════════════════
// Request handler
// ═══════════════════════════════════════════════════════════════════════════

serve(async (req) => {
  // ── CORS preflight ──────────────────────────────────────────────
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  if (req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 })
  }

  try {
    const url = new URL(req.url)
    const username = url.searchParams.get('username')
    const achievementId = url.searchParams.get('achievement_id')

    // ── Validate required params ──────────────────────────────────
    if (!username || !/^[a-z0-9][a-z0-9_-]{1,28}[a-z0-9]$/i.test(username)) {
      return new Response('Invalid username', {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'text/plain' },
      })
    }

    // ── Fetch public profile ──────────────────────────────────────
    const profile = await fetchProfile(username)
    if (!profile || !profile.is_public) {
      // Return a minimal "not found" OG image or a 404
      const notFoundHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      width: ${OG_WIDTH}px; height: ${OG_HEIGHT}px;
      font-family: system-ui, sans-serif;
      display: flex; align-items: center; justify-content: center;
      background: linear-gradient(135deg, #1E1B4B, #312E81);
      color: white;
    }
    .msg { text-align: center; }
    .msg h1 { font-size: 48px; font-weight: 700; margin-bottom: 12px; }
    .msg p { font-size: 22px; color: rgba(255,255,255,0.6); }
  </style>
</head>
<body>
  <div class="msg">
    <h1>Profile Not Found</h1>
    <p>This profile doesn't exist or is set to private.</p>
  </div>
</body>
</html>`
      const png = await renderOGImage(notFoundHtml)
      return new Response(png, {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'image/png',
          'Cache-Control': 'public, max-age=3600, s-maxage=3600',
        },
      })
    }

    // ── Rate limit ────────────────────────────────────────────────
    const userId = username // use username as rate-limit key
    const allowed = await checkRateLimit(userId)
    if (!allowed) {
      // Return a cached or rate-limited response
      return new Response('Rate limited', {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'text/plain' },
      })
    }

    // Record generation (async, fire-and-forget)
    recordGeneration(userId)

    // ── Get achievement definition (if sharing an achievement) ────
    let achievementData: OGRenderOptions['achievement'] | undefined

    if (achievementId) {
      // Validate achievement ID against known IDs
      const knownAchievementIcons: Record<string, { icon: string; label: string; description: string; tier: string }> = {
        first_document: { icon: '📄', label: 'First Document', description: 'Upload your first document', tier: 'bronze' },
        first_quiz: { icon: '🧠', label: 'Quiz Novice', description: 'Complete your first quiz', tier: 'bronze' },
        quiz_ace_100: { icon: '🏆', label: 'Perfect Score', description: 'Get 100% on a quiz', tier: 'silver' },
        streak_3: { icon: '🔥', label: 'On a Roll', description: '3-day study streak', tier: 'bronze' },
        streak_7: { icon: '💪', label: 'Week Warrior', description: '7-day study streak', tier: 'silver' },
        streak_30: { icon: '⚡', label: 'Iron Will', description: '30-day study streak', tier: 'gold' },
        cards_50: { icon: '🃏', label: 'Card Collector', description: 'Review 50 flashcards', tier: 'bronze' },
        cards_500: { icon: '📚', label: 'Card Master', description: 'Review 500 flashcards', tier: 'gold' },
        night_owl: { icon: '🦉', label: 'Night Owl', description: 'Study after 10 PM', tier: 'bronze' },
        completionist: { icon: '🎯', label: 'Completionist', description: 'Complete all cards in a session', tier: 'silver' },
        weak_spot_slayer: { icon: '🎯', label: 'Weak-Spot Slayer', description: 'Complete targeted practice', tier: 'silver' },
        exam_ace: { icon: '📝', label: 'Exam Ace', description: 'Score 90%+ on an exam', tier: 'gold' },
        mastery_first: { icon: '⭐', label: 'Mastery Achieved', description: 'Reach 90% average mastery', tier: 'gold' },
      }

      const def = knownAchievementIcons[achievementId]
      if (def) {
        achievementData = def
      }
    }

    // ── Build and render OG image ──────────────────────────────────
    const html = buildOGImageHTML({
      username: profile.username,
      displayName: profile.display_name,
      bio: profile.bio,
      totalDocuments: profile.total_documents,
      currentStreak: profile.current_streak,
      totalCards: profile.total_cards,
      avgMastery: profile.avg_mastery,
      achievementsCount: profile.achievements.length,
      achievement: achievementData,
    })

    const png = await renderOGImage(html)

    // ── Respond with PNG + caching headers ─────────────────────────
    return new Response(png, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400, s-maxage=3600, stale-while-revalidate=86400',
      },
    })
  } catch (err) {
    console.error('OG image error:', err)
    return new Response('Internal error', {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'text/plain' },
    })
  }
})
