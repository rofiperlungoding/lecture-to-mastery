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
    const { imageUrl, fileName } = await req.json()
    if (!imageUrl) {
      return new Response(
        JSON.stringify({ error: 'imageUrl is required' }),
        { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } },
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const mistralKey = Deno.env.get('MISTRAL_API_KEY')!
    if (!supabaseUrl || !supabaseAnonKey || !mistralKey) {
      throw new Error('Missing required environment variables')
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

    // Rate limit: 10 per 5 minutes
    const cutoff = new Date(Date.now() - 300 * 1000).toISOString()
    const { count } = await supabase.from('rate_limits').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('endpoint', 'ocr-image').gte('window_start', cutoff)
    if (count !== null && count >= 10) {
      return new Response(JSON.stringify({ error: 'Too many requests. Please wait before OCRing more images.' }), { status: 429, headers: { ...headers, 'Content-Type': 'application/json' } })
    }
    await supabase.from('rate_limits').insert({ user_id: user.id, endpoint: 'ocr-image' })

    // Call Mistral Vision API (pixtral model for image understanding)
    // Using the same endpoint but with a multimodal prompt that includes the image URL
    const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${mistralKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'pixtral-large-latest',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Extract ALL text from this image of notes or lecture slides. Transcribe the content exactly as written, including any diagrams, equations, or handwritten text. Return ONLY the extracted text, nothing else. If the image has no readable text, respond with "NO_TEXT_FOUND".',
              },
              {
                type: 'image_url',
                image_url: imageUrl,
              },
            ],
          },
        ],
        temperature: 0.1,
        max_tokens: 4096,
      }),
    })

    if (!response.ok) {
      const body = await response.text()
      throw new Error(`Mistral Vision API error: ${response.status} — ${body.slice(0, 200)}`)
    }

    const result = await response.json()
    const extractedText = result.choices?.[0]?.message?.content?.trim() || ''

    if (!extractedText || extractedText === 'NO_TEXT_FOUND') {
      return new Response(
        JSON.stringify({
          error: 'No readable text could be extracted from this image. The image may be too blurry, low-quality, or contain only graphics.',
          extractedText: '',
        }),
        { status: 422, headers: { ...headers, 'Content-Type': 'application/json' } },
      )
    }

    return new Response(
      JSON.stringify({
        ok: true,
        text: extractedText,
        sourceMeta: {
          fileName: fileName || 'unknown',
          imageUrl,
          model: 'pixtral-large-latest',
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
