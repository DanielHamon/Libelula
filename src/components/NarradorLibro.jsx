import { useCallback, useEffect, useRef, useState } from 'react'
import { firmarNarracionPagina, getNarracionPublicada } from '../services/narraciones.service'
import { createSpeechFallback } from '../lib/speechFallback'
import './NarradorLibro.css'

async function textoPagina(pdfDoc, pagina) {
  const page = await pdfDoc.getPage(pagina)
  const content = await page.getTextContent()
  return content.items.map(item => item.str || '').join(' ').replace(/\s+/g, ' ').trim()
}

export default function NarradorLibro({ libroId, pdfDoc, leftPageNum, rightPageNum, numPages, doublePage, onPrev, onNext, accent }) {
  const [narracion, setNarracion] = useState(null)
  const [estado, setEstado] = useState('cargando')
  const [pagina, setPagina] = useState(leftPageNum)
  const [velocidad, setVelocidad] = useState(() => {
    try { return Number(sessionStorage.getItem('iabooks_narracion_velocidad')) || 1 }
    catch { return 1 }
  })
  const [origen, setOrigen] = useState(null)
  const audioRef = useRef(null)
  const speechRef = useRef(null)
  const generationRef = useRef(0)
  const urlCacheRef = useRef(new Map())

  const detener = useCallback(() => {
    generationRef.current += 1
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.src = ''
      audioRef.current = null
    }
    speechRef.current?.stop()
    speechRef.current = null
    setEstado('parado')
    setOrigen(null)
  }, [])

  useEffect(() => {
    let active = true
    getNarracionPublicada(libroId)
      .then(data => {
        if (!active) return
        setNarracion(data)
        setEstado(data ? 'parado' : 'sin_narracion')
      })
      .catch(() => { if (active) setEstado('error') })
    return () => { active = false; detener() }
  }, [libroId, detener])

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = velocidad
    speechRef.current?.setRate(velocidad)
    try { sessionStorage.setItem('iabooks_narracion_velocidad', velocidad) } catch { /* almacenamiento opcional */ }
  }, [velocidad])

  async function iniciar() {
    if (!narracion || !pdfDoc) return
    detener()
    const request = generationRef.current
    setEstado('cargando')
    const audioPage = narracion.paginas.get(pagina)
    try {
      if (audioPage) {
        const cached = urlCacheRef.current.get(audioPage.storage_path)
        const url = cached && cached.expiresAt > Date.now() + 30_000
          ? cached.url
          : await firmarNarracionPagina(audioPage)
        if (!cached || cached.url !== url) {
          urlCacheRef.current.set(audioPage.storage_path, { url, expiresAt: Date.now() + 270_000 })
        }
        if (request !== generationRef.current) return
        const audio = new Audio(url)
        audio.playbackRate = velocidad
        audio.onended = () => { if (request === generationRef.current) setEstado('parado') }
        audio.onerror = () => { if (request === generationRef.current) setEstado('error') }
        audioRef.current = audio
        setOrigen('grabada')
        await audio.play()
      } else {
        if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) {
          setEstado('sin_audio')
          return
        }
        const texto = await textoPagina(pdfDoc, pagina)
        if (request !== generationRef.current) return
        if (!texto) { setEstado('sin_audio'); return }
        speechRef.current = createSpeechFallback({
          synthesis: window.speechSynthesis,
          Utterance: window.SpeechSynthesisUtterance,
          onEnd: () => { if (request === generationRef.current) setEstado('parado') },
          onError: () => { if (request === generationRef.current) setEstado('error') },
        })
        setOrigen('dispositivo')
        speechRef.current.start(texto, velocidad)
      }
      if (request === generationRef.current) setEstado('leyendo')
    } catch {
      if (request === generationRef.current) setEstado('error')
    }
  }

  function pausar() {
    if (origen === 'grabada') audioRef.current?.pause()
    else speechRef.current?.pause()
    setEstado('pausado')
  }

  async function continuar() {
    try {
      if (origen === 'grabada') await audioRef.current?.play()
      else speechRef.current?.resume()
      setEstado('leyendo')
    } catch { setEstado('error') }
  }

  if (estado === 'sin_narracion') return null

  const lastVisiblePage = doublePage ? Math.min(rightPageNum, numPages) : leftPageNum
  const statusText = {
    cargando: 'Preparando narración…',
    parado: `Página ${pagina} lista para escuchar`,
    leyendo: `Leyendo página ${pagina}`,
    pausado: `Pausado en página ${pagina}`,
    sin_audio: 'Esta página no tiene audio ni texto extraíble',
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
        <span className="voice-reader__source">{hasRecordedAudio ? 'Audio piloto' : 'Voz del dispositivo'}</span>
      </div>

      <p className="voice-reader__status" role="status">
        <span className={`voice-reader__status-dot${estado === 'leyendo' ? ' is-playing' : ''}`} aria-hidden="true" />
        {statusText}
      </p>

      <div className="voice-reader__controls">
        <button className="voice-reader__nav" type="button" onClick={() => { detener(); onPrev() }} disabled={leftPageNum <= 1}>
          <span aria-hidden="true">←</span><span>Anterior</span>
        </button>
        {doublePage && lastVisiblePage > leftPageNum && (
          <label className="voice-reader__field">Página
            <select aria-label="Página para narrar" value={pagina} onChange={event => { detener(); setPagina(Number(event.target.value)) }}>
              <option value={leftPageNum}>{leftPageNum}</option>
              <option value={rightPageNum}>{rightPageNum}</option>
            </select>
          </label>
        )}
        <button className="voice-reader__play" type="button"
          onClick={estado === 'leyendo' ? pausar : estado === 'pausado' ? continuar : iniciar}
          disabled={!narracion || estado === 'cargando'}>
          <span aria-hidden="true">{estado === 'leyendo' ? '⏸' : '▶'}</span>
          <span>{estado === 'leyendo' ? 'Pausar' : estado === 'pausado' ? 'Continuar' : 'Reproducir'}</span>
        </button>
        <button className="voice-reader__restart" type="button" onClick={iniciar}
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
      {!hasRecordedAudio && <p className="voice-reader__note">Esta página usa la voz de tu navegador mientras preparamos su narración.</p>}
    </section>
  )
}
