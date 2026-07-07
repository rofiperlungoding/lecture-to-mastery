import { createClient } from 'npm:@supabase/supabase-js@2'

function isLocalhostOrigin(origin: string | null): boolean {
  if (!origin) return false;
  const url = new URL(origin);
  return url.hostname === 'localhost' || url.hostname === '127.0.0.1';
}

const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:4173',
  'https://30031c7a.lecture-to-mastery.pages.dev',
]

function corsHeaders(origin: string | null) {
  const allowOrigin = origin && (ALLOWED_ORIGINS.includes(origin) || isLocalhostOrigin(origin)) ? origin : ALLOWED_ORIGINS[0]
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

interface SummaryResult {
  tldr: string
  keyPoints: string[]
  keyTerms: { term: string; definition: string }[]
}

function validateSummary(data: unknown): SummaryResult {
  const obj = data as Record<string, unknown>
  if (!obj || typeof obj !== 'object') throw new Error('Response is not a JSON object')
  if (typeof obj.tldr !== 'string' || obj.tldr.trim().length === 0) throw new Error('tldr must be a non-empty string')
  if (!Array.isArray(obj.keyPoints) || obj.keyPoints.length < 2 || obj.keyPoints.length > 10) throw new Error('keyPoints must be an array of 2-10 strings')
  for (const kp of obj.keyPoints) { if (typeof kp !== 'string') throw new Error('Each keyPoint must be a string') }
  if (!Array.isArray(obj.keyTerms)) throw new Error('keyTerms must be an array')
  for (const kt of obj.keyTerms) {
    const item = kt as Record<string, unknown>
    if (typeof item.term !== 'string' || typeof item.definition !== 'string') throw new Error('Each keyTerm must have a string term and definition')
  }
  return { tldr: (obj.tldr as string).trim(), keyPoints: obj.keyPoints as string[], keyTerms: obj.keyTerms as { term: string; definition: string }[] }
}

async function callMistral(messages: { role: string; content: string }[], apiKey: string): Promise<unknown> {
  const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'mistral-small-latest', messages, temperature: 0.2, response_format: { type: 'json_object' } }),
  })
  if (!response.ok) { const body = await response.text(); throw new Error(`Mistral API error: ${response.status} ${body}`) }
  const result = await response.json()
  const content = result.choices?.[0]?.message?.content ?? ''
  try { return JSON.parse(content) } catch { throw new Error('Failed to parse Mistral response as JSON') }
}

const MODE_PROMPTS: Record<string, string> = {
  'eli5': 'You are a study assistant explaining complex topics simply. Output ONLY valid JSON with this exact shape:\n{\n  "tldr": "Explain this document like I am 10 years old — simple analogies, no jargon, one paragraph",\n  "keyPoints": ["point 1", "point 2", ...],\n  "keyTerms": [{"term": "term name", "definition": "simple definition"}, ...]\n}\n\nRules:\n- tldr: use everyday language, analogies, avoid jargon\n- keyPoints: 3-5 simple bullet points\n- keyTerms: at least 2 important terms defined in plain language',
  'detailed': 'You are a precise study assistant. Output ONLY valid JSON with this exact shape:\n{\n  "tldr": "comprehensive 3-4 sentence summary covering main thesis, evidence, and conclusions",\n  "keyPoints": ["point 1", "point 2", ...],\n  "keyTerms": [{"term": "term name", "definition": "thorough definition with context"}, ...]\n}\n\nRules:\n- tldr: thorough, include methodology and conclusions\n- keyPoints: 5-8 detailed bullet points with supporting evidence\n- keyTerms: at least 4 terms with detailed definitions',
  'cheat-sheet': 'You are a study assistant creating quick-reference material. Output ONLY valid JSON with this exact shape:\n{\n  "tldr": "Ultra-condensed: 1 sentence capturing the single most important takeaway",\n  "keyPoints": ["short bullet 1", "short bullet 2", ...],\n  "keyTerms": [{"term": "term name", "definition": "one-line definition"}, ...]\n}\n\nRules:\n- tldr: maximum 20 words, just the essential takeaway\n- keyPoints: exactly 5 crisp, scannable bullets — each 15 words max\n- keyTerms: at least 2 terms with one-line definitions',
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin')
  const headers = corsHeaders(origin)

  if (req.method === 'OPTIONS') return new Response('ok', { headers })

  try {
    const { documentId, mode = 'detailed' } = await req.json()
    if (!documentId) {
      return new Response(JSON.stringify({ error: 'documentId is required' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } })
    }

    const validModes = ['eli5', 'detailed', 'cheat-sheet']
    if (!validModes.includes(mode)) {
      return new Response(JSON.stringify({ error: 'mode must be one of: eli5, detailed, cheat-sheet' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } })
    }

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

    const allowed = await checkRateLimit(supabase, user.id, 'summarize-document', 10, 300)
    if (!allowed) return new Response(JSON.stringify({ error: 'Too many requests. Please wait before generating another summary.' }), { status: 429, headers: { ...headers, 'Content-Type': 'application/json' } })

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

    const systemContent = MODE_PROMPTS[mode]
    const systemMessage = { role: 'system' as const, content: systemContent }
    const userMessage = { role: 'user' as const, content: `Generate a ${mode} summary of this document:\n\n${context}` }

    let summary: SummaryResult
    try {
      const parsed = await callMistral([systemMessage, userMessage], mistralKey)
      summary = validateSummary(parsed)
    } catch {
      try { const parsed = await callMistral([systemMessage, userMessage], mistralKey); summary = validateSummary(parsed) }
      catch (retryErr) { throw new Error(`Summary generation failed after retr
y: ${retryErr}`)}
    }
    return new Response(JSON.stringify(summary), { headers: { ...headers, 'Content-Type': 'application/json' } })
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500, headers: { ...headers, 'Content-Type': 'application/json' } })
  }
})
