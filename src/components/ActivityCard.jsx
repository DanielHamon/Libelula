import { useState, useRef, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

// ── Palette ───────────────────────────────────────────────────────────────────
export const C = {
  pink: '#e91e8c', pinkMid: '#f48fb1', pinkLight: '#fce4ec',
  purple: '#7b1fa2', purpleLight: '#f3e5f5',
  green: '#4caf50', greenLight: '#e8f5e9',
  red: '#f44336', redLight: '#ffebee',
  blue: '#1e88e5', blueLight: '#e3f2fd',
  teal: '#00897b', tealLight: '#e0f2f1',
  orange: '#e65100', orangeLight: '#fff3e0',
  text: '#2d2d2d', textMuted: '#757575',
  bg: '#fff9fb', white: '#ffffff', border: '#f0e0ea',
}

export const TIPO_CONFIG = {
  video:             { icon: '▶️', label: 'Video',              color: C.blue,   bg: C.blueLight   },
  audio:             { icon: '🔊', label: 'Audio',              color: C.purple, bg: C.purpleLight  },
  imagen:            { icon: '🖼️', label: 'Imagen',             color: C.teal,   bg: C.tealLight   },
  colorear:          { icon: '🎨', label: 'Colorear',           color: C.pink,   bg: C.pinkLight   },
  termometroEmocional:{ icon: '🌡️', label: 'Termómetro',        color: C.orange, bg: C.orangeLight },
  sopaLetras:        { icon: '🔤', label: 'Sopa de letras',     color: C.green,  bg: C.greenLight  },
  seleccionMultiple: { icon: '🎯', label: 'Selección múltiple', color: C.pink,   bg: C.pinkLight   },
  verdaderoFalso:    { icon: '⚖️', label: 'Verdadero / Falso',  color: C.teal,   bg: C.tealLight   },
  completarPalabras: { icon: '✏️', label: 'Completar',          color: C.purple, bg: C.purpleLight  },
  ordenarEventos:    { icon: '🔢', label: 'Ordenar',            color: C.blue,   bg: C.blueLight   },
  escribirCarta:     { icon: '✉️', label: 'Escribir',           color: C.orange, bg: C.orangeLight  },
  completarMapa:     { icon: '🗺️', label: 'Mapa',               color: C.green,  bg: C.greenLight  },
  emparejar:         { icon: '🔗', label: 'Emparejar',          color: C.blue,   bg: C.blueLight   },
  dibujoLibre:       { icon: '✏️', label: 'Dibujo libre',       color: C.pink,   bg: C.pinkLight   },
  identificar:       { icon: '🔍', label: 'Identificar',        color: C.orange, bg: C.orangeLight },
}

// ── Word-search helpers ───────────────────────────────────────────────────────
export function generateGrid(palabras, size) {
  const grid = Array.from({ length: size }, () => Array(size).fill(''))
  const dirs = [[0,1],[0,-1],[1,0],[-1,0],[1,1]]
  for (const word of palabras) {
    if (word.length > size) continue
    let placed = false
    for (let attempt = 0; attempt < 300 && !placed; attempt++) {
      const [dr, dc] = dirs[Math.floor(Math.random() * dirs.length)]
      const minR = dr < 0 ? word.length - 1 : 0, maxR = dr > 0 ? size - word.length : size - 1
      const minC = dc < 0 ? word.length - 1 : 0, maxC = dc > 0 ? size - word.length : size - 1
      if (minR > maxR || minC > maxC) continue
      const r0 = minR + Math.floor(Math.random() * (maxR - minR + 1))
      const c0 = minC + Math.floor(Math.random() * (maxC - minC + 1))
      let ok = true
      for (let i = 0; i < word.length && ok; i++) {
        const cell = grid[r0 + dr * i][c0 + dc * i]
        if (cell !== '' && cell !== word[i]) ok = false
      }
      if (ok) { for (let i = 0; i < word.length; i++) grid[r0+dr*i][c0+dc*i] = word[i]; placed = true }
    }
  }
  const AL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (!grid[r][c]) grid[r][c] = AL[Math.floor(Math.random() * 26)]
  return grid
}

function linePath(a, b) {
  const dr = b.r - a.r, dc = b.c - a.c, steps = Math.max(Math.abs(dr), Math.abs(dc))
  if (steps === 0) return [a]
  const sr = dr / steps, sc = dc / steps
  if ((Math.abs(sr) > 0 && Math.abs(sr) < 1) || (Math.abs(sc) > 0 && Math.abs(sc) < 1)) return null
  return Array.from({ length: steps + 1 }, (_, i) => ({ r: a.r + Math.round(sr * i), c: a.c + Math.round(sc * i) }))
}
function matchWord(path, palabras, grid) {
  if (!path || path.length < 2) return null
  const fwd = path.map(p => grid[p.r][p.c]).join(''), rev = fwd.split('').reverse().join('')
  return palabras.find(w => w === fwd || w === rev) || null
}
function cellKey(r, c) { return `${r},${c}` }
function cellFromPoint(x, y) {
  const el = document.elementFromPoint(x, y); if (!el) return null
  const cell = el.closest('[data-row]'); if (!cell) return null
  return { r: parseInt(cell.dataset.row, 10), c: parseInt(cell.dataset.col, 10) }
}

// ── Activity card wrapper ─────────────────────────────────────────────────────
export function ActivityCard({ act, numero, isMobile, completada, onComplete, snapMode = true }) {
  const cfg = TIPO_CONFIG[act.tipo] || { icon: '📄', label: act.tipo || 'Actividad', color: C.textMuted, bg: '#F3F4F6' }
  const cardStyle = snapMode ? {
    scrollSnapAlign: 'start',
    minHeight: '100%',
    padding: isMobile ? '28px 20px 44px' : '48px 56px 56px',
    borderBottom: `2px solid ${C.border}`,
    background: C.bg,
  } : {
    background: '#fff',
    border: '2px solid #fce4f3',
    borderRadius: 18,
    boxShadow: '0 4px 24px rgba(233,30,140,0.10)',
    padding: isMobile ? '22px 20px 28px' : '28px 36px 36px',
    marginBottom: 20,
  }

  return (
    <div style={{
      ...cardStyle,
      display: 'flex', flexDirection: 'column', gap: 22,
      boxSizing: 'border-box',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
        <div style={{
          width: isMobile ? 42 : 50, height: isMobile ? 42 : 50, borderRadius: '50%', flexShrink: 0,
          background: cfg.color, color: C.white,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: "'Fredoka One', cursive", fontSize: isMobile ? 18 : 22,
          boxShadow: `0 3px 12px ${cfg.color}55`,
        }}>{numero}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: isMobile ? 18 : 23, fontWeight: 800, color: C.text, lineHeight: 1.3 }}>
            {act.tipo === 'termometroEmocional' ? (act.label || act.titulo) : act.titulo}
          </div>
          <span style={{ display: 'inline-block', marginTop: 6, background: cfg.bg, color: cfg.color, fontSize: 12, fontWeight: 700, padding: '4px 12px', borderRadius: 20 }}>
            {cfg.icon} {cfg.label}
          </span>
        </div>
        {completada && (
          <span style={{ flexShrink: 0, background: C.greenLight, color: C.green, fontSize: 12, fontWeight: 700, padding: '6px 14px', borderRadius: 20 }}>
            ✅ Listo
          </span>
        )}
      </div>
      <div>
        <ActivityContent act={act} isMobile={isMobile} completada={completada} onComplete={onComplete} />
      </div>
    </div>
  )
}

// ── Dispatcher ────────────────────────────────────────────────────────────────
function ActivityContent({ act, isMobile, completada, onComplete }) {
  const p = { key: act.id, isMobile, completada, onComplete }
  const maxIntentos = act.maxIntentos ?? 2
  switch (act.tipo) {
    case 'video':             return <VideoActividad url={act.url} titulo={act.videoTitulo} />
    case 'audio':             return <AudioActividad url={act.url} titulo={act.titulo} />
    case 'imagen':            return <ImagenActividad imagenUrl={act.imagenUrl} descripcion={act.descripcion} />
    case 'colorear':          return <ColorearActividad {...p} imagenUrl={act.imagenUrl} actividadId={act.id} alreadyComplete={completada} />
    case 'termometroEmocional': return <TermometroEmocional {...p} actividadId={act.id} instruccion={act.instruccion} label={act.label} emoji={act.emoji} estados={act.estados ?? []} escalas={act.escalas ?? []} min={act.min} max={act.max} minLabel={act.minLabel} maxLabel={act.maxLabel} />
    case 'sopaLetras':        return <SopaLetras {...p} palabras={act.palabras ?? []} numPalabras={act.numPalabras ?? act.palabras?.length ?? 0} espacio={Math.min(Math.max(act.espacio ?? 8, 5), 12)} alreadyComplete={completada} />
    case 'seleccionMultiple': return <SeleccionMultiple {...p} pregunta={act.pregunta} opciones={act.opciones ?? []} retroalimentacion={act.retroalimentacion} retroalimentacionError={act.retroalimentacionError} maxIntentos={maxIntentos} />
    case 'verdaderoFalso':    return <VerdaderoFalso {...p} afirmaciones={act.afirmaciones ?? []} />
    case 'completarPalabras': return <CompletarPalabras {...p} texto={act.texto ?? ''} respuestas={act.respuestas ?? []} maxIntentos={maxIntentos} />
    case 'ordenarEventos':    return <OrdenarEventos {...p} instruccion={act.instruccion} eventos={act.eventos ?? []} maxIntentos={maxIntentos} />
    case 'escribirCarta':     return <EscribirCarta {...p} actividadId={act.id} destinatario={act.destinatario} promptTexto={act.promptTexto} />
    case 'completarMapa':     return <CompletarMapa {...p} actividadId={act.id} instruccion={act.instruccion} nodos={act.nodos ?? []} />
    case 'emparejar':         return <Emparejar {...p} pares={act.pares ?? []} maxIntentos={maxIntentos} />
    case 'dibujoLibre':       return <DibujoLibre {...p} actividadId={act.id} instruccion={act.instruccion} />
    case 'identificar':       return <IdentificarActividad {...p} instruccion={act.instruccion} opciones={act.opciones ?? []} maxIntentos={maxIntentos} />
    default: return <div style={{ color: C.red, fontSize: 13, background: C.redLight, padding: '8px 12px', borderRadius: 8 }}>Tipo desconocido: {act.tipo}</div>
  }
}

// ── Video ─────────────────────────────────────────────────────────────────────
function VideoActividad({ url, titulo }) {
  if (!url) return <MissingField campo="url" />
  const embedUrl = url.includes('youtu') ? url.replace('watch?v=', 'embed/').replace('youtu.be/', 'www.youtube.com/embed/') : url
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {titulo && <p style={{ fontSize: 14, color: C.textMuted, margin: 0 }}>{titulo}</p>}
      <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0, borderRadius: 14, overflow: 'hidden', border: `1px solid ${C.border}` }}>
        <iframe src={embedUrl} title={titulo || 'video'} allowFullScreen style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }} />
      </div>
    </div>
  )
}

