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
  const [queue, setQueue] = useState<ExtractResponse[]>([])
  const [activeQueueIndex, setActiveQueueIndex] = useState(0)
  const [rate, setRate] = useState(1.0)
  const [pitch, setPitch] = useState(1.0)
  const [voiceName, setVoiceName] = useState<string>('')
  const [speaking, setSpeaking] = useState(false)
  const utteranceRef = useRef<SpeechSynthesisUtterance|null>(null)
  const isChunkActiveRef = useRef(false)
  const nextIndexRef = useRef(0)
  const chunkListRef = useRef<string[]>([])
  const heartbeatRef = useRef<any>(null)
  const silentAudioRef = useRef<HTMLAudioElement | null>(null)
  const playbackRequestedRef = useRef(false)
  const [currentIdx, setCurrentIdx] = useState(-1)
  const [chunks, setChunks] = useState<string[]>([])
  const scrollContainerRef = useRef<HTMLDivElement|null>(null)
  const wakeLockRef = useRef<any>(null)
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null)

  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const synth = window.speechSynthesis
    const updateVoices = () => {
      const v = synth.getVoices()
      if (v.length > 0) {
        setVoices(v)
      }
    }

    updateVoices()
    synth.onvoiceschanged = updateVoices

    // Android/Edge Mobile Fix: Polling for voices
    // Some mobile browsers don't fire initial 'onvoiceschanged' correctly
    const voicePolling = setInterval(() => {
        const v = synth.getVoices()
        if (v.length > 0) {
            setVoices(prev => {
                if (prev.length !== v.length) return v;
                return prev;
            });
        }
    }, 500);

    // Stop polling after 10 seconds to save battery
    const stopPolling = setTimeout(() => clearInterval(voicePolling), 10000);

    const handlePrompt = (e: any) => {
      e.preventDefault()
      setDeferredPrompt(e)
    }
    window.addEventListener('beforeinstallprompt', handlePrompt)
    window.addEventListener('appinstalled', () => setDeferredPrompt(null))

    const handleVisibility = async () => {
      if (!window.speechSynthesis.speaking) return;
      // Extra safety resume to prevent freezing
      window.speechSynthesis.resume()
      
      if (document.visibilityState === 'visible') {
        if (playbackRequestedRef.current) {
          requestWakeLock();
        }
      } else if (document.visibilityState === 'hidden') {
         if (silentAudioRef.current && silentAudioRef.current.paused) {
           silentAudioRef.current.play().catch(() => {})
         }
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      stopPersistence()
      releaseWakeLock()
      clearInterval(voicePolling)
      clearTimeout(stopPolling)
      synth.onvoiceschanged = null
      window.removeEventListener('beforeinstallprompt', handlePrompt)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [])

  // Carga inicial desde localStorage
  useEffect(() => {
    const saved = localStorage.getItem('voxreader-state')
    if (saved) {
      try {
        const state = JSON.parse(saved)
        if (state.queue && state.queue.length > 0) {
          setQueue(state.queue)
          const activeIdx = state.activeQueueIndex || 0
          setActiveQueueIndex(activeIdx)
          
          const currentData = state.queue[activeIdx]
          if (currentData) {
            // Forzar segmentación para restaurar chunks
            const finalChunks = segmentText(currentData.text)
            chunkListRef.current = finalChunks
            setChunks(finalChunks)
            
            if (state.index !== undefined) {
              nextIndexRef.current = state.index
              setCurrentIdx(state.index - 1)
            }
          }
        } else if (state.data) {
          // Migración de versión anterior
          setQueue([state.data])
          setActiveQueueIndex(0)
          const finalChunks = segmentText(state.data.text)
          chunkListRef.current = finalChunks
          setChunks(finalChunks)
          if (state.index !== undefined) {
            nextIndexRef.current = state.index
            setCurrentIdx(state.index - 1)
          }
        }
        if (state.rate) setRate(state.rate)
        if (state.pitch) setPitch(state.pitch)
        if (state.voiceName) setVoiceName(state.voiceName)
      } catch (e) {
        console.error("Error cargando estado:", e)
      }
    }
  }, [])

  const sortedVoices = useMemo(() => {
    return [...voices].sort((a, b) => {
      if (a.lang < b.lang) return -1
      if (a.lang > b.lang) return 1
      return a.name.localeCompare(b.name)
    })
  }, [voices])

  useEffect(() => {
    if (currentIdx !== -1 && scrollContainerRef.current) {
      const activeElement = document.getElementById(`chunk-${currentIdx}`)
      if (activeElement) {
        activeElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }
    // Guardar progreso cada vez que cambia el índice o configuración
    saveState()
  }, [currentIdx, queue, activeQueueIndex, rate, pitch, voiceName])

  const saveState = () => {
    const state = {
      queue,
      activeQueueIndex,
      index: nextIndexRef.current,
      rate,
      pitch,
      voiceName
    }
    localStorage.setItem('voxreader-state', JSON.stringify(state))
  }

  const requestWakeLock = async () => {
    if (!('wakeLock' in navigator)) return;
    try {
      if (wakeLockRef.current) return;
      wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
      wakeLockRef.current.addEventListener('release', () => {
        wakeLockRef.current = null;
      });
    } catch (err: any) {
      console.error(`${err.name}, ${err.message}`);
    }
  }

  const releaseWakeLock = async () => {
    if (wakeLockRef.current) {
      await wakeLockRef.current.release();
      wakeLockRef.current = null;
    }
  }

  const segmentText = (text: string) => {
    const rawText = text.replace(/[\u0000-\u001F\u007F-\u009F]/g, " ").replace(/\s+/g, " ").trim();
    const regex = /[^.!?]+[.!?]+/g;
    let initialChunks = rawText.match(regex) || [rawText];
    const finalChunks: string[] = []
    initialChunks.forEach((c: string) => {
      if (c.length > 400) {
        const sub = c.match(/.{1,400}/g) || [c]
        finalChunks.push(...sub)
      } else {
        finalChunks.push(c)
      }
    })
    return finalChunks.filter((c: string) => c.trim().length > 0)
  }
 // Depend on voices.length to re-run only when needed

  const currentData = queue[activeQueueIndex]

  const doExtract = async () => {
    setError(undefined); setBusy(true)
    try {
      let json: ExtractResponse;

      if (mode === 'pdf') {
        if (!pdf) throw new Error('Adjuntá un PDF')
        const { extractFromPdfClient } = await import('@/lib/extract/pdf-client')
        json = await extractFromPdfClient(pdf)
      } else if (mode === 'epub') {
        if (!epub) throw new Error('Adjuntá un EPUB (*.epub)')
        const { extractFromEpubClient } = await import('@/lib/extract/epub-client')
        json = await extractFromEpubClient(epub)
      } else if (mode === 'web') {
        if (!url) throw new Error('Ingresá una URL válida')
        const fd = new FormData()
        fd.append('source', 'web')
        fd.append('url', url)
        const res = await fetch('/api/extract', { method: 'POST', body: fd })
        if (!res.ok) throw new Error(await res.text())
        json = await res.json() as ExtractResponse
      } else {
        throw new Error('Modo no soportado')
      }

      const newQueue = [...queue, json]
      setQueue(newQueue)
      
      if (queue.length === 0) {
        setActiveQueueIndex(0)
      }
    } catch (e:any) {
      console.error("Extraction error:", e)
      setError(e.message || 'Error al extraer contenido')
    } finally {
      setBusy(false)
    }
  }

  const startPersistence = () => {
    if (silentAudioRef.current && silentAudioRef.current.paused) {
      silentAudioRef.current.play().catch(() => {})
    }
    if (heartbeatRef.current) clearInterval(heartbeatRef.current)
    heartbeatRef.current = setInterval(() => {
      if (!playbackRequestedRef.current) return;
      if (window.speechSynthesis.speaking) {
        window.speechSynthesis.resume();
        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
      }
    }, 2000)
    saveState()
  }

  const stopPersistence = () => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current)
      heartbeatRef.current = null
    }
    if (silentAudioRef.current) {
      silentAudioRef.current.pause()
    }
  }

  const pauseReading = () => {
    playbackRequestedRef.current = false
    const synth = window.speechSynthesis
    synth.cancel()
    stopPersistence()
    if (silentAudioRef.current) {
      silentAudioRef.current.pause()
    }
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'paused'
    }
    setSpeaking(false)
    isChunkActiveRef.current = false
    setCurrentIdx(-1)
    releaseWakeLock()
    saveState()
  }

  const restartReading = () => {
    playbackRequestedRef.current = false
    stopPersistence()
    window.speechSynthesis.cancel()
    nextIndexRef.current = 0
    isChunkActiveRef.current = false
    setSpeaking(false)
    setCurrentIdx(-1)
    releaseWakeLock()
    if (currentData?.text) readAloud()
  }

  const skipForward = () => {
    if (chunkListRef.current.length === 0) return
    playbackRequestedRef.current = true
    startPersistence()
    setSpeaking(true)
    playChunk(nextIndexRef.current)
  }

  const skipBackward = () => {
    if (chunkListRef.current.length === 0) return
    playbackRequestedRef.current = true
    startPersistence()
    setSpeaking(true)
    const prev = Math.max(0, nextIndexRef.current - 2)
    playChunk(prev)
  }

  const playChunk = (index: number) => {
    if (!playbackRequestedRef.current) return
    const synth = window.speechSynthesis
    
    // Safety check for index
    if (index < 0) index = 0
    
    if (index >= chunkListRef.current.length) {
      pauseReading()
      nextIndexRef.current = 0
      return
    }

    // Cancelar cualquier cosa anterior antes de hablar
    synth.cancel()
    requestWakeLock()

    isChunkActiveRef.current = true
    nextIndexRef.current = index + 1
    setCurrentIdx(index)

    const text = chunkListRef.current[index]
    const u = new SpeechSynthesisUtterance(text)
    u.rate = rate
    u.pitch = pitch
    u.volume = 1

    const v = voices.find((v: SpeechSynthesisVoice) => v.name === voiceName)
    if (v) {
      u.voice = v
      u.lang = v.lang
    } else {
      u.lang = 'es-ES'
    }

    u.onend = () => {
      isChunkActiveRef.current = false
      if (playbackRequestedRef.current) {
        if ('mediaSession' in navigator) {
          navigator.mediaSession.playbackState = 'playing'
          // Aprox. duration tracking
          if ('setPositionState' in navigator.mediaSession) {
             const pos = nextIndexRef.current * 10
             const dur = chunkListRef.current.length * 10
             navigator.mediaSession.setPositionState({
                duration: Math.max(pos, dur),
                playbackRate: 1,
                position: Math.min(pos, dur)
             })
          }
        }
      }
    }

    u.onerror = (e: SpeechSynthesisErrorEvent) => {
      if (e.error === 'interrupted') return;
      console.error("Chunk Error:", e)
      isChunkActiveRef.current = false
    }

    // Sincronizar audio silencioso
    if (silentAudioRef.current && silentAudioRef.current.paused) {
      silentAudioRef.current.play().catch(() => {})
    }

    utteranceRef.current = u
    synth.speak(u)
  }

  const readAloud = (resume = false, forceQueueIdx?: number) => {
    const targetIdx = forceQueueIdx !== undefined ? forceQueueIdx : activeQueueIndex
    const docToRead = queue[targetIdx]
    if (!docToRead?.text) return
    playbackRequestedRef.current = true
    const synth = window.speechSynthesis
    
    if (!resume) {
      pauseReading()
      nextIndexRef.current = 0
    }
    
    setSpeaking(true)

    // Preparar audio silencioso (se activará solo cuando sea necesario)
    if (!silentAudioRef.current) {
      const blob = generateSilentWav(60); 
      if (blob) {
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url)
        audio.loop = true
        audio.ontimeupdate = () => {
          if (!playbackRequestedRef.current) return;
          const synth = window.speechSynthesis;
          if (synth.speaking) {
             synth.resume();
          } else if (isChunkActiveRef.current === false && nextIndexRef.current < chunkListRef.current.length) {
             playChunk(nextIndexRef.current);
          }
        };
        silentAudioRef.current = audio
      }
    }

    startPersistence()

    // Configurar Media Session para lock screen
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: docToRead.title || 'Voxreader',
        artist: `Doc ${targetIdx + 1} de ${queue.length}`,
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
        const synth = window.speechSynthesis;
        if (synth.paused) {
          synth.resume();
        } else if (!isChunkActiveRef.current) {
          playChunk(nextIndexRef.current);
        }
        navigator.mediaSession.playbackState = 'playing'
      })
      navigator.mediaSession.setActionHandler('pause', () => pauseReading())
      navigator.mediaSession.setActionHandler('stop', () => restartReading())
      navigator.mediaSession.setActionHandler('previoustrack', () => skipBackward())
      navigator.mediaSession.setActionHandler('nexttrack', () => skipForward())
    }

    if (resume) {
      if (chunkListRef.current.length > 0) {
        // Si ya tenemos pedazos, simplemente reanudamos desde el actual o el siguiente
        const idx = Math.max(0, nextIndexRef.current - 1)
        playChunk(idx)
        return
      }
      // Si no hay pedazos (perdimos estado), caemos al flujo normal para regenerarlos
    }

    // Preparar texto: Limpiar caracteres basura
    const finalChunks = segmentText(docToRead.text);
    
    chunkListRef.current = finalChunks
    setChunks(chunkListRef.current)
    if (!resume) {
      nextIndexRef.current = 0
      setCurrentIdx(-1)
    }
    isChunkActiveRef.current = false

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

  const removeFromQueue = (idx: number) => {
    const newQueue = queue.filter((_, i) => i !== idx)
    setQueue(newQueue)
    if (idx === activeQueueIndex) {
      pauseReading()
      setActiveQueueIndex(0)
    } else if (idx < activeQueueIndex) {
      setActiveQueueIndex(activeQueueIndex - 1)
    }
  }

  return (
    <div className="container">
      <img 
        src="https://github.com/user-attachments/assets/80d1698d-1d02-45c6-81c1-6c6660ed7563" 
        alt="VoxReader Logo" 
        style={{
          width: '120px', 
          height: 'auto', 
          display: 'block', 
          margin: '0 auto 1rem auto',
          borderRadius: '12px'
        }} 
      />
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
          <input type="file" accept="application/pdf" onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPdf(e.target.files?.[0] || null)} />
        </div>}
        {mode === 'web' && <div>
          <label>URL de la página</label>
          <input type="url" placeholder="https://ejemplo.com/articulo" value={url} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUrl(e.target.value)} />
          <p className="small">Respetá robots.txt y términos del sitio. Para contenidos detrás de login, no funcionará.</p>
        </div>}
        {mode === 'epub' && <div>
          <label>Adjuntar EPUB</label>
          <input type="file" accept=".epub" onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEpub(e.target.files?.[0] || null)} />
        </div>}

        <div style={{marginTop: 20}}>
          <button onClick={doExtract} disabled={busy} className="btn-glow" style={{width: '100%'}}>
            <div className="btn-content">{busy ? 'Procesando...' : '✨ Extraer texto'}</div>
          </button>
        </div>
        {error && <p style={{color: '#f87171', marginTop: 12, textAlign: 'center', fontWeight: 500}}>{error}</p>}
      </div>

      {queue.length > 0 && (
        <div className="card" style={{marginTop: '1.5rem'}}>
          <h3 style={{fontSize: '1.1rem', marginBottom: '1rem'}}>📚 Cola de Lectura ({queue.length})</h3>
          <div style={{display: 'flex', flexDirection: 'column', gap: 8}}>
            {queue.map((item, idx) => (
              <div 
                key={idx} 
                style={{
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  background: idx === activeQueueIndex ? 'rgba(99, 102, 241, 0.15)' : 'rgba(255,255,255,0.03)',
                  borderRadius: '8px',
                  border: idx === activeQueueIndex ? '1px solid var(--brand)' : '1px solid transparent',
                  transition: 'all 0.2s ease'
                }}
              >
                <div 
                  onClick={() => {
                    pauseReading()
                    setActiveQueueIndex(idx)
                    nextIndexRef.current = 0
                  }}
                  style={{flex: 1, cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.9rem'}}
                >
                  <span style={{color: idx === activeQueueIndex ? 'var(--brand)' : 'var(--muted)', marginRight: 8, fontWeight: 'bold'}}>
                    {idx + 1}.
                  </span>
                  {item.title || 'Sin título'}
                </div>
                <button 
                  onClick={() => removeFromQueue(idx)}
                  className="simple" 
                  style={{padding: '4px 8px', fontSize: '0.8rem', color: '#f87171'}}
                >
                  Eliminar
                </button>
              </div>
            ))}
          </div>
          {queue.length > 1 && (
             <button onClick={() => { pauseReading(); setQueue([]); setActiveQueueIndex(0); }} className="simple" style={{width: '100%', marginTop: '1rem', color: 'var(--muted)', fontSize: '0.85rem'}}>
                Vaciar cola
             </button>
          )}
        </div>
      )}

      {currentData && <div className="card">
        <h2 style={{fontSize: '1.25rem', marginBottom: '0.5rem'}}>{currentData.title || (mode === 'web' ? 'Página Web' : (mode === 'pdf' ? 'Documento PDF' : 'EPUB'))}</h2>
        <p className="small" style={{marginBottom: '1.5rem'}}>Caracteres: {currentData.text.length.toLocaleString()} | Doc {activeQueueIndex + 1} de {queue.length}</p>
        
        <div className="row">
          <div>
            <label>Voz ({voices.length})</label>
            <select value={voiceName} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setVoiceName(e.target.value)}>
              <option value="">Sistema (detectar)</option>
              {sortedVoices.map((v: SpeechSynthesisVoice) => (
                <option key={v.name} value={v.name}>
                  [{v.lang.substring(0,2).toUpperCase()}] {v.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>Velocidad: {rate.toFixed(1)}x</label>
            <input type="range" min="0.5" max="2" step="0.1" value={rate} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRate(parseFloat(e.target.value))} />
          </div>
        </div>
        
        <div className="row">
          <div>
            <label>Tono: {pitch.toFixed(1)}</label>
            <input type="range" min="0.5" max="2" step="0.1" value={pitch} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPitch(parseFloat(e.target.value))} />
          </div>
          <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, width: '100%'}}>
             <button title="Anterior" onClick={skipBackward} className="simple" style={{padding: '12px', borderRadius: '50%', background: 'rgba(255,255,255,0.05)', width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                <div style={{fontSize: '1rem'}}>⏪</div>
             </button>
             <button title="Reiniciar" onClick={restartReading} className="simple" style={{padding: '12px', borderRadius: '50%', background: 'rgba(255,255,255,0.05)', width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                <div style={{fontSize: '1rem'}}>🔄</div>
             </button>
             <button onClick={speaking ? pauseReading : () => readAloud(true)} className="btn-glow" style={{flex: 1, minWidth: 140}}>
                <div className="btn-content" style={{fontSize: '0.95rem'}}>{speaking ? '⏸ Pausar' : (nextIndexRef.current > 0 ? '▶ Reanudar' : '▶ Leer contenido')}</div>
             </button>
             <button title="Siguiente" onClick={skipForward} className="simple" style={{padding: '12px', borderRadius: '50%', background: 'rgba(255,255,255,0.05)', width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
                <div style={{fontSize: '1rem'}}>⏩</div>
             </button>
          </div>
        </div>

        <div style={{marginTop: '1.5rem', marginBottom: '0.5rem'}}>
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px'}}>
            <span style={{fontSize: '0.85rem', color: 'var(--muted)', fontWeight: 500}}>Avance del artículo</span>
            <span style={{fontSize: '0.9rem', color: 'var(--brand)', fontWeight: 'bold'}}>
              {chunks.length > 0 ? Math.min(100, Math.round(((currentIdx + 1) / chunks.length) * 100)) : 0}%
            </span>
          </div>
          <div style={{width: '100%', height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '10px', overflow: 'hidden'}}>
            <div 
              style={{
                width: `${chunks.length > 0 ? Math.min(100, Math.round(((currentIdx + 1) / chunks.length) * 100)) : 0}%`,
                height: '100%',
                background: 'var(--brand)',
                boxShadow: '0 0 10px var(--brand)',
                transition: 'width 0.3s ease'
              }}
            />
          </div>
        </div>

        <div 
          ref={scrollContainerRef}
          style={{
            marginTop: '1.5rem',
            height: '350px',
            overflowY: 'auto',
            background: 'rgba(0,0,0,0.4)',
            borderRadius: '12px',
            padding: '1.5rem',
            lineHeight: '1.8',
            fontSize: '1.05rem',
            border: '1px solid var(--border)',
            scrollBehavior: 'smooth'
          }}
        >
          {chunks.length > 0 ? chunks.map((chunk, i) => (
            <span 
              key={i}
              id={`chunk-${i}`}
              onClick={() => {
                playbackRequestedRef.current = true;
                startPersistence();
                setSpeaking(true);
                playChunk(i);
              }}
              style={{
                cursor: 'pointer',
                borderRadius: '4px',
                padding: '2px 4px',
                backgroundColor: currentIdx === i ? 'rgba(99, 102, 241, 0.3)' : 'transparent',
                color: currentIdx === i ? 'var(--neon-blue)' : 'inherit',
                borderBottom: currentIdx === i ? '2px solid var(--neon-blue)' : 'none',
                transition: 'all 0.2s ease',
                display: 'inline',
                marginRight: '6px'
              }}
            >
              {chunk}
            </span>
          )) : (
            <p style={{color: 'var(--muted)', textAlign: 'center', marginTop: '2rem'}}>
              El texto extraído aparecerá segmentado aquí para seguir la lectura...
            </p>
          )}
        </div>

        <style jsx>{`
          span:hover {
            background: rgba(255,255,255,0.05);
            color: #fff;
          }
        `}</style>
      </div>}
    </div>
  )
}
