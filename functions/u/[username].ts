// ═══════════════════════════════════════════════════════════════════════════
// Cloudflare Pages Function — /u/<username>
//
// Intercepts requests to /u/<username> routes:
//   - Crawler (Googlebot, Twitterbot, Facebook, Slack, Discord, etc.):
//     Fetches public profile from Supabase and returns SSR HTML with
//     full OG meta tags so social previews work.
//   - Normal user: Passes through to the SPA.
//
// Environment variables (set in Cloudflare Pages dashboard):
//   SUPABASE_URL      — Your Supabase project URL
//   SUPABASE_ANON_KEY — Your Supabase anon/public key
// ═══════════════════════════════════════════════════════════════════════════

export interface Env {
  SUPABASE_URL: string
  SUPABASE_ANON_KEY: string
  ASSETS: { fetch: (req: Request) => Promise<Response> }
}

// ── Crawler detection ──────────────────────────────────────────────────────
// List of common crawler User-Agent patterns
const CRAWLER_PATTERNS = [
  'googlebot', 'twitterbot', 'facebookexternalhit', 'slack',
  'discordbot', 'telegrambot', 'whatsapp', 'linkedinbot',
  'pinterest', 'slurp', 'yandexbot', 'baiduspider',
  'applebot', 'bingbot', 'duckduckbot', 'mj12bot',
  'meta-externalagent', 'meta-seo-scanner', 'scanner',
  'woorankbot', 'semrushbot', 'ahrefsbot', 'maggiebot',
  'flipboard', 'tumblr', 'bitlybot', 'redditbot',
  'outbrain', 'google-inspectiontool', 'validator',
  'w3c_validator', 'whatsapp', 'crawler', 'spider',
  'preview', 'headless', 'chrome-lighthouse',
]

function isCrawler(userAgent: string): boolean {
  const ua = userAgent.toLowerCase()
  return CRAWLER_PATTERNS.some((p) => ua.includes(p))
}

// ── Fetch public profile from Supabase ─────────────────────────────────────
interface PublicProfileMeta {
  username: string
  display_name: string | null
  bio: string | null
  is_public: boolean
  total_documents: number
  current_streak: number
  total_cards: number
  avg_mastery: number
  achievements: Array<{ key: string; unlocked_at: string }>
}

async function fetchPublicProfile(
  supabaseUrl: string,
  anonKey: string,
  username: string,
): Promise<PublicProfileMeta | null> {
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
      bio: data.bio ?? null,
      is_public: data.is_public !== false,
      total_documents: data.total_documents ?? 0,
      current_streak: data.current_streak ?? 0,
      total_cards: data.total_cards ?? 0,
      avg_mastery: data.avg_mastery ?? 0,
      achievements: data.achievements ?? [],
    }
  } catch {
    return null
  }
}

// ── Build SSR HTML with OG tags ───────────────────────────────────────────

function buildOGHTML(
  profile: PublicProfileMeta | null,
  canonicalUrl: string,
  ogImageUrl: string,
): string {
  // Sanitize user-provided strings
  const esc = (s: string | null | undefined): string => {
    if (!s) return ''
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }

  if (!profile) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Profile not found — Lecture to Mastery</title>
  <meta name="robots" content="noindex" />
  <meta property="og:title" content="Profile Not Found" />
  <meta property="og:description" content="This profile doesn't exist or is set to private." />
  <meta property="og:url" content="${esc(canonicalUrl)}" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content="Lecture to Mastery" />
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content="Profile Not Found" />
  <meta name="twitter:description" content="This profile doesn't exist or is set to private." />
  <script>window.location.replace('/');</script>
</head>
<body>
  <p>Redirecting home…</p>
</body>
</html>`
  }

  const displayName = esc(profile.display_name || profile.username)
  const bio = profile.bio
    ? esc(profile.bio.length > 200 ? profile.bio.slice(0, 197) + '…' : profile.bio)
    : `${profile.total_documents} documents · ${profile.current_streak} day streak · ${profile.total_cards} cards reviewed · ${Math.round(profile.avg_mastery)}% avg mastery`
  const description = `${profile.total_documents} documents · ${profile.current_streak} day streak · ${profile.total_cards} cards reviewed · ${Math.round(profile.avg_mastery)}% avg mastery · ${profile.achievements.length} achievements unlocked`

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${displayName} (@${esc(profile.username)}) — Study profile on Lecture to Mastery</title>
  <meta name="description" content="${esc(description)}" />

  <!-- Open Graph -->
  <meta property="og:title" content="${displayName} (@${esc(profile.username)})" />
  <meta property="og:description" content="${esc(description)}" />
  <meta property="og:url" content="${esc(canonicalUrl)}" />
  <meta property="og:type" content="profile" />
  <meta property="og:site_name" content="Lecture to Mastery" />
  <meta property="og:image" content="${esc(ogImageUrl)}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content="${displayName}'s study profile on Lecture to Mastery" />

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${displayName} (@${esc(profile.username)})" />
  <meta name="twitter:description" content="${esc(description)}" />
  <meta name="twitter:image" content="${esc(ogImageUrl)}" />
  <meta name="twitter:image:alt" content="${displayName}'s study profile on Lecture to Mastery" />

  <!-- Profile-specific meta -->
  <meta property="profile:username" content="${esc(profile.username)}" />

  <!-- Redirect to SPA for interactive features -->
  <script>window.location.replace('/u/${esc(profile.username)}');</script>
</head>
<body>
  <p>Redirecting to ${displayName}'s profile…</p>
</body>
</html>`
}

// ── Request Handler ────────────────────────────────────────────────────────

export async function onRequest(context: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = context
  const url = new URL(request.url)
  const userAgent = request.headers.get('User-Agent') || ''

  // Extract username from URL path (/u/<username>)
  const pathParts = url.pathname.split('/').filter(Boolean)
  const username = pathParts.length >= 2 ? decodeURIComponent(pathParts[1]) : ''

  // Validate username format (basic check)
  if (!username || !/^[a-z0-9][a-z0-9_.-]{0,30}[a-z0-9]$/i.test(username)) {
    // Invalid username — pass through to SPA or return 404
    try {
      const spaResponse = await env.ASSETS.fetch(request)
      return spaResponse
    } catch {
      return new Response('Not found', { status: 404 })
    }
  }

  // ── Build canonical URL and OG image URL ─────────────────────────
  const canonicalUrl = `${url.protocol}//${url.host}/u/${encodeURIComponent(username)}`
  const ogImageUrl = `${env.SUPABASE_URL}/functions/v1/og-image?username=${encodeURIComponent(username)}`

  // ── Crawler detection ────────────────────────────────────────────
  if (isCrawler(userAgent)) {
    const profile = await fetchPublicProfile(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, username)

    const html = buildOGHTML(profile, canonicalUrl, ogImageUrl)

    return new Response(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      },
    })
  }

  // ── Normal user: serve the SPA ──────────────────────────────────
  try {
    const spaResponse = await env.ASSETS.fetch(request)
    return spaResponse
  } catch {
    return new Response('Not found', { status: 404 })
  }
}
