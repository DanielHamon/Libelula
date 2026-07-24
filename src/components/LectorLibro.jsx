import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import { useWindowWidth } from '../hooks/useWindowWidth'

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

const C = { primary: '#2563EB', primaryLight: '#DBEAFE' }
const ANIM_MS = 1100

function getSavedSpread(libroId) {
  try { return parseInt(localStorage.getItem(`iabooks_spread_${libroId}`), 10) || 0 }
  catch { return 0 }
}

// Picks the most natural available Spanish voice
function pickBestVoice(voices) {
  const tests = [
    // Sabina Desktop — first priority
    v => /sabina.*desktop/i.test(v.name),
    v => /microsoft.*sabina/i.test(v.name),
    // Other Microsoft Neural (Edge / Windows 11)
    v => /natural|neural/i.test(v.name) && v.lang.startsWith('es'),
    v => /microsoft.*(pablo|jorge|helena)/i.test(v.name),
    // Apple Neural (Safari / macOS / iOS)
    v => ['Paulina', 'Marisol', 'Mónica', 'Monica', 'Juan'].includes(v.name),
    // Google voices
    v => /google/i.test(v.name) && v.lang.startsWith('es'),
    // Any es-MX
    v => v.lang === 'es-MX',
    // Any es-419 (Latin America)
    v => v.lang === 'es-419',
    // Any Spanish
    v => v.lang.startsWith('es'),
  ]
  for (const test of tests) {
    const found = voices.find(test)
    if (found) return found
  }
  return voices[0] ?? null
}

async function extractPageText(pdfDoc, pageNum) {
  try {
    const page = await pdfDoc.getPage(pageNum)
    const content = await page.getTextContent()
    return content.items
      .map(item => item.str)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
  } catch {
    return ''
  }
}

