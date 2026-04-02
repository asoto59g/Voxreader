import fs from 'node:fs/promises'

export async function extractFromEpub(tmpPath: string) {
  // Import dinámico para evitar issues de tipos en Vercel
  // @ts-ignore - sin tipos oficiales para 'epub'
  const EPub = (await import('epub')).default as any
  const book = new EPub(tmpPath)
  const textParts: string[] = []
  const title = await new Promise<string>((resolve, reject) => {
    book.on('error', (err: any) => reject(err))
    book.on('end', () => {
      resolve(book.metadata?.title || 'Libro EPUB')
    })
    book.parse()
  }).catch((e) => {
    console.error('EPUB Parse Error:', e)
    throw new Error('Error al parsear el archivo EPUB')
  })

  const getChapter = (id: string) => new Promise<string>((resolve) => {
    book.getChapter(id, (err: any, text: string) => {
      if (err) resolve('')
      else resolve(text.replace(/<[^>]+>/g, ' '))
    })
  })

  // Procesar capítulos en orden
  for (const item of (book.flow || [])) {
    if (item.id) {
      const t = await getChapter(item.id)
      if (t.trim()) textParts.push(t)
    }
  }

  const raw = textParts.join('\n')
  const text = raw.replace(/[\r\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim()
  try { await fs.unlink(tmpPath) } catch {}
  return { title, text }
}