// ── Audio ─────────────────────────────────────────────────────────────────────
function AudioActividad({ url, titulo }) {
  if (!url) return <MissingField campo="url" />
  return (
    <div style={{ background: C.purpleLight, borderRadius: 16, padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {titulo && <p style={{ fontSize: 14, fontWeight: 600, color: C.purple, margin: 0 }}>{titulo}</p>}
      <audio controls src={url} style={{ width: '100%' }} />
    </div>
  )
}

// ── Imagen ────────────────────────────────────────────────────────────────────
function ImagenActividad({ imagenUrl, descripcion }) {
  if (!imagenUrl) return <MissingField campo="imagenUrl" />
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <img src={imagenUrl} alt={descripcion || ''} style={{ width: '100%', maxHeight: 420, objectFit: 'contain', borderRadius: 14, border: `1px solid ${C.border}` }} />
      {descripcion && <p style={{ fontSize: 13, color: C.textMuted, margin: 0 }}>{descripcion}</p>}
    </div>
  )
}

// ── Colorear ──────────────────────────────────────────────────────────────────
const CANVAS_SIZE = 800
const PRESET_COLORS = ['#EF4444','#F97316','#FACC15','#22C55E','#3B82F6','#A855F7','#EC4899','#78716C']
const BRUSH_SIZES = [{ label: 'Fino', size: 4 }, { label: 'Normal', size: 11 }, { label: 'Grueso', size: 26 }]
const sTitle = { fontSize: 10, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.6, margin: '0 0 6px' }

function ColorearActividad({ imagenUrl, actividadId, isMobile, onComplete, alreadyComplete }) {
  const canvasRef = useRef(null)
  const [tool, setTool] = useState('pencil')
  const [brushSize, setBrushSize] = useState(11)
  const [color, setColor] = useState('#EF4444')
  const [customColor, setCustomColor] = useState('#FF69B4')
  const [undoStack, setUndoStack] = useState([])
  const [saveStatus, setSaveStatus] = useState(null)
  const [userId, setUserId] = useState(null)
  const isDrawingRef = useRef(false), lastPosRef = useRef(null)
  const saveDrawingTimerRef = useRef(null), onCompleteRef = useRef(onComplete)
  const toolRef = useRef(tool), brushSizeRef = useRef(brushSize), colorRef = useRef(color)
  const saveTimerRef = useRef(null)
  onCompleteRef.current = onComplete; toolRef.current = tool; brushSizeRef.current = brushSize; colorRef.current = color

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUserId(user?.id ?? null))
  }, [])

  useEffect(() => {
    if (!userId) return
    const canvas = canvasRef.current; if (!canvas) return
    canvas.getContext('2d').clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE)
    const saved = localStorage.getItem(`colorear_${userId}_${actividadId}`)
    if (saved) { const img = new Image(); img.onload = () => canvas.getContext('2d').drawImage(img, 0, 0); img.src = saved }
  }, [actividadId, userId])

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const prev = e => e.preventDefault()
    canvas.addEventListener('touchstart', prev, { passive: false }); canvas.addEventListener('touchmove', prev, { passive: false })
    return () => { canvas.removeEventListener('touchstart', prev); canvas.removeEventListener('touchmove', prev) }
  }, [])

  useEffect(() => {
    const onUp = () => { if (isDrawingRef.current) stopDrawing() }
    document.addEventListener('mouseup', onUp); document.addEventListener('touchend', onUp)
    return () => { document.removeEventListener('mouseup', onUp); document.removeEventListener('touchend', onUp) }
  }, [])

  function getPos(e) {
    const rect = canvasRef.current.getBoundingClientRect(), sx = CANVAS_SIZE / rect.width, sy = CANVAS_SIZE / rect.height
    const src = e.touches ? e.touches[0] : e
    return { x: (src.clientX - rect.left) * sx, y: (src.clientY - rect.top) * sy }
  }
  function startDraw(e) {
    const ctx = canvasRef.current.getContext('2d')
    setUndoStack(prev => [...prev.slice(-19), ctx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE)])
    isDrawingRef.current = true; const pos = getPos(e); lastPosRef.current = pos
    const sz = toolRef.current === 'eraser' ? brushSizeRef.current * 2.5 : brushSizeRef.current
    ctx.beginPath(); ctx.arc(pos.x, pos.y, sz / 2, 0, Math.PI * 2)
    if (toolRef.current === 'eraser') { ctx.save(); ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = 'rgba(0,0,0,1)'; ctx.fill(); ctx.restore() }
    else { ctx.fillStyle = colorRef.current; ctx.fill() }
  }
  function draw(e) {
    if (!isDrawingRef.current) return
    const ctx = canvasRef.current.getContext('2d'), pos = getPos(e)
    const sz = toolRef.current === 'eraser' ? brushSizeRef.current * 2.5 : brushSizeRef.current
    ctx.beginPath(); ctx.moveTo(lastPosRef.current.x, lastPosRef.current.y); ctx.lineTo(pos.x, pos.y)
    ctx.lineWidth = sz; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    if (toolRef.current === 'eraser') { ctx.save(); ctx.globalCompositeOperation = 'destination-out'; ctx.strokeStyle = 'rgba(0,0,0,1)'; ctx.stroke(); ctx.restore() }
    else { ctx.strokeStyle = colorRef.current; ctx.stroke() }
    lastPosRef.current = pos
  }
  function stopDrawing() {
    if (!isDrawingRef.current) return
    isDrawingRef.current = false; triggerSave()
    if (saveDrawingTimerRef.current) clearTimeout(saveDrawingTimerRef.current)
    saveDrawingTimerRef.current = setTimeout(() => {
      if (!canvasRef.current) return
      const src = canvasRef.current
      const tmp = document.createElement('canvas')
      tmp.width = src.width; tmp.height = src.height
      const tCtx = tmp.getContext('2d')
      tCtx.fillStyle = '#ffffff'
      tCtx.fillRect(0, 0, tmp.width, tmp.height)
      tCtx.drawImage(src, 0, 0)
      const imageData = tmp.toDataURL('image/jpeg', 0.6)
      onCompleteRef.current({ tipo: 'colorear', imageData }, null)
    }, 1500)
  }
  function triggerSave() {
    setSaveStatus('saving'); if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      if (userId) localStorage.setItem(`colorear_${userId}_${actividadId}`, canvasRef.current.toDataURL('image/png'))
      setSaveStatus('saved'); setTimeout(() => setSaveStatus(null), 2000)
    }, 80)
  }
  function undo() {
    if (!undoStack.length) return
    const stack = [...undoStack], snap = stack.pop(); setUndoStack(stack)
    canvasRef.current.getContext('2d').putImageData(snap, 0, 0); triggerSave()
  }

  const canvasW = isMobile ? '100%' : 'min(380px, 48vw)'
  const activeColor = tool === 'pencil' ? color : null
  return (
    <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 16, alignItems: 'flex-start' }}>
      <div style={{ position: 'relative', flexShrink: 0, width: canvasW, aspectRatio: '1/1', borderRadius: 16, overflow: 'hidden', border: `1px solid ${C.border}`, background: '#fff' }}>
        <canvas ref={canvasRef} width={CANVAS_SIZE} height={CANVAS_SIZE}
          style={{ width: '100%', height: '100%', display: 'block', cursor: tool === 'eraser' ? 'cell' : 'crosshair', touchAction: 'none' }}
          onMouseDown={startDraw} onMouseMove={draw} onTouchStart={startDraw} onTouchMove={draw} />
        {imagenUrl && <img src={imagenUrl} alt="" draggable={false} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'fill', pointerEvents: 'none', mixBlendMode: 'multiply' }} />}
      </div>
      <div style={{ background: '#fff', borderRadius: 16, padding: '14px 12px', border: `1px solid ${C.border}`, width: isMobile ? '100%' : 175, flexShrink: 0, boxSizing: 'border-box' }}>
        <p style={sTitle}>Lápiz</p>
        <div style={{ display: 'flex', gap: 5, marginBottom: 14 }}>
          {BRUSH_SIZES.map(b => (
            <button key={b.size} onClick={() => { setBrushSize(b.size); setTool('pencil') }} style={{ flex: 1, padding: '6px 2px', borderRadius: 8, border: '2px solid', borderColor: tool === 'pencil' && brushSize === b.size ? C.pink : C.border, background: tool === 'pencil' && brushSize === b.size ? C.pinkLight : '#F9FAFB', color: tool === 'pencil' && brushSize === b.size ? C.pink : C.textMuted, fontFamily: 'Nunito', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}>{b.label}</button>
          ))}
        </div>
        <p style={sTitle}>Colores</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 5, marginBottom: 14 }}>
          {PRESET_COLORS.map(c => (
            <button key={c} onClick={() => { setColor(c); setTool('pencil') }} style={{ aspectRatio: '1/1', borderRadius: 7, background: c, border: `3px solid ${activeColor === c ? '#111' : 'transparent'}`, cursor: 'pointer', boxShadow: activeColor === c ? '0 0 0 2px #fff inset' : 'none' }} />
          ))}
          <label onClick={() => { setColor(customColor); setTool('pencil') }} style={{ aspectRatio: '1/1', borderRadius: 7, cursor: 'pointer', gridColumn: 'span 2', background: 'conic-gradient(red 0%,yellow 17%,lime 33%,cyan 50%,blue 67%,magenta 83%,red 100%)', border: `3px solid ${activeColor === customColor ? '#111' : 'transparent'}`, position: 'relative', overflow: 'hidden', display: 'block' }}>
            <input type="color" value={customColor} onChange={e => { setCustomColor(e.target.value); setColor(e.target.value); setTool('pencil') }} style={{ opacity: 0, position: 'absolute', inset: 0, width: '100%', height: '100%', cursor: 'pointer' }} />
          </label>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <button onClick={() => setTool('eraser')} style={{ padding: '7px 6px', borderRadius: 8, border: '2px solid', borderColor: tool === 'eraser' ? '#F59E0B' : C.border, background: tool === 'eraser' ? '#FEF3C7' : '#F9FAFB', color: tool === 'eraser' ? '#92400E' : C.textMuted, fontFamily: 'Nunito', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>◻ Borrador</button>
          <button onClick={undo} disabled={!undoStack.length} style={{ padding: '7px 6px', borderRadius: 8, border: `2px solid ${C.border}`, background: !undoStack.length ? '#F9FAFB' : '#fff', color: !undoStack.length ? '#D1D5DB' : C.text, fontFamily: 'Nunito', fontWeight: 700, fontSize: 12, cursor: !undoStack.length ? 'default' : 'pointer' }}>↩ Deshacer</button>
        </div>
        <div style={{ marginTop: 10, fontSize: 11, borderTop: `1px solid ${C.border}`, paddingTop: 8, color: saveStatus === 'saved' ? C.green : C.textMuted }}>
          {saveStatus === 'saving' ? '💾 Guardando...' : saveStatus === 'saved' ? '✓ Guardado' : '💾 Autoguardado'}
        </div>
      </div>
    </div>
  )
}