export default function LectorLibro({ pdfUrl, libroId, hotspots = [] }) {
  const windowWidth = useWindowWidth()
  const isMobile = windowWidth < 768
  const doublePage = windowWidth > 860

  const [numPages, setNumPages] = useState(null)
  const [pdfDoc, setPdfDoc] = useState(null)
  const [spread, setSpread] = useState(0)
  const [flipState, setFlipState] = useState('idle')
  const [pageWidth, setPageWidth] = useState(null)
  const [pageHeight, setPageHeight] = useState(null)
  const [jumpInput, setJumpInput] = useState('')
  const [activeVideo, setActiveVideo] = useState(null)
  const containerRef = useRef(null)
  const outerRef = useRef(null)
  const animTimerRef = useRef(null)
  const restoredRef = useRef(false)

  useEffect(() => {
    if (!numPages || !libroId || restoredRef.current) return
    restoredRef.current = true
    const saved = getSavedSpread(libroId)
    const total = doublePage ? Math.ceil(numPages / 2) : numPages
    if (saved > 0 && saved < total) setSpread(saved)
  }, [numPages, libroId, doublePage])

  useEffect(() => {
    if (!libroId || !numPages) return
    try { localStorage.setItem(`iabooks_spread_${libroId}`, spread) } catch {}
  }, [spread, libroId, numPages])

  const calcPageWidth = useCallback(() => {
    if (!containerRef.current) return
    const available = containerRef.current.clientWidth - 120
    setPageWidth(doublePage ? Math.floor((available - 12) / 2) : available)
  }, [doublePage])

  useEffect(() => {
    calcPageWidth()
    window.addEventListener('resize', calcPageWidth)
    return () => window.removeEventListener('resize', calcPageWidth)
  }, [calcPageWidth])

  useEffect(() => () => { if (animTimerRef.current) clearTimeout(animTimerRef.current) }, [])

  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') setActiveVideo(null) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const totalSpreads = numPages ? (doublePage ? Math.ceil(numPages / 2) : numPages) : 0
  const leftPageNum  = doublePage ? spread * 2 + 1 : spread + 1
  const rightPageNum = doublePage ? spread * 2 + 2 : spread + 1

  const preloadPageNums = useMemo(() => {
    if (!numPages || !pageWidth) return []
    const lp = doublePage ? spread * 2 + 1 : spread + 1
    const rp = doublePage ? spread * 2 + 2 : spread + 1
    const candidates = doublePage
      ? [lp - 4, lp - 2, rp + 2, rp + 4]
      : [lp - 2, lp - 1, lp + 1, lp + 2, lp + 3]
    return [...new Set(candidates.filter(n => n >= 1 && n <= numPages))]
  }, [spread, numPages, doublePage, pageWidth])

  function freezeHeight() {
    if (outerRef.current) outerRef.current.style.minHeight = outerRef.current.offsetHeight + 'px'
  }
  function thawHeight(delay = 400) {
    setTimeout(() => { if (outerRef.current) outerRef.current.style.minHeight = '' }, delay)
  }

  function goNext() {
    if (flipState !== 'idle' || spread >= totalSpreads - 1) return
    freezeHeight()
    setSpread(s => s + 1)
    setFlipState('next')
    if (animTimerRef.current) clearTimeout(animTimerRef.current)
    animTimerRef.current = setTimeout(() => { setFlipState('idle'); thawHeight() }, ANIM_MS)
  }

  function goPrev() {
    if (flipState !== 'idle' || spread <= 0) return
    freezeHeight()
    setSpread(s => s - 1)
    setFlipState('prev')
    if (animTimerRef.current) clearTimeout(animTimerRef.current)
    animTimerRef.current = setTimeout(() => { setFlipState('idle'); thawHeight() }, ANIM_MS)
  }

  function handleJump(e) {
    e.preventDefault()
    const target = parseInt(jumpInput, 10)
    if (!isNaN(target) && target >= 1 && target <= numPages) {
      const targetSpread = doublePage ? Math.floor((target - 1) / 2) : target - 1
      if (targetSpread !== spread) { freezeHeight(); setSpread(targetSpread); thawHeight(200) }
    }
    setJumpInput('')
  }

  function hotspotsForPage(pageNum) {
    if (!pageHeight || !pageWidth) return null
    return hotspots
      .filter(h => h.pagina === pageNum)
      .map(h => (
        <HotspotOverlay key={h.id} hotspot={h} onClick={() => setActiveVideo(h)} />
      ))
  }

  const canPrev = spread > 0
  const canNext = spread < totalSpreads - 1

  return (
    <div ref={outerRef} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px 16px 32px', background: '#E8E3D8' }}>
      <style>{`
        @keyframes flipNext {
          0%   { transform: perspective(2400px) rotateY(0deg);    box-shadow: -2px 0 6px rgba(0,0,0,0.10); opacity: 1; }
          30%  { transform: perspective(2400px) rotateY(-55deg);  box-shadow: -18px 0 42px rgba(0,0,0,0.28); opacity: 1; }
          55%  { transform: perspective(2400px) rotateY(-90deg);  box-shadow: -28px 0 60px rgba(0,0,0,0.36); opacity: 1; }
          80%  { transform: perspective(2400px) rotateY(-135deg); box-shadow: -10px 0 24px rgba(0,0,0,0.16); opacity: 1; }
          100% { transform: perspective(2400px) rotateY(-180deg); box-shadow: none; opacity: 0; }
        }
        @keyframes flipPrev {
          0%   { transform: perspective(2400px) rotateY(0deg);   box-shadow: 2px 0 6px rgba(0,0,0,0.10); opacity: 1; }
          30%  { transform: perspective(2400px) rotateY(55deg);  box-shadow: 18px 0 42px rgba(0,0,0,0.28); opacity: 1; }
          55%  { transform: perspective(2400px) rotateY(90deg);  box-shadow: 28px 0 60px rgba(0,0,0,0.36); opacity: 1; }
          80%  { transform: perspective(2400px) rotateY(135deg); box-shadow: 10px 0 24px rgba(0,0,0,0.16); opacity: 1; }
          100% { transform: perspective(2400px) rotateY(180deg); box-shadow: none; opacity: 0; }
        }
        @keyframes modalIn {
          from { opacity: 0; transform: scale(0.94) translateY(8px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes soundBar {
          0%, 100% { transform: scaleY(0.4); }
          50%      { transform: scaleY(1); }
        }
      `}</style>

      {/* Page indicator + jump */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#6B6050' }}>
          {numPages
            ? doublePage
              ? `Páginas ${leftPageNum}–${Math.min(rightPageNum, numPages)} de ${numPages}`
              : `Página ${leftPageNum} de ${numPages}`
            : 'Cargando...'}
        </span>
        {numPages && (
          <div style={{ width: 100, background: 'rgba(0,0,0,0.15)', borderRadius: 4, height: 4, overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 4, background: C.primary,
              width: `${(leftPageNum / numPages) * 100}%`,
              transition: 'width 0.4s ease',
            }} />
          </div>
        )}
        {numPages && (
          <form onSubmit={handleJump} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 12, color: '#6B6050', fontWeight: 600 }}>Ir a pág.</span>
            <input
              type="number" min={1} max={numPages} value={jumpInput}
              onChange={e => setJumpInput(e.target.value)} placeholder="…"
              style={{
                width: 52, padding: '3px 6px', borderRadius: 6,
                border: '1px solid #C4BBA8', fontSize: 13,
                fontFamily: 'Nunito', background: '#FFFEF7', color: '#6B6050',
                textAlign: 'center', outline: 'none',
              }}
            />
            <button type="submit" style={{
              background: C.primary, color: '#fff', border: 'none',
              borderRadius: 6, padding: '4px 10px', fontSize: 13,
              cursor: 'pointer', fontFamily: 'Nunito', fontWeight: 700,
            }}>→</button>
          </form>
        )}
      </div>

      {/* Book area */}
      <div ref={containerRef} style={{ width: '100%', minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: isMobile ? 5 : 12, overflow: 'hidden' }}>
        <NavBtn onClick={goPrev} disabled={!canPrev || flipState !== 'idle'} label="←" />

        {pageWidth && (
          <div style={{ display: 'flex', position: 'relative', filter: 'drop-shadow(0 8px 32px rgba(0,0,0,0.22))' }}>
            {doublePage && (
              <div style={{
                position: 'absolute', left: '50%', top: 6, bottom: 6, width: 10,
                transform: 'translateX(-50%)',
                background: 'linear-gradient(90deg,rgba(0,0,0,0.06),rgba(0,0,0,0.18),rgba(0,0,0,0.06))',
                zIndex: 5, borderRadius: 2,
              }} />
            )}

            <Document
              file={pdfUrl}
              onLoadSuccess={pdf => { setNumPages(pdf.numPages); setPdfDoc(pdf) }}
              loading={
                <div style={{ display: 'flex' }}>
                  <PageSkeleton width={pageWidth} />
                  {doublePage && <PageSkeleton width={pageWidth} />}
                </div>
              }
              error={<PageError />}
            >
              <div style={{ display: 'flex' }}>
                {/* Left page */}
                <div style={{
                  width: pageWidth, height: pageHeight || 'auto',
                  position: 'relative', overflow: 'hidden',
                  borderRadius: doublePage ? '8px 0 0 8px' : 8,
                  background: '#FFFEF7',
                  boxShadow: doublePage ? 'inset -6px 0 10px rgba(0,0,0,0.04)' : 'none',
                }}>
                  {leftPageNum <= (numPages || 0) && (
                    <Page
                      pageNumber={leftPageNum}
                      width={pageWidth}
                      renderAnnotationLayer={false}
                      renderTextLayer={false}
                      onRenderSuccess={({ height }) => setPageHeight(Math.round(height))}
                    />
                  )}
                  {hotspotsForPage(leftPageNum)}
                </div>

                {/* Right page */}
                {doublePage && numPages && rightPageNum <= numPages && (
                  <div style={{
                    width: pageWidth, height: pageHeight || 'auto',
                    position: 'relative', overflow: 'hidden',
                    borderRadius: '0 8px 8px 0',
                    background: '#FFFEF7',
                    boxShadow: 'inset 6px 0 10px rgba(0,0,0,0.04)',
                  }}>
                    <Page
                      pageNumber={rightPageNum}
                      width={pageWidth}
                      renderAnnotationLayer={false}
                      renderTextLayer={false}
                    />
                    {hotspotsForPage(rightPageNum)}
                  </div>
                )}
              </div>

              {numPages && (
                <div style={{ position: 'absolute', top: 0, left: 0, width: 0, height: 0, overflow: 'hidden', visibility: 'hidden', pointerEvents: 'none' }}>
                  {preloadPageNums.map(n => (
                    <Page key={`pr-${n}`} pageNumber={n} width={pageWidth} renderAnnotationLayer={false} renderTextLayer={false} />
                  ))}
                </div>
              )}
            </Document>

            {flipState !== 'idle' && (
              <div style={{
                position: 'absolute',
                top: 0, bottom: 0,
                width: pageWidth,
                ...(flipState === 'next' ? { right: 0 } : { left: 0 }),
                transformOrigin: flipState === 'next' ? 'left center' : 'right center',
                animation: `${flipState === 'next' ? 'flipNext' : 'flipPrev'} ${ANIM_MS}ms cubic-bezier(0.4, 0.0, 0.2, 1) forwards`,
                zIndex: 10, borderRadius: 6,
                background: flipState === 'next'
                  ? 'linear-gradient(90deg, #C8BFB2 0%, #DDD8CE 5%, #FFFEF7 20%, #FFFEF7 100%)'
                  : 'linear-gradient(270deg, #C8BFB2 0%, #DDD8CE 5%, #FFFEF7 20%, #FFFEF7 100%)',
                backfaceVisibility: 'hidden',
              }} />
            )}
          </div>
        )}

        <NavBtn onClick={goNext} disabled={!canNext || flipState !== 'idle'} label="→" />
      </div>

      {/* TTS Reader */}
      {pdfDoc && (
        <LectorVoz
          pdfDoc={pdfDoc}
          leftPageNum={leftPageNum}
          rightPageNum={rightPageNum}
          numPages={numPages}
          doublePage={doublePage}
          spread={spread}
        />
      )}

      {/* Dots */}
      {totalSpreads > 1 && (
        <div style={{ display: 'flex', gap: 6, marginTop: 16, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 400 }}>
          {Array.from({ length: Math.min(totalSpreads, 20) }).map((_, i) => (
            <button key={i}
              onClick={() => {
                if (flipState === 'idle' && i !== spread) { freezeHeight(); setSpread(i); thawHeight(200) }
              }}
              style={{
                width: spread === i ? 24 : 8, height: 8, borderRadius: 4, border: 'none',
                background: spread === i ? C.primary : '#C4BBA8',
                cursor: 'pointer', transition: 'all 0.3s', padding: 0,
              }} />
          ))}
        </div>
      )}

      {activeVideo && <VideoModal hotspot={activeVideo} onClose={() => setActiveVideo(null)} />}
    </div>
  )
}

