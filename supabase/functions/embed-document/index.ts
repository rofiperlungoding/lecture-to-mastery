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

Deno.serve(async (req) => {
  const origin = req.headers.get('origin')
  const headers = corsHeaders(origin)

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers })
  }

  try {
    const { documentId } = await req.json()
    if (!documentId) {
      return new Response(
        JSON.stringify({ error: 'documentId is required' }),
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
        JSON.stringify({ error: 'Invalid or expired session' }),
        { status: 401, headers: { ...headers, 'Content-Type': 'application/json' } },
      )
    }

    const allowed = await checkRateLimit(supabase, user.id, 'embed-document', 10, 300)
    if (!allowed) {
      return new Response(
        JSON.stringify({ error: 'Too many requests. Please wait before indexing another document.' }),
        { status: 429, headers: { ...headers, 'Content-Type': 'application/json' } },
      )
    }

    const { data: chunks, error } = await supabase
      .from('chunks')
      .select('id, content, chunk_index')
      .eq('document_id', documentId)
      .is('embedding', null)
      .order('chunk_index')

    if (error) throw error
    if (!chunks || chunks.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, embedded: 0, failedCount: 0 }),
        { headers: { ...headers, 'Content-Type': 'application/json' } },
      )
    }

    const BATCH_SIZE = 32
    const RATE_LIMIT_DELAY_MS = 300
    let embedded = 0
    const failedIndexes: number[] = []

    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE)
      const texts = batch.map((c) => c.content)

      const response = await fetch('https://api.mistral.ai/v1/embeddings', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${mistralKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model: 'mistral-embed', input: texts }),
      })

      if (!response.ok) {
        const body = await response.text()
        batch.forEach((c) => failedIndexes.push(c.chunk_index))
        console.error(`Batch ${i / BATCH_SIZE} failed: ${response.status} ${body}`)
        continue
      }

      const result = await response.json()
      if (!result.data || result.data.length !== batch.length) {
        batch.forEach((c) => failedIndexes.push(c.chunk_index))
        continue
      }

      for (let j = 0; j < result.data.length; j++) {
        const emb = result.data[j].embedding
        if (!emb || emb.length !== 1024) {
          failedIndexes.push(batch[j].chunk_index)
          continue
        }

        const { error: updateErr } = await supabase
          .from('chunks')
          .update({ embedding: emb })
          .eq('id', batch[j].id)

        if (updateErr) {
          failedIndexes.push(batch[j].chunk_index)
        } else {
          embedded++
        }
      }

      if (i + BATCH_SIZE < chunks.length) {
        await new Promise((r) => setTimeout(r, RATE_LIMIT_DELAY_MS))
      }
    }

    return new Response(
      JSON.stringify({ ok: true, embedded, failedCount: failedIndexes.length, failedIndexes }),
      { headers: { ...headers, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } },
    )
  }
})
