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

interface RawQuestion { question: string; options: string[]; correct_index: number; explanation: string; concept?: string }

function validateQuestion(q: unknown): q is RawQuestion {
  const obj = q as Record<string, unknown>
  if (typeof obj.question !== 'string' || obj.question.trim().length === 0) return false
  if (typeof obj.explanation !== 'string' || obj.explanation.trim().length === 0) return false
  if (!Array.isArray(obj.options) || obj.options.length !== 4) return false
  for (const opt of obj.options) { if (typeof opt !== 'string' || opt.trim().length === 0) return false }
  if (typeof obj.correct_index !== 'number' || !Number.isInteger(obj.correct_index)) return false
  if (obj.correct_index < 0 || obj.correct_index > 3) return false
  return true
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin')
  const headers = corsHeaders(origin)

  if (req.method === 'OPTIONS') return new Response('ok', { headers })

  try {
    const { documentId, count = 8 } = await req.json()
    if (!documentId) return new Response(JSON.stringify({ error: 'documentId is required' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } })
    if (typeof count !== 'number' || count < 1 || count > 20) return new Response(JSON.stringify({ error: 'count must be a number between 1 and 20' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } })

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    if (!supabaseUrl || !supabaseAnonKey) throw new Error('Missing required environment variables')

    const authHeader = req.headers.get('Authorization') || ''
    const jwt = authHeader.replace('Bearer ', '')
    if (!jwt) return new Response(JSON.stringify({ error: 'Authentication required' }), { status: 401, headers: { ...headers, 'Content-Type': 'application/json' } })

    const supabase = createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: `Bearer ${jwt}` } } })

    const { data: { user }, error: userErr } = await supabase.auth.getUser()
    if (userErr || !user) return new Response(JSON.stringify({ error: 'Invalid or expired session' }), { status: 401, headers: { ...headers, 'Content-Type': 'application/json' } })

    const allowed = await checkRateLimit(supabase, user.id, 'generate-quiz', 5, 300)
    if (!allowed) return new Response(JSON.stringify({ error: 'Too many requests. Please wait before generating another quiz.' }), { status: 429, headers: { ...headers, 'Content-Type': 'application/json' } })

    const { data: chunks, error } = await supabase.from('chunks').select('content, chunk_index').eq('document_id', documentId).order('chunk_index')
    if (error) throw error
    if (!chunks || chunks.length === 0) throw new Error('No chunks found for this document')

    const { data: doc } = await supabase
      .from('documents')
      .select('language')
      .eq('id', documentId)
      .single()
    const language: string = doc?.language || 'en'

    const maxSamples = 12
    let sampled: { content: string }[]
    if (chunks.length <= maxSamples) { sampled = chunks } else {
      const step = chunks.length / maxSamples; sampled = []
      for (let i = 0; i < maxSamples; i++) sampled.push(chunks[Math.floor(i * step)])
    }
    const context = sampled.map((c) => c.content).join('\n\n')

    const buildMessages = (qCount: number, extra?: string) => [
      { role: 'system' as const, content: 'You are a precise quiz generator. Output ONLY valid JSON with this exact shape — no other text:\n{\n  "questions": [\n    {\n      "question": "question text",\n      "options": ["A", "B", "C", "D"],\n      "correct_index": 0,\n      "explanation": "why this answer is correct",\n      "concept": "short topic label (1-4 words)"\n    }\n  ]\n}\n\nGenerate exactly ' + qCount + ' questions based on the provided document. Each question MUST have exactly 4 options (A/B/C/D). correct_index must be 0-3. All strings must be non-empty. Include a "concept" field for each question — a short 1-4 word topic label drawn from the document (e.g., "Big-O notation", "Array access", "Linked list insertion"). The concept field is required.\n\nIMPORTANT: Write ALL questions, options, explanations, and concept labels in the language corresponding to code "' + language + '".\n' + (extra ?? '') },
      { role: 'user' as const, content: `Generate ${qCount} quiz questions from:\n\n${context}` },
    ]

    let validQuestions: RawQuestion[] = []
    const { content: raw1 } = await chatComplete({ messages: buildMessages(count), temperature: 0.2, jsonMode: true })
    const parsed1 = JSON.parse(raw1)
    if (!Array.isArray(parsed1.questions)) throw new Error('Response missing "questions" array')
    validQuestions = parsed1.questions.filter(validateQuestion)

    if (validQuestions.length < count) {
      const shortfall = count - validQuestions.length
      try {
        const { content: raw2 } = await chatComplete({ messages: buildMessages(shortfall, `Previously generated ${validQuestions.length} valid questions. Generate ${shortfall} more.`), temperature: 0.2, jsonMode: true })
        const parsed2 = JSON.parse(raw2)
        if (Array.isArray(parsed2.questions)) validQuestions.push(...parsed2.questions.filter(validateQuestion))
      } catch {}
    }

    if (validQuestions.length === 0) throw new Error('Failed to generate any valid quiz questions after retry')

    const rows = validQuestions.map((q) => ({ document_id: documentId, question: q.question.trim(), options: q.options, correct_index: q.correct_index, explanation: q.explanation.trim(), concept: (q.concept || '').trim().slice(0, 100) }))

    await supabase.from('quiz_questions').delete().eq('document_id', documentId)
    const { error: insertErr } = await supabase.from('quiz_questions').insert(rows)
    if (insertErr) throw insertErr

    return new Response(JSON.stringify({ ok: true, inserted: validQuestions.length }), { headers: { ...headers, 'Content-Type': 'application/json' } })
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: (err as Error).message }), { status: 500, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } })
  }
})