// ── Sopa de Letras ────────────────────────────────────────────────────────────
function SopaLetras({ isMobile, onComplete, alreadyComplete, palabras, numPalabras, espacio }) {
  const [grid] = useState(() => generateGrid(palabras, espacio))
  const [foundWords, setFoundWords] = useState(() => new Set())
  const [foundCellKeys, setFoundCellKeys] = useState(() => new Set())
  const [startCell, setStartCell] = useState(null)
  const [currentCell, setCurrentCell] = useState(null)
  const [isSelecting, setIsSelecting] = useState(false)
  const [wrongPath, setWrongPath] = useState(null)
  const [gameWon, setGameWon] = useState(alreadyComplete)
  const gridInnerRef = useRef(null)
  const [letterSize, setLetterSize] = useState(20)
  const isSelectingRef = useRef(false), startCellRef = useRef(null), currentCellRef = useRef(null)
  const foundWordsRef = useRef(foundWords), foundCellKeysRef = useRef(foundCellKeys)
  const onCompleteRef = useRef(onComplete), gameWonRef = useRef(gameWon)
  const palabrasRef = useRef(palabras), numPalabrasRef = useRef(numPalabras), gridRef = useRef(grid)
  const wrongTimerRef = useRef(null)

  useEffect(() => {
    const el = gridInnerRef.current; if (!el) return
    const obs = new ResizeObserver(([e]) => setLetterSize(Math.floor(e.contentRect.width / espacio * 0.8)))
    obs.observe(el); return () => obs.disconnect()
  }, [espacio])

  isSelectingRef.current = isSelecting; startCellRef.current = startCell; currentCellRef.current = currentCell
  foundWordsRef.current = foundWords; foundCellKeysRef.current = foundCellKeys
  onCompleteRef.current = onComplete; gameWonRef.current = gameWon
  palabrasRef.current = palabras; numPalabrasRef.current = numPalabras

  const selPath = startCell && currentCell ? linePath(startCell, currentCell) : null

  const commitSelection = useCallback(() => {
    if (!isSelectingRef.current) return
    const path = startCellRef.current && currentCellRef.current ? linePath(startCellRef.current, currentCellRef.current) : null
    setIsSelecting(false); isSelectingRef.current = false
    if (!path || path.length < 2) { setStartCell(null); setCurrentCell(null); return }
    const matched = matchWord(path, palabrasRef.current, gridRef.current)
    if (matched && !foundWordsRef.current.has(matched)) {
      const nw = new Set(foundWordsRef.current); nw.add(matched)
      const nk = new Set(foundCellKeysRef.current); path.forEach(p => nk.add(cellKey(p.r, p.c)))
      setFoundWords(nw); setFoundCellKeys(nk); foundWordsRef.current = nw; foundCellKeysRef.current = nk
      if (nw.size >= numPalabrasRef.current && !gameWonRef.current) { gameWonRef.current = true; setGameWon(true); onCompleteRef.current({ palabrasEncontradas: [...nw] }, true) }
    } else if (!matched) {
      setWrongPath(path.map(p => cellKey(p.r, p.c)))
      if (wrongTimerRef.current) clearTimeout(wrongTimerRef.current)
      wrongTimerRef.current = setTimeout(() => setWrongPath(null), 600)
    }
    setStartCell(null); setCurrentCell(null)
  }, [])

  useEffect(() => {
    const up = () => commitSelection()
    document.addEventListener('mouseup', up); document.addEventListener('touchend', up)
    return () => { document.removeEventListener('mouseup', up); document.removeEventListener('touchend', up); if (wrongTimerRef.current) clearTimeout(wrongTimerRef.current) }
  }, [commitSelection])

  function onCellMouseDown(r, c) { if (gameWonRef.current) return; setIsSelecting(true); setStartCell({ r, c }); setCurrentCell({ r, c }) }
  function onCellMouseEnter(r, c) { if (!isSelectingRef.current) return; setCurrentCell({ r, c }) }
  function onTouchStart(e, r, c) { if (gameWonRef.current) return; e.preventDefault(); setIsSelecting(true); setStartCell({ r, c }); setCurrentCell({ r, c }) }
  function onTouchMove(e) { e.preventDefault(); if (!isSelectingRef.current) return; const cell = cellFromPoint(e.touches[0].clientX, e.touches[0].clientY); if (cell) setCurrentCell(cell) }

  function cellColor(r, c) {
    const k = cellKey(r, c)
    if (wrongPath?.includes(k)) return { bg: '#FEE2E2', text: '#DC2626' }
    if (foundCellKeys.has(k)) return { bg: C.greenLight, text: C.green }
    if (selPath?.some(p => p.r === r && p.c === c)) return { bg: C.blueLight, text: C.blue }
    return { bg: '#fff', text: C.text }
  }

  return (
    <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: 'flex-start', gap: 14 }}>
      <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {gameWon && <div style={{ background: `linear-gradient(135deg, ${C.green}, #22C55E)`, color: '#fff', borderRadius: 12, padding: '10px 16px', fontSize: 14, fontWeight: 800, textAlign: 'center' }}>¡Felicidades! Encontraste todas las palabras 🎉</div>}
        <div style={{ background: '#fff', borderRadius: 16, padding: isMobile ? 8 : 12, border: `1px solid ${C.border}`, userSelect: 'none', WebkitUserSelect: 'none', width: 'min(380px, 100%)', boxSizing: 'border-box' }} onTouchMove={onTouchMove}>
          <div ref={gridInnerRef} style={{ display: 'grid', gridTemplateColumns: `repeat(${espacio}, 1fr)`, gap: isMobile ? 2 : 3, aspectRatio: '1/1' }}>
            {grid.flat().map((letter, i) => {
              const r = Math.floor(i / espacio), c = i % espacio, { bg, text: tc } = cellColor(r, c)
              return <div key={i} data-row={r} data-col={c} onMouseDown={() => onCellMouseDown(r, c)} onMouseEnter={() => onCellMouseEnter(r, c)} onTouchStart={e => onTouchStart(e, r, c)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: letterSize, fontWeight: 700, background: bg, color: tc, borderRadius: 4, cursor: 'default', transition: 'background 0.12s', border: `1px solid ${C.border}` }}>{letter}</div>
            })}
          </div>
        </div>
      </div>
      <div style={{ background: '#fff', borderRadius: 16, padding: '14px 12px', border: `1px solid ${C.border}`, width: isMobile ? '100%' : 155, flexShrink: 0 }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 10px' }}>Palabras</p>
        <div style={{ display: 'flex', flexDirection: isMobile ? 'row' : 'column', flexWrap: 'wrap', gap: 6 }}>
          {palabras.map(w => <span key={w} style={{ padding: '5px 10px', borderRadius: 8, fontSize: 12, fontWeight: 700, background: foundWords.has(w) ? C.greenLight : '#F3F4F6', color: foundWords.has(w) ? C.green : C.textMuted, textDecoration: foundWords.has(w) ? 'line-through' : 'none' }}>{foundWords.has(w) ? '✓ ' : ''}{w}</span>)}
        </div>
        <div style={{ marginTop: 10, fontSize: 11, color: C.textMuted, borderTop: `1px solid ${C.border}`, paddingTop: 8 }}>{foundWords.size} / {numPalabras} encontradas</div>
      </div>
    </div>
  )
}