// ─── TTS Reader ──────────────────────────────────────────────────────────────

function LectorVoz({ pdfDoc, leftPageNum, rightPageNum, numPages, doublePage, spread }) {
  const [estado, setEstado] = useState('parado') // parado | leyendo | pausado
  const [voces, setVoces] = useState([])
  const [vozIdx, setVozIdx] = useState(0)
  const [velocidad, setVelocidad] = useState(1.0)
  const [sinTexto, setSinTexto] = useState(false)
  const uttRef = useRef(null)
  // keepAlive: browsers pause speech after ~15 s in background tab
  const keepAliveRef = useRef(null)

  useEffect(() => {
    function cargar() {
      const todas = window.speechSynthesis.getVoices()
      const esp = todas.filter(v => v.lang.startsWith('es'))
      const lista = esp.length > 0 ? esp : todas
      setVoces(lista)
      const mejor = pickBestVoice(todas)
      const idx = lista.findIndex(v => v === mejor)
      setVozIdx(idx >= 0 ? idx : 0)
    }
    cargar()
    window.speechSynthesis.addEventListener('voiceschanged', cargar)
    return () => window.speechSynthesis.removeEventListener('voiceschanged', cargar)
  }, [])

  // Stop reading when page changes
  useEffect(() => {
    detener()
  }, [spread])

  useEffect(() => {
    return () => {
      window.speechSynthesis.cancel()
      clearInterval(keepAliveRef.current)
    }
  }, [])

  async function iniciar() {
    setSinTexto(false)
    window.speechSynthesis.cancel()

    const paginas = doublePage && rightPageNum <= numPages
      ? [leftPageNum, rightPageNum]
      : [leftPageNum]

    const textos = await Promise.all(paginas.map(p => extractPageText(pdfDoc, p)))
    const texto = textos.join(' ').trim()

    if (!texto) { setSinTexto(true); return }

    const utt = new SpeechSynthesisUtterance(texto)
    if (voces[vozIdx]) utt.voice = voces[vozIdx]
    utt.lang = voces[vozIdx]?.lang || 'es-MX'
    utt.rate = velocidad
    utt.pitch = 1.0
    utt.onend = () => { setEstado('parado'); clearInterval(keepAliveRef.current) }
    utt.onerror = () => { setEstado('parado'); clearInterval(keepAliveRef.current) }
    uttRef.current = utt

    setEstado('leyendo')
    window.speechSynthesis.speak(utt)

    // Keep-alive: Chrome pauses speech after ~15 s when tab loses focus
    clearInterval(keepAliveRef.current)
    keepAliveRef.current = setInterval(() => {
      if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
        window.speechSynthesis.pause()
        window.speechSynthesis.resume()
      }
    }, 12000)
  }

  function pausar() {
    window.speechSynthesis.pause()
    setEstado('pausado')
  }

  function reanudar() {
    window.speechSynthesis.resume()
    setEstado('leyendo')
  }

  function detener() {
    window.speechSynthesis.cancel()
    clearInterval(keepAliveRef.current)
    setEstado('parado')
    setSinTexto(false)
  }

  const pagLabel = doublePage && rightPageNum <= numPages
    ? `Páginas ${leftPageNum}–${rightPageNum}`
    : `Página ${leftPageNum}`

  return (
    <div style={{
      marginTop: 20,
      background: '#fff',
      borderRadius: 16,
      border: '1px solid #E5E7EB',
      padding: '10px 16px',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      flexWrap: 'wrap',
      justifyContent: 'center',
      boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
      maxWidth: 680,
      width: '100%',
      fontFamily: 'Nunito, sans-serif',
    }}>
      {/* Status label */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 120 }}>
        {estado === 'leyendo' ? (
          <SoundWave />
        ) : (
          <span style={{ fontSize: 16 }}>🔊</span>
        )}
        <span style={{ fontSize: 12, fontWeight: 700, color: estado === 'leyendo' ? '#2563EB' : '#6B7280' }}>
          {estado === 'leyendo' ? `Leyendo ${pagLabel}` : estado === 'pausado' ? 'Pausado' : 'Lector de voz'}
        </span>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        {/* Play / Pause */}
        <button
          onClick={estado === 'parado' ? iniciar : estado === 'leyendo' ? pausar : reanudar}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: '#2563EB', color: '#fff', border: 'none',
            borderRadius: 10, padding: '7px 14px', fontSize: 13, fontWeight: 700,
            cursor: 'pointer', fontFamily: 'Nunito, sans-serif',
            boxShadow: '0 1px 4px rgba(37,99,235,0.3)',
          }}
        >
          {estado === 'leyendo' ? '⏸ Pausar' : estado === 'pausado' ? '▶ Continuar' : '▶ Iniciar'}
        </button>

        {/* Restart */}
        {estado !== 'parado' && (
          <button
            onClick={() => { detener(); setTimeout(iniciar, 80) }}
            title="Reiniciar"
            style={{
              width: 34, height: 34, borderRadius: 8,
              background: '#F3F4F6', border: 'none',
              cursor: 'pointer', fontSize: 15,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >↺</button>
        )}
      </div>

      {/* Speed — hidden, kept for future use
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: '#9CA3AF', fontWeight: 600 }}>Vel.</span>
        {[0.8, 1.0, 1.3].map(v => (
          <button key={v} onClick={() => setVelocidad(v)} style={{
            padding: '3px 8px', borderRadius: 6, border: 'none',
            background: velocidad === v ? '#2563EB' : '#F3F4F6',
            color: velocidad === v ? '#fff' : '#6B7280',
            fontSize: 11, fontWeight: 700, cursor: 'pointer',
            fontFamily: 'Nunito, sans-serif',
          }}>{v}x</button>
        ))}
      </div>
      */}

      {/* Voice selector — hidden, kept for future use
      {voces.length > 1 && (
        <select
          value={vozIdx}
          onChange={e => setVozIdx(Number(e.target.value))}
          style={{
            padding: '4px 8px', borderRadius: 8, border: '1px solid #E5E7EB',
            fontSize: 11, fontFamily: 'Nunito, sans-serif', color: '#374151',
            background: '#F9FAFB', cursor: 'pointer', maxWidth: 160,
            outline: 'none',
          }}
        >
          {voces.map((v, i) => (
            <option key={i} value={i}>{v.name}</option>
          ))}
        </select>
      )}
      */}

      {sinTexto && (
        <span style={{ fontSize: 11, color: '#F97316', fontWeight: 600 }}>
          Esta página no tiene texto extraíble (imagen escaneada).
        </span>
      )}
    </div>
  )
}

