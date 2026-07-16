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
    const { audioUrl, fileName } = await req.json()
    if (!audioUrl) {
      return new Response(
        JSON.stringify({ error: 'audioUrl is required' }),
        { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } },
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const runpodKey = Deno.env.get('RUNPOD_API_KEY')!
    if (!supabaseUrl || !supabaseAnonKey || !runpodKey) {
      throw new Error('Missing required environment variables. RUNPOD_API_KEY is needed for transcription.')
    }

    const authHeader = req.headers.get('Authorization') || ''
    const jwt = authHeader.replace('Bearer ', '')
    if (!jwt) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), { status: 401, headers: { ...headers, 'Content-Type': 'application/json' } })
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    })

    const { data: { user }, error: userErr } = await supabase.auth.getUser()
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: 'Invalid session' }), { status: 401, headers: { ...headers, 'Content-Type': 'application/json' } })
    }

    // Rate limit: 5 per 10 minutes
    const cutoff = new Date(Date.now() - 600 * 1000).toISOString()
    const { count } = await supabase.from('rate_limits').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('endpoint', 'transcribe-audio').gte('window_start', cutoff)
    if (count !== null && count >= 5) {
      return new Response(JSON.stringify({ error: 'Too many requests. Please wait before transcribing more audio.' }), { status: 429, headers: { ...headers, 'Content-Type': 'application/json' } })
    }
    await supabase.from('rate_limits').insert({ user_id: user.id, endpoint: 'transcribe-audio' })

    // Fetch the audio file from Supabase Storage and transcribe via RunPod Whisper
    // RunPod Whisper endpoint expects a URL or direct audio upload
    const runpodEndpoint = 'https://api.runpod.ai/v2/whisper/runsync'

    const transcriptionResponse = await fetch(runpodEndpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${runpodKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: {
          audio_url: audioUrl,
          model: 'base',
          task: 'transcribe',
          language: 'en',
          response_format: 'json',
        },
      }),
    })

    if (!transcriptionResponse.ok) {
      const body = await transcriptionResponse.text()
      throw new Error(`RunPod Whisper API error: ${transcriptionResponse.status} — ${body.slice(0, 200)}`)
    }

    const result = await transcriptionResponse.json()
    const transcribedText = result.output?.text || result.text || result.transcription || result.output?.transcription || ''

    if (!transcribedText || transcribedText.trim().length < 20) {
      return new Response(
        JSON.stringify({ error: 'Transcription produced very little text. The audio may be silent, too noisy, or in an unsupported language.' }),
        { status: 422, headers: { ...headers, 'Content-Type': 'application/json' } },
      )
    }

    const durationSec = result.output?.duration || result.duration || Math.round(transcribedText.split(' ').length * 0.3)

    return new Response(
      JSON.stringify({
        ok: true,
        text: transcribedText.trim(),
        durationSec,
        sourceMeta: {
          fileName: fileName || 'unknown',
          audioUrl,
          durationSec,
          model: 'whisper-base',
          provider: 'runpod',
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
