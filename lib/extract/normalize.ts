const WHITESPACE_RE = /[\r\t]+/g
const PUNCTUATION_BOUNDARY_RE = /([.!?,;:()\[\]{}"'«»])/g
const DIGIT_BOUNDARY_RE = /([A-Za-zÁÉÍÓÚáéíóúÑñÜü])([0-9])/g
const DIGIT_WORD_BOUNDARY_RE = /([0-9])([A-Za-zÁÉÍÓÚáéíóúÑñÜü])/g

export function normalizePdfText(rawText: string) {
  const normalized = (rawText || '')
    .replace(WHITESPACE_RE, ' ')
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(PUNCTUATION_BOUNDARY_RE, '$1 ')
    .replace(DIGIT_BOUNDARY_RE, '$1 $2')
    .replace(DIGIT_WORD_BOUNDARY_RE, '$1 $2')
    .replace(/([\p{L}\p{N}])([\p{Lu}])/gu, '$1 $2')
    .replace(/([\p{Lu}])([\p{Lu}][\p{Ll}])/gu, '$1 $2')
    .replace(/\s+([,.;:!?\)\]])/g, '$1')
    .replace(/([\(\[])\s+/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim()

  return normalized
}
