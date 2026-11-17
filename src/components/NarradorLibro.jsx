import { useCallback, useEffect, useRef, useState } from 'react'
import { firmarNarracionPagina, getNarracionPublicada } from '../services/narraciones.service'

async function textoPagina(pdfDoc, pagina) {
  const page = await pdfDoc.getPage(pagina)
  const content = await page.getTextContent()
  return content.items.map(item => item.str || '').join(' ').replace(/\s+/g, ' ').trim()
}

export default function NarradorLibro({ libroId, pdfDoc, leftPageNum, rightPageNum, numPages, doublePage, onPrev, onNext }) {
  const [narracion, setNarracion] = useState(null)
  const [estado, setEstado] = useState('cargando')
  const [pagina, setPagina] = useState(leftPageNum)
  const [velocidad, setVelocidad] = useState(() => {
    try { return Number(sessionStorage.getItem('iabooks_narracion_velocidad')) || 1 }
    catch { return 1 }
  })
  const [origen, setOrigen] = useState(null)
  const audioRef = useRef(null)
  const generationRef = useRef(0)
  const urlCacheRef = useRef(new Map())

  const detener = useCallback(() => {
    generationRef.current += 1
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.src = ''
      audioRef.current = null
    }
    window.speechSynthesis?.cancel()
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
        const utterance = new SpeechSynthesisUtterance(texto)
        utterance.lang = 'es'
        utterance.rate = velocidad
        utterance.onend = () => { if (request === generationRef.current) setEstado('parado') }
        utterance.onerror = () => { if (request === generationRef.current) setEstado('error') }
        setOrigen('dispositivo')
        window.speechSynthesis.speak(utterance)
      }
      if (request === generationRef.current) setEstado('leyendo')
    } catch {
      if (request === generationRef.current) setEstado('error')
    }
  }

  function pausar() {
    if (origen === 'grabada') audioRef.current?.pause()
    else window.speechSynthesis?.pause()
    setEstado('pausado')
  }

  async function continuar() {
    try {
      if (origen === 'grabada') await audioRef.current?.play()
      else window.speechSynthesis?.resume()
      setEstado('leyendo')
    } catch { setEstado('error') }
  }

  if (estado === 'sin_narracion') return null

  const lastVisiblePage = doublePage ? Math.min(rightPageNum, numPages) : leftPageNum
  const statusText = {
    cargando: 'Preparando narración…',
    parado: 'Lector de voz',
    leyendo: `Leyendo página ${pagina}`,
    pausado: `Pausado en página ${pagina}`,
    sin_audio: 'Esta página no tiene audio ni texto extraíble',
    error: 'No se pudo cargar la narración',
  }[estado]

  return (
    <section aria-label="Lector de voz" style={{ marginTop: 20, padding: 16, background: '#fff', borderRadius: 14, width: '100%', maxWidth: 680, textAlign: 'center' }}>
      <p role="status" style={{ margin: '0 0 10px', fontWeight: 700 }}>{statusText}</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'center' }}>
        <button type="button" onClick={() => { detener(); onPrev() }} disabled={leftPageNum <= 1}>Anterior</button>
        {doublePage && lastVisiblePage > leftPageNum && (
          <select aria-label="Página para narrar" value={pagina} onChange={event => { detener(); setPagina(Number(event.target.value)) }}>
            <option value={leftPageNum}>Página {leftPageNum}</option>
            <option value={rightPageNum}>Página {rightPageNum}</option>
          </select>
        )}
        <button type="button" onClick={estado === 'leyendo' ? pausar : estado === 'pausado' ? continuar : iniciar}
          disabled={!narracion || estado === 'cargando'}>
          {estado === 'leyendo' ? 'Pausar' : estado === 'pausado' ? 'Continuar' : 'Reproducir'}
        </button>
        <button type="button" onClick={iniciar} disabled={!narracion || estado === 'cargando'}>Reiniciar</button>
        <button type="button" onClick={() => { detener(); onNext() }} disabled={lastVisiblePage >= numPages}>Siguiente</button>
        <label>Velocidad{' '}
          <select value={velocidad} onChange={event => setVelocidad(Number(event.target.value))}>
            <option value={0.8}>0,8×</option>
            <option value={1}>1×</option>
            <option value={1.25}>1,25×</option>
          </select>
        </label>
      </div>
      {origen === 'dispositivo' && <small>Voz del dispositivo: audio piloto no disponible en esta página.</small>}
    </section>
  )
}
