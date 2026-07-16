import { invokeEdgeFunction } from './api'
import { supabase } from './supabase'

// ============================================================================
// YouTube Transcript Import
// ============================================================================

export interface YouTubeTranscriptResult {
  text: string
  videoId: string
  autoTitle: string
  durationSec: number
  segmentCount: number
  sourceMeta: Record<string, unknown>
}

/**
 * Fetch a YouTube video's transcript via edge function.
 */
export async function fetchYouTubeTranscript(url: string): Promise<YouTubeTranscriptResult> {
  const { data, error } = await invokeEdgeFunction<YouTubeTranscriptResult>('fetch-youtube-transcript', { url })
  if (error) throw new Error(error.message)
  if (!data || !data.text) throw new Error('No transcript returned')
  return {
    text: data.text,
    videoId: data.videoId,
    autoTitle: data.autoTitle || `YouTube video ${data.videoId}`,
    durationSec: data.durationSec || 0,
    segmentCount: data.segmentCount || 0,
    sourceMeta: data.sourceMeta || { url, video_id: data.videoId },
  }
}

// ============================================================================
// Office Documents (DOCX via mammoth, PPTX via ZIP text extraction)
// ============================================================================

/**
 * Extract text from a .docx file using mammoth.js.
 */
export async function extractDocxText(file: File): Promise<string> {
  const mammoth = await import('mammoth')
  const buffer = await file.arrayBuffer()
  const result = await mammoth.extractRawText({ arrayBuffer: buffer })
  const text = result.value.trim()
  if (text.length < 200) {
    throw new Error(
      'The document contains very little extractable text (< 200 chars). ' +
      'Try copying the content and using "Paste text" instead.',
    )
  }
  return text
}

/**
 * Extract text from a .pptx file by reading the ZIP archive and parsing slide XML.
 * Uses jszip for ZIP parsing (dynamically imported).
 */
export async function extractPptxText(file: File): Promise<string> {
  // Dynamically import jszip (it's a sub-dependency of mammoth or we install it)
  const JSZip = await import('jszip')
  const buffer = await file.arrayBuffer()
  const zip = await JSZip.loadAsync(buffer)

  // Collect text from all slides
  const slideTexts: string[] = []
  const slideFiles = Object.keys(zip.files)
    .filter(name => name.startsWith('ppt/slides/slide') && name.endsWith('.xml'))
    .sort()

  if (slideFiles.length === 0) {
    throw new Error('Could not find slides in this PPTX file. The file may be corrupted.')
  }

  for (const slideFile of slideFiles) {
    const content = await zip.files[slideFile].async('text')
    // Extract text between XML tags
    const textMatches = content.match(/<a:t[^>]*>([^<]+)<\/a:t>/g) || []
    const slideText = textMatches
      .map((m: string) => m.replace(/<\/?a:t[^>]*>/g, ''))
      .join(' ')
      .trim()
    if (slideText) slideTexts.push(slideText)
  }

  const fullText = slideTexts.join('\n\n').trim()
  if (fullText.length < 200) {
    throw new Error(
      'The presentation contains very little extractable text (< 200 chars). ' +
      'It may consist mainly of images. Try copying text content directly.',
    )
  }
  return fullText
}

/**
 * Determine file type and extract text from an Office document.
 */
export async function extractOfficeText(file: File): Promise<{ text: string; sourceType: string }> {
  const name = file.name.toLowerCase()
  if (name.endsWith('.docx')) {
    const text = await extractDocxText(file)
    return { text, sourceType: 'docx' }
  }
  if (name.endsWith('.pptx')) {
    const text = await extractPptxText(file)
    return { text, sourceType: 'pptx' }
  }
  throw new Error(`Unsupported file type: ${name}. Only .docx and .pptx are supported.`)
}

// ============================================================================
// Image OCR (Mistral Vision API via edge function)
// ============================================================================

/**
 * Upload an image file to Supabase Storage and get its public URL.
 */
async function uploadImage(file: File, folder: string = 'ocr-uploads'): Promise<string> {
  const fileName = `${Date.now()}-${file.name}`
  const { error: uploadErr } = await supabase.storage
    .from(folder)
    .upload(fileName, file, {
      contentType: file.type,
      upsert: false,
    })

  if (uploadErr) throw new Error(`Failed to upload image: ${uploadErr.message}`)

  const { data: publicUrl } = supabase.storage
    .from(folder)
    .getPublicUrl(fileName)

  return publicUrl.publicUrl
}

export interface OcrResult {
  text: string
  sourceMeta: Record<string, unknown>
}

/**
 * Send an image to the OCR edge function for text extraction.
 */
export async function ocrImage(file: File): Promise<OcrResult> {
  // Upload to storage first (edge functions need a URL to fetch)
  const imageUrl = await uploadImage(file)

  const res = await invokeEdgeFunction<OcrResult>('ocr-image', {
    imageUrl,
    fileName: file.name,
  })

  if (res.error) throw new Error(`OCR failed: ${res.error.message}`)
  if (!res.data || !res.data.text) throw new Error('No text extracted from image')

  return {
    text: res.data.text,
    sourceMeta: res.data.sourceMeta || { fileName: file.name, imageUrl },
  }
}

// ============================================================================
// Audio Transcription (RunPod Whisper via edge function)
// ============================================================================

/**
 * Upload audio file to storage and transcribe via edge function.
 */
export async function transcribeAudio(file: File): Promise<{ text: string; durationSec: number; sourceMeta: Record<string, unknown> }> {
  // Upload to Supabase Storage
  const folder = 'audio-uploads'
  const fileName = `${Date.now()}-${file.name}`
  const { error: uploadErr } = await supabase.storage
    .from(folder)
    .upload(fileName, file, {
      contentType: file.type,
      upsert: false,
    })

  if (uploadErr) throw new Error(`Failed to upload audio: ${uploadErr.message}`)

  const { data: publicUrl } = supabase.storage
    .from(folder)
    .getPublicUrl(fileName)

  const audioUrl = publicUrl.publicUrl

  // Call edge function
  const { data, error } = await invokeEdgeFunction<{
    text: string
    durationSec: number
    sourceMeta: Record<string, unknown>
  }>('transcribe-audio', { audioUrl, fileName: file.name })

  if (error) throw new Error(`Transcription failed: ${error.message}`)
  if (!data || !data.text) throw new Error('No text returned from transcription')

  return {
    text: data.text,
    durationSec: data.durationSec || 0,
    sourceMeta: data.sourceMeta || { fileName: file.name, durationSec: data.durationSec || 0 },
  }
}
