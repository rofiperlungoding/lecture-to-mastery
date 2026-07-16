import { supabase } from './supabase'
import { chunkText } from './chunk'
import { embedDocument } from './api'
import { detectLanguage } from './detectLanguage'
import type { Document } from '../types/db'

// ============================================================================
// Shared ingest pipeline
// Every importer (PDF, text, YouTube, audio, image, Office) fans into this.
// ============================================================================

export interface IngestResult {
  doc: Document
  embedded: number
  failedCount: number
}

export interface IngestOptions {
  title: string
  rawText: string
  sourceType: string
  sourceMeta?: Record<string, unknown> | null
}

/**
 * Take plain text from any source, create a document, chunk it, insert chunks,
 * and run embed-document. Returns the created document + embed stats.
 *
 * This is the ONE normalization boundary — do not duplicate this pipeline.
 */
export async function ingestText(options: IngestOptions): Promise<IngestResult> {
  const { title, rawText, sourceType, sourceMeta } = options

  if (!title.trim()) throw new Error('Title is required.')
  if (title.trim().length > 200) throw new Error('Title must be under 200 characters.')
  if (rawText.length < 200) throw new Error('Text must be at least 200 characters.')

  // Detect content language from raw text (heuristic, no API call)
  const language = detectLanguage(rawText)

  const chunks = chunkText(rawText)

  // Create document with source_type + language + optional source_meta
  const insertData: Record<string, unknown> = {
    title: title.trim(),
    source_type: sourceType,
    language,
  }
  if (sourceMeta) {
    insertData.source_meta = sourceMeta
  }

  const { data: doc, error: docErr } = await supabase
    .from('documents')
    .insert(insertData)
    .select()
    .single()

  if (docErr) throw new Error(`Failed to create document: ${docErr.message}`)
  if (!doc) throw new Error('No document returned after insert.')

  // Insert chunks
  const chunkRows = chunks.map((content, idx) => ({
    document_id: doc.id,
    content,
    chunk_index: idx,
    embedding: null,
  }))

  const { error: chunkErr } = await supabase.from('chunks').insert(chunkRows)
  if (chunkErr) throw new Error(`Failed to insert chunks: ${chunkErr.message}`)

  // Embed via the existing edge function
  const embedResult = await embedDocument(doc.id)

  return {
    doc: doc as Document,
    embedded: embedResult.embedded,
    failedCount: embedResult.failedCount,
  }
}
