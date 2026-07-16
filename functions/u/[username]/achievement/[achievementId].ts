// ═══════════════════════════════════════════════════════════════════════════
// Cloudflare Pages Function — /u/<username>/achievement/<achievementId>
//
// Intercepts crawler requests to achievement share URLs and renders
// OG meta tags specific to the achievement milestone.
// ═══════════════════════════════════════════════════════════════════════════

export interface Env {
  SUPABASE_URL: string
  SUPABASE_ANON_KEY: string
  ASSETS: { fetch: (req: Request) => Promise<Response> }
}

// ── Known achievements (mirrors ACHIEVEMENT_DEFS from the client) ──────────
const ACHIEVEMENTS: Record<string, { label: string; description: string; icon: string; tier: string }> = {
  first_document: { label: 'First Document', description: 'Upload your first document', icon: '📄', tier: 'bronze' },
  first_quiz: { label: 'Quiz Novice', description: 'Complete your first quiz', icon: '🧠', tier: 'bronze' },
  quiz_ace_100: { label: 'Perfect Score', description: 'Get 100% on a quiz', icon: '🏆', tier: 'silver' },
  streak_3: { label: 'On a Roll', description: '3-day study streak', icon: '🔥', tier: 'bronze' },
  streak_7: { label: 'Week Warrior', description: '7-day study streak', icon: '💪', tier: 'silver' },
  streak_30: { label: 'Iron Will', description: '30-day study streak', icon: '⚡', tier: 'gold' },
  cards_50: { label: 'Card Collector', description: 'Review 50 flashcards', icon: '🃏', tier: 'bronze' },
  cards_500: { label: 'Card Master', description: 'Review 500 flashcards', icon: '📚', tier: 'gold' },
  night_owl: { label: 'Night Owl', description: 'Study after 10 PM', icon: '🦉', tier: 'bronze' },
  completionist: { label: 'Completionist', description: 'Complete all cards in a session', icon: '🎯', tier: 'silver' },
  weak_spot_slayer: { label: 'Weak-Spot Slayer', description: 'Complete targeted practice', icon: '🎯', tier: 'silver' },
  exam_ace: { label: 'Exam Ace', description: 'Score 90%+ on an exam', icon: '📝', tier: 'gold' },
  mastery_first: { label: 'Mastery Achieved', description: 'Reach 90% average mastery', icon: '⭐', tier: 'gold' },
}

// ── Crawler detection ──────────────────────────────────────────────────────
const CRAWLER_PATTERNS = [
  'googlebot', 'twitterbot', 'facebookexternalhit', 'slack',
  'discordbot', 'telegrambot', 'whatsapp', 'linkedinbot',
  'pinterest', 'slurp', 'yandexbot', 'baiduspider',
  'applebot', 'bingbot', 'crawler', 'spider',
  'preview', 'headless', 'chrome-lighthouse',
  'meta-externalagent', 'validator', 'w3c',
  'flipboard', 'redditbot', 'bitlybot',
]

function isCrawler(userAgent: string): boolean {
  const ua = userAgent.toLowerCase()
  return CRAWLER_PATTERNS.some((p) => ua.includes(p))
}

// ── Helpers ────────────────────────────────────────────────────────────────
const esc = (s: string | null | undefined): string => {
  if (!s) return ''
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// ── Fetch public profile from Supabase ─────────────────────────────────────
interface ProfileMeta {
  username: string
  display_name: string | null
  is_public: boolean
}

async function fetchProfile(
  supabaseUrl: string,
  anonKey: string,
  username: string,
): Promise<ProfileMeta | null> {
  try {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/rpc/get_public_profile`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': anonKey,
          'Authorization': `Bearer ${anonKey}`,
        },
        body: JSON.stringify({ username }),
      },
    )
    if (!response.ok) return null
    const data = await response.json()
    if (!data || data.is_public === false) return null
    return {
      username: data.username,
      display_name: data.display_name ?? null,
      is_public: data.is_public !== false,
    }
  } catch {
    return null
  }
}

// ── Request Handler ────────────────────────────────────────────────────────

export async function onRequest(context: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = context
  const url = new URL(request.url)
  const userAgent = request.headers.get('User-Agent') || ''

  // Extract path params: /u/<username>/achievement/<achievementId>
  const pathParts = url.pathname.split('/').filter(Boolean)
  // pathParts = ['u', 'username', 'achievement', 'achievementId']
  const username = pathParts.length >= 2 ? decodeURIComponent(pathParts[1]) : ''
  const achievementId = pathParts.length >= 4 ? decodeURIComponent(pathParts[3]) : ''

  if (!username || !achievementId || !/^[a-z0-9][a-z0-9_.-]{0,30}[a-z0-9]$/i.test(username)) {
    try {
      return await env.ASSETS.fetch(request)
    } catch {
      return new Response('Not found', { status: 404 })
    }
  }

  const canonicalUrl = `${url.protocol}//${url.host}/u/${encodeURIComponent(username)}/achievement/${encodeURIComponent(achievementId)}`
  const ogImageUrl = `${env.SUPABASE_URL}/functions/v1/og-image?username=${encodeURIComponent(username)}&achievement_id=${encodeURIComponent(achievementId)}`
  const profileUrl = `${url.protocol}//${url.host}/u/${encodeURIComponent(username)}`

  const achievementDef = ACHIEVEMENTS[achievementId]

  // ── Crawler request: SSR HTML with OG tags ─────────────────────
  if (isCrawler(userAgent)) {
    const profile = await fetchProfile(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, username)
    const displayName = esc(profile?.display_name || username)
    const achievementLabel = esc(achievementDef?.label || achievementId)
    const achievementDesc = esc(achievementDef?.description || 'Achievement unlocked')
    const tier = esc(achievementDef?.tier || '')
    const title = achievementDef
      ? `${achievementDef.icon} ${achievementDef.label} — ${displayName} (@${esc(username)})`
      : `Achievement — ${displayName} (@${esc(username)})`
    const description = achievementDef
      ? `${displayName} unlocked the "${achievementDef.label}" ${achievementDef.tier} achievement on Lecture to Mastery`
      : `Check out ${displayName}'s study achievements on Lecture to Mastery`

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <meta name="description" content="${esc(description)}" />

  <!-- Open Graph -->
  <meta property="og:title" content="${achievementLabel} — ${displayName} (@${esc(username)})" />
  <meta property="og:description" content="${esc(description)}" />
  <meta property="og:url" content="${esc(canonicalUrl)}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="Lecture to Mastery" />
  <meta property="og:image" content="${esc(ogImageUrl)}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content="${achievementLabel} achievement" />

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${achievementLabel} — ${displayName} (@${esc(username)})" />
  <meta name="twitter:description" content="${esc(description)}" />
  <meta name="twitter:image" content="${esc(ogImageUrl)}" />

  <script>window.location.replace('/u/${esc(username)}');</script>
</head>
<body>
  <p>Redirecting…</p>
</body>
</html>`

    return new Response(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      },
    })
  }

  // ── Normal user: serve SPA ────────────────────────────────────
  try {
    return await env.ASSETS.fetch(request)
  } catch {
    return new Response('Not found', { status: 404 })
  }
}
