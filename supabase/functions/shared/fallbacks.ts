// ============================================================================
// "I don't know" fallback translations for RAG edge functions.
// 
// When the document context doesn't contain the answer, the assistant should
// respond with a language-appropriate phrase instead of making something up.
// ============================================================================

/**
 * Map of language codes to their "I don't know based on this document" phrase.
 * Used in RAG system prompts to ground the assistant's honesty.
 */
export const DONT_KNOW_FALLBACKS: Record<string, { document: string; course: string; notes: string }> = {
  en: {
    document: "I don't know based on this document.",
    course: "I don't know based on this course.",
    notes: "I don't know based on your notes.",
  },
  es: {
    document: 'No sé basándome en este documento.',
    course: 'No sé basándome en este curso.',
    notes: 'No sé basándome en tus apuntes.',
  },
  fr: {
    document: "Je ne sais pas d'après ce document.",
    course: "Je ne sais pas d'après ce cours.",
    notes: "Je ne sais pas d'après vos notes.",
  },
  de: {
    document: 'Ich weiß es nicht basierend auf diesem Dokument.',
    course: 'Ich weiß es nicht basierend auf diesem Kurs.',
    notes: 'Ich weiß es nicht basierend auf Ihren Notizen.',
  },
  pt: {
    document: 'Não sei com base neste documento.',
    course: 'Não sei com base neste curso.',
    notes: 'Não sei com base nas suas anotações.',
  },
  it: {
    document: 'Non lo so in base a questo documento.',
    course: 'Non lo so in base a questo corso.',
    notes: 'Non lo so in base ai tuoi appunti.',
  },
  nl: {
    document: 'Ik weet het niet op basis van dit document.',
    course: 'Ik weet het niet op basis van deze cursus.',
    notes: 'Ik weet het niet op basis van uw notities.',
  },
  ru: {
    document: 'Я не знаю ответа на основе этого документа.',
    course: 'Я не знаю ответа на основе этого курса.',
    notes: 'Я не знаю ответа на основе ваших заметок.',
  },
  zh: {
    document: '我不知道基于此文档的答案。',
    course: '我不知道基于此课程的答案。',
    notes: '我不知道基于你的笔记的答案。',
  },
  ja: {
    document: 'このドキュメントに基づく答えはわかりません。',
    course: 'このコースに基づく答えはわかりません。',
    notes: 'あなたのノートに基づく答えはわかりません。',
  },
  ko: {
    document: '이 문서에 기반한 답변을 알 수 없습니다.',
    course: '이 강좌에 기반한 답변을 알 수 없습니다.',
    notes: '노트에 기반한 답변을 알 수 없습니다.',
  },
  ar: {
    document: 'لا أعرف الإجابة بناءً على هذه الوثيقة.',
    course: 'لا أعرف الإجابة بناءً على هذه الدورة.',
    notes: 'لا أعرف الإجابة بناءً على ملاحظاتك.',
  },
  hi: {
    document: 'मुझे इस दस्तावेज़ के आधार पर नहीं पता।',
    course: 'मुझे इस पाठ्यक्रम के आधार पर नहीं पता।',
    notes: 'मुझे आपके नोट्स के आधार पर नहीं पता।',
  },
  tr: {
    document: 'Bu belgeye dayanarak bilmiyorum.',
    course: 'Bu kursa dayanarak bilmiyorum.',
    notes: 'Notlarınıza dayanarak bilmiyorum.',
  },
  pl: {
    document: 'Nie wiem na podstawie tego dokumentu.',
    course: 'Nie wiem na podstawie tego kursu.',
    notes: 'Nie wiem na podstawie twoich notatek.',
  },
  sv: {
    document: 'Jag vet inte baserat på detta dokument.',
    course: 'Jag vet inte baserat på denna kurs.',
    notes: 'Jag vet inte baserat på dina anteckningar.',
  },
  vi: {
    document: 'Tôi không biết dựa trên tài liệu này.',
    course: 'Tôi không biết dựa trên khóa học này.',
    notes: 'Tôi không biết dựa trên ghi chú của bạn.',
  },
}

/**
 * Get the "I don't know" fallback phrase for a given language and context.
 * Falls back to English if the language is not in the map.
 */
export function getDontKnowFallback(
  language: string,
  context: 'document' | 'course' | 'notes' = 'document',
): string {
  const entry = DONT_KNOW_FALLBACKS[language]
  if (!entry) return DONT_KNOW_FALLBACKS.en[context]
  return entry[context]
}
