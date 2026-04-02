import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const source = String(form.get('source') || '')
    if (!['pdf','web','epub'].includes(source)) {
      return NextResponse.json({ error: 'source inválido' }, { status: 400 })
    }

    if (source === 'web') {
      const url = String(form.get('url') || '')
      const schema = z.string().url()
      const parsed = schema.safeParse(url)
      if (!parsed.success) return NextResponse.json({ error: 'URL inválida' }, { status: 400 })
      const { extractFromWeb } = await import('@/lib/extract/web')
      const { title, text } = await extractFromWeb(url)
      return NextResponse.json({ title, text, source: { type: 'web', url } })
    }

    const file = form.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'Falta archivo' }, { status: 400 })
    if (file.size > 15 * 1024 * 1024) return NextResponse.json({ error: 'Archivo demasiado grande (máx 15MB)' }, { status: 413 })

    if (source === 'pdf') {
      const arrayBuf = await file.arrayBuffer()
      const buf = Buffer.from(arrayBuf)
      const { extractFromPdf } = await import('@/lib/extract/pdf')
      const { title, text } = await extractFromPdf(buf)
      return NextResponse.json({ title, text, source: { type: 'pdf', name: file.name } })
    }

    if (source === 'epub') {
      const arrayBuf = await file.arrayBuffer()
      const buf = Buffer.from(arrayBuf)
      const tmpPath = path.join(os.tmpdir(), `upload-${Date.now()}.epub`)
      await fs.writeFile(tmpPath, buf)
      const { extractFromEpub } = await import('@/lib/extract/epub')
      const { title, text } = await extractFromEpub(tmpPath)
      return NextResponse.json({ title, text, source: { type: 'epub', name: file.name } })
    }

    return NextResponse.json({ error: 'No soportado' }, { status: 400 })
  } catch (e:any) {
    return new NextResponse(e?.message || 'Error al procesar', { status: 500 })
  }
}
