import { JSDOM } from 'jsdom'
import { Readability } from '@mozilla/readability'

export async function extractFromWeb(url: string) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Text2AudioBot/1.0 (+https://example.com)' } })
  if (!res.ok) throw new Error(`No se pudo descargar la URL (${res.status})`)
  const html = await res.text()
  const doc = new JSDOM(html, { url })
  const reader = new Readability(doc.window.document)
  const article = reader.parse()
  const title = article?.title || doc.window.document.title || 'Página web'
  const text = (article?.textContent || doc.window.document.body.textContent || '')
    .replace(/[\r\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim()
  if (!text) throw new Error('No se pudo extraer texto útil de la página')
  return { title, text }
}
