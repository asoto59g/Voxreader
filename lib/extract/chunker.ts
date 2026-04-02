export function splitIntoChunks(text: string, maxLen = 4000) {
  const sentences = text.split(/(?<=[.!?])\s+/)
  const chunks: string[] = []
  let current = ''
  for (const s of sentences) {
    if ((current + ' ' + s).trim().length > maxLen) {
      if (current.trim()) chunks.push(current.trim())
      current = s
    } else {
      current = (current + ' ' + s).trim()
    }
  }
  if (current.trim()) chunks.push(current.trim())
  return chunks
}
