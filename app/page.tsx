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
  // Split on sentence-ending punctuation then re-join short fragments
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

  // Derived sentences list
  const sentences = useMemo(() => data?.text ? splitSentences(data.text) : [], [data])
  
  // Char offset for progress bar
  const charOffset = useMemo(() => {
    let offset = 0
    for (let i = 0; i < sentenceIdx && i < sentences.length; i++) {
      offset += sentences[i].length + 1
    }
    return Math.min(offset, data?.text?.length ?? 0)
  }, [sentenceIdx, sentences, data])

  const speakingRef = useRef(false)
  const sentenceIdxRef = useRef(0)
  const keepAliveRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const voices = useMemo(() => {
    if (typeof window === 'undefined') return []
    return window.speechSynthesis.getVoices()
  }, [speaking])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const synth = window.speechSynthesis
    const onvoiceschanged = () => {
      setSpeaking(s => !s)
      setSpeaking(s => !s)
    }
    synth.addEventListener('voiceschanged', onvoiceschanged)
    return () => synth.removeEventListener('voiceschanged', onvoiceschanged)
  }, [])

  const stopSpeaking = useCallback(() => {
    speakingRef.current = false
    if (keepAliveRef.current) clearInterval(keepAliveRef.current)
    window.speechSynthesis.cancel()
    setSpeaking(false)
  }, [])

  const speakFrom = useCallback((fromIdx: number, currentSentences: string[], currentVoices: SpeechSynthesisVoice[], currentVoiceName: string, currentRate: number, currentPitch: number) => {
    if (!speakingRef.current || fromIdx >= currentSentences.length) {
      speakingRef.current = false
      setSpeaking(false)
      if (keepAliveRef.current) clearInterval(keepAliveRef.current)
      return
    }

    sentenceIdxRef.current = fromIdx
    setSentenceIdx(fromIdx)

    const text = currentSentences[fromIdx]
    if (!text?.trim()) {
      // skip empty
      speakFrom(fromIdx + 1, currentSentences, currentVoices, currentVoiceName, currentRate, currentPitch)
      return
    }

    const u = new SpeechSynthesisUtterance(text)
    u.rate = currentRate
    u.pitch = currentPitch
    u.lang = 'es-ES'
    const v = currentVoices.find(v => v.name === currentVoiceName)
    if (v) u.voice = v

    u.onend = () => {
      if (speakingRef.current) {
        speakFrom(fromIdx + 1, currentSentences, currentVoices, currentVoiceName, currentRate, currentPitch)
      }
    }
    u.onerror = (e) => {
      if (e.error !== 'interrupted') {
        console.error('TTS error', e)
      }
      if (speakingRef.current) {
        speakFrom(fromIdx + 1, currentSentences, currentVoices, currentVoiceName, currentRate, currentPitch)
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

    // Android Chrome bug: TTS pauses after ~14 sec. keepAlive forces resume.
    if (keepAliveRef.current) clearInterval(keepAliveRef.current)
    keepAliveRef.current = setInterval(() => {
      if (speakingRef.current && synth.speaking && synth.paused) {
        synth.resume()
      }
    }, 5000)

    speakFrom(fromIdx, sentences, voices, voiceName, rate, pitch)
  }, [sentences, voices, voiceName, rate, pitch, speakFrom])

  const doExtract = async () => {
    setError(undefined); setBusy(true); setData(undefined); setSentenceIdx(0);
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
            // Font size derived from the transform matrix (scale component)
            const fontSize = Math.hypot(item.transform[0], item.transform[1]) || 12
            if (lastY !== undefined && Math.abs(lastY - currentY) > 5) {
              pageStr += '\n'
            } else if (lastY !== undefined) {
              const distance = currentX - (lastX + lastWidth)
              // A real word space is typically >= 20% of the font size.
              // Tracking (letter-spacing in headings) is usually < 15%, so we ignore it.
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
        
        setData({
          title: pdf.name,
          text,
          truncated: false,
          totalLength: text.length,
          source: { type: 'pdf', name: pdf.name }
        })
      } else {
        const fd = new FormData()
        if (mode === 'web') {
          if (!url) throw new Error('Ingresá una URL válida')
          fd.append('source', 'web')
          fd.append('url', url)
        } else {
          if (!epub) throw new Error('Adjuntá un EPUB (*.epub)')
          fd.append('source', 'epub')
          fd.append('file', epub)
        }
        const res = await fetch('/api/extract', { method: 'POST', body: fd })
        if (!res.ok) throw new Error(await res.text())
        const json = await res.json() as ExtractResponse
        setData(json)
      }
    } catch (e:any) {
      setError(e.message || 'Error al extraer contenido')
    } finally {
      setBusy(false)
    }
  }

  // Cleanup on unmount
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
      <p className="small">Convierte texto (PDF, páginas web, EPUB) a audio con lectura en el navegador y control de avance.</p>

      <div className="card" style={{marginTop: '1rem'}}>
        <div style={{display: 'flex', gap: 8, marginBottom: 12}}>
          <button onClick={() => setMode('pdf')} disabled={mode==='pdf'}>PDF</button>
          <button onClick={() => setMode('web')} disabled={mode==='web'}>Web</button>
          <button onClick={() => setMode('epub')} disabled={mode==='epub'}>EPUB</button>
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

        <div style={{display:'flex', gap: 8, marginTop: 12}}>
          <button onClick={doExtract} disabled={busy}>{busy ? 'Procesando...' : 'Extraer texto'}</button>
        </div>
        {error && <p style={{color: '#fca5a5', marginTop: 8}}>{error}</p>}
      </div>

      {data && <div className="card" style={{marginTop: '1rem'}}>
        <h2>{data.title || 'Contenido extraído'}</h2>
        <p className="small">Caracteres: {data.text.length.toLocaleString()} &nbsp;|&nbsp; Frases: {sentences.length.toLocaleString()}</p>
        {data.truncated && <p style={{color: '#fbbf24', marginTop: 8, backgroundColor: 'rgba(251, 191, 36, 0.1)', padding: '0.75rem', borderRadius: '0.5rem'}}>
          ⚠️ Contenido muy grande ({(data.totalLength || 0).toLocaleString()} caracteres). Se muestra solo los primeros {data.text.length.toLocaleString()} caracteres.
        </p>}
        
        <div className="row" style={{marginTop: 16}}>
          <div>
            <label>Voz</label>
            <select value={voiceName} onChange={e => setVoiceName(e.target.value)}>
              <option value="">Sistema (depende del SO)</option>
              {voices.map(v => <option key={v.name} value={v.name}>{v.name} ({v.lang})</option>)}
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

        {/* Progress bar */}
        <div style={{marginTop: 16}}>
          <label>Progreso: {progressPct}% &nbsp;(frase {sentenceIdx + 1} de {sentences.length})</label>
          <input 
            type="range" 
            min="0" 
            max={Math.max(sentences.length - 1, 0)} 
            value={sentenceIdx} 
            onChange={e => {
              const val = parseInt(e.target.value)
              setSentenceIdx(val)
              sentenceIdxRef.current = val
              if (speaking) {
                startReading(val)
              }
            }} 
            style={{ width: '100%' }}
          />
        </div>

        <div style={{display:'flex', gap: 8, marginTop: 12}}>
          {!speaking 
            ? <button onClick={() => startReading(sentenceIdx)}>▶ Leer en el navegador</button> 
            : <button onClick={stopSpeaking}>⏹ Detener</button>
          }
        </div>
        <hr/>
        
        {/* Current sentence highlight */}
        <div style={{
          padding: '0.75rem 1rem',
          backgroundColor: '#1e3a5f',
          borderRadius: '6px',
          marginBottom: '0.5rem',
          fontSize: '1.05rem',
          lineHeight: '1.6',
          color: '#e0f2fe',
          minHeight: '3rem'
        }}>
          {sentences[sentenceIdx] || ''}
        </div>

        {/* Full text view */}
        <div style={{
          whiteSpace: 'pre-wrap', 
          maxHeight: '250px', 
          overflowY: 'auto', 
          padding: '1rem', 
          border: '1px solid #333', 
          borderRadius: '4px',
          backgroundColor: '#111',
          fontFamily: 'monospace',
          lineHeight: '1.5',
          fontSize: '0.85rem'
        }}>
          <span style={{ color: '#555' }}>{data.text.slice(0, charOffset)}</span>
          <span style={{ backgroundColor: '#2563eb', color: '#fff', borderRadius: '2px', padding: '0 2px' }}>
            {sentences[sentenceIdx] || ''}
          </span>
          <span style={{ color: '#aaa' }}>{data.text.slice(charOffset + (sentences[sentenceIdx]?.length ?? 0))}</span>
        </div>
      </div>}
    </div>
  )
}