// ── Selección múltiple ────────────────────────────────────────────────────────
function SeleccionMultiple({ pregunta, opciones, retroalimentacion, retroalimentacionError, onComplete, completada, maxIntentos = 2 }) {
  const [seleccionadas, setSeleccionadas] = useState(() => new Set())
  const [resultado, setResultado] = useState(null)
  const [intentos, setIntentos] = useState(0)
  const firedRef = useRef(false)
  const onCompleteRef = useRef(onComplete); onCompleteRef.current = onComplete

  const correctas = opciones.map((op, idx) => (op.esCorrecta ? idx : null)).filter(idx => idx !== null)
  const selIdxs = [...seleccionadas]
  const payload = {
    seleccionadas: selIdxs.map(idx => opciones[idx]?.texto || ''),
    correctas: correctas.map(idx => opciones[idx]?.texto || ''),
    opcionElegida: selIdxs.map(idx => opciones[idx]?.texto || '').join(' | '),
    seleccionadasIndices: selIdxs,
    respuestas: opciones.map((op, idx) => ({
      texto: op.texto,
      esCorrecta: !!op.esCorrecta,
      seleccionada: seleccionadas.has(idx),
      respondio: seleccionadas.has(idx),
    })),
  }
  const allOk = opciones.length > 0 && opciones.every((op, idx) => !!op.esCorrecta === seleccionadas.has(idx))
  const isLocked = resultado === 'correct' || resultado === 'agotado' || completada
  const restantes = maxIntentos - intentos

  function toggle(idx) {
    if (isLocked) return
    setSeleccionadas(prev => {
      const next = new Set(prev)
      next.has(idx) ? next.delete(idx) : next.add(idx)
      return next
    })
    if (resultado) setResultado(null)
  }

  function verificar() {
    if (isLocked || firedRef.current) return
    const ok = allOk
    setResultado(ok ? 'correct' : 'wrong')
    if (ok) {
      firedRef.current = true
      onCompleteRef.current(payload, true)
      return
    }
    const n = intentos + 1
    setIntentos(n)
    if (n >= maxIntentos) {
      setResultado('agotado')
      firedRef.current = true
      onCompleteRef.current(payload, false)
    }
  }

  function estadoOpcion(idx) {
    const sel = seleccionadas.has(idx)
    const correcta = !!opciones[idx]?.esCorrecta
    if (resultado === 'correct') return correcta ? 'ok' : null
    if (resultado === 'wrong' || resultado === 'agotado') {
      if (sel && correcta) return 'ok'
      if (sel && !correcta) return 'no'
      if (!sel && correcta) return 'missed'
    }
    return sel ? 'sel' : null
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {pregunta && <p style={{ fontSize: 18, fontWeight: 600, color: C.text, margin: 0, lineHeight: 1.5 }}>{pregunta}</p>}
      <p style={{ fontSize: 13, fontWeight: 700, color: C.textMuted, margin: 0 }}>Marca todas las opciones correctas y luego verifica.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {opciones.map((op, idx) => {
          const estado = estadoOpcion(idx)
          const ok = estado === 'ok'
          const bad = estado === 'no'
          const missed = estado === 'missed'
          const sel = estado === 'sel'
          const bg = ok ? C.greenLight : bad ? C.redLight : missed ? '#FFF7ED' : sel ? C.pinkLight : '#fff'
          const border = ok ? C.green : bad ? C.red : missed ? '#F59E0B' : sel ? C.pink : '#fce4f3'
          const badgeBg = ok ? C.green : bad ? C.red : missed ? '#F59E0B' : sel ? C.pink : '#fce4f3'
          const badgeColor = ok || bad || missed || sel ? '#fff' : C.pink
          return (
            <button
              key={idx}
              onClick={() => toggle(idx)}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 12,
                padding: '14px 16px',
                borderRadius: 14,
                border: `2px solid ${border}`,
                background: bg,
                cursor: isLocked ? 'default' : 'pointer',
                textAlign: 'left',
                fontFamily: 'Nunito',
                transition: 'all 0.15s',
                boxShadow: '0 2px 6px rgba(233,30,140,0.06)',
              }}
            >
              <span style={{
                width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                background: badgeBg, color: badgeColor,
                fontWeight: 800, fontSize: 14, display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                marginTop: 1,
              }}>
                {ok ? '✓' : bad ? '✗' : missed ? '!' : String.fromCharCode(65 + idx)}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                  <span style={{ width: 14, height: 14, borderRadius: 3, border: `2px solid ${border}`, background: sel || ok ? border : '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 10, fontWeight: 900, flexShrink: 0 }}>
                    {sel || ok ? '✓' : ''}
                  </span>
                  <span style={{ fontSize: 16, fontWeight: 600, color: ok ? C.green : bad ? C.red : missed ? '#B45309' : C.text, lineHeight: 1.45 }}>
                    {op.texto}
                  </span>
                </span>
              </span>
            </button>
          )
        })}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {!isLocked && <button onClick={verificar} style={btnP(C.pink)}>Verificar ✓</button>}
        {resultado === 'wrong' && !isLocked && <button onClick={() => setResultado(null)} style={btnS}>↺ Revisar</button>}
        <AttemptsLeft restantes={restantes} max={maxIntentos} locked={isLocked} />
      </div>
      {resultado === 'correct' && <FeedbackBox ok msg={retroalimentacion || '✅ Seleccionaste todas las respuestas correctas.'} />}
      {resultado === 'wrong' && <FeedbackBox ok={false} msg={retroalimentacionError || '❌ Revisa todas las opciones correctas antes de volver a verificar.'} />}
      {resultado === 'agotado' && <FeedbackBox ok={false} msg="Intentos agotados. La actividad quedó registrada." />}
    </div>
  )
}

