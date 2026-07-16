import { createClient } from 'npm:@supabase/supabase-js@2'

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  try {
    const url = new URL(origin);
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return true;
    if (url.hostname.endsWith('.lecture-to-mastery.pages.dev') || url.hostname === 'lecture-to-mastery.pages.dev') return true;
    if (url.hostname.endsWith('.netlify.app')) return true;
    return false;
  } catch { return false; }
}
import { computeSm2, QUALITY_MAP, VALID_RATINGS } from './sm2.ts'

const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:4173',
  'https://master.lecture-to-mastery.pages.dev',
  'https://preview-phase1-2.lecture-to-mastery.pages.dev',
]

function corsHeaders(origin: string | null) {
  const allowOrigin = isAllowedOrigin(origin) ? origin : 'http://localhost:5173'
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Max-Age': '86400',
  }
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin')
  const headers = corsHeaders(origin)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers })
  }

  try {
    const { flashcardId, rating } = await req.json()
    if (!flashcardId || !rating) {
      return new Response(
        JSON.stringify({ error: 'flashcardId and rating are required' }),
        { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } },
      )
    }

    if (!VALID_RATINGS.includes(rating)) {
      return new Response(
        JSON.stringify({ error: 'rating must be one of: again, hard, good, easy' }),
        { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } },
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Missing required environment variables')
    }

    const authHeader = req.headers.get('Authorization') || ''
    const jwt = authHeader.replace('Bearer ', '')
    if (!jwt) {
      return new Response(
        JSON.stringify({ error: 'Authentication required' }),
        { status: 401, headers: { ...headers, 'Content-Type': 'application/json' } },
      )
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    })

    // Verify session
    const { data: { user }, error: userErr } = await supabase.auth.getUser()
    if (userErr || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired session' }),
        { status: 401, headers: { ...headers, 'Content-Type': 'application/json' } },
      )
    }

    // Fetch current flashcard
    const { data: card, error: cardErr } = await supabase
      .from('flashcards')
      .select('id, ease, interval_days, due_at')
      .eq('id', flashcardId)
      .single()

    if (cardErr || !card) {
      return new Response(
        JSON.stringify({ error: 'Flashcard not found' }),
        { status: 404, headers: { ...headers, 'Content-Type': 'application/json' } },
      )
    }

    const quality = QUALITY_MAP[rating] as number

    // Compute SM-2 schedule
    const { ease, intervalDays, dueAt } = computeSm2(quality, card.ease, card.interval_days)

    // Update flashcard row (defense-in-depth: also filter by user_id)
    const { error: updateErr } = await supabase
      .from('flashcards')
      .update({ ease, interval_days: intervalDays, due_at: dueAt })
      .eq('id', flashcardId)
      .eq('user_id', user.id)

    if (updateErr) throw new Error(`Update failed: ${updateErr.message}`)

    // Log the review for analytics
    await supabase.from('review_log').insert({
      flashcard_id: flashcardId,
      user_id: user.id,
      rating,
    }).catch(() => {})

    return new Response(
      JSON.stringify({
        ok: true,
        ease,
        intervalDays,
        dueAt,
        nextReview: intervalDays === 0 ? 'due now' : `in ${intervalDays} day${intervalDays === 1 ? '' : 's'}`,
      }),
      { headers: { ...headers, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } },
    )
  }
})
