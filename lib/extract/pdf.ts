import pdf from 'pdf-parse'
import { normalizePdfText } from './normalize'

export async function extractFromPdf(buffer: Buffer) {
  const data = await pdf(buffer)
  const text = normalizePdfText(data.text || '')
  return { title: data.info?.Title || 'Documento PDF', text }
}