// ── Verdadero / Falso ─────────────────────────────────────────────────────────
function VerdaderoFalso({ afirmaciones, onComplete, completada }) {
  const [respuestas, setRespuestas] = useState({})
  const onCompleteRef = useRef(onComplete); onCompleteRef.current = onComplete
  function responder(idx, valor) {
    if (respuestas[idx] !== undefined) return
    setRespuestas(prev => {
      const n = { ...prev, [idx]: valor }
      if (Object.keys(n).length === afirmaciones.length && !completada) {
        const data = afirmaciones.map((af, i) => ({ texto: af.texto, respondio: n[i], esVerdadero: af.esVerdadero, esCorrecta: n[i] === af.esVerdadero }))
        onCompleteRef.current({ respuestas: data }, data.every(d => d.esCorrecta))
      }
      return n
    })
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {afirmaciones.map((af, idx) => {
        const resp = respuestas[idx], correcto = resp !== undefined ? resp === af.esVerdadero : null
        return (
          <div key={idx} style={{ background: correcto === true ? C.greenLight : correcto === false ? C.redLight : '#fff', border: `2px solid ${correcto === true ? C.green : correcto === false ? C.red : '#fce4f3'}`, borderRadius: 14, padding: '18px 20px', boxShadow: '0 2px 6px rgba(233,30,140,0.06)' }}>
            <p style={{ fontSize: 17, fontWeight: 600, color: C.text, margin: '0 0 14px', lineHeight: 1.4 }}>{af.texto}</p>
            <div style={{ display: 'flex', gap: 10 }}>
              {[{ val: true, label: 'Verdadero', ac: C.green, ab: C.greenLight }, { val: false, label: 'Falso', ac: C.red, ab: C.redLight }].map(btn => {
                const s = resp === btn.val
                return <button key={String(btn.val)} onClick={() => responder(idx, btn.val)} disabled={resp !== undefined} style={{ padding: '10px 26px', borderRadius: 50, border: `2px solid ${s ? btn.ac : '#fce4f3'}`, background: s ? btn.ab : '#fff', color: s ? btn.ac : C.textMuted, fontFamily: 'Nunito', fontWeight: 800, fontSize: 16, cursor: resp !== undefined ? 'default' : 'pointer' }}>{btn.label}</button>
              })}
            </div>
            {resp !== undefined && <p style={{ margin: '10px 0 0', fontSize: 14, fontWeight: 700, color: correcto ? C.green : C.red }}>{correcto ? '✅ ¡Correcto!' : `❌ La respuesta era: ${af.esVerdadero ? 'Verdadero' : 'Falso'}`}</p>}
          </div>
        )
      })}
    </div>
  )
}

// ── Completar palabras ────────────────────────────────────────────────────────
function CompletarPalabras({ texto, respuestas, onComplete, completada, maxIntentos = 2 }) {
  const partes = texto.split(/\{\{[^}]*\}\}/)
  const [valores, setValores] = useState(() => Array(respuestas.length).fill(''))
  const [verificado, setVerificado] = useState(false)
  const [resultados, setResultados] = useState([])
  const [verificaciones, setVerificaciones] = useState(0)
  const [agotado, setAgotado] = useState(false)
  const firedRef = useRef(false)
  const onCompleteRef = useRef(onComplete); onCompleteRef.current = onComplete

  function verificar() {
    const r = respuestas.map((v, i) => norm(valores[i]) === norm(v))
    setResultados(r); setVerificado(true)
    if (r.every(Boolean)) {
      if (!firedRef.current) { firedRef.current = true; onCompleteRef.current({ respuestas: respuestas.map((correcta, i) => ({ correcta, dada: valores[i] })) }, true) }
    } else {
      const n = verificaciones + 1; setVerificaciones(n)
      if (n >= maxIntentos && !firedRef.current) {
        firedRef.current = true; setAgotado(true)
        onCompleteRef.current({ respuestas: respuestas.map((correcta, i) => ({ correcta, dada: valores[i] })) }, false)
      }
    }
  }
  function reiniciar() {
    if (agotado || completada) return
    setValores(Array(respuestas.length).fill('')); setVerificado(false); setResultados([])
  }
  const allOk = verificado && resultados.every(Boolean)
  const isLocked = allOk || agotado || completada
  const restantes = maxIntentos - verificaciones
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={{ fontSize: 15, lineHeight: 2.4, color: C.text, fontWeight: 600, margin: 0 }}>
        {partes.map((parte, i) => (
          <span key={i}>{parte}{i < respuestas.length && <input value={valores[i]} onChange={e => { const v = [...valores]; v[i] = e.target.value; setValores(v) }} disabled={isLocked} style={{ border: 'none', borderBottom: `2.5px solid ${!verificado ? C.pink : resultados[i] ? C.green : C.red}`, padding: '2px 6px', fontFamily: 'Nunito', fontSize: '0.95em', fontWeight: 700, color: !verificado ? C.purple : resultados[i] ? C.green : C.red, background: 'transparent', width: 110, outline: 'none', textAlign: 'center' }} />}</span>
        ))}
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {!isLocked && <button onClick={verificar} style={btnP(C.pink)}>Verificar ✓</button>}
        {verificado && !isLocked && <button onClick={reiniciar} style={btnS}>↺ Reiniciar</button>}
        <AttemptsLeft restantes={restantes} max={maxIntentos} locked={isLocked} />
      </div>
      {allOk && <FeedbackBox ok msg="✅ ¡Perfecto! Todas las respuestas son correctas." />}
      {verificado && !allOk && !agotado && <FeedbackBox ok={false} msg="❌ Algunas respuestas no son correctas. ¡Inténtalo de nuevo!" />}
      {agotado && <FeedbackBox ok={false} msg="Intentos agotados. La actividad quedó registrada." />}
    </div>
  )
}
function norm(s) { return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim() }

// ── Ordenar eventos ───────────────────────────────────────────────────────────
function OrdenarEventos({ instruccion, eventos, onComplete, completada, maxIntentos = 2 }) {
  const [items, setItems] = useState(() => [...eventos].sort(() => Math.random() - 0.5))
  const [verificado, setVerificado] = useState(false)
  const [correcto, setCorrecto] = useState(false)
  const [verificaciones, setVerificaciones] = useState(0)
  const [agotado, setAgotado] = useState(false)
  const firedRef = useRef(false)
  const onCompleteRef = useRef(onComplete); onCompleteRef.current = onComplete

  function mover(idx, dir) {
    if (correcto || agotado || completada) return
    const arr = [...items], t = idx + dir
    if (t < 0 || t >= arr.length) return
    ;[arr[idx], arr[t]] = [arr[t], arr[idx]]; setItems(arr); setVerificado(false)
  }
  function verificar() {
    const ok = items.every((it, i) => (it.orden ?? Number(it.id)) === i + 1)
    setVerificado(true); setCorrecto(ok)
    if (ok) {
      if (!firedRef.current) { firedRef.current = true; onCompleteRef.current({ orden: items.map(it => it.texto) }, true) }
    } else {
      const n = verificaciones + 1; setVerificaciones(n)
      if (n >= maxIntentos && !firedRef.current) {
        firedRef.current = true; setAgotado(true)
        onCompleteRef.current({ orden: items.map(it => it.texto) }, false)
      }
    }
  }
  function reiniciar() {
    if (agotado || completada) return
    setItems([...eventos].sort(() => Math.random() - 0.5)); setVerificado(false); setCorrecto(false)
  }
  const isLocked = correcto || agotado || completada
  const restantes = maxIntentos - verificaciones

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {instruccion && <p style={{ fontSize: 14, fontWeight: 600, color: C.textMuted, margin: 0 }}>{instruccion}</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map((item, idx) => (
          <div key={item.texto} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: isLocked ? C.greenLight : C.blueLight, border: `2px solid ${isLocked ? C.green : C.blue}`, borderRadius: 10, fontWeight: 600, fontSize: 14, transition: 'all 0.2s' }}>
            <div style={{ background: isLocked ? C.green : C.blue, color: '#fff', width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13, flexShrink: 0 }}>{idx + 1}</div>
            <span style={{ flex: 1, color: C.text }}>{item.texto}</span>
            {!isLocked && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flexShrink: 0 }}>
                <button onClick={() => mover(idx, -1)} disabled={idx === 0} style={arrBtn(idx === 0, C.blue)}>▲</button>
                <button onClick={() => mover(idx, 1)} disabled={idx === items.length - 1} style={arrBtn(idx === items.length - 1, C.blue)}>▼</button>
              </div>
            )}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {!isLocked && <button onClick={verificar} style={btnP(C.blue)}>Verificar orden ✓</button>}
        {verificado && !isLocked && <button onClick={reiniciar} style={btnS}>↺ Mezclar</button>}
        <AttemptsLeft restantes={restantes} max={maxIntentos} locked={isLocked} />
      </div>
      {correcto && <FeedbackBox ok msg="✅ ¡Orden correcto! Muy bien." />}
      {verificado && !correcto && !agotado && <FeedbackBox ok={false} msg="❌ El orden no es correcto. ¡Vuelve a intentarlo!" />}
      {agotado && <FeedbackBox ok={false} msg="Intentos agotados. La actividad quedó registrada." />}
    </div>
  )
}

