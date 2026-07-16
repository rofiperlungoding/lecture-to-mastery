// ============================================================================
// Language detection — lightweight heuristic for lecture content.
//
// Detects the dominant language of a text by examining:
// 1. Unicode script ranges (CJK, Cyrillic, Arabic, etc.)
// 2. Common word frequency for Latin-script languages
//
// This is deliberately fast/cheap — no API calls, no model loads.
// For ambiguous Latin-script texts, falls back to 'en'.
//
// ── Embeddings note ──────────────────────────────────────────────────────
// Mistral Embed (mistral-embed) is used for all vector search operations.
// It supports 100+ languages including: English, Spanish, French, German,
// Portuguese, Italian, Dutch, Russian, Chinese, Japanese, Korean, Arabic,
// Hindi, Vietnamese, Turkish, Polish, Swedish, Thai, Greek, Hebrew, and
// many more. For the full official list see:
// https://docs.mistral.ai/capabilities/embeddings/
//
// **Known limitations:**
// - Low-resource languages (e.g., Swahili, Burmese) may have reduced
//   embedding quality.
// - Code-switched or heavily mixed-language content may produce embeddings
//   that favor the dominant language.
// - Very short texts (< 50 chars) may not capture language-specific signal.
// ============================================================================

export type LangCode =
  | 'en' | 'es' | 'fr' | 'de' | 'pt' | 'it' | 'nl'
  | 'ru' | 'zh' | 'ja' | 'ko' | 'ar' | 'hi'
  | 'vi' | 'tr' | 'pl' | 'sv' | 'th' | 'el' | 'he'

// ── Unicode script range checks ──────────────────────────────────────────

function hasCJK(text: string): boolean {
  return /[\u4E00-\u9FFF\u3400-\u4DBF]/.test(text) // CJK Unified Ideographs
}

function hasHiragana(text: string): boolean {
  return /[\u3040-\u309F]/.test(text)
}

function hasKatakana(text: string): boolean {
  return /[\u30A0-\u30FF]/.test(text)
}

function hasKorean(text: string): boolean {
  return /[\uAC00-\uD7AF]/.test(text)
}

function hasCyrillic(text: string): boolean {
  return /[\u0400-\u04FF]/.test(text)
}

function hasArabic(text: string): boolean {
  return /[\u0600-\u06FF]/.test(text)
}

function hasDevanagari(text: string): boolean {
  return /[\u0900-\u097F]/.test(text)
}

function hasThai(text: string): boolean {
  return /[\u0E00-\u0E7F]/.test(text)
}

function hasGreek(text: string): boolean {
  return /[\u0370-\u03FF]/.test(text)
}

function hasHebrew(text: string): boolean {
  return /[\u0590-\u05FF]/.test(text)
}

// ── Latin-script language identification via function words ──────────────
// These are the most distinctive short function words per language.
// We count occurrences in the text and pick the language with the highest score.

interface LangProfile {
  code: LangCode
  commonWords: string[]
}

const LATIN_PROFILES: LangProfile[] = [
  { code: 'en', commonWords: ['the', 'and', 'that', 'have', 'with', 'this', 'from', 'they', 'would', 'about', 'there', 'which', 'their', 'what', 'when', 'make', 'like', 'time', 'just', 'know'] },
  { code: 'es', commonWords: ['que', 'los', 'las', 'del', 'para', 'por', 'como', 'más', 'pero', 'sus', 'entre', 'también', 'este', 'esta', 'puede', 'todo', 'parte', 'tiene', 'sobre', 'cada'] },
  { code: 'fr', commonWords: ['les', 'des', 'dans', 'pour', 'sur', 'avec', 'plus', 'tout', 'sont', 'aussi', 'mais', 'leur', 'cette', 'être', 'faire', 'comme', 'bien', 'nous', 'vous', 'donc'] },
  { code: 'de', commonWords: ['die', 'der', 'das', 'und', 'mit', 'sich', 'auch', 'sein', 'auf', 'für', 'sind', 'dass', 'nicht', 'wird', 'einen', 'einer', 'kann', 'aber', 'oder', 'nach'] },
  { code: 'pt', commonWords: ['que', 'dos', 'das', 'para', 'por', 'como', 'mais', 'mas', 'entre', 'também', 'pode', 'todo', 'parte', 'sobre', 'cada', 'muito', 'ainda', 'depois', 'aquela', 'grande'] },
  { code: 'it', commonWords: ['che', 'gli', 'del', 'della', 'per', 'con', 'una', 'anche', 'sono', 'nella', 'alla', 'delle', 'degli', 'oltre', 'dopo', 'sulla', 'prima', 'ogni', 'quale', 'questa'] },
  { code: 'nl', commonWords: ['van', 'het', 'met', 'voor', 'een', 'zijn', 'ook', 'wordt', 'maar', 'deze', 'hebben', 'tussen', 'daar', 'nog', 'naar', 'moet', 'over', 'door', 'zou', 'omdat'] },
  { code: 'pl', commonWords: ['jak', 'przez', 'jego', 'ich', 'tego', 'jest', 'tylko', 'również', 'może', 'które', 'bardzo', 'oraz', 'gdzie', 'przed', 'każdy', 'jednak', 'nigdy', 'nawet', 'ponad', 'tych'] },
  { code: 'sv', commonWords: ['och', 'det', 'som', 'med', 'att', 'för', 'inte', 'den', 'har', 'är', 'men', 'om', 'kan', 'när', 'alla', 'under', 'utan', 'bara', 'efter', 'över'] },
  { code: 'vi', commonWords: ['các', 'cho', 'của', 'với', 'trong', 'một', 'nhưng', 'cũng', 'khi', 'này', 'nhiều', 'khác', 'qua', 'giữa', 'hoặc', 'nếu', 'vì', 'thì', 'từ', 'được'] },
  { code: 'tr', commonWords: ['bir', 'ile', 'olan', 'için', 'daha', 'olarak', 'onun', 'gibi', 'kadar', 'kendi', 'bunu', 'çok', 'sonra', 'yani', 'veya', 'önce', 'hatta', 'ara', 'başka', 'üzerinde'] },
]

