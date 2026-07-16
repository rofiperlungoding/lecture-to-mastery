import { createClient } from 'npm:@supabase/supabase-js@2'
import { chatComplete } from '../shared/llm.ts'

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false
  try {
    const url = new URL(origin)
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return true
    if (url.hostname.endsWith('.lecture-to-mastery.pages.dev') || url.hostname === 'lecture-to-mastery.pages.dev') return true
    if (url.hostname.endsWith('.netlify.app')) return true
    return false
  } catch { return false }
}

const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:4173',
  'https://master.lecture-to-mastery.pages.dev',
  'https://preview-phase1-2.lecture-to-mastery.pages.dev',
]

function corsHeaders(origin: string | null) {
  const allowOrigin = origin && (ALLOWED_ORIGINS.includes(origin) || isAllowedOrigin(origin)) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Max-Age': '86400',
  }
}

async function checkRateLimit(supabase: ReturnType<typeof createClient>, userId: string, endpoint: string, maxCalls: number, windowSec: number): Promise<boolean> {
  const cutoff = new Date(Date.now() - windowSec * 1000).toISOString()
  const { count, error } = await supabase.from('rate_limits').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('endpoint', endpoint).gte('window_start', cutoff)
  if (error) return true
  if (count !== null && count >= maxCalls) return false
  await supabase.from('rate_limits').insert({ user_id: userId, endpoint })
  return true
}

interface RawNode { id: string; label: string; importance: number }
interface RawEdge { source: string; target: string; label: string }
interface RawConceptMap { nodes: RawNode[]; edges: RawEdge[] }

