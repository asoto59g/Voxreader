export async function extractFromPdf(buffer: Buffer) {
  // Import dinámico para evitar errores de types en Vercel (no hay @types/pdf-parse)
  // @ts-ignore - sin tipos para 'pdf-parse'
  const pdf = (await import('pdf-parse')).default as any
  const data = await pdf(buffer)
  const text = (data.text || '').replace(/[\r\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim()
  return { title: data.info?.Title || 'Documento PDF', text }
}