function SoundWave() {
  const bars = [
    { delay: '0s', height: 14 },
    { delay: '0.15s', height: 20 },
    { delay: '0.3s', height: 12 },
    { delay: '0.1s', height: 18 },
  ]
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2, height: 20 }}>
      {bars.map((b, i) => (
        <div key={i} style={{
          width: 3, height: b.height, borderRadius: 2,
          background: '#2563EB',
          animation: `soundBar 0.7s ease-in-out infinite`,
          animationDelay: b.delay,
          transformOrigin: 'bottom',
        }} />
      ))}
    </div>
  )
}

// ─── Hotspot overlay ──────────────────────────────────────────────────────────

function HotspotOverlay({ hotspot, onClick }) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={hotspot.texto || 'Ver video'}
      style={{
        position: 'absolute',
        left:   `${(hotspot.x     ?? 0.05) * 100}%`,
        top:    `${(hotspot.y     ?? 0.80) * 100}%`,
        width:  `${(hotspot.ancho ?? 0.90) * 100}%`,
        height: `${(hotspot.alto  ?? 0.08) * 100}%`,
        zIndex: 6,
        cursor: 'pointer',
        borderRadius: 4,
        border: `2px dashed ${hovered ? '#EC4899' : 'rgba(236,72,153,0.50)'}`,
        background: hovered ? 'rgba(236,72,153,0.10)' : 'rgba(236,72,153,0.03)',
        transition: 'background 0.18s, border-color 0.18s',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'flex-end',
        padding: 3,
        boxSizing: 'border-box',
      }}
    >
      <span style={{
        background: '#EC4899', color: '#fff',
        fontSize: 9, fontWeight: 700,
        padding: '2px 7px', borderRadius: 6,
        fontFamily: 'Nunito, sans-serif', letterSpacing: 0.2,
        boxShadow: '0 1px 4px rgba(236,72,153,0.45)',
        flexShrink: 0, userSelect: 'none',
      }}>▶ Video</span>
    </div>
  )
}

