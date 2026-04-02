'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'

type ExtractResponse = {
  title?: string
  text: string
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

  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const synth = window.speechSynthesis
    const updateVoices = () => {
      setVoices(synth.getVoices())
    }
    updateVoices()
    synth.onvoiceschanged = updateVoices
    return () => {
      synth.onvoiceschanged = null
    }
  }, [])

  const doExtract = async () => {
    setError(undefined); setBusy(true); setData(undefined)
    try {
      const fd = new FormData()
      if (mode === 'pdf') {
        if (!pdf) throw new Error('Adjuntá un PDF')
        fd.append('source', 'pdf')
        fd.append('file', pdf)
      } else if (mode === 'web') {
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
    } catch (e:any) {
      setError(e.message || 'Error al extraer contenido')
    } finally {
      setBusy(false)
    }
  }

  const readAloud = () => {
    if (!data?.text) return
    const synth = window.speechSynthesis
    
    // Cancelar cualquier lectura previa (fundamental en móviles)
    synth.cancel()
    setSpeaking(true)

    // Un pequeño retraso ayuda a que el motor de voz de Android se "resetee" correctamente
    setTimeout(() => {
      // Limpiamos el texto de caracteres de control que confunden a algunos motores TTS
      const cleanText = data.text.slice(0, 100000)
        .replace(/[\r\n\t]+/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      if (!cleanText) {
        setSpeaking(false);
        return;
      }

      const u = new SpeechSynthesisUtterance(cleanText)
      u.rate = rate
      u.pitch = pitch
      
      const v = voices.find(v => v.name === voiceName)
      if (v) u.voice = v
      
      u.onend = () => setSpeaking(false)
      u.onerror = (e) => {
        console.error('Error TTS:', e)
        setSpeaking(false)
      }
      
      utteranceRef.current = u
      synth.speak(u)
    }, 60)
  }

  const stop = () => {
    window.speechSynthesis.cancel()
    setSpeaking(false)
  }


  return (
    <div className="container">
      <h1>Text2Audio PWA</h1>
      <p className="small">Convierte texto (PDF, páginas web, EPUB) a audio. Lectura rápida en el navegador.</p>

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
        <div className="row">
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

        <div style={{display:'flex', gap: 8, marginTop: 12}}>
          {!speaking ? <button onClick={readAloud}>Leer en el navegador</button> : <button onClick={stop}>Detener</button>}
        </div>
        <hr/>
        <textarea readOnly value={data.text} rows={16} />
      </div>}
    </div>
  )
}
