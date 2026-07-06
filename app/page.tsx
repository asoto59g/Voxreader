'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'

type ExtractResponse = {
  title?: string
  text: string
  truncated?: boolean
  totalLength?: number
  source?: { type: 'pdf' | 'web' | 'epub', url?: string, name?: string }
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
  const utteranceRef = useRef<SpeechSynthesisUtterance|null>(null)
  const [charIndex, setCharIndex] = useState(0)

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

  const doExtract = async () => {
    setError(undefined); setBusy(true); setData(undefined); setCharIndex(0);
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
          let lastY = undefined
          let lastX = 0
          let lastWidth = 0
          let pageStr = ''
          for (const item of textContent.items as any[]) {
            const currentX = item.transform[4]
            const currentY = item.transform[5]
            if (lastY !== undefined && Math.abs(lastY - currentY) > 5) {
              pageStr += '\n'
            } else if (lastY !== undefined) {
              const distance = currentX - (lastX + lastWidth)
              if (distance > 4) {
                pageStr += ' '
              }
            }
            pageStr += item.str
            lastY = currentY
            lastX = currentX
            lastWidth = item.width
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

  const playFrom = (startIndex: number) => {
    if (!data?.text) return
    const synth = window.speechSynthesis
    synth.cancel()
    
    // limit for browser stability
    const u = new SpeechSynthesisUtterance(data.text.slice(startIndex, startIndex + 30000))
    u.rate = rate
    u.pitch = pitch
    u.lang = 'es-ES' // Forzar idioma español por defecto
    const v = voices.find(v => v.name === voiceName)
    if (v) u.voice = v
    u.onend = () => setSpeaking(false)
    u.onerror = (e) => { console.error(e); setSpeaking(false) }
    u.onboundary = (e) => {
      if (e.name === 'word') {
        setCharIndex(startIndex + e.charIndex)
      }
    }
    utteranceRef.current = u
    setSpeaking(true)
    synth.speak(u)
  }

  const readAloud = () => {
    playFrom(charIndex)
  }

  const stop = () => {
    window.speechSynthesis.cancel()
    setSpeaking(false)
  }

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
        <p className="small">Caracteres: {data.text.length.toLocaleString()}</p>
        {data.truncated && <p style={{color: '#fbbf24', marginTop: 8, backgroundColor: 'rgba(251, 191, 36, 0.1)', padding: '0.75rem', borderRadius: '0.5rem'}}>
          ⚠️ Contenido muy grande ({(data.totalLength || 0).toLocaleString()} caracteres). Se muestra solo los primeros {data.text.length.toLocaleString()} caracteres. Para procesar archivos más grandes, divídilo en partes.
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

        <div style={{marginTop: 16}}>
          <label>Progreso de Lectura: {data.text.length > 0 ? Math.round((charIndex / data.text.length) * 100) : 0}%</label>
          <input 
            type="range" 
            min="0" 
            max={data.text.length} 
            value={charIndex} 
            onChange={e => {
              const val = parseInt(e.target.value)
              setCharIndex(val)
              if (speaking) {
                playFrom(val)
              }
            }} 
            style={{ width: '100%' }}
          />
        </div>

        <div style={{display:'flex', gap: 8, marginTop: 12}}>
          {!speaking ? <button onClick={readAloud}>Leer en el navegador</button> : <button onClick={stop}>Detener</button>}
        </div>
        <hr/>
        
        <div style={{
          whiteSpace: 'pre-wrap', 
          maxHeight: '300px', 
          overflowY: 'auto', 
          padding: '1rem', 
          border: '1px solid #333', 
          borderRadius: '4px',
          backgroundColor: '#111',
          fontFamily: 'monospace',
          lineHeight: '1.5'
        }}>
          <span style={{ color: '#888' }}>{data.text.slice(0, charIndex)}</span>
          <span style={{ backgroundColor: '#2563eb', color: '#fff' }}>{data.text.slice(charIndex, charIndex + 30)}</span>
          <span style={{ color: '#ddd' }}>{data.text.slice(charIndex + 30)}</span>
        </div>
      </div>}
    </div>
  )
}
