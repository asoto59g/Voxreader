const WHITESPACE_RE = /[\r\t]+/g
const PUNCTUATION_BOUNDARY_RE = /([.!?,;:()\[\]{}"'«»])/g
const WORD_RUN_RE = /[A-Za-zÁÉÍÓÚáéíóúÑñÜü]+/g
const DIGIT_BOUNDARY_RE = /([A-Za-zÁÉÍÓÚáéíóúÑñÜü])([0-9])/g
const DIGIT_WORD_BOUNDARY_RE = /([0-9])([A-Za-zÁÉÍÓÚáéíóúÑñÜü])/g
const COMMON_WORDS = new Set([
  'a','an','and','are','as','at','be','by','can','cada','ce','con','cual','cuyo','de','del','después','does','el','en','end','for','from','gran','granja','have','her','his','how','i','in','into','is','it','its','la','las','los','many','material','mejor','more','no','not','of','on','or','our','para','parte','plan','por','primer','que','qué','se','second','sin','sobre','su','sus','that','the','their','there','this','to','un','una','unos','unas','use','very','vez','water','were','what','when','which','with','you','your','yeomans','keyline','challenge','landscape','farm','every','city','forest','publicado','publicada','editores','padre','estos','este','libro','fue','primer','vez','hidricos','diseño','terreno','cultivo','categorias','agua','pequeno','hermosamente','desarrollo','recursos','mejoramiento','urbano','naturaleza','entorno','base','planificacion','patron','categorias','que','como','desde','hasta','hacia','donde','cuando','tambien','tiene','tienen','sistema','sistemas','proyecto','proyectos','desarrollo','diseñar','diseño','mismo','mucho','poco','todas','todos','ademas','también'
])

function capitalizeWord(word: string) {
  if (!word) return word
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
}

function segmentToken(token: string) {
  const normalized = token.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  if (normalized.length < 8) return token

  const parts: string[] = []
  let index = 0
  while (index < normalized.length) {
    let bestMatch = ''
    let bestEnd = index + 1

    for (let end = index + 1; end <= normalized.length; end++) {
      const candidate = normalized.slice(index, end)
      if (candidate.length >= 2 && COMMON_WORDS.has(candidate) && candidate.length > bestMatch.length) {
        bestMatch = candidate
        bestEnd = end
      }
    }

    if (bestMatch) {
      const part = index === 0 && /^[A-ZÁÉÍÓÚÑÜ]/.test(token) ? capitalizeWord(bestMatch) : bestMatch
      parts.push(part)
      index = bestEnd
    } else {
      const fallback = normalized[index]
      parts.push(index === 0 && /^[A-ZÁÉÍÓÚÑÜ]/.test(token) ? capitalizeWord(fallback) : fallback)
      index += 1
    }
  }

  return parts.join(' ')
}

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
    .replace(WORD_RUN_RE, (match) => segmentToken(match))
    .replace(/\s+([,.;:!?\)\]])/g, '$1')
    .replace(/([\(\[])\s+/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim()

  return normalized
}
