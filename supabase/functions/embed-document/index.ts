import { createClient } from 'npm:@supabase/supabase-js@2'

// ═══════════════════════════════════════════════════════════════════════════
// F1 FIXES:
//   1. Added 25s timeout on Mistral fetch (AbortSignal)
//   2. Added retry with exponential backoff (2 retries: 1s, 3s)
//   3. Uses SUPABASE_SERVICE_ROLE_KEY for write operations (bypasses RLS)
//   4. Extended response contract with totalChunks for frontend progress
//   5. All error responses now have { ok: false, error: ... } shape
// ═══════════════════════════════════════════════════════════════════════════

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

/**
 * Call Mistral embeddings API with timeout + retry.
 * Returns the parsed response data or throws on exhaustion.
 */
async function embedWithRetry(
  texts: string[],
  mistralKey: string,
  retries = 2,
): Promise<{ data: Array<{ embedding: number[] }> }> {
  const MISTRAL_TIMEOUT_MS = 25_000
  const BACKOFFS_MS = [1_000, 3_000]

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), MISTRAL_TIMEOUT_MS)

      const response = await fetch('https://api.mistral.ai/v1/embeddings', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${mistralKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ model: 'mistral-embed', input: texts }),
        signal: controller.signal,
      })
      clearTimeout(timeoutId)

      if (!response.ok) {
        const body = await response.text()
        console.error(`Mistral API attempt ${attempt + 1}: ${response.status} ${body}`)
        if (attempt < retries) {
          await new Promise((r) => setTimeout(r, BACKOFFS_MS[attempt]))
          continue
        }
        throw new Error(`Mistral API error after ${retries + 1} attempts: ${response.status} ${body}`)
      }

      const result = await response.json()
      if (!result.data || !Array.isArray(result.data)) {
        throw new Error('Mistral returned unexpected response shape (missing data array)')
      }
      return result
    } catch (err) {
      const isTimeout = err instanceof DOMException && err.name === 'AbortError'
      if (isTimeout) {
        console.error(`Mistral API attempt ${attempt + 1}: TIMEOUT after ${MISTRAL_TIMEOUT_MS}ms`)
      }
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, BACKOFFS_MS[attempt]))
        continue
      }
      throw new Error(
        `Mistral API failed after ${retries + 1} attempts: ${isTimeout ? 'timeout' : (err as Error).message}`,
      )
    }
  }

  throw new Error('Unexpected: retry loop exhausted without returning or throwing')
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
        JSON.stringify({ ok: false, error: 'documentId is required' }),
        { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } },
      )
    }

    // ── Read env vars ─────────────────────────────────────────────────
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const mistralKey = Deno.env.get('MISTRAL_API_KEY')!

    if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey || !mistralKey) {
      const missing = [
        !supabaseUrl && 'SUPABASE_URL',
        !supabaseAnonKey && 'SUPABASE_ANON_KEY',
        !serviceRoleKey && 'SUPABASE_SERVICE_ROLE_KEY',
        !mistralKey && 'MISTRAL_API_KEY',
      ].filter(Boolean).join(', ')
      return new Response(
        JSON.stringify({ ok: false, error: `Missing environment variables: ${missing}` }),
        { status: 500, headers: { ...headers, 'Content-Type': 'application/json' } },
      )
    }

    // ── Auth: verify user via JWT ─────────────────────────────────────
    const authHeader = req.headers.get('Authorization') || ''
    const jwt = authHeader.replace('Bearer ', '')
    if (!jwt) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Authentication required' }),
        { status: 401, headers: { ...headers, 'Content-Type': 'application/json' } },
      )
    }

    // Auth client (user-scoped for identity verification + rate limit)
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    })

    // Service-role client (bypasses RLS for DB writes — embedding writes
    // must succeed regardless of RLS policies)
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    })

    const { data: { user }, error: userErr } = await authClient.auth.getUser()
    if (userErr || !user) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Invalid or expired session' }),
        { status: 401, headers: { ...headers, 'Content-Type': 'application/json' } },
      )
    }

    const allowed = await checkRateLimit(authClient, user.id, 'embed-document', 10, 300)
    if (!allowed) {
      return new Response(
        JSON.stringify({ ok: false, error: 'Too many requests. Please wait before indexing another document.' }),
        { status: 429, headers: { ...headers, 'Content-Type': 'application/json' } },
      )
    }

    // ── Fetch unembedded chunks (idempotent: only embedding IS NULL) ──
    const { data: chunks, error: fetchErr } = await adminClient
      .from('chunks')
      .select('id, content, chunk_index')
      .eq('document_id', documentId)
      .is('embedding', null)
      .order('chunk_index')

    if (fetchErr) {
      return new Response(
        JSON.stringify({ ok: false, error: `Failed to query chunks: ${fetchErr.message}` }),
        { status: 500, headers: { ...headers, 'Content-Type': 'application/json' } },
      )
    }

    if (!chunks || chunks.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, totalChunks: 0, embedded: 0, failedCount: 0, failedIndexes: [] }),
        { headers: { ...headers, 'Content-Type': 'application/json' } },
      )
    }

    const totalChunks = chunks.length
    const BATCH_SIZE = 32
    const RATE_LIMIT_DELAY_MS = 300
    let embedded = 0
    const failedIndexes: number[] = []

    // ── Batch embed through Mistral ───────────────────────────────────
    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE)
      const texts = batch.map((c) => c.content)

      try {
        const result = await embedWithRetry(texts, mistralKey)

        // Validate response length
        if (result.data.length !== batch.length) {
          console.error(
            `Batch ${Math.floor(i / BATCH_SIZE)}: expected ${batch.length} embeddings, got ${result.data.length}`,
          )
          batch.forEach((c) => failedIndexes.push(c.chunk_index))
          continue
        }

        // Write each embedding via service-role client
        for (let j = 0; j < result.data.length; j++) {
          const emb = result.data[j].embedding
          if (!emb || emb.length !== 1024) {
            console.error(
              `Chunk ${batch[j].chunk_index}: expected 1024-dim embedding, got ${emb?.length ?? 'none'}`,
            )
            failedIndexes.push(batch[j].chunk_index)
            continue
          }

          const { error: updateErr } = await adminClient
            .from('chunks')
            .update({ embedding: emb })
            .eq('id', batch[j].id)

          if (updateErr) {
            console.error(`Failed to update chunk ${batch[j].id}: ${updateErr.message}`)
            failedIndexes.push(batch[j].chunk_index)
          } else {
            embedded++
          }
        }
      } catch (err) {
        // Batch-level failure (all Mistral retries exhausted)
        console.error(`Batch ${Math.floor(i / BATCH_SIZE)} failed after retries: ${(err as Error).message}`)
        batch.forEach((c) => failedIndexes.push(c.chunk_index))
      }

      // Rate-limit delay between batches
      if (i + BATCH_SIZE < chunks.length) {
        await new Promise((r) => setTimeout(r, RATE_LIMIT_DELAY_MS))
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        totalChunks,
        embedded,
        failedCount: failedIndexes.length,
        failedIndexes,
      }),
      { headers: { ...headers, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    console.error(`embed-document fatal error: ${(err as Error).message}`)
    return new Response(
      JSON.stringify({ ok: false, error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } },
    )
  }
})
