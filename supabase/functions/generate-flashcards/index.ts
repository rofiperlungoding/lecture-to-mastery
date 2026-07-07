import { createClient } from 'npm:@supabase/supabase-js@2'

const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:4173',
  'https://30031c7a.lecture-to-mastery.pages.dev',
]

function corsHeaders(origin: string | null) {
  const allowOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Max-Age': '86400',
  }
}

async function checkRateLimit(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  endpoint: string,
  maxCalls: number,
  windowSec: number,
): Promise<boolean> {
  const cutoff = new Date(Date.now() - windowSec * 1000).toISOString()
  const { count, error } = await supabase
    .from('rate_limits')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('endpoint', endpoint)
    .gte('window_start', cutoff)
  if (error) return true
  if (count !== null && count >= maxCalls) return false
  await supabase.from('rate_limits').insert({ user_id: userId, endpoint })
  return true
}

interface RawFlashcard { front: string; back: string }

function validateFlashcard(f: unknown): f is RawFlashcard {
  const obj = f as Record<string, unknown>
  if (typeof obj.front !== 'string' || obj.front.trim().length === 0) return false
  if (typeof obj.back !== 'string' || obj.back.trim().length === 0) return false
  return true
}

async function callMistral(messages: { role: string; content: string }[], apiKey: string): Promise<{ flashcards: RawFlashcard[] }> {
  const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'mistral-small-latest', messages, temperature: 0.2, response_format: { type: 'json_object' } }),
  })
  if (!response.ok) { const body = await response.text(); throw new Error(`Mistral API error: ${response.status} ${body}`) }
  const result = await response.json()
  const content = result.choices?.[0]?.message?.content ?? ''
  let parsed: { flashcards: unknown[] }
  try { parsed = JSON.parse(content) } catch { throw new Error('Failed to parse Mistral response as JSON') }
  if (!Array.isArray(parsed.flashcards)) throw new Error('Response missing "flashcards" array')
  return parsed as { flashcards: RawFlashcard[] }
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin')
  const headers = corsHeaders(origin)

  if (req.method === 'OPTIONS') return new Response('ok', { headers })

  try {
    const { documentId, count = 10 } = await req.json()
    if (!documentId) return new Response(JSON.stringify({ error: 'documentId is required' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } })
    if (typeof count !== 'number' || count < 1 || count > 30) return new Response(JSON.stringify({ error: 'count must be a number between 1 and 30' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } })

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const mistralKey = Deno.env.get('MISTRAL_API_KEY')!
    if (!supabaseUrl || !supabaseAnonKey || !mistralKey) throw new Error('Missing required environment variables')

    const authHeader = req.headers.get('Authorization') || ''
    const jwt = authHeader.replace('Bearer ', '')
    if (!jwt) return new Response(JSON.stringify({ error: 'Authentication required' }), { status: 401, headers: { ...headers, 'Content-Type': 'application/json' } })

    const supabase = createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: `Bearer ${jwt}` } } })

    const { data: { user }, error: userErr } = await supabase.auth.getUser()
    if (userErr || !user) return new Response(JSON.stringify({ error: 'Invalid or expired session' }), { status: 401, headers: { ...headers, 'Content-Type': 'application/json' } })

    const allowed = await checkRateLimit(supabase, user.id, 'generate-flashcards', 5, 300)
    if (!allowed) return new Response(JSON.stringify({ error: 'Too many requests. Please wait before generating more flashcards.' }), { status: 429, headers: { ...headers, 'Content-Type': 'application/json' } })

    const { data: chunks, error } = await supabase.from('chunks').select('content, chunk_index').eq('document_id', documentId).order('chunk_index')
    if (error) throw error
    if (!chunks || chunks.length === 0) throw new Error('No chunks found for this document')

    const maxSamples = 12
    let sampled: { content: string }[]
    if (chunks.length <= maxSamples) { sampled = chunks } else {
      const step = chunks.length / maxSamples; sampled = []
      for (let i = 0; i < maxSamples; i++) sampled.push(chunks[Math.floor(i * step)])
    }
    const context = sampled.map((c) => c.content).join('\n\n')

    const buildMessages = (fcCount: number, extra?: string) => [
      { role: 'system' as const, content: 'You are a precise flashcard generator. Output ONLY valid JSON with this exact shape — no other text:\n{\n  "flashcards": [\n    {\n      "front": "concise question or term",\n      "back": "clear answer or definition"\n    }\n  ]\n}\n\nGenerate exactly ' + fcCount + ' flashcards based on the provided document. Each card should test understanding of a key concept, term, or relationship. Front should be a short question or term. Back should be a thorough but concise explanation. All strings must be non-empty.\n' + (extra ?? '') },
      { role: 'user' as const, content: `Generate ${fcCount} flashcards from:\n\n${context}` },
    ]

    let validCards: RawFlashcard[] = []
    const { flashcards: raw1 } = await callMistral(buildMessages(count), mistralKey)
    validCards = raw1.filter(validateFlashcard)

    if (validCards.length < count) {
      const shortfall = count - validCards.length
      try { const { flashcards: raw2 } = await callMistral(buildMessages(shortfall, `Previously generated ${validCards.length} valid flashcards. Generate ${shortfall} more.`), mistralKey); validCards.push(...raw2.filter(validateFlashcard)) } catch {}
    }

    if (validCards.length === 0) throw new Error('Failed to generate any valid flashcards after retry')

    const rows = validCards.map((fc) => ({ document_id: documentId, front: fc.front.trim(), back: fc.back.trim() }))

    await supabase.from('flashcards').delete().eq('document_id', documentId)
    const { error: insertErr } = await supabase.from('flashcards').insert(rows)
    if (insertErr) throw insertErr

    return new Response(JSON.stringify({ ok: true, inserted: validCards.length }), { headers: { ...headers, 'Content-Type': 'application/json' } })
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: (err as Error).message }), { status: 500, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } })
  }
})
