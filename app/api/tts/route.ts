import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import OpenAI from 'openai'

export const runtime = 'nodejs'
export const preferredRegion = 'auto'

const schema = z.object({
  provider: z.literal('openai'),
  text: z.string().min(1),
  voice: z.string().default('alloy')
})

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: 'Payload inválido' }, { status: 400 })
    const { text, voice } = parsed.data

    if (!process.env.OPENAI_API_KEY) {
      return new NextResponse('Configurar OPENAI_API_KEY en el servidor', { status: 501 })
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const response = await openai.audio.speech.create({
      model: 'gpt-4o-mini-tts',
      voice,
      input: text
    })

    const arrayBuffer = await response.arrayBuffer()
    return new NextResponse(Buffer.from(arrayBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Disposition': 'attachment; filename="speech.mp3"',
        'Cache-Control': 'public, max-age=31536000, immutable'
      }
    })
  } catch (e:any) {
    return new NextResponse(e?.message || 'Error TTS', { status: 500 })
  }
}
