'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

type ExtractResponse = {
  title?: string
  text: string
  truncated?: boolean
  totalLength?: number
  source?: { type: 'pdf' | 'web' | 'epub', url?: string, name?: string }
}

/** Split text into sentences of at most maxLen characters, breaking on punctuation. */
function splitSentences(text: string, maxLen = 180): string[] {
  const raw = text.replace(/\n+/g, ' ').trim()
  const chunks: string[] = []
  const pieces = raw.split(/(?<=[.!?;])\s+/)
  let current = ''
  for (const piece of pieces) {
    if ((current + ' ' + piece).length > maxLen && current.length > 0) {
      chunks.push(current.trim())
      current = piece
    } else {
      current = current ? current + ' ' + piece : piece
    }
  }
  if (current.trim()) chunks.push(current.trim())
  return chunks
}

export default function Page() {
  const [mode, setMode] = useState<'pdf'|'web'|'epub'>('pdf')
  const [pdf, setPdf] = useState<File | null>(null)
  const [url, setUrl] = useState('')
  const [epub, setEpub] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string|undefined>()
  const [data, setData] = useState<ExtractResponse|undefined>()
  const [rate, setRate] = useState(1.0)
  const [pitch, setPitch] = useState(1.0)
  const [voiceName, setVoiceName] = useState<string>('')
  const [speaking, setSpeaking] = useState(false)
  const [sentenceIdx, setSentenceIdx] = useState(0)

  // Sentences derived from extracted text
  const sentences = useMemo(() => data?.text ? splitSentences(data.text) : [], [data])

  // Refs to avoid stale closures in async TTS callbacks
  const speakingRef = useRef(false)
  const sentenceIdxRef = useRef(0)
  const keepAliveRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const sentenceDivRefs = useRef<(HTMLDivElement | null)[]>([])

  // Voice list
  const [voiceList, setVoiceList] = useState<SpeechSynthesisVoice[]>([])
  useEffect(() => {
    if (typeof window === 'undefined') return
    const load = () => setVoiceList(window.speechSynthesis.getVoices())
    load()
    window.speechSynthesis.addEventListener('voiceschanged', load)
    return () => window.speechSynthesis.removeEventListener('voiceschanged', load)
  }, [])

  // Auto-scroll to current sentence in full-text panel
  useEffect(() => {
    const el = sentenceDivRefs.current[sentenceIdx]
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [sentenceIdx])

  const stopSpeaking = useCallback(() => {
    speakingRef.current = false
    if (keepAliveRef.current) clearInterval(keepAliveRef.current)
    window.speechSynthesis.cancel()
    setSpeaking(false)
  }, [])

  // Core recursive TTS function
  const speakSentence = useCallback((
    idx: number,
    sents: string[],
    vList: SpeechSynthesisVoice[],
    vName: string,
    r: number,
    p: number
  ) => {
    if (!speakingRef.current || idx >= sents.length) {
      speakingRef.current = false
      setSpeaking(false)
      if (keepAliveRef.current) clearInterval(keepAliveRef.current)
      return
    }

    sentenceIdxRef.current = idx
    setSentenceIdx(idx)

    const text = sents[idx]
    if (!text?.trim()) {
      speakSentence(idx + 1, sents, vList, vName, r, p)
      return
    }

    const u = new SpeechSynthesisUtterance(text)
    u.rate = r
    u.pitch = p
    u.lang = 'es-ES'
    const v = vList.find(v => v.name === vName)
    if (v) u.voice = v

    u.onend = () => {
      if (speakingRef.current) {
        speakSentence(idx + 1, sents, vList, vName, r, p)
      }
    }
    u.onerror = (e) => {
      if (e.error !== 'interrupted' && speakingRef.current) {
        speakSentence(idx + 1, sents, vList, vName, r, p)
      }
    }

    window.speechSynthesis.speak(u)
  }, [])

  const startReading = useCallback((fromIdx: number) => {
    if (typeof window === 'undefined') return
    const synth = window.speechSynthesis
    synth.cancel()
    speakingRef.current = true
    setSpeaking(true)

    // Android Chrome keepAlive fix
    if (keepAliveRef.current) clearInterval(keepAliveRef.current)
    keepAliveRef.current = setInterval(() => {
      if (speakingRef.current && synth.speaking && synth.paused) {
        synth.resume()
      }
    }, 5000)

    speakSentence(fromIdx, sentences, voiceList, voiceName, rate, pitch)
  }, [sentences, voiceList, voiceName, rate, pitch, speakSentence])

  const goTo = useCallback((idx: number) => {
    const clamped = Math.max(0, Math.min(idx, sentences.length - 1))
    setSentenceIdx(clamped)
    sentenceIdxRef.current = clamped
    if (speaking) {
      startReading(clamped)
    }
  }, [speaking, sentences.length, startReading])

  const doExtract = async () => {
    setError(undefined); setBusy(true); setData(undefined); setSentenceIdx(0)
    try {
      if (mode === 'pdf') {
        if (!pdf) throw new Error('Adjuntá un PDF')
        const arrayBuffer = await pdf.arrayBuffer()
        const pdfjsLib = await import('pdfjs-dist')
        pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`

        const loadingTask = pdfjsLib.getDocument(arrayBuffer)
        const pdfDoc = await loadingTask.promise
        let rawText = ''
        for (let i = 1; i <= pdfDoc.numPages; i++) {
          const page = await pdfDoc.getPage(i)
          const textContent = await page.getTextContent()
          let lastY: number | undefined = undefined
          let lastX = 0
          let lastWidth = 0
          let lastFontSize = 12
          let pageStr = ''
          for (const item of textContent.items as any[]) {
            const currentX = item.transform[4]
            const currentY = item.transform[5]
            const fontSize = Math.hypot(item.transform[0], item.transform[1]) || 12
            if (lastY !== undefined && Math.abs(lastY - currentY) > 5) {
              pageStr += '\n'
            } else if (lastY !== undefined) {
              const distance = currentX - (lastX + lastWidth)
              const spaceThreshold = lastFontSize * 0.20
              if (distance > spaceThreshold) {
                pageStr += ' '
              }
            }
            pageStr += item.str
            lastY = currentY
            lastX = currentX
            lastWidth = item.width
            lastFontSize = fontSize
          }
          rawText += pageStr + '\n\n'
        }

        const { normalizePdfText } = await import('@/lib/extract/normalize')
        const text = normalizePdfText(rawText)
        setData({ title: pdf.name, text, truncated: false, totalLength: text.length, source: { type: 'pdf', name: pdf.name } })

      } else {
        const fd = new FormData()
        if (mode === 'web') {
          if (!url) throw new Error('Ingresá una URL válida')
          fd.append('source', 'web'); fd.append('url', url)
        } else {
          if (!epub) throw new Error('Adjuntá un EPUB (*.epub)')
          fd.append('source', 'epub'); fd.append('file', epub)
        }
        const res = await fetch('/api/extract', { method: 'POST', body: fd })
        if (!res.ok) throw new Error(await res.text())
        setData(await res.json() as ExtractResponse)
      }
    } catch (e: any) {
      setError(e.message || 'Error al extraer contenido')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    return () => {
      speakingRef.current = false
      if (keepAliveRef.current) clearInterval(keepAliveRef.current)
      if (typeof window !== 'undefined') window.speechSynthesis.cancel()
    }
  }, [])

  const progressPct = sentences.length > 0 ? Math.round((sentenceIdx / sentences.length) * 100) : 0

  return (
    <div className="container">
      <h1>Text2Audio PWA</h1>
      <p className="small">Convierte texto (PDF, páginas web, EPUB) a audio con lectura sincronizada.</p>

      {/* Source selection */}
      <div className="card" style={{ marginTop: '1rem' }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button onClick={() => setMode('pdf')} disabled={mode === 'pdf'}>PDF</button>
          <button onClick={() => setMode('web')} disabled={mode === 'web'}>Web</button>
          <button onClick={() => setMode('epub')} disabled={mode === 'epub'}>EPUB</button>
        </div>
        {mode === 'pdf' && <div>
          <label>Adjuntar PDF</label>
          <input type="file" accept="application/pdf" onChange={e => setPdf(e.target.files?.[0] || null)} />
        </div>}
        {mode === 'web' && <div>
          <label>URL de la página</label>
          <input type="url" placeholder="https://ejemplo.com/articulo" value={url} onChange={e => setUrl(e.target.value)} />
          <p className="small">Respetá robots.txt y términos del sitio. Para contenidos detrás de login, no funcionará.</p>
        </div>}
        {mode === 'epub' && <div>
          <label>Adjuntar EPUB</label>
          <input type="file" accept=".epub" onChange={e => setEpub(e.target.files?.[0] || null)} />
        </div>}
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button onClick={doExtract} disabled={busy}>{busy ? 'Procesando...' : 'Extraer texto'}</button>
        </div>
        {error && <p style={{ color: '#fca5a5', marginTop: 8 }}>{error}</p>}
      </div>

      {/* Player */}
      {data && (
        <div className="card" style={{ marginTop: '1rem' }}>
          <h2>{data.title || 'Contenido extraído'}</h2>
          <p className="small">
            {data.text.length.toLocaleString()} caracteres &nbsp;|&nbsp; {sentences.length.toLocaleString()} frases
          </p>

          {/* Voice & speed controls */}
          <div className="row" style={{ marginTop: 12 }}>
            <div>
              <label>Voz</label>
              <select value={voiceName} onChange={e => setVoiceName(e.target.value)}>
                <option value="">Sistema (depende del SO)</option>
                {voiceList.map(v => <option key={v.name} value={v.name}>{v.name} ({v.lang})</option>)}
              </select>
            </div>
            <div>
              <label>Velocidad: {rate.toFixed(1)}x</label>
              <input type="range" min="0.5" max="2" step="0.1" value={rate} onChange={e => setRate(parseFloat(e.target.value))} />
            </div>
          </div>
          <div className="row">
            <div>
              <label>Tono: {pitch.toFixed(1)}</label>
              <input type="range" min="0.5" max="2" step="0.1" value={pitch} onChange={e => setPitch(parseFloat(e.target.value))} />
            </div>
          </div>

          {/* Progress slider */}
          <div style={{ marginTop: 14 }}>
            <label style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Progreso: {progressPct}%</span>
              <span style={{ color: '#94a3b8' }}>frase {sentenceIdx + 1} / {sentences.length}</span>
            </label>
            <input
              type="range"
              min="0"
              max={Math.max(sentences.length - 1, 0)}
              value={sentenceIdx}
              onChange={e => goTo(parseInt(e.target.value))}
              style={{ width: '100%' }}
            />
          </div>

          {/* Playback controls */}
          <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={() => goTo(sentenceIdx - 1)}
              title="Frase anterior"
              style={{ fontSize: '1.2rem', padding: '6px 14px' }}
            >⏮</button>

            {!speaking
              ? <button onClick={() => startReading(sentenceIdx)} style={{ flex: 1 }}>▶ Leer</button>
              : <button onClick={stopSpeaking} style={{ flex: 1 }}>⏹ Detener</button>
            }

            <button
              onClick={() => goTo(sentenceIdx + 1)}
              title="Frase siguiente"
              style={{ fontSize: '1.2rem', padding: '6px 14px' }}
            >⏭</button>
          </div>

          <hr />

          {/* Current sentence highlight box */}
          <div style={{
            padding: '0.85rem 1rem',
            backgroundColor: '#1e3a5f',
            borderLeft: '4px solid #3b82f6',
            borderRadius: '6px',
            marginBottom: '0.75rem',
            fontSize: '1.05rem',
            lineHeight: '1.7',
            color: '#e0f2fe',
            minHeight: '3.5rem'
          }}>
            {sentences[sentenceIdx] || ''}
          </div>

          {/* Scrollable full-text with per-sentence click */}
          <div style={{
            maxHeight: '320px',
            overflowY: 'auto',
            padding: '0.75rem',
            border: '1px solid #334155',
            borderRadius: '6px',
            backgroundColor: '#0f172a',
            lineHeight: '1.7',
            fontSize: '0.88rem'
          }}>
            {sentences.map((s, i) => (
              <div
                key={i}
                ref={el => { sentenceDivRefs.current[i] = el }}
                onClick={() => goTo(i)}
                title="Clic para leer desde aquí"
                style={{
                  display: 'inline',
                  cursor: 'pointer',
                  backgroundColor: i === sentenceIdx ? '#2563eb' : 'transparent',
                  color: i < sentenceIdx ? '#475569' : i === sentenceIdx ? '#ffffff' : '#cbd5e1',
                  borderRadius: '3px',
                  padding: i === sentenceIdx ? '1px 3px' : '0',
                  transition: 'background-color 0.2s',
                }}
              >
                {s}{' '}
              </div>
            ))}
          </div>
          <p className="small" style={{ marginTop: 6, color: '#64748b' }}>
            💡 Toca cualquier frase para saltar a ella y comenzar la lectura desde ese punto.
          </p>
        </div>
      )}
    </div>
  )
}
