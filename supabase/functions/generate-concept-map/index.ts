import { createClient } from 'npm:@supabase/supabase-js@2'

const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:5174',
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

interface ConceptMapData {
  nodes: { id: string; label: string }[]
  edges: { from: string; to: string; label: string }[]
}

function validateConceptMap(data: unknown): ConceptMapData {
  const obj = data as Record<string, unknown>
  if (!obj || typeof obj !== 'object') throw new Error('Response is not a JSON object')
  if (!Array.isArray(obj.nodes)) throw new Error('nodes must be an array')
  if (!Array.isArray(obj.edges)) throw new Error('edges must be an array')
  for (const n of obj.nodes) {
    const node = n as Record<string, unknown>
    if (typeof node.id !== 'string' || typeof node.label !== 'string') throw new Error('Each node must have string id and label')
  }
  const nodeIds = new Set(obj.nodes.map((n: Record<string, unknown>) => n.id))
  for (const e of obj.edges) {
    const edge = e as Record<string, unknown>
    if (typeof edge.from !== 'string' || typeof edge.to !== 'string' || typeof edge.label !== 'string') throw new Error('Each edge must have string from, to, and label')
    if (!nodeIds.has(edge.from as string)) throw new Error(`Edge references unknown node: ${edge.from}`)
    if (!nodeIds.has(edge.to as string)) throw new Error(`Edge references unknown node: ${edge.to}`)
  }
  return { nodes: obj.nodes as { id: string; label: string }[], edges: obj.edges as { from: string; to: string; label: string }[] }
}

async function callMistral(messages: { role: string; content: string }[], apiKey: string): Promise<unknown> {
  const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'mistral-small-latest', messages, temperature: 0.3, response_format: { type: 'json_object' } }),
  })
  if (!response.ok) { const body = await response.text(); throw new Error(`Mistral API error: ${response.status} ${body}`) }
  const result = await response.json()
  const content = result.choices?.[0]?.message?.content ?? ''
  try { return JSON.parse(content) } catch { throw new Error('Failed to parse Mistral response as JSON') }
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin')
  const headers = corsHeaders(origin)

  if (req.method === 'OPTIONS') return new Response('ok', { headers })

  try {
    const { documentId } = await req.json()
    if (!documentId) {
      return new Response(JSON.stringify({ error: 'documentId is required' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } })
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

    const allowed = await checkRateLimit(supabase, user.id, 'generate-concept-map', 5, 300)
    if (!allowed) return new Response(JSON.stringify({ error: 'Too many requests. Please wait before generating another concept map.' }), { status: 429, headers: { ...headers, 'Content-Type': 'application/json' } })

    const { data: chunks, error } = await supabase.from('chunks').select('content, chunk_index').eq('document_id', documentId).order('chunk_index')
    if (error) throw error
    if (!chunks || chunks.length === 0) throw new Error('No chunks found for this document')

    const maxSamples = 10
    let sampled: { content: string }[]
    if (chunks.length <= maxSamples) { sampled = chunks } else {
      const step = chunks.length / maxSamples; sampled = []
      for (let i = 0; i < maxSamples; i++) sampled.push(chunks[Math.floor(i * step)])
    }
    const context = sampled.map((c) => c.content).join('\n\n')

    const systemMessage = {
      role: 'system' as const,
      content: 'You are a precise study assistant. Analyze the provided document and extract a concept map showing how the key ideas relate to each other. Output ONLY valid JSON with this exact shape — no other text, no markdown, no explanation:\n{\n  "nodes": [{"id": "unique-id", "label": "Short concept name"}],\n  "edges": [{"from": "source-node-id", "to": "target-node-id", "label": "relationship description"}]\n}\n\nRules:\n- Include 5-10 nodes representing the main concepts from the document\n- Include 5-12 edges showing meaningful relationships\n- Node IDs must be short kebab-case strings (e.g., \"cell-theory\")\n- Edge labels should describe the relationship (e.g., \"depends on\", \"contrasts with\", \"leads to\", \"is a type of\")\n- Every edge must reference valid node IDs\n- Keep node labels concise (3-5 words max)\n- Do not include edges that are trivial or obvious',
    }
    const userMessage = { role: 'user' as const, content: `Generate a concept map for this document:\n\n${context}` }

    let conceptMap: ConceptMapData
    try {
      const parsed = await callMistral([systemMessage, userMessage], mistralKey)
      conceptMap = validateConceptMap(parsed)
    } catch {
      try { const parsed = await callMistral([systemMessage, userMessage], mistralKey); conceptMap = validateConceptMap(parsed) }
      catch (retryErr) { throw new Error(`Concept map generation failed after retry: ${(retryErr as Error).message}`) }
    }

    // Cache the result
    await supabase.from('doc_artifacts').upsert({
      document_id: documentId,
      user_id: user.id,
      artifact_type: 'concept_map',
      content: conceptMap,
      updated_at: new Date().toISOString(),
    }, { onConflict: "document_id, artifact_type", ignoreDuplicates: false })

    return new Response(JSON.stringify({ ...conceptMap, cached: false }), { headers: { ...headers, 'Content-Type': 'application/json' } })
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } })
  }
})
