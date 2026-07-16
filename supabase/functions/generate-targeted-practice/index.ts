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
  return { 'Access-Control-Allow-Origin': allowOrigin, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Max-Age': '86400' }
}

async function checkRateLimit(supabase: ReturnType<typeof createClient>, userId: string, endpoint: string, maxCalls: number, windowSec: number): Promise<boolean> {
  const cutoff = new Date(Date.now() - windowSec * 1000).toISOString()
  const { count, error } = await supabase.from('rate_limits').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('endpoint', endpoint).gte('window_start', cutoff)
  if (error) return true
  if (count !== null && count >= maxCalls) return false
  await supabase.from('rate_limits').insert({ user_id: userId, endpoint })
  return true
}

interface RawQuestion { question: string; options: string[]; correct_index: number; explanation: string; concept: string }
interface RawFlashcard { front: string; back: string; concept?: string }

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

function validateFlashcard(f: unknown): f is RawFlashcard {
  const obj = f as Record<string, unknown>
  if (typeof obj.front !== 'string' || obj.front.trim().length === 0) return false
  if (typeof obj.back !== 'string' || obj.back.trim().length === 0) return false
  return true
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin')
  const headers = corsHeaders(origin)
  if (req.method === 'OPTIONS') return new Response('ok', { headers })

  try {
    const { documentId, mode } = await req.json()
    if (!documentId) return new Response(JSON.stringify({ error: 'documentId is required' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } })
    if (mode !== 'quiz' && mode !== 'flashcards') return new Response(JSON.stringify({ error: 'mode must be "quiz" or "flashcards"' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } })

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    if (!supabaseUrl || !supabaseAnonKey) throw new Error('Missing required environment variables')

    const authHeader = req.headers.get('Authorization') || ''
    const jwt = authHeader.replace('Bearer ', '')
    if (!jwt) return new Response(JSON.stringify({ error: 'Authentication required' }), { status: 401, headers: { ...headers, 'Content-Type': 'application/json' } })

    const supabase = createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: `Bearer ${jwt}` } } })
    const { data: { user }, error: userErr } = await supabase.auth.getUser()
    if (userErr || !user) return new Response(JSON.stringify({ error: 'Invalid or expired session' }), { status: 401, headers: { ...headers, 'Content-Type': 'application/json' } })

    const allowed = await checkRateLimit(supabase, user.id, 'generate-targeted-practice', 5, 300)
    if (!allowed) return new Response(JSON.stringify({ error: 'Too many requests. Please wait before generating more practice.' }), { status: 429, headers: { ...headers, 'Content-Type': 'application/json' } })

    let conceptList: string[]
    const { data: weakConcepts, error: masteryErr } = await supabase.rpc('get_weak_concepts', { p_document_id: documentId })
    if (masteryErr) {
      console.error('get_weak_concepts RPC failed:', masteryErr)
      const { data: allConcepts, error: fallbackErr } = await supabase.from('concept_mastery').select('concept, attempts, correct').eq('document_id', documentId).eq('user_id', user.id).order('correct', { ascending: true }).limit(5)
      if (fallbackErr) throw fallbackErr
      const weakOnes = (allConcepts ?? []).filter((c: any) => { const pct = c.attempts > 0 ? c.correct / c.attempts : 0; return pct < 0.7 })
      const focusConcepts = weakOnes.length > 0 ? weakOnes.map((c: any) => c.concept) : (allConcepts ?? []).map((c: any) => c.concept)
      conceptList = focusConcepts.length > 0 ? focusConcepts : ['key concepts from the document']
    } else {
      const weakList = (weakConcepts ?? []) as Array<{ concept: string; attempts: number; correct: number; mastery: number }>
      conceptList = weakList.length > 0 ? weakList.map((c) => c.concept) : ['key concepts from the document']
    }

    const { data: docLang } = await supabase.from('documents').select('language').eq('id', documentId).single()
    const language: string = docLang?.language || 'en'

    const { data: chunks, error: chunkErr } = await supabase.from('chunks').select('content, chunk_index').eq('document_id', documentId).order('chunk_index')
    if (chunkErr) throw chunkErr
    if (!chunks || chunks.length === 0) throw new Error('No chunks found for this document')

    const maxSamples = 12
    let sampled: { content: string }[]
    if (chunks.length <= maxSamples) { sampled = chunks } else {
      const step = chunks.length / maxSamples; sampled = []
      for (let i = 0; i < maxSamples; i++) sampled.push(chunks[Math.floor(i * step)])
    }
    const context = sampled.map((c: any) => c.content).join('\n\n')
    const conceptStr = conceptList.join(', ')

    if (mode === 'quiz') {
      const count = 6
      const systemMsg = 'You are a precise quiz generator. Output ONLY valid JSON with this exact shape:\n{\n  "questions": [\n    {\n      "question": "question text",\n      "options": ["A", "B", "C", "D"],\n      "correct_index": 0,\n      "explanation": "why this answer is correct",\n      "concept": "short topic label (1-4 words)"\n    }\n  ]\n}\n\nGenerate exactly ' + count + ' questions. Each question MUST have exactly 4 options. correct_index must be 0-3. Focus on these weak areas: ' + conceptStr + '.\n\nIMPORTANT: Write ALL questions, options, explanations, and concept labels in the language corresponding to code "' + language + '".'

      let validQuestions: RawQuestion[] = []
      const { content: raw1 } = await chatComplete({ messages: [{ role: 'system', content: systemMsg }, { role: 'user', content: `Generate ${count} quiz questions focused on: ${conceptStr}\n\n${context}` }], temperature: 0.2, jsonMode: true })
      validQuestions = (JSON.parse(raw1).questions ?? []).filter(validateQuestion)

      if (validQuestions.length < count) {
        const shortfall = count - validQuestions.length
        try {
          const { content: raw2 } = await chatComplete({ messages: [{ role: 'system', content: systemMsg }, { role: 'user', content: `Previously generated ${validQuestions.length} valid questions. Generate ${shortfall} more focused on: ${conceptStr}\n\n${context}` }], temperature: 0.2, jsonMode: true })
          validQuestions.push(...(JSON.parse(raw2).questions ?? []).filter(validateQuestion))
        } catch {}
      }

      if (validQuestions.length === 0) throw new Error('Failed to generate any valid quiz questions after retry')

      await supabase.from('quiz_questions').delete().eq('document_id', documentId)
      const { error: insertErr } = await supabase.from('quiz_questions').insert(validQuestions.map((q) => ({
        document_id: documentId, question: q.question.trim(), options: q.options, correct_index: q.correct_index, explanation: q.explanation.trim(), concept: (q.concept || '').trim().slice(0, 100),
      })))
      if (insertErr) throw insertErr
      return new Response(JSON.stringify({ ok: true, inserted: validQuestions.length, mode: 'quiz', concepts: conceptList }), { headers: { ...headers, 'Content-Type': 'application/json' } })
    }

    const fcCount = 8
    const fcSystemMsg = 'You are a precise flashcard generator. Output ONLY valid JSON:\n{\n  "flashcards": [\n    {\n      "front": "concise question or term",\n      "back": "clear answer or definition",\n      "concept": "short topic label (1-4 words)"\n    }\n  ]\n}\n\nGenerate exactly ' + fcCount + ' flashcards. Focus on these weak areas: ' + conceptStr + '.\n\nIMPORTANT: Write ALL flashcards in the language corresponding to code "' + language + '".'

    let validCards: RawFlashcard[] = []
    const { content: rawFc1 } = await chatComplete({ messages: [{ role: 'system', content: fcSystemMsg }, { role: 'user', content: `Generate ${fcCount} flashcards focused on: ${conceptStr}\n\n${context}` }], temperature: 0.2, jsonMode: true })
    validCards = (JSON.parse(rawFc1).flashcards ?? []).filter(validateFlashcard)

    if (validCards.length < fcCount) {
      const shortfall = fcCount - validCards.length
      try {
        const { content: rawFc2 } = await chatComplete({ messages: [{ role: 'system', content: fcSystemMsg }, { role: 'user', content: `Previously generated ${validCards.length} valid flashcards. Generate ${shortfall} more focused on: ${conceptStr}\n\n${context}` }], temperature: 0.2, jsonMode: true })
        validCards.push(...(JSON.parse(rawFc2).flashcards ?? []).filter(validateFlashcard))
      } catch {}
    }

    if (validCards.length === 0) throw new Error('Failed to generate any valid flashcards after retry')

    await supabase.from('flashcards').delete().eq('document_id', documentId)
    const { error: fcInsertErr } = await supabase.from('flashcards').insert(validCards.map((fc) => ({ document_id: documentId, user_id: user.id, front: fc.front.trim(), back: fc.back.trim() })))
    if (fcInsertErr) throw fcInsertErr
    return new Response(JSON.stringify({ ok: true, inserted: validCards.length, mode: 'flashcards', concepts: conceptList }), { headers: { ...headers, 'Content-Type': 'application/json' } })
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: (err as Error).message }), { status: 500, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } })
  }
})