// ─── Video modal ──────────────────────────────────────────────────────────────

function VideoModal({ hotspot, onClose }) {
  const videoRef = useRef(null)
  useEffect(() => {
    return () => { if (videoRef.current) { videoRef.current.pause(); videoRef.current.src = '' } }
  }, [])

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(15,23,42,0.78)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24, backdropFilter: 'blur(6px)',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#fff', borderRadius: 20,
        width: '100%', maxWidth: 720, overflow: 'hidden',
        boxShadow: '0 32px 80px rgba(0,0,0,0.45)',
        animation: 'modalIn 0.22s ease',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '14px 18px', borderBottom: '1px solid #E5E7EB',
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10, background: '#DBEAFE',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, flexShrink: 0,
          }}>▶</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            {hotspot.videoTitulo && (
              <div style={{ fontSize: 15, fontWeight: 700, color: '#1F2937', fontFamily: 'Nunito, sans-serif', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {hotspot.videoTitulo}
              </div>
            )}
            {hotspot.texto && (
              <div style={{ fontSize: 12, color: '#6B7280', fontFamily: 'Nunito, sans-serif', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {hotspot.texto}
              </div>
            )}
          </div>
          <button onClick={onClose} style={{
            width: 32, height: 32, borderRadius: '50%', border: 'none',
            background: '#F3F4F6', cursor: 'pointer', fontSize: 15,
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6B7280', flexShrink: 0,
          }}
            onMouseEnter={e => e.currentTarget.style.background = '#E5E7EB'}
            onMouseLeave={e => e.currentTarget.style.background = '#F3F4F6'}
          >✕</button>
        </div>
        <div style={{ background: '#000', aspectRatio: '16 / 9' }}>
          <video ref={videoRef} src={hotspot.videoSrc} controls autoPlay playsInline
            style={{ width: '100%', height: '100%', display: 'block' }} />
        </div>
      </div>
    </div>
  )
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

function NavBtn({ onClick, disabled, label }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      width: 44, height: 44, borderRadius: '50%', border: 'none', fontSize: 18,
      background: disabled ? '#C4BBA8' : '#2563EB', color: '#fff',
      cursor: disabled ? 'default' : 'pointer',
      opacity: disabled ? 0.4 : 1, flexShrink: 0,
      boxShadow: '0 2px 8px rgba(0,0,0,0.15)', transition: 'opacity 0.2s',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>{label}</button>
  )
}

function PageSkeleton({ width }) {
  return (
    <div style={{ width, minHeight: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FFFEF7' }}>
      <div style={{ textAlign: 'center', color: '#C4BBA8' }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>📄</div>
        <div style={{ fontSize: 12 }}>Cargando...</div>
      </div>
    </div>
  )
}

function PageError() {
  return <div style={{ padding: 24, textAlign: 'center', color: '#EF4444', fontSize: 13 }}>No se pudo cargar el PDF</div>
}