function validateConceptMap(data: unknown): RawConceptMap {
  const obj = data as Record<string, unknown>
  if (!obj || typeof obj !== 'object') throw new Error('Response is not a JSON object')
  if (!Array.isArray(obj.nodes) || obj.nodes.length === 0) throw new Error('nodes must be a non-empty array')
  if (!Array.isArray(obj.edges)) throw new Error('edges must be an array')
  const nodeIds = new Set<string>()
  const nodes: RawNode[] = []
  for (const n of obj.nodes) {
    const node = n as Record<string, unknown>
    if (typeof node.id !== 'string' || node.id.trim().length === 0) throw new Error('Each node must have a non-empty string id')
    if (typeof node.label !== 'string' || node.label.trim().length === 0) throw new Error('Each node must have a non-empty string label')
    if (typeof node.importance !== 'number' || node.importance < 1 || node.importance > 3) throw new Error('Each node must have importance 1-3')
    if (nodeIds.has(node.id)) throw new Error(`Duplicate node id: ${node.id}`)
    nodeIds.add(node.id)
    nodes.push({ id: node.id.trim(), label: node.label.trim(), importance: Math.round(node.importance) })
  }
  const edges: RawEdge[] = []
  const edgeKeys = new Set<string>()
  for (const e of obj.edges) {
    const edge = e as Record<string, unknown>
    if (typeof edge.source !== 'string' || edge.source.trim().length === 0) throw new Error('Each edge must have a non-empty source')
    if (typeof edge.target !== 'string' || edge.target.trim().length === 0) throw new Error('Each edge must have a non-empty target')
    if (!nodeIds.has(edge.source)) throw new Error(`Edge source "${edge.source}" not found in nodes`)
    if (!nodeIds.has(edge.target)) throw new Error(`Edge target "${edge.target}" not found in nodes`)
    if (typeof edge.label !== 'string' || edge.label.trim().length === 0) throw new Error('Each edge must have a non-empty label')
    const key = `${edge.source.trim()}-${edge.target.trim()}`
    if (edgeKeys.has(key)) continue
    edgeKeys.add(key)
    edges.push({ source: edge.source.trim(), target: edge.target.trim(), label: edge.label.trim() })
  }
  return { nodes, edges }
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin')
  const headers = corsHeaders(origin)
  if (req.method === 'OPTIONS') return new Response('ok', { headers })

  try {
    const { documentId } = await req.json()
    if (!documentId) return new Response(JSON.stringify({ error: 'documentId is required' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } })

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    if (!supabaseUrl || !supabaseAnonKey) throw new Error('Missing required environment variables')

    const authHeader = req.headers.get('Authorization') || ''
    const jwt = authHeader.replace('Bearer ', '')
    if (!jwt) return new Response(JSON.stringify({ error: 'Authentication required' }), { status: 401, headers: { ...headers, 'Content-Type': 'application/json' } })

    const supabase = createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: `Bearer ${jwt}` } } })
    const { data: { user }, error: userErr } = await supabase.auth.getUser()
    if (userErr || !user) return new Response(JSON.stringify({ error: 'Invalid or expired session' }), { status: 401, headers: { ...headers, 'Content-Type': 'application/json' } })

    const allowed = await checkRateLimit(supabase, user.id, 'generate-concept-map', 5, 300)
    if (!allowed) return new Response(JSON.stringify({ error: 'Too many requests. Please wait before generating another concept map.' }), { status: 429, headers: { ...headers, 'Content-Type': 'application/json' } })

    const { data: chunks, error: chunkErr } = await supabase.from('chunks').select('content, chunk_index').eq('document_id', documentId).order('chunk_index')
    if (chunkErr) throw chunkErr
    if (!chunks || chunks.length === 0) throw new Error('No chunks found for this document')

    const { data: doc } = await supabase.from('documents').select('language').eq('id', documentId).single()
    const language: string = doc?.language || 'en'

    const maxSamples = 12
    let sampled: { content: string }[]
    if (chunks.length <= maxSamples) { sampled = chunks } else {
      const step = chunks.length / maxSamples; sampled = []
      for (let i = 0; i < maxSamples; i++) sampled.push(chunks[Math.floor(i * step)])
    }
    const context = sampled.map((c) => c.content).join('\n\n')

    let seedTerms = ''
    try {
      const { data: summaryArtifact } = await supabase.from('doc_artifacts').select('content').eq('document_id', documentId).eq('artifact_type', 'summary_detailed').single()
      if (summaryArtifact?.content) {
        const summary = summaryArtifact.content as { keyTerms?: { term: string; definition: string }[] }
        if (summary.keyTerms && summary.keyTerms.length > 0) {
          seedTerms = 'Use these key terms as the primary nodes in your concept map:\n' + summary.keyTerms.map((kt: { term: string; definition: string }) => `- "${kt.term}": ${kt.definition}`).join('\n')
        }
      }
    } catch {}

    const systemMessage = {
      role: 'system' as const,
      content: `You are a precise concept map generator. Output ONLY valid JSON with this exact shape — no other text:\n{\n  "nodes": [\n    { "id": "unique-slug", "label": "Display Name", "importance": 2 }\n  ],\n  "edges": [\n    { "source": "node-id-1", "target": "node-id-2", "label": "relation description (2-6 words)" }\n  ]\n}\n\nRules:\n- Extract 5-10 key concepts from the document as nodes\n- Each node must have: id (kebab-case unique slug), label (short display name, 1-4 words), importance (1=minor, 2=important, 3=core concept)\n- Edges represent meaningful relationships between concepts\n- Each edge must have: source (existing node id), target (existing node id), label (short relation description)\n- Every edge's source and target must reference valid node ids\n- Focus on the most important concepts and their relationships\n${seedTerms ? `\n${seedTerms}\nNote: Add any additional relevant nodes beyond the key terms as needed.` : ''}\n\nIMPORTANT: Write ALL node labels, edge labels, and descriptions in the language corresponding to code "${language}".`
    }
    const userMessage = { role: 'user' as const, content: `Generate a concept map from this document:\n\n${context}` }

    let conceptMap: RawConceptMap
    try {
      const { content: raw } = await chatComplete({ messages: [systemMessage, userMessage], temperature: 0.2, jsonMode: true })
      conceptMap = validateConceptMap(JSON.parse(raw))
    } catch {
      try {
        const { content: raw } = await chatComplete({ messages: [systemMessage, userMessage], temperature: 0.2, jsonMode: true })
        conceptMap = validateConceptMap(JSON.parse(raw))
      } catch (retryErr) { throw new Error(`Concept map generation failed after retry: ${(retryErr as Error).message}`) }
    }

    const { error: upsertErr } = await supabase.from('doc_artifacts').upsert({
      document_id: documentId, user_id: user.id, artifact_type: 'concept_map', content: conceptMap,
    }, { onConflict: 'document_id, user_id, artifact_type', ignoreDuplicates: false })
    if (upsertErr) console.error('Failed to cache concept map:', upsertErr.message)

    return new Response(JSON.stringify(conceptMap), { headers: { ...headers, 'Content-Type': 'application/json' } })
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } })
  }
})
