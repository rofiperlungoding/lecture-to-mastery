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

async function checkRateLimit(supabase: any, userId: string, endpoint: string, maxCalls: number, windowSec: number): Promise<boolean> {
  const cutoff = new Date(Date.now() - windowSec * 1000).toISOString()
  const { count, error } = await supabase.from('rate_limits').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('endpoint', endpoint).gte('window_start', cutoff)
  if (error) return true
  if (count !== null && count >= maxCalls) return false
  await supabase.from('rate_limits').insert({ user_id: userId, endpoint })
  return true
}

function validateQuizQuestion(q: unknown): boolean {
  const obj = q as Record<string, unknown>
  if (typeof obj.question !== 'string' || obj.question.trim().length === 0) return false
  if (typeof obj.explanation !== 'string' || obj.explanation.trim().length === 0) return false
  if (!Array.isArray(obj.options) || obj.options.length !== 4) return false
  for (const opt of obj.options) { if (typeof opt !== 'string' || opt.trim().length === 0) return false }
  if (typeof obj.correct_index !== 'number' || !Number.isInteger(obj.correct_index) || obj.correct_index < 0 || obj.correct_index > 3) return false
  return true
}

function validateFlashcard(f: unknown): boolean {
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
    const { courseId, mode } = await req.json()
    if (!courseId || !mode) return new Response(JSON.stringify({ error: 'courseId and mode are required' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } })
    if (mode !== 'quiz' && mode !== 'flashcards') return new Response(JSON.stringify({ error: 'mode must be "quiz" or "flashcards"' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } })

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    if (!supabaseUrl || !supabaseAnonKey) throw new Error('Missing required environment variables')

    const authHeader = req.headers.get('Authorization') || ''
    const jwt = authHeader.replace('Bearer ', '')
    if (!jwt) return new Response(JSON.stringify({ error: 'Authentication required' }), { status: 401, headers: { ...headers, 'Content-Type': 'application/json' } })

    const supabase = createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: `Bearer ${jwt}` } } })
    const { data: { user }, error: userErr } = await supabase.auth.getUser()
    if (userErr || !user) return new Response(JSON.stringify({ error: 'Invalid session' }), { status: 401, headers: { ...headers, 'Content-Type': 'application/json' } })

    const allowed = await checkRateLimit(supabase, user.id, 'generate-course-practice', 5, 300)
    if (!allowed) return new Response(JSON.stringify({ error: 'Too many requests.' }), { status: 429, headers: { ...headers, 'Content-Type': 'application/json' } })

    const { data: members, error: membersErr } = await supabase.from('course_documents').select('document_id, documents!inner(id, title)').eq('course_id', courseId)
    if (membersErr) throw new Error(`Course access error: ${membersErr.message}`)
    if (!members || members.length === 0) return new Response(JSON.stringify({ error: 'Course has no documents' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } })

    const docIds = members.map((m: any) => m.document_id)
    const docTitles = new Map<string, string>()
    members.forEach((m: any) => docTitles.set(m.document_id, m.documents?.title || 'Unknown'))

    const { data: courseDocs } = await supabase.from('documents').select('language').in('id', docIds)
    const langCounts = new Map<string, number>()
    for (const d of courseDocs ?? []) {
      const lang = d.language || 'en'
      langCounts.set(lang, (langCounts.get(lang) || 0) + 1)
    }
    const dominantLanguage = langCounts.size > 0 ? Array.from(langCounts.entries()).sort((a, b) => b[1] - a[1])[0][0] : 'en'

    const { data: chunks, error: chunkErr } = await supabase.from('chunks').select('content, chunk_index, document_id').in('document_id', docIds).order('chunk_index')
    if (chunkErr) throw chunkErr
    if (!chunks || chunks.length === 0) throw new Error('No chunks found for this course')

    const docGroups = new Map<string, { content: string; document_id: string }[]>()
    for (const c of chunks) {
      if (!docGroups.has(c.document_id)) docGroups.set(c.document_id, [])
      const group = docGroups.get(c.document_id)!
      if (group.length < 12) group.push(c)
    }
    const sampled = Array.from(docGroups.values()).flat().slice(0, 36)
    const context = sampled.map((c: any) => `[Doc: ${docTitles.get(c.document_id) || 'Unknown'}] ${c.content}`).join('\n\n')

    let conceptStr = 'key concepts'
    try {
      const { data: weakConcepts } = await supabase.rpc('get_weak_concepts', { p_document_id: docIds[0] })
      if (weakConcepts && weakConcepts.length > 0) {
        conceptStr = (weakConcepts as Array<{ concept: string }>).map((c: any) => c.concept).join(', ')
      }
    } catch {}

    if (mode === 'quiz') {
      const count = 6
      const systemMsg = `You are a precise quiz generator. Output ONLY valid JSON:\n{\n  "questions": [\n    {\n      "question": "question text",\n      "options": ["A", "B", "C", "D"],\n      "correct_index": 0,\n      "explanation": "why this answer is correct",\n      "concept": "short topic label (1-4 words)",\n      "sourceDocument": "title of the document this question is based on"\n    }\n  ]\n}\n\nGenerate exactly ${count} questions. Focus on: ${conceptStr}. Distribute across different documents.\n\nIMPORTANT: Write ALL content in the language corresponding to code "${dominantLanguage}".`

      let validQuestions: any[] = []
      const { content: raw1 } = await chatComplete({ messages: [{ role: 'system', content: systemMsg }, { role: 'user', content: `Generate ${count} questions across this course covering ${conceptStr}.\n\nCourse material:\n\n${context}` }], temperature: 0.2, jsonMode: true })
      validQuestions = (JSON.parse(raw1).questions ?? []).filter(validateQuizQuestion)
      if (validQuestions.length < count) {
        try {
          const { content: raw2 } = await chatComplete({ messages: [{ role: 'system', content: systemMsg }, { role: 'user', content: `Generate ${count - validQuestions.length} more questions.\n\n${context}` }], temperature: 0.2, jsonMode: true })
          validQuestions.push(...(JSON.parse(raw2).questions ?? []).filter(validateQuizQuestion))
        } catch {}
      }
      if (validQuestions.length === 0) throw new Error('Failed to generate valid quiz questions')

      await supabase.from('quiz_questions').delete().in('document_id', docIds)
      const { error: insertErr } = await supabase.from('quiz_questions').insert(validQuestions.map((q, i) => ({
        document_id: docIds[i % docIds.length], question: q.question.trim(), options: q.options, correct_index: q.correct_index, explanation: q.explanation.trim(), concept: (q.concept || '').trim().slice(0, 100),
      })))
      if (insertErr) throw insertErr
      return new Response(JSON.stringify({ ok: true, inserted: validQuestions.length, mode: 'quiz', docIds }), { headers: { ...headers, 'Content-Type': 'application/json' } })
    }

    const fcCount = 10
    const fcSystemMsg = `You are a precise flashcard generator. Output ONLY valid JSON:\n{\n  "flashcards": [\n    {\n      "front": "concise question or term",\n      "back": "clear answer or definition",\n      "concept": "short topic label (1-4 words)",\n      "sourceDocument": "title of the document this card is based on"\n    }\n  ]\n}\n\nGenerate exactly ${fcCount} flashcards. Focus on: ${conceptStr}. Distribute across documents.\n\nIMPORTANT: Write ALL content in the language corresponding to code "${dominantLanguage}".`

    let validCards: any[] = []
    const { content: rawFc1 } = await chatComplete({ messages: [{ role: 'system', content: fcSystemMsg }, { role: 'user', content: `Generate ${fcCount} flashcards across this course covering ${conceptStr}.\n\nCourse material:\n\n${context}` }], temperature: 0.2, jsonMode: true })
    validCards = (JSON.parse(rawFc1).flashcards ?? []).filter(validateFlashcard)
    if (validCards.length < fcCount) {
      try {
        const { content: rawFc2 } = await chatComplete({ messages: [{ role: 'system', content: fcSystemMsg }, { role: 'user', content: `Generate ${fcCount - validCards.length} more flashcards.\n\n${context}` }], temperature: 0.2, jsonMode: true })
        validCards.push(...(JSON.parse(rawFc2).flashcards ?? []).filter(validateFlashcard))
      } catch {}
    }
    if (validCards.length === 0) throw new Error('Failed to generate valid flashcards')

    await supabase.from('flashcards').delete().in('document_id', docIds)
    const { error: fcInsertErr } = await supabase.from('flashcards').insert(validCards.map((fc, i) => ({
      document_id: docIds[i % docIds.length], user_id: user.id, front: fc.front.trim(), back: fc.back.trim(),
    })))
    if (fcInsertErr) throw fcInsertErr
    return new Response(JSON.stringify({ ok: true, inserted: validCards.length, mode: 'flashcards', docIds }), { headers: { ...headers, 'Content-Type': 'application/json' } })
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: (err as Error).message }), { status: 500, headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' } })
  }
})
