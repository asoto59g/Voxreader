export async function extractFromPdf(buffer: Buffer) {
  // Nota: pdf-parse no publica tipos. Usamos import dinámico con ts-ignore para evitar error de tipos en Vercel.
  // @ts-ignore - tipos ausentes para 'pdf-parse'
  const pdf = (await import('pdf-parse')).default as any
  const data = await pdf(buffer)
  const text = (data.text || '').replace(/[\r\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim()
  return { title: data.info?.Title || 'Documento PDF', text }
}
