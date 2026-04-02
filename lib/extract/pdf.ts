import pdf from 'pdf-parse'

export async function extractFromPdf(buffer: Buffer) {
  const data = await pdf(buffer)
  const text = (data.text || '').replace(/[\r\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim()
  return { title: data.info?.Title || 'Documento PDF', text }
}
