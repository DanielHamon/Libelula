import { useCallback, useEffect, useRef, useState } from 'react'
import { firmarNarracionPagina, getNarracionPublicada } from '../services/narraciones.service'
import { etiquetaPaginaLibro } from '../lib/bookPageNumbers'
import './NarradorLibro.css'

export default function NarradorLibro({ libroId, pdfDoc, leftPageNum, rightPageNum, numPages, doublePage, onPrev, onNext, onAutoNext, autoPlayPage, autoPlayReady, onAutoPlayConsumed, onAvailabilityChange, accent }) {
  const [narracion, setNarracion] = useState(null)
  const [estado, setEstado] = useState('cargando')
  const [pagina, setPagina] = useState(leftPageNum)
  const [velocidad, setVelocidad] = useState(() => {
    try { return Number(sessionStorage.getItem('iabooks_narracion_velocidad')) || 1 }
    catch { return 1 }
  })
  const audioRef = useRef(null)
  const narracionIdRef = useRef(null)
  const generationRef = useRef(0)
  const urlCacheRef = useRef(new Map())
  const advanceTimerRef = useRef(null)
  const iniciarRef = useRef(null)
  const onAutoNextRef = useRef(null)
  const lastVisiblePage = doublePage ? Math.min(rightPageNum, numPages) : leftPageNum

  const detener = useCallback(() => {
    generationRef.current += 1
    clearTimeout(advanceTimerRef.current)
    advanceTimerRef.current = null
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.src = ''
      audioRef.current = null
    }
    setEstado('parado')
  }, [])

  useEffect(() => {
    let active = true
    let latestRequest = 0
    const urlCache = urlCacheRef.current
    async function refresh() {
      const request = ++latestRequest
      try {
        const data = await getNarracionPublicada(libroId)
        if (!active || request !== latestRequest) return
        if (narracionIdRef.current !== (data?.id ?? null)) {
          detener()
          urlCache.clear()
          narracionIdRef.current = data?.id ?? null
          setEstado(data ? 'parado' : 'sin_narracion')
        }
        setNarracion(data)
        onAvailabilityChange(Boolean(data))
      } catch {
        if (active && request === latestRequest) {
          setEstado('error')
        }
      }
    }
    void refresh()
    const timer = setInterval(() => { void refresh() }, 3000)
    return () => { active = false; clearInterval(timer); detener(); urlCache.clear() }
  }, [libroId, detener, onAvailabilityChange])

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = velocidad
    try { sessionStorage.setItem('iabooks_narracion_velocidad', velocidad) } catch { /* almacenamiento opcional */ }
  }, [velocidad])

  function finalizar(targetPage, request) {
    if (request !== generationRef.current) return
    if (targetPage >= numPages) { setEstado('parado'); return }
    setEstado('esperando')
    advanceTimerRef.current = setTimeout(() => {
      advanceTimerRef.current = null
      if (request !== generationRef.current) return
      const nextPage = targetPage + 1
      if (nextPage <= lastVisiblePage) {
        setPagina(nextPage)
        void iniciarRef.current(nextPage)
      } else {
        onAutoNextRef.current(nextPage)
      }
    }, 1000)
  }

  async function iniciar(targetPage = pagina) {
    if (!narracion || !pdfDoc) return
    detener()
    const request = generationRef.current
    setEstado('cargando')
    const audioPage = narracion.paginas.get(targetPage)
    try {
      if (audioPage) {
        const cached = urlCacheRef.current.get(audioPage.storage_path)
        const url = cached && cached.expiresAt > Date.now() + 30_000
          ? cached.url
          : await firmarNarracionPagina(audioPage)
        if (!cached || cached.url !== url) {
          urlCacheRef.current.set(audioPage.storage_path, { url, expiresAt: Date.now() + 90_000 })
        }
        if (request !== generationRef.current) return
        const audio = new Audio(url)
        audio.playbackRate = velocidad
        audio.onended = () => finalizar(targetPage, request)
        audio.onerror = () => { if (request === generationRef.current) setEstado('error') }
        audioRef.current = audio
        await audio.play()
      } else {
        setEstado('sin_audio')
        finalizar(targetPage, request)
        return
      }
      if (request === generationRef.current) setEstado('leyendo')
    } catch {
      if (request === generationRef.current) setEstado('error')
    }
  }
  useEffect(() => {
    iniciarRef.current = iniciar
    onAutoNextRef.current = onAutoNext
  })

  useEffect(() => {
    if (!narracion || !pdfDoc || !autoPlayReady || autoPlayPage !== leftPageNum) return undefined
    const timer = setTimeout(() => {
      onAutoPlayConsumed(null)
      void iniciarRef.current(autoPlayPage)
    }, 0)
    return () => clearTimeout(timer)
  }, [narracion, pdfDoc, autoPlayPage, autoPlayReady, leftPageNum, onAutoPlayConsumed])

  function pausar() {
    if (advanceTimerRef.current) { detener(); return }
    audioRef.current?.pause()
    setEstado('pausado')
  }

  async function continuar() {
    try {
      await audioRef.current?.play()
      setEstado('leyendo')
    } catch { setEstado('error') }
  }

  if (!narracion) return null

  const portada = numPages > 1 && pagina === 1
  const paginaMostrada = etiquetaPaginaLibro(pagina, numPages)
  const statusText = {
    cargando: 'Preparando narración…',
    parado: `${portada ? 'Portada' : `Página ${paginaMostrada}`} lista para escuchar`,
    esperando: 'Pasando a la siguiente página en 1 segundo…',
    leyendo: `Leyendo ${portada ? 'la portada' : `página ${paginaMostrada}`}`,
    pausado: `Pausado en ${portada ? 'la portada' : `página ${paginaMostrada}`}`,
    sin_audio: 'Esta página no requiere narración',
    error: 'No se pudo cargar la narración',
  }[estado]
  const hasRecordedAudio = Boolean(narracion?.paginas.has(pagina))

  return (
    <section className="voice-reader" aria-label="Lector de voz" style={{ '--voice-accent': accent || '#e91e8c' }}>
      <div className="voice-reader__header">
        <span className="voice-reader__icon" aria-hidden="true">🔊</span>
        <div className="voice-reader__heading">
          <span className="voice-reader__eyebrow">ACOMPAÑA TU LECTURA</span>
          <h2>Lector de voz</h2>
        </div>
        <p className="voice-reader__status" role="status">
          <span className={`voice-reader__status-dot${estado === 'leyendo' ? ' is-playing' : ''}`} aria-hidden="true" />
          {statusText}
        </p>
        <span className="voice-reader__source">{hasRecordedAudio ? 'Audio grabado' : 'Sin audio en esta página'}</span>
      </div>

      <div className="voice-reader__controls">
        <button className="voice-reader__nav" type="button" onClick={() => { detener(); onPrev() }} disabled={leftPageNum <= 1}>
          <span aria-hidden="true">←</span><span>Anterior</span>
        </button>
        {doublePage && lastVisiblePage > leftPageNum && (
          <label className="voice-reader__field">Página
            <select aria-label="Página impresa para narrar" value={pagina} onChange={event => { detener(); setPagina(Number(event.target.value)) }}>
              <option value={leftPageNum}>{etiquetaPaginaLibro(leftPageNum, numPages)}</option>
              <option value={rightPageNum}>{etiquetaPaginaLibro(rightPageNum, numPages)}</option>
            </select>
          </label>
        )}
        <button className="voice-reader__play" type="button"
          onClick={estado === 'leyendo' ? pausar : estado === 'esperando' ? detener : estado === 'pausado' ? continuar : () => iniciar()}
          disabled={!narracion || estado === 'cargando'}>
          <span aria-hidden="true">{estado === 'leyendo' ? '⏸' : estado === 'esperando' ? '■' : '▶'}</span>
          <span>{estado === 'leyendo' ? 'Pausar' : estado === 'esperando' ? 'Detener' : estado === 'pausado' ? 'Continuar' : 'Reproducir'}</span>
        </button>
        <button className="voice-reader__restart" type="button" onClick={() => iniciar()}
          disabled={!narracion || estado === 'cargando'} aria-label="Reiniciar lectura" title="Reiniciar lectura">
          <span aria-hidden="true">↺</span>
        </button>
        <button className="voice-reader__nav" type="button" onClick={() => { detener(); onNext() }} disabled={lastVisiblePage >= numPages}>
          <span>Siguiente</span><span aria-hidden="true">→</span>
        </button>
        <label className="voice-reader__field voice-reader__speed">Velocidad
          <select value={velocidad} onChange={event => setVelocidad(Number(event.target.value))}>
            <option value={0.8}>0,8×</option>
            <option value={1}>1×</option>
            <option value={1.25}>1,25×</option>
          </select>
        </label>
      </div>
      {!hasRecordedAudio && <p className="voice-reader__note">La lectura continuará en la siguiente página narrada.</p>}
    </section>
  )
}