// Score a Latin text against a language profile by counting function-word matches.
function scoreLanguage(text: string, profile: LangProfile): number {
  const lower = text.toLowerCase()
  let score = 0
  for (const word of profile.commonWords) {
    // Count all occurrences (word boundary check via regex)
    const regex = new RegExp(`\\b${word}\\b`, 'gi')
    const matches = lower.match(regex)
    if (matches) score += matches.length
  }
  return score
}

// ── Main detection function ──────────────────────────────────────────────

/**
 * Detect the dominant language of a text using heuristics.
 *
 * Returns an ISO 639-1 language code (e.g. 'en', 'es', 'zh', 'ja', 'ko').
 * Falls back to 'en' when uncertain.
 *
 * **Limitations:**
 * - Latin-script language detection is based on function-word frequency,
 *   which can be unreliable for short texts (< 200 chars) or texts with
 *   heavy technical vocabulary shared across languages.
 * - Does not distinguish regional variants (e.g. 'en-US' vs 'en-GB').
 * - Mixed-language texts return the dominant detected script/language.
 *
 * @param text — The text to analyze (at least ~100 chars for reliable results)
 * @returns ISO 639-1 language code
 */
export function detectLanguage(text: string): LangCode {
  if (!text || text.length < 20) return 'en'

  const sample = text.slice(0, 5000) // Check first 5000 chars

  // ── Non-Latin scripts — check by Unicode ranges ──────────────────────
  // These are unambiguous, so we return immediately upon detection.

  if (hasKorean(sample)) return 'ko'
  if (hasHiragana(sample) || hasKatakana(sample)) return 'ja'
  if (hasCJK(sample)) return 'zh' // Chinese (simplified/traditional)
  if (hasCyrillic(sample)) return 'ru' // Default to Russian for Cyrillic
  if (hasArabic(sample)) return 'ar'
  if (hasDevanagari(sample)) return 'hi'
  if (hasThai(sample)) return 'th'
  if (hasGreek(sample)) return 'el'
  if (hasHebrew(sample)) return 'he'

  // ── Latin-script — score by function-word frequency ──────────────────
  const scores = LATIN_PROFILES.map((p) => ({
    code: p.code,
    score: scoreLanguage(sample, p),
  })).sort((a, b) => b.score - a.score)

  // If the top score is significant enough, use it
  if (scores[0].score > 3 && scores[0].score > scores[1].score * 0.8) {
    return scores[0].code
  }

  // If no clear winner and we see some Latin text, default to English
  const hasLatinText = /[a-zA-Z]/.test(sample)
  if (hasLatinText) return 'en'

  // Ultimate fallback
  return 'en'
}

/**
 * Get the display name for a language code.
 */
export function getLanguageLabel(code: string): string {
  const labels: Record<string, string> = {
    en: 'English',
    es: 'Spanish',
    fr: 'French',
    de: 'German',
    pt: 'Portuguese',
    it: 'Italian',
    nl: 'Dutch',
    ru: 'Russian',
    zh: 'Chinese',
    ja: 'Japanese',
    ko: 'Korean',
    ar: 'Arabic',
    hi: 'Hindi',
    vi: 'Vietnamese',
    tr: 'Turkish',
    pl: 'Polish',
    sv: 'Swedish',
    th: 'Thai',
    el: 'Greek',
    he: 'Hebrew',
  }
  return labels[code] || code
}
