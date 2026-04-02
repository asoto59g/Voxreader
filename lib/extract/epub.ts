import fs from 'node:fs/promises'

export async function extractFromEpub(tmpPath: string) {
  // Import dinámico: algunos entornos requieren evitar tipos/ssr de 'epub'
  // @ts-ignore - tipos ausentes o no compatibles para 'epub'
  const EPub = (await import('epub')).default as any
  const book = new EPub(tmpPath)
  const textParts: string[] = []
  const title = await new Promise<string>((resolve, reject) => {
    book.on('error', reject)
    book.on('end', () => resolve(book.metadata?.title || 'Libro EPUB'))
    book.on('book:metadata', () => {})
    book.on('book:chapter', () => {})
    book.parse()
  }).catch((e) => { throw e })

  const getChapter = (id: string) => new Promise<string>((resolve, reject) => {
    book.getChapter(id, (err: any, text: string) => {
      if (err) reject(err)
      else resolve(text.replace(/<[^>]+>/g, ' '))
    })
  })

  for (const id of (book.flow || []).map((c:any)=>c.id)) {
    try {
      const t = await getChapter(id)
      textParts.push(t)
    } catch {}
  }

  const raw = textParts.join('\n')
  const text = raw.replace(/[\r\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim()
  try { await fs.unlink(tmpPath) } catch {}
  return { title, text }
}
