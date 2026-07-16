import { createClient } from 'npm:@supabase/supabase-js@2'

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  try {
    const url = new URL(origin);
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return true;
    if (url.hostname.endsWith('.lecture-to-mastery.pages.dev') || url.hostname === 'lecture-to-mastery.pages.dev') return true;
    return false;
  } catch { return false; }
}

function corsHeaders(origin: string | null) {
  const allowOrigin = isAllowedOrigin(origin) ? origin : 'http://localhost:5173'}

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

  if (req.method === 'OPTIONS') return new Response('ok', { headers })

  try {
    const { query } = await req.json()
    if (!query) {
      return new Response(JSON.stringify({ error: 'query is required' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const mistralKey = Deno.env.get('MISTRAL_API_KEY')!
    if (!supabaseUrl || !supabaseAnonKey || !mistralKey) throw new Error('Missing required environment variables')

    const authHeader = req.headers.get('Authorization') || ''
    const jwt = authHeader.replace('Bearer ', '')
    if (!jwt) return new Response(JSON.stringify({ error: 'Authentication required' }), { status: 401, headers: { ...headers, 'Content-Type': 'application/json' } })

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    })

    const { data: { user }, error: userErr } = await supabase.auth.getUser()
    if (userErr || !user) return new Response(JSON.stringify({ error: 'Invalid session' }), { status: 401, headers: { ...headers, 'Content-Type': 'application/json' } })

    // Rate limit: 20 searches per 60 seconds
    const allowed = await checkRateLimit(supabase, user.id, 'global-search', 20, 60)
    if (!allowed) {
      return new Response(
        JSON.stringify({ error: 'Too many requests. Please wait before searching again.' }),
        { status: 429, headers: { ...headers, 'Content-Type': 'application/json' } },
      )
    }

    // Embed the query
    const embedRes = await fetch('https://api.mistral.ai/v1/embeddings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${mistralKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'mistral-embed', input: [query] }),
    })
    if (!embedRes.ok) throw new Error(`Embedding API error: ${embedRes.status}`)

    const embedData = await embedRes.json()
    const qEmbedding = embedData.data?.[0]?.embedding
    if (!qEmbedding || qEmbedding.length !== 1024) throw new Error('Invalid embedding')

    // Search across all user chunks via match_chunks_all (RLS + auth.uid() scopes)
    const { data: matches, error: matchErr } = await supabase.rpc('match_chunks_all', {
      query_embedding: qEmbedding,
      match_count: 30,
    })
    if (matchErr) throw new Error(`RPC error: ${matchErr.message}`)
    if (!Array.isArray(matches) || matches.length === 0) {
      return new Response(JSON.stringify({ results: [] }), { headers: { ...headers, 'Content-Type': 'application/json' } })
    }

    // Fetch document titles
    const docIds = [...new Set(matches.map((m: any) => m.document_id))]
    const { data: docs } = await supabase.from('documents').select('id, title').in('id', docIds)
    const docTitles = new Map<string, string>()
    if (docs) docs.forEach((d: any) => docTitles.set(d.id, d.title))

    // Group results by document
    const grouped = new Map<string, { documentId: string; documentTitle: string; chunks: any[]; maxSimilarity: number }>()
    for (const m of matches) {
      const docId = m.document_id
      const title = docTitles.get(docId) || 'Unknown'
      if (!grouped.has(docId)) grouped.set(docId, { documentId: docId, documentTitle: title, chunks: [], maxSimilarity: 0 })
      const entry = grouped.get(docId)!
      entry.chunks.push({ id: m.id, content: m.content, chunkIndex: m.chunk_index, similarity: m.similarity })
      if (m.similarity > entry.maxSimilarity) entry.maxSimilarity = m.similarity
    }

    const results = Array.from(grouped.values()).sort((a, b) => b.maxSimilarity - a.maxSimilarity)

    return new Response(JSON.stringify({ results }), { headers: { ...headers, 'Content-Type': 'application/json' } })
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message, results: [] }), { status: 500, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } })
  }
})