// ── Escribir carta ────────────────────────────────────────────────────────────
function EscribirCarta({ actividadId, destinatario, promptTexto, onComplete, completada }) {
  const key = `carta_${actividadId}`
  const [texto, setTexto] = useState(() => localStorage.getItem(key) || '')
  const [guardado, setGuardado] = useState(false)
  const saveTimer = useRef(null), onCompleteRef = useRef(onComplete); onCompleteRef.current = onComplete
  function handleChange(e) { const v = e.target.value; setTexto(v); setGuardado(false); if (saveTimer.current) clearTimeout(saveTimer.current); saveTimer.current = setTimeout(() => { localStorage.setItem(key, v); setGuardado(true) }, 500) }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {destinatario && <div style={{ background: C.orangeLight, border: `1px solid #ffcc80`, borderRadius: 12, padding: '10px 14px' }}><span style={{ fontSize: 13, fontWeight: 700, color: C.orange }}>Para: </span><span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{destinatario}</span></div>}
      {promptTexto && <p style={{ fontSize: 14, fontWeight: 600, color: C.textMuted, margin: 0, fontStyle: 'italic' }}>{promptTexto}</p>}
      <textarea value={texto} onChange={handleChange} placeholder="Escribe aquí tu carta..." style={{ width: '100%', minHeight: 150, padding: 14, boxSizing: 'border-box', border: `2px solid ${C.pinkLight}`, borderRadius: 12, fontFamily: 'Nunito', fontSize: 14, color: C.text, resize: 'vertical', outline: 'none', background: '#fff', lineHeight: 1.7 }} onFocus={e => { e.target.style.borderColor = C.pink }} onBlur={e => { e.target.style.borderColor = C.pinkLight }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {!completada ? <button onClick={() => { localStorage.setItem(key, texto); if (!completada) onCompleteRef.current({ texto }, null) }} disabled={!texto.trim()} style={btnP(texto.trim() ? C.pink : C.border)}>✉️ Entregar carta</button>
          : <span style={{ background: C.greenLight, color: C.green, fontSize: 13, fontWeight: 700, padding: '6px 14px', borderRadius: 20 }}>✅ Carta entregada</span>}
        {guardado && <span style={{ fontSize: 12, color: C.textMuted }}>💾 Guardado</span>}
      </div>
    </div>
  )
}

// ── Completar mapa ────────────────────────────────────────────────────────────
function CompletarMapa({ actividadId, instruccion, nodos, onComplete, completada }) {
  const key = `mapa_${actividadId}`
  const [valores, setValores] = useState(() => { try { return JSON.parse(localStorage.getItem(key)) || {} } catch { return {} } })
  const onCompleteRef = useRef(onComplete); onCompleteRef.current = onComplete
  function handleChange(id, val) { const n = { ...valores, [id]: val }; setValores(n); localStorage.setItem(key, JSON.stringify(n)) }
  const todosLlenos = nodos.length > 0 && nodos.every(n => (valores[n.id] || '').trim())
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {instruccion && <p style={{ fontSize: 14, fontWeight: 600, color: C.textMuted, margin: 0 }}>{instruccion}</p>}
      {nodos.map(nodo => (
        <div key={nodo.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: 14, background: '#fff', border: `2px solid ${C.pinkLight}`, borderRadius: 14 }}>
          {nodo.icono && <span style={{ fontSize: 22, flexShrink: 0, marginTop: 4 }}>{nodo.icono}</span>}
          <div style={{ flex: 1 }}>
            <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 800, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 1 }}>{nodo.label}</p>
            <textarea value={valores[nodo.id] || ''} onChange={e => handleChange(nodo.id, e.target.value)} placeholder={nodo.placeholder || 'Escribe aquí...'} disabled={completada} style={{ width: '100%', minHeight: 60, padding: '8px 10px', boxSizing: 'border-box', border: `2px solid ${C.pinkLight}`, borderRadius: 8, fontFamily: 'Nunito', fontSize: 13, color: C.text, resize: 'vertical', outline: 'none', background: '#fff' }} onFocus={e => { e.target.style.borderColor = C.pink }} onBlur={e => { e.target.style.borderColor = C.pinkLight }} />
          </div>
        </div>
      ))}
      {!completada && <button onClick={() => { if (!completada) onCompleteRef.current({ valores }, null) }} disabled={!todosLlenos} style={{ ...btnP(todosLlenos ? C.green : C.border), alignSelf: 'flex-start' }}>✅ Listo</button>}
    </div>
  )
}

