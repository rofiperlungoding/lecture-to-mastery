import { createClient } from 'npm:@supabase/supabase-js@2'
import { YoutubeTranscript } from 'npm:youtube-transcript@1.2.1'

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

function corsHeaders(origin: string | null) {
  const allowOrigin = isAllowedOrigin(origin) ? origin : 'http://localhost:5173'
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Max-Age': '86400',
  }
}

/**
 * Extract video ID from various YouTube URL formats.
 */
function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/, // raw ID
  ]
  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match) return match[1]
  }
  return null
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin')
  const headers = corsHeaders(origin)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers })
  }

  try {
    const { url } = await req.json()
    if (!url) {
      return new Response(
        JSON.stringify({ error: 'YouTube URL is required' }),
        { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } },
      )
    }

    const videoId = extractVideoId(url)
    if (!videoId) {
      return new Response(
        JSON.stringify({ error: 'Invalid YouTube URL. Expected format: https://youtube.com/watch?v=VIDEO_ID' }),
        { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } },
      )
    }

    // Authenticate
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

    const { data: { user }, error: userErr } = await supabase.auth.getUser()
    if (userErr || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid session' }),
        { status: 401, headers: { ...headers, 'Content-Type': 'application/json' } },
      )
    }

    // Rate limit: 5 fetches per 5 minutes
    const cutoff = new Date(Date.now() - 300 * 1000).toISOString()
    const { count } = await supabase
      .from('rate_limits')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('endpoint', 'fetch-youtube-transcript')
      .gte('window_start', cutoff)

    if (count !== null && count >= 5) {
      return new Response(
        JSON.stringify({ error: 'Too many requests. Please wait before fetching another transcript.' }),
        { status: 429, headers: { ...headers, 'Content-Type': 'application/json' } },
      )
    }
    await supabase.from('rate_limits').insert({ user_id: user.id, endpoint: 'fetch-youtube-transcript' })

    // Fetch transcript
    let transcriptItems: Array<{ text: string; duration: number; offset: number }> = []
    try {
      const result = await YoutubeTranscript.fetchTranscript(videoId)
      transcriptItems = result.map((item: any) => ({
        text: item.text,
        duration: item.duration,
        offset: item.offset,
      }))
    } catch (fetchErr) {
      return new Response(
        JSON.stringify({
          error: 'Could not fetch transcript. The video may have no captions, or the transcript is disabled.',
          hint: 'Try a video with auto-generated or manual captions enabled.',
        }),
        { status: 404, headers: { ...headers, 'Content-Type': 'application/json' } },
      )
    }

    if (transcriptItems.length === 0) {
      return new Response(
        JSON.stringify({
          error: 'No transcript segments found for this video.',
          hint: 'The video may not have captions available.',
        }),
        { status: 404, headers: { ...headers, 'Content-Type': 'application/json' } },
      )
    }

    // Build plain text from transcript segments
    const fullText = transcriptItems
      .map((item) => item.text.trim())
      .filter(Boolean)
      .join(' ')

    // Compute total duration in seconds
    const totalDurationSec = transcriptItems.reduce((sum, item) => sum + (item.duration || 0), 0)

    return new Response(
      JSON.stringify({
        ok: true,
        videoId,
        title: `YouTube video ${videoId}`,
        text: fullText,
        durationSec: Math.round(totalDurationSec),
        segmentCount: transcriptItems.length,
        sourceMeta: {
          url,
          video_id: videoId,
          duration_sec: Math.round(totalDurationSec),
          segment_count: transcriptItems.length,
        },
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
