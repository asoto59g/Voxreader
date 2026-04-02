'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'

type ExtractResponse = {
  title?: string
  text: string
  source?: { type: 'pdf' | 'web' | 'epub', url?: string, name?: string }
}

const generateSilentWav = (durationSeconds = 60) => {
  if (typeof window === 'undefined') return null;
  const sampleRate = 8000;
  const numChannels = 1;
  const bitsPerSample = 8;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = durationSeconds * byteRate;
  const chunkSize = 36 + dataSize;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  view.setUint32(0, 0x52494646, false); // RIFF
  view.setUint32(4, chunkSize, true);
  view.setUint32(8, 0x57415645, false); // WAVE
  view.setUint32(12, 0x666d7420, false); // fmt
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  view.setUint32(36, 0x64617461, false); // data
  view.setUint32(40, dataSize, true);
  for (let i = 0; i < dataSize; i++) view.setUint8(44 + i, 128); // Silence
  return new Blob([buffer], { type: 'audio/wav' });
};

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
  const chunkIndexRef = useRef(0)
  const chunkListRef = useRef<string[]>([])
  const heartbeatRef = useRef<any>(null)
  const silentAudioRef = useRef<HTMLAudioElement | null>(null)
  const workerRef = useRef<Worker | null>(null)
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null)

  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const synth = window.speechSynthesis
    const updateVoices = () => {
      const v = synth.getVoices()
      if (v.length > 0) setVoices(v)
    }

    const interval = setInterval(updateVoices, 500)
    updateVoices()
    synth.onvoiceschanged = updateVoices

    const handlePrompt = (e: any) => {
      e.preventDefault()
      setDeferredPrompt(e)
    }
    window.addEventListener('beforeinstallprompt', handlePrompt)
    window.addEventListener('appinstalled', () => setDeferredPrompt(null))

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden' && window.speechSynthesis.speaking) {
        window.speechSynthesis.resume()
        if (silentAudioRef.current && silentAudioRef.current.paused) {
          silentAudioRef.current.play().catch(() => {})
        }
        // Boost priority in MediaSession when hidden
        if ('mediaSession' in navigator) {
          navigator.mediaSession.playbackState = 'playing'
        }
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)

    // Crear un Worker para mantener el pulso en segundo plano (Android lo suspende menos que al hilo principal)
    const workerCode = `
      var timer = null;
      onmessage = function(e) {
        if (e.data === 'start') {
          if (timer) clearInterval(timer);
          timer = setInterval(function() { postMessage('tick'); }, 1000);
        } else if (e.data === 'stop') {
          if (timer) clearInterval(timer);
        }
      };
    `;
    const blob = new Blob([workerCode], {type: 'application/javascript'});
    const worker = new Worker(URL.createObjectURL(blob));
    worker.onmessage = () => {
      if (window.speechSynthesis.speaking) window.speechSynthesis.resume();
    };
    workerRef.current = worker;

    return () => {
      clearInterval(interval)
      if (heartbeatRef.current) clearInterval(heartbeatRef.current)
      if (workerRef.current) {
        workerRef.current.postMessage('stop');
        workerRef.current.terminate();
      }
      synth.onvoiceschanged = null
      window.removeEventListener('beforeinstallprompt', handlePrompt)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [voices.length]) // Depend on voices.length to re-run only when needed

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

  const stop = () => {
    const synth = window.speechSynthesis
    synth.cancel()
    if (heartbeatRef.current) clearInterval(heartbeatRef.current)
    if (workerRef.current) workerRef.current.postMessage('stop')
    if (silentAudioRef.current) {
      silentAudioRef.current.pause()
      silentAudioRef.current.currentTime = 0
    }
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'none'
    }
    setSpeaking(false)
    chunkIndexRef.current = 0
  }

  const playChunk = (index: number) => {
    const synth = window.speechSynthesis
    if (index >= chunkListRef.current.length) {
      stop()
      return
    }

    const text = chunkListRef.current[index]
    const u = new SpeechSynthesisUtterance(text)
    u.rate = rate
    u.pitch = pitch
    u.volume = 1

    const v = voices.find(v => v.name === voiceName)
    if (v) {
      u.voice = v
      u.lang = v.lang
    } else {
      u.lang = 'es-ES'
    }

    u.onend = () => {
      chunkIndexRef.current = index + 1
      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'playing'
        // Force update position to keep OS interested
        if ('setPositionState' in navigator.mediaSession) {
          navigator.mediaSession.setPositionState({
            duration: chunkListRef.current.length * 10, // Mock duration
            playbackRate: 1,
            position: (index + 1) * 10
          })
        }
      }
      // Pequeño delay para dejar respirar al motor pero lo suficientemente corto para que no suspendan el hilo
      setTimeout(() => playChunk(index + 1), 10);
    }

    u.onerror = (e) => {
      console.error("Chunk Error:", e)
      // Si falla por estar en segundo plano, intentar recuperar
      setTimeout(() => {
        chunkIndexRef.current = index + 1
        playChunk(index + 1)
      }, 100)
    }

    // Sincronizar audio silencioso en cada chunk para renovar la prioridad de Android
    if (silentAudioRef.current && silentAudioRef.current.paused) {
      silentAudioRef.current.play().catch(() => {})
    }

    utteranceRef.current = u
    synth.speak(u)
  }

  const readAloud = () => {
    if (!data?.text) return
    const synth = window.speechSynthesis
    stop() // Limpiar todo antes de empezar
    setSpeaking(true)

    // Activar audio silencioso para mantener vivo el proceso en Android
    if (!silentAudioRef.current) {
      const blob = generateSilentWav(60); // 1 minuto de silencio real
      if (blob) {
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url)
        audio.loop = true
        // El pulso de audio mantiene vivo el hilo principal
        audio.ontimeupdate = () => {
          if (window.speechSynthesis.speaking) {
            window.speechSynthesis.resume();
          }
        };
        silentAudioRef.current = audio
      }
    }
    silentAudioRef.current?.play().catch(console.error)

    // Configurar Media Session para lock screen
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: data.title || 'Voxreader',
        artist: 'Leyendo contenido...',
        album: 'Voxreader PWA',
        artwork: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }]
      })
      navigator.mediaSession.playbackState = 'playing'
      
      // Intentar forzar duración para que Android no lo ignore
      if ('setPositionState' in navigator.mediaSession) {
        navigator.mediaSession.setPositionState({
          duration: 1000,
          playbackRate: 1,
          position: 0
        })
      }

      navigator.mediaSession.setActionHandler('play', () => {
        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        } else if (!window.speechSynthesis.speaking) {
          playChunk(chunkIndexRef.current);
        }
        navigator.mediaSession.playbackState = 'playing'
      })
      navigator.mediaSession.setActionHandler('pause', () => {
        window.speechSynthesis.pause();
        navigator.mediaSession.playbackState = 'paused';
      })
      navigator.mediaSession.setActionHandler('stop', () => stop())
    }

    // Preparar texto: Limpiar caracteres basura
    const rawText = data.text.replace(/[\u0000-\u001F\u007F-\u009F]/g, " ").replace(/\s+/g, " ").trim();
    
    // Segmentar por frases (puntos, signos) para que Android no se sature
    const regex = /[^.!?]+[.!?]+/g;
    let initialChunks = rawText.match(regex) || [rawText];
    
    // Si una frase es muy larga (>400), dividirla más
    const finalChunks: string[] = []
    initialChunks.forEach(c => {
      if (c.length > 400) {
        const sub = c.match(/.{1,400}/g) || [c]
        finalChunks.push(...sub)
      } else {
        finalChunks.push(c)
      }
    })
    
    chunkListRef.current = finalChunks.filter(c => c.trim().length > 0)
    chunkIndexRef.current = 0

    if (chunkListRef.current.length === 0) {
      setSpeaking(false)
      return
    }

    if (workerRef.current) workerRef.current.postMessage('start')

    // Sistema Keep-Alive para Android: resume() preventivo cada 2s (más agresivo)
    heartbeatRef.current = setInterval(() => {
      if (window.speechSynthesis.speaking) {
        window.speechSynthesis.resume();
        // Recordar al MediaSession que seguimos aquí
        if ('mediaSession' in navigator) {
          navigator.mediaSession.playbackState = 'playing';
        }
      }
    }, 2000)

    // Iniciar con un pequeño delay y warmup
    setTimeout(() => {
      const warmup = new SpeechSynthesisUtterance("")
      warmup.volume = 0
      synth.speak(warmup)
      playChunk(0)
    }, 250)
  }


  const handleInstall = async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') setDeferredPrompt(null)
  }

  return (
    <div className="container">
      <h1>Text2Audio PWA</h1>
      <p className="small">Convierte texto (PDF, páginas web, EPUB) a audio. Lectura rápida en el navegador.</p>

      {deferredPrompt && (
        <button onClick={handleInstall} className="btn-glow" style={{width: '100%', marginTop: '1.5rem', marginBottom: '0.5rem'}}>
          <div className="btn-content">📲 Instalar App en este dispositivo</div>
        </button>
      )}

      <div className="card" style={{marginTop: '1.5rem'}}>
        <div style={{display: 'flex', gap: 12, marginBottom: 24}}>
          <button onClick={() => setMode('pdf')} className="simple" style={{flex: 1, background: mode==='pdf' ? 'var(--brand)' : 'rgba(255,255,255,0.05)'}}>PDF</button>
          <button onClick={() => setMode('web')} className="simple" style={{flex: 1, background: mode==='web' ? 'var(--brand)' : 'rgba(255,255,255,0.05)'}}>Web</button>
          <button onClick={() => setMode('epub')} className="simple" style={{flex: 1, background: mode==='epub' ? 'var(--brand)' : 'rgba(255,255,255,0.05)'}}>EPUB</button>
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

        <div style={{marginTop: 20}}>
          <button onClick={doExtract} disabled={busy} className="btn-glow" style={{width: '100%'}}>
            <div className="btn-content">{busy ? 'Procesando...' : '✨ Extraer texto'}</div>
          </button>
        </div>
        {error && <p style={{color: '#f87171', marginTop: 12, textAlign: 'center', fontWeight: 500}}>{error}</p>}
      </div>

      {data && <div className="card">
        <h2 style={{fontSize: '1.25rem', marginBottom: '0.5rem'}}>{data.title || 'Contenido extraído'}</h2>
        <p className="small" style={{marginBottom: '1.5rem'}}>Caracteres: {data.text.length.toLocaleString()}</p>
        
        <div className="row">
          <div>
            <label>Voz</label>
            <select value={voiceName} onChange={e => setVoiceName(e.target.value)}>
              <option value="">Sistema (detectar)</option>
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
          <div style={{display: 'flex', alignItems: 'flex-end'}}>
             <button onClick={speaking ? stop : readAloud} className="btn-glow" style={{width: '100%'}}>
                <div className="btn-content">{speaking ? '⏹ Detener' : '▶ Leer contenido'}</div>
             </button>
          </div>
        </div>
        <hr/>
        <textarea 
          readOnly 
          value={data.text} 
          rows={12} 
          style={{marginTop: '1.5rem'}}
          placeholder="El texto extraído aparecerá aquí..."
        />
      </div>}
    </div>
  )
}