// ── Emparejar ─────────────────────────────────────────────────────────────────
function Emparejar({ pares, onComplete, completada, isMobile, maxIntentos = 2 }) {
  const [derechaShuffled] = useState(() => [...pares].sort(() => Math.random() - 0.5))
  const [selIzqIdx, setSelIzqIdx] = useState(null)
  const [matchedPairs, setMatchedPairs] = useState(() => new Set())
  const [wrongDerIdx, setWrongDerIdx] = useState(null)
  const [gameWon, setGameWon] = useState(completada)
  const [errores, setErrores] = useState(0)
  const wrongTimer = useRef(null)
  const firedRef = useRef(false)
  const onCompleteRef = useRef(onComplete); onCompleteRef.current = onComplete

  const derToPairIdx = derechaShuffled.map(rItem => pares.findIndex(p => p.derecha === rItem.derecha))

  function clickLeft(pairIdx) {
    if (matchedPairs.has(pairIdx) || gameWon) return
    setSelIzqIdx(prev => prev === pairIdx ? null : pairIdx)
  }

  function clickRight(shuffledIdx) {
    if (gameWon || selIzqIdx === null) return
    const targetPairIdx = derToPairIdx[shuffledIdx]
    if (matchedPairs.has(targetPairIdx)) return
    if (selIzqIdx === targetPairIdx) {
      const next = new Set(matchedPairs); next.add(targetPairIdx)
      setMatchedPairs(next); setSelIzqIdx(null)
      if (next.size === pares.length && !firedRef.current) {
        setGameWon(true); firedRef.current = true
        onCompleteRef.current({ parejas: pares.map(p => ({ izquierda: p.izquierda, derecha: p.derecha })) }, true)
      }
    } else {
      setWrongDerIdx(shuffledIdx)
      if (wrongTimer.current) clearTimeout(wrongTimer.current)
      wrongTimer.current = setTimeout(() => { setWrongDerIdx(null); setSelIzqIdx(null) }, 700)
      const n = errores + 1; setErrores(n)
      if (n >= maxIntentos && !firedRef.current) {
        firedRef.current = true; setGameWon(true)
        const matchedList = [...matchedPairs].map(i => ({ izquierda: pares[i].izquierda, derecha: pares[i].derecha }))
        onCompleteRef.current({ parejas: matchedList }, false)
      }
    }
  }

  const restantes = maxIntentos - errores
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {gameWon && <div style={{ background: `linear-gradient(135deg, ${C.green}, #22C55E)`, color: '#fff', borderRadius: 12, padding: '10px 16px', fontSize: 14, fontWeight: 800, textAlign: 'center' }}>¡Felicidades! Emparejaste todo correctamente 🎉</div>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: isMobile ? 8 : 14 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p style={{ fontSize: 11, fontWeight: 800, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, margin: '0 0 4px', textAlign: 'center' }}>Personaje</p>
          {pares.map((par, idx) => {
            const isMatched = matchedPairs.has(idx), isSel = selIzqIdx === idx
            return (
              <button key={idx} onClick={() => clickLeft(idx)} style={{
                padding: isMobile ? '10px 8px' : '12px 14px', borderRadius: 12,
                border: `2px solid ${isMatched ? C.green : isSel ? C.pink : C.border}`,
                background: isMatched ? C.greenLight : isSel ? C.pinkLight : '#fff',
                color: isMatched ? C.green : isSel ? C.pink : C.text,
                fontFamily: 'Nunito', fontWeight: 700, fontSize: isMobile ? 13 : 14,
                cursor: isMatched || gameWon ? 'default' : 'pointer',
                textAlign: 'center', transition: 'all 0.15s',
                transform: isSel ? 'scale(1.03)' : 'scale(1)',
              }}>
                {isMatched ? '✓ ' : ''}{par.izquierda}
              </button>
            )
          })}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p style={{ fontSize: 11, fontWeight: 800, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, margin: '0 0 4px', textAlign: 'center' }}>Descripción</p>
          {derechaShuffled.map((par, sIdx) => {
            const pairIdx = derToPairIdx[sIdx]
            const isMatched = matchedPairs.has(pairIdx)
            const isWrong = wrongDerIdx === sIdx
            const isClickable = selIzqIdx !== null && !isMatched
            return (
              <button key={sIdx} onClick={() => clickRight(sIdx)} style={{
                padding: isMobile ? '10px 8px' : '12px 14px', borderRadius: 12,
                border: `2px solid ${isMatched ? C.green : isWrong ? C.red : isClickable ? C.blue : C.border}`,
                background: isMatched ? C.greenLight : isWrong ? C.redLight : isClickable ? C.blueLight : '#fff',
                color: isMatched ? C.green : isWrong ? C.red : C.text,
                fontFamily: 'Nunito', fontWeight: 700, fontSize: isMobile ? 13 : 14,
                cursor: isMatched || gameWon ? 'default' : 'pointer',
                textAlign: 'center', transition: 'all 0.15s',
              }}>
                {isMatched ? '✓ ' : ''}{par.derecha}
              </button>
            )
          })}
        </div>
      </div>
      {selIzqIdx !== null && !gameWon && (
        <p style={{ fontSize: 13, color: C.textMuted, textAlign: 'center', fontStyle: 'italic', margin: 0 }}>
          Selecciona la descripción de <strong style={{ color: C.pink }}>{pares[selIzqIdx]?.izquierda}</strong>
        </p>
      )}
      {selIzqIdx === null && matchedPairs.size === 0 && !gameWon && (
        <p style={{ fontSize: 13, color: C.textMuted, textAlign: 'center', fontStyle: 'italic', margin: 0 }}>
          Empieza seleccionando un elemento de la izquierda
        </p>
      )}
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <AttemptsLeft restantes={restantes} max={maxIntentos} locked={gameWon} />
      </div>
    </div>
  )
}

// ── Dibujo Libre ──────────────────────────────────────────────────────────────
function DibujoLibre({ actividadId, instruccion, isMobile, onComplete, completada }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {instruccion && <p style={{ fontSize: 15, fontWeight: 600, color: C.textMuted, margin: 0 }}>{instruccion}</p>}
      <ColorearActividad actividadId={actividadId} isMobile={isMobile} onComplete={onComplete} alreadyComplete={completada} />
    </div>
  )
}

// ── Identificar ───────────────────────────────────────────────────────────────
const CARD_PAL = [
  { bg: C.pinkLight,   border: C.pinkMid,  text: '#c2185b' },
  { bg: C.orangeLight, border: '#ffcc80',  text: C.orange  },
  { bg: C.blueLight,   border: '#90caf9',  text: C.blue    },
  { bg: C.greenLight,  border: '#a5d6a7',  text: C.green   },
  { bg: C.purpleLight, border: '#ce93d8',  text: C.purple  },
  { bg: C.tealLight,   border: '#80cbc4',  text: C.teal    },
]
function IdentificarActividad({ instruccion, opciones, onComplete, completada, maxIntentos = 2 }) {
  const [sel, setSel] = useState(new Set())
  const [verificado, setVerificado] = useState(false)
  const [verificaciones, setVerificaciones] = useState(0)
  const [agotado, setAgotado] = useState(false)
  const firedRef = useRef(false)
  const onCompleteRef = useRef(onComplete); onCompleteRef.current = onComplete

  function toggle(idx) {
    if (verificado || agotado || completada) return
    setSel(prev => { const n = new Set(prev); n.has(idx) ? n.delete(idx) : n.add(idx); return n })
  }
  function verificar() {
    setVerificado(true)
    const todoBien = opciones.every((op, i) => op.esCorrecta === sel.has(i))
    if (todoBien) {
      if (!firedRef.current) { firedRef.current = true; onCompleteRef.current({ seleccionadas: [...sel].map(i => opciones[i]?.texto) }, true) }
    } else {
      const n = verificaciones + 1; setVerificaciones(n)
      if (n >= maxIntentos && !firedRef.current) {
        firedRef.current = true; setAgotado(true)
        onCompleteRef.current({ seleccionadas: [...sel].map(i => opciones[i]?.texto) }, false)
      }
    }
  }
  function reiniciar() {
    if (agotado || completada) return
    setSel(new Set()); setVerificado(false)
  }

  function getRes(idx) {
    if (!verificado) return null
    const s = sel.has(idx), ok = opciones[idx]?.esCorrecta
    if (ok && s)  return 'correct'
    if (!ok && s) return 'wrong'
    if (ok && !s) return 'missed'
    return null
  }
  const allOk = verificado && opciones.every((op, i) => op.esCorrecta === sel.has(i))
  const isLocked = allOk || agotado || completada
  const restantes = maxIntentos - verificaciones

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {instruccion && <p style={{ fontSize: 16, fontWeight: 600, color: C.text, margin: 0, lineHeight: 1.5 }}>{instruccion}</p>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
        {opciones.map((op, idx) => {
          const pal = CARD_PAL[idx % CARD_PAL.length]
          const res = getRes(idx)
          const isSelected = sel.has(idx)
          const borderCol = res === 'correct' ? C.green : res === 'wrong' ? C.red : res === 'missed' ? C.orange : isSelected ? C.pink : pal.border
          const bgCol = res === 'correct' ? C.greenLight : res === 'wrong' ? C.redLight : res === 'missed' ? C.orangeLight : pal.bg
          const textCol = res === 'correct' ? C.green : res === 'wrong' ? C.red : res === 'missed' ? C.orange : pal.text
          return (
            <button key={idx} onClick={() => toggle(idx)} style={{
              flex: '1 1 130px', maxWidth: 180, padding: 14,
              border: `${isSelected && !isLocked ? 3 : 2}px solid ${borderCol}`,
              background: bgCol, borderRadius: 10,
              cursor: isLocked ? 'default' : 'pointer',
              textAlign: 'center', fontFamily: 'Nunito', transition: 'all 0.2s',
              transform: isSelected && !isLocked ? 'translateY(-3px)' : 'none',
              boxShadow: isSelected && !isLocked ? `0 4px 12px ${C.pink}44` : 'none',
            }}>
              <span style={{ fontSize: '2rem', display: 'block', marginBottom: 6 }}>{op.icono}</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: textCol, lineHeight: 1.3 }}>{op.texto}</span>
              {res === 'correct' && <span style={{ display: 'block', fontSize: 11, marginTop: 4, color: C.green }}>✅ Correcto</span>}
              {res === 'wrong'   && <span style={{ display: 'block', fontSize: 11, marginTop: 4, color: C.red }}>❌ Incorrecto</span>}
              {res === 'missed'  && <span style={{ display: 'block', fontSize: 11, marginTop: 4, color: C.orange }}>← correcta</span>}
            </button>
          )
        })}
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        {!isLocked && (
          <button onClick={verificar} style={{ padding: '10px 24px', background: C.pink, color: '#fff', border: 'none', borderRadius: 50, fontFamily: 'Nunito', fontWeight: 800, fontSize: 15, cursor: 'pointer' }}>
            Verificar ✓
          </button>
        )}
        {verificado && !isLocked && (
          <button onClick={reiniciar} style={{ padding: '10px 24px', background: 'transparent', color: C.pink, border: `2px solid ${C.pink}`, borderRadius: 50, fontFamily: 'Nunito', fontWeight: 800, fontSize: 15, cursor: 'pointer' }}>
            ↺ Reiniciar
          </button>
        )}
        <AttemptsLeft restantes={restantes} max={maxIntentos} locked={isLocked} />
      </div>
      {allOk && <FeedbackBox ok msg="¡Muy bien! Identificaste todas las correctas." />}
      {verificado && !allOk && !agotado && <FeedbackBox ok={false} msg="Algunas respuestas no son correctas. Revisa las marcadas." />}
      {agotado && <FeedbackBox ok={false} msg="Intentos agotados. La actividad quedó registrada." />}
    </div>
  )
}

// ── Termómetro emocional ──────────────────────────────────────────────────────
function TermometroEmocional({ actividadId, instruccion, label, emoji, estados, escalas, min = 0, max = 100, minLabel = 'Muy poco', maxLabel = 'Mucho', onComplete, completada }) {
  const escalaLegacy = escalas?.[0] || {}
  const titulo = label || escalaLegacy.label || '¿Cómo se siente el personaje?'
  const icono = emoji || escalaLegacy.emoji || '🌡️'
  const safeMin = Number.isFinite(Number(min)) ? Number(min) : 0
  const safeMax = Number.isFinite(Number(max)) && Number(max) > safeMin ? Number(max) : 100
  const middle = Math.round((safeMin + safeMax) / 2)
  const key = `termometro_${actividadId}`
  const estadosOrdenados = (estados?.length ? estados : [
    { id: '1', desde: safeMin, emoji: '😌', texto: 'Casi nada' },
    { id: '2', desde: Math.round(safeMin + (safeMax - safeMin) * 0.25), emoji: '😐', texto: 'Un poco' },
    { id: '3', desde: Math.round(safeMin + (safeMax - safeMin) * 0.5), emoji: '😰', texto: 'Bastante' },
    { id: '4', desde: Math.round(safeMin + (safeMax - safeMin) * 0.75), emoji: '😨', texto: 'Mucho' },
  ]).slice().sort((a, b) => Number(a.desde ?? safeMin) - Number(b.desde ?? safeMin))
  const [valor, setValorState] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(key))
      if (typeof saved === 'number') return saved
      if (saved && typeof saved === 'object') {
        const first = Object.values(saved).find(v => Number.isFinite(Number(v)))
        if (first !== undefined) return Number(first)
      }
    } catch {}
    return middle
  })
  const [entregado, setEntregado] = useState(completada)
  const onCompleteRef = useRef(onComplete); onCompleteRef.current = onComplete

  function estadoActual(value) {
    return estadosOrdenados.reduce((actual, estado) => {
      const desde = Number(estado.desde ?? safeMin)
      return Number(value) >= desde ? estado : actual
    }, estadosOrdenados[0] || null)
  }

  function setValor(value) {
    if (entregado || completada) return
    const next = Number(value)
    setValorState(next)
    localStorage.setItem(key, JSON.stringify(next))
  }

  function entregar() {
    const estado = estadoActual(valor)
    const respuesta = {
      id: '1',
      label: titulo,
      emoji: icono,
      valor: Number(valor ?? middle),
      min: safeMin,
      max: safeMax,
      minLabel: escalaLegacy.minLabel || minLabel,
      maxLabel: escalaLegacy.maxLabel || maxLabel,
      estado: estado ? { emoji: estado.emoji || '', texto: estado.texto || '', desde: Number(estado.desde ?? safeMin) } : null,
    }
    localStorage.setItem(key, JSON.stringify(respuesta.valor))
    setEntregado(true)
    onCompleteRef.current({ ...respuesta, respuestas: [respuesta] }, null)
  }

  const percent = ((Number(valor ?? middle) - safeMin) / (safeMax - safeMin)) * 100
  const estado = estadoActual(valor)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {instruccion && <p style={{ fontSize: 16, fontWeight: 600, color: C.text, margin: 0, lineHeight: 1.5 }}>{instruccion}</p>}
      <div style={{ background: '#fff', border: `2px solid ${C.orangeLight}`, borderRadius: 14, padding: 18, boxShadow: '0 2px 6px rgba(230,81,0,0.06)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, width: '100%', maxWidth: 430 }}>
          <span style={{ width: 38, height: 38, borderRadius: '50%', background: C.orangeLight, color: C.orange, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>{icono}</span>
          <span style={{ background: C.orange, color: '#fff', borderRadius: 20, padding: '5px 12px', fontSize: 14, fontWeight: 800, minWidth: 34, textAlign: 'center' }}>{valor}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', maxWidth: 430, fontSize: 24, lineHeight: 1 }}>
          {estadosOrdenados.map((item, idx) => <span key={item.id || idx}>{item.emoji || '🙂'}</span>)}
        </div>
        <div style={{ position: 'relative', width: '100%', maxWidth: 430, padding: '2px 0 6px' }}>
          <div style={{ height: 28, borderRadius: 20, background: '#E2E8F0', border: '3px solid #CBD5E1', overflow: 'hidden' }}>
            <div style={{ width: `${Math.max(0, Math.min(100, percent))}%`, height: '100%', borderRadius: 20, transition: 'width .35s ease', background: `linear-gradient(90deg, ${C.green}, #facc15, ${C.orange}, ${C.red})` }} />
          </div>
          <input
            type="range"
            min={safeMin}
            max={safeMax}
            step="1"
            value={valor}
            disabled={entregado || completada}
            onChange={e => setValor(e.target.value)}
            style={{ width: '100%', marginTop: 10, accentColor: C.orange, cursor: entregado || completada ? 'default' : 'pointer' }}
            aria-label={titulo}
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, width: '100%', maxWidth: 430 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: C.green }}>{escalaLegacy.minLabel || minLabel}</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: C.red, textAlign: 'right' }}>{escalaLegacy.maxLabel || maxLabel}</span>
        </div>
        <div style={{ minHeight: 32, fontSize: 20, fontWeight: 800, color: C.orange, textAlign: 'center' }}>
          {estado ? `${estado.emoji || ''} ${estado.texto || ''}` : ''}
        </div>
      </div>
      {!entregado && !completada ? (
        <button onClick={entregar} style={{ ...btnP(C.orange), alignSelf: 'flex-start' }}>Guardar respuesta</button>
      ) : (
        <FeedbackBox ok msg="Respuesta guardada." />
      )}
    </div>
  )
}

// ── Shared UI helpers ─────────────────────────────────────────────────────────
function btnP(bg) { return { padding: '10px 22px', background: bg, color: '#fff', border: 'none', borderRadius: 50, cursor: bg === C.border ? 'default' : 'pointer', fontFamily: 'Nunito', fontWeight: 800, fontSize: 14 } }
const btnS = { padding: '10px 22px', background: '#fff', color: C.textMuted, border: `2px solid ${C.border}`, borderRadius: 50, cursor: 'pointer', fontFamily: 'Nunito', fontWeight: 700, fontSize: 13 }
function arrBtn(disabled, col) { return { width: 22, height: 22, borderRadius: 4, border: 'none', background: disabled ? '#e0e0e0' : col, color: disabled ? '#aaa' : '#fff', cursor: disabled ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, padding: 0 } }
function FeedbackBox({ ok, msg }) { return <div style={{ background: ok ? C.greenLight : C.redLight, border: `1px solid ${ok ? C.green : C.red}`, borderRadius: 12, padding: '10px 14px', fontSize: 14, fontWeight: 600, color: ok ? '#1a6b1a' : '#a00' }}>{msg}</div> }
function AttemptsLeft({ restantes, max, locked }) {
  if (locked || max <= 1) return null
  const danger = restantes <= 1
  return <span style={{ fontSize: 12, fontWeight: 700, color: danger ? C.red : '#D97706', background: danger ? C.redLight : '#FEF3C7', borderRadius: 20, padding: '3px 10px', whiteSpace: 'nowrap' }}>🔄 {restantes} intento{restantes !== 1 ? 's' : ''} restante{restantes !== 1 ? 's' : ''}</span>
}
function MissingField({ campo }) { return <div style={{ color: C.red, fontSize: 13, background: C.redLight, padding: '8px 12px', borderRadius: 8 }}>Campo faltante: <code>{campo}</code></div> }
