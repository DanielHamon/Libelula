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
  clasificacionCategorias:{ icon: '🧩', label: 'Clasificar',     color: C.teal,   bg: C.tealLight   },
  separarSilabas:    { icon: '🔡', label: 'Sílabas',            color: C.purple, bg: C.purpleLight },
  acrostico:          { icon: '✨', label: 'Acróstico',          color: C.orange, bg: C.orangeLight },
  crucigrama:         { icon: '▦', label: 'Crucigrama',         color: C.blue,   bg: C.blueLight   },
  respiracionGuiada:  { icon: '🌬️', label: 'Respiración',       color: C.blue,   bg: C.blueLight   },
  miniJuegoConteo:    { icon: '🎈', label: 'Mini-juego',         color: C.pink,   bg: C.pinkLight   },
  exploracionInteractiva:{ icon: '🔎', label: 'Explorar',        color: C.teal,   bg: C.tealLight   },
  selectorEmocionColor:{ icon: '🎨', label: 'Emoción y color',   color: C.purple, bg: C.purpleLight },
  mezclaPinturaGuiada:{ icon: '🖌️', label: 'Mezcla de colores', color: C.pink,   bg: C.pinkLight   },
  tarjetasVolteables:{ icon: '🃏', label: 'Voltea y descubre', color: C.purple, bg: C.purpleLight },
  sopaLetras:        { icon: '🔤', label: 'Sopa de letras',     color: C.green,  bg: C.greenLight  },
  seleccionMultiple: { icon: '🎯', label: 'Selección múltiple', color: C.pink,   bg: C.pinkLight   },
  verdaderoFalso:    { icon: '⚖️', label: 'Verdadero / Falso',  color: C.teal,   bg: C.tealLight   },
  completarPalabras: { icon: '✏️', label: 'Completar',          color: C.purple, bg: C.purpleLight  },
  ordenarEventos:    { icon: '🔢', label: 'Ordenar',            color: C.blue,   bg: C.blueLight   },
  ordenarPalabras:   { icon: '🔤', label: 'Ordenar palabras',   color: C.teal,   bg: C.tealLight   },
  escribirCarta:     { icon: '✉️', label: 'Escribir',           color: C.orange, bg: C.orangeLight  },
  completarMapa:     { icon: '🗺️', label: 'Mapa',               color: C.green,  bg: C.greenLight  },
  emparejar:         { icon: '🔗', label: 'Emparejar',          color: C.blue,   bg: C.blueLight   },
  dibujoLibre:       { icon: '✏️', label: 'Dibujo libre',       color: C.pink,   bg: C.pinkLight   },
  identificar:       { icon: '🔍', label: 'Identificar',        color: C.orange, bg: C.orangeLight },
  reflexionPersonal: { icon: '💭', label: 'Reflexión personal', color: C.purple, bg: C.purpleLight },
  lineaTiempoEmocional:{ icon: '💞', label: 'Emociones',        color: C.purple, bg: C.purpleLight },
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
export function ActivityCard({ act, numero, isMobile, completada, onComplete, snapMode = true, primaryColor }) {
  const typeCfg = TIPO_CONFIG[act.tipo] || { icon: '📄', label: act.tipo || 'Actividad', color: C.textMuted, bg: '#F3F4F6' }
  const primary = primaryColor || typeCfg.color
  const primaryLight = primaryColor ? `${primaryColor}18` : typeCfg.bg
  const cfg = { ...typeCfg, color: primary, bg: primaryLight }
  const cardStyle = snapMode ? {
    scrollSnapAlign: 'start',
    minHeight: '100%',
    padding: isMobile ? '28px 20px 44px' : '48px 56px 56px',
    borderBottom: `2px solid ${C.border}`,
    background: C.bg,
  } : {
    background: '#fff',
    border: `2px solid ${primaryLight}`,
    borderRadius: 18,
    boxShadow: `0 4px 24px ${primary}18`,
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
          <div style={{ fontSize: isMobile ? 18 : 23, fontWeight: 800, color: primary, lineHeight: 1.3 }}>
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
        <ActivityContent act={act} isMobile={isMobile} completada={completada} onComplete={onComplete} primaryColor={primary} />
      </div>
    </div>
  )
}

// ── Dispatcher ────────────────────────────────────────────────────────────────
function ActivityContent({ act, isMobile, completada, onComplete, primaryColor }) {
  const p = { key: act.id, isMobile, completada, onComplete, primaryColor }
  const maxIntentos = act.maxIntentos ?? 2
  switch (act.tipo) {
    case 'video':             return <VideoActividad url={act.url} titulo={act.videoTitulo} />
    case 'audio':             return <AudioActividad url={act.url} titulo={act.titulo} />
    case 'imagen':            return <ImagenActividad imagenUrl={act.imagenUrl} descripcion={act.descripcion} />
    case 'colorear':          return <ColorearActividad {...p} imagenUrl={act.imagenUrl} actividadId={act.id} alreadyComplete={completada} />
    case 'termometroEmocional': return <TermometroEmocional {...p} actividadId={act.id} instruccion={act.instruccion} label={act.label} emoji={act.emoji} estados={act.estados ?? []} escalas={act.escalas ?? []} min={act.min} max={act.max} minLabel={act.minLabel} maxLabel={act.maxLabel} />
    case 'clasificacionCategorias': return <ClasificacionCategorias {...p} instruccion={act.instruccion} categorias={act.categorias ?? []} items={act.items ?? act.elementos ?? []} maxIntentos={maxIntentos} />
    case 'separarSilabas':    return <SepararSilabas {...p} instruccion={act.instruccion} pista={act.pista} palabras={act.palabras ?? []} maxIntentos={maxIntentos} />
    case 'acrostico':          return <Acrostico {...p} actividadId={act.id} palabra={act.palabra} letras={act.letras} lineas={act.lineas ?? []} instruccion={act.instruccion} pista={act.pista} banco={act.banco ?? []} maxIntentos={maxIntentos} />
    case 'crucigrama':         return <Crucigrama {...p} actividadId={act.id} instruccion={act.instruccion} pista={act.pista} palabras={act.palabras ?? act.words ?? []} filas={act.filas ?? act.rows} columnas={act.columnas ?? act.cols} pistas={act.pistas ?? act.clues} />
    case 'respiracionGuiada':  return <RespiracionGuiada {...p} actividadId={act.id} instruccion={act.instruccion} mensajeFinal={act.mensajeFinal} ciclos={act.ciclos} duracionInhala={act.duracionInhala} duracionExhala={act.duracionExhala} textoInicio={act.textoInicio} textoInhala={act.textoInhala} textoExhala={act.textoExhala} />
    case 'miniJuegoConteo':    return <MiniJuegoConteo {...p} actividadId={act.id} instruccion={act.instruccion} emoji={act.emoji} cantidad={act.cantidad} tiempoLimite={act.tiempoLimite} textoContador={act.textoContador} mensajeFinal={act.mensajeFinal} mensajeTiempo={act.mensajeTiempo} />
    case 'exploracionInteractiva': return <ExploracionInteractiva {...p} actividadId={act.id} instruccion={act.instruccion} escenaInicial={act.escenaInicial} textoInicial={act.textoInicial} opciones={act.opciones ?? []} mensajeFinal={act.mensajeFinal} preguntaAbierta={act.preguntaAbierta} placeholder={act.placeholder} />
    case 'selectorEmocionColor': return <SelectorEmocionColor {...p} actividadId={act.id} instruccion={act.instruccion} opciones={act.opciones ?? []} retroalimentacion={act.retroalimentacion} retroalimentacionError={act.retroalimentacionError} maxIntentos={maxIntentos} />
    case 'mezclaPinturaGuiada': return <MezclaPinturaGuiada {...p} actividadId={act.id} instruccion={act.instruccion} colores={act.colores ?? []} mezclas={act.mezclas ?? []} numMezclas={act.numMezclas} mensajeFinal={act.mensajeFinal} pregunta={act.pregunta} placeholder={act.placeholder} />
    case 'tarjetasVolteables': return <TarjetasVolteables {...p} instruccion={act.instruccion} tarjetas={act.tarjetas ?? []} textoFrente={act.textoFrente} mensajeFinal={act.mensajeFinal} />
    case 'sopaLetras':        return <SopaLetras {...p} palabras={act.palabras ?? []} numPalabras={act.numPalabras ?? act.palabras?.length ?? 0} espacio={Math.min(Math.max(act.espacio ?? 8, 5), 12)} alreadyComplete={completada} />
    case 'seleccionMultiple': return <SeleccionMultiple {...p} pregunta={act.pregunta} opciones={act.opciones ?? []} pista={act.pista} estilo={act.estilo} retroalimentacion={act.retroalimentacion} retroalimentacionError={act.retroalimentacionError} maxIntentos={maxIntentos} />
    case 'verdaderoFalso':    return <VerdaderoFalso {...p} afirmaciones={act.afirmaciones ?? []} />
    case 'completarPalabras': return <CompletarPalabras {...p} texto={act.texto ?? ''} respuestas={act.respuestas ?? []} maxIntentos={maxIntentos} />
    case 'ordenarEventos':    return <OrdenarEventos {...p} instruccion={act.instruccion} eventos={act.eventos ?? []} maxIntentos={maxIntentos} />
    case 'ordenarPalabras':   return <OrdenarPalabras {...p} instruccion={act.instruccion} pista={act.pista} fraseCorrecta={act.fraseCorrecta} palabras={act.palabras ?? []} textoArea={act.textoArea} maxIntentos={maxIntentos} />
    case 'escribirCarta':     return <EscribirCarta {...p} actividadId={act.id} destinatario={act.destinatario} promptTexto={act.promptTexto} placeholder={act.placeholder} />
    case 'completarMapa':     return <CompletarMapa {...p} actividadId={act.id} instruccion={act.instruccion} nodos={act.nodos ?? []} />
    case 'emparejar':         return <Emparejar {...p} pares={act.pares ?? []} instruccion={act.instruccion} encabezadoIzquierda={act.encabezadoIzquierda} encabezadoDerecha={act.encabezadoDerecha} maxIntentos={maxIntentos} />
    case 'dibujoLibre':       return <DibujoLibre {...p} actividadId={act.id} instruccion={act.instruccion} />
    case 'identificar':       return <IdentificarActividad {...p} instruccion={act.instruccion} opciones={act.opciones ?? []} maxIntentos={maxIntentos} />
    case 'reflexionPersonal': return <ReflexionPersonal {...p} actividadId={act.id} instruccion={act.instruccion} opciones={act.opciones ?? []} preguntaAbierta={act.preguntaAbierta} placeholder={act.placeholder} textoBoton={act.textoBoton} />
    case 'lineaTiempoEmocional': return <LineaTiempoEmocional {...p} instruccion={act.instruccion} pista={act.pista} momentos={act.momentos ?? []} retroalimentacion={act.retroalimentacion} retroalimentacionError={act.retroalimentacionError} maxIntentos={maxIntentos} />
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

// ── Clasificación por categorías ──────────────────────────────────────────────
function ClasificacionCategorias({ instruccion, categorias, items, isMobile, onComplete, completada, maxIntentos = 2 }) {
  const normalizedCategories = categorias.map((cat, idx) => ({
    id: String(cat.id ?? cat.key ?? norm(cat.label || cat.nombre || `categoria-${idx + 1}`)),
    label: cat.label || cat.nombre || `Categoría ${idx + 1}`,
    descripcion: cat.descripcion || '',
  }))
  const fallbackCat = normalizedCategories[0]?.id || ''
  const normalizedItems = items.map((item, idx) => ({
    id: String(item.id ?? `item-${idx + 1}`),
    texto: item.texto || item.label || item.nombre || '',
    categoriaId: String(item.categoriaId ?? item.categoria ?? item.respuesta ?? fallbackCat),
  })).filter(item => item.texto)

  const [placements, setPlacements] = useState({})
  const [selectedItem, setSelectedItem] = useState(null)
  const [verificado, setVerificado] = useState(false)
  const [verificaciones, setVerificaciones] = useState(0)
  const [agotado, setAgotado] = useState(false)
  const [dropTarget, setDropTarget] = useState(null)
  const firedRef = useRef(false)

  const itemById = new Map(normalizedItems.map(item => [item.id, item]))
  const allPlaced = normalizedItems.length > 0 && normalizedItems.every(item => placements[item.id])
  const allOk = allPlaced && normalizedItems.every(item => placements[item.id] === item.categoriaId)
  const isLocked = completada || agotado || (verificado && allOk)
  const restantes = maxIntentos - verificaciones

  function place(itemId, categoryId) {
    if (isLocked || !itemById.has(itemId)) return
    setPlacements(prev => ({ ...prev, [itemId]: categoryId }))
    setSelectedItem(null)
    setVerificado(false)
  }

  function remove(itemId) {
    if (isLocked) return
    setPlacements(prev => {
      const next = { ...prev }
      delete next[itemId]
      return next
    })
    setVerificado(false)
  }

  function buildPayload() {
    return {
      clasificaciones: normalizedItems.map(item => {
        const elegida = placements[item.id] || null
        const categoriaElegida = normalizedCategories.find(cat => cat.id === elegida)
        const categoriaCorrecta = normalizedCategories.find(cat => cat.id === item.categoriaId)
        return {
          id: item.id,
          texto: item.texto,
          categoriaElegidaId: elegida,
          categoriaElegida: categoriaElegida?.label || '',
          categoriaCorrectaId: item.categoriaId,
          categoriaCorrecta: categoriaCorrecta?.label || '',
          esCorrecta: elegida === item.categoriaId,
        }
      }),
    }
  }

  function verificar() {
    if (isLocked || !allPlaced || firedRef.current) return
    setVerificado(true)
    if (allOk) {
      firedRef.current = true
      onComplete(buildPayload(), true)
      return
    }
    const n = verificaciones + 1
    setVerificaciones(n)
    if (n >= maxIntentos) {
      firedRef.current = true
      setAgotado(true)
      onComplete(buildPayload(), false)
    }
  }

  function reiniciar() {
    if (isLocked) return
    setPlacements({})
    setSelectedItem(null)
    setVerificado(false)
  }

  function statusFor(item) {
    if (!verificado && !agotado) return null
    const chosen = placements[item.id]
    if (!chosen) return null
    return chosen === item.categoriaId ? 'ok' : 'no'
  }

  const placedIds = new Set(Object.keys(placements))
  const unplacedItems = normalizedItems.filter(item => !placedIds.has(item.id))

  if (normalizedCategories.length < 2 || normalizedItems.length === 0) {
    return <MissingField campo="categorias/items" />
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {instruccion && <p style={{ fontSize: 15, fontWeight: 600, color: C.text, lineHeight: 1.5, margin: 0 }}>{instruccion}</p>}

      <div style={{ background: '#fff', border: `2px solid ${C.tealLight}`, borderRadius: 14, padding: 14 }}>
        <p style={{ fontSize: 12, fontWeight: 800, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 10px' }}>
          Elementos por clasificar
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', minHeight: 42 }}>
          {unplacedItems.length === 0 && <span style={{ fontSize: 13, color: C.textMuted, fontStyle: 'italic' }}>Todos los elementos están ubicados.</span>}
          {unplacedItems.map(item => {
            const selected = selectedItem === item.id
            return (
              <button
                key={item.id}
                type="button"
                draggable={!isLocked}
                onDragStart={e => e.dataTransfer.setData('text/plain', item.id)}
                onClick={() => !isLocked && setSelectedItem(prev => prev === item.id ? null : item.id)}
                style={{
                  padding: '8px 12px',
                  borderRadius: 20,
                  border: `2px solid ${selected ? C.teal : '#B2DFDB'}`,
                  background: selected ? C.tealLight : '#fff',
                  color: selected ? C.teal : C.text,
                  fontFamily: 'Nunito',
                  fontSize: 13,
                  fontWeight: 800,
                  cursor: isLocked ? 'default' : 'grab',
                  boxShadow: selected ? `0 3px 10px ${C.teal}33` : 'none',
                }}
              >
                {item.texto}
              </button>
            )
          })}
        </div>
        {selectedItem && <p style={{ fontSize: 12, color: C.teal, fontWeight: 700, margin: '10px 0 0' }}>Ahora toca una categoría para ubicar el elemento.</p>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : `repeat(${Math.min(normalizedCategories.length, 3)}, minmax(0, 1fr))`, gap: 12 }}>
        {normalizedCategories.map((cat, idx) => {
          const color = [C.teal, C.blue, C.purple, C.orange, C.green, C.pink][idx % 6]
          const placed = normalizedItems.filter(item => placements[item.id] === cat.id)
          return (
            <div
              key={cat.id}
              onDragOver={e => { if (!isLocked) e.preventDefault() }}
              onDrop={e => {
                e.preventDefault()
                place(e.dataTransfer.getData('text/plain'), cat.id)
              }}
              onClick={() => selectedItem && place(selectedItem, cat.id)}
              style={{
                minHeight: 128,
                border: `2px dashed ${color}88`,
                background: '#fff',
                borderRadius: 14,
                padding: 12,
                cursor: selectedItem && !isLocked ? 'pointer' : 'default',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 900, color, lineHeight: 1.25 }}>{cat.label}</div>
                  {cat.descripcion && <div style={{ fontSize: 11, color: C.textMuted, fontWeight: 600, marginTop: 2 }}>{cat.descripcion}</div>}
                </div>
                <span style={{ background: `${color}18`, color, borderRadius: 20, padding: '3px 8px', fontSize: 11, fontWeight: 800 }}>{placed.length}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {placed.map(item => {
                  const st = statusFor(item)
                  const border = st === 'ok' ? C.green : st === 'no' ? C.red : color
                  const bg = st === 'ok' ? C.greenLight : st === 'no' ? C.redLight : `${color}12`
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={e => { e.stopPropagation(); remove(item.id) }}
                      title="Quitar de esta categoría"
                      aria-label={`Quitar ${item.texto} de ${cat.label}`}
                      disabled={isLocked}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '8px 10px',
                        border: `2px solid ${border}`,
                        background: bg,
                        color: st === 'ok' ? C.green : st === 'no' ? C.red : C.text,
                        borderRadius: 10,
                        fontFamily: 'Nunito',
                        fontSize: 13,
                        fontWeight: 800,
                        cursor: isLocked ? 'default' : 'pointer',
                        textAlign: 'left',
                      }}
                    >
                      <span style={{ fontSize: 13, lineHeight: 1, flexShrink: 0 }}>{st === 'ok' ? '✓' : st === 'no' ? '✗' : '×'}</span>
                      <span>{item.texto}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {!isLocked && <button onClick={verificar} disabled={!allPlaced} style={btnP(allPlaced ? C.teal : C.border)}>Comprobar</button>}
        {!isLocked && Object.keys(placements).length > 0 && <button onClick={reiniciar} style={btnS}>↺ Reiniciar</button>}
        <AttemptsLeft restantes={restantes} max={maxIntentos} locked={isLocked} />
      </div>

      {verificado && allOk && <FeedbackBox ok msg="✅ Clasificaste todos los elementos correctamente." />}
      {verificado && !allOk && !agotado && <FeedbackBox ok={false} msg="❌ Algunas clasificaciones no corresponden. Revisa las marcadas." />}
      {agotado && <FeedbackBox ok={false} msg="Intentos agotados. La actividad quedó registrada." />}
    </div>
  )
}

// ── Separar en sílabas ────────────────────────────────────────────────────────
function SepararSilabas({ instruccion, pista, palabras, isMobile, onComplete, completada, maxIntentos = 2 }) {
  const rows = palabras.map((item, idx) => {
    const palabra = item.palabra || item.texto || item.word || ''
    const silabas = item.silabas || item.respuesta || item.correcta || ''
    const cantidad = item.cantidad ?? item.numSilabas ?? item.numero ?? String(silabas).split('-').filter(Boolean).length
    return {
      id: String(item.id ?? `palabra-${idx + 1}`),
      palabra,
      silabas: String(silabas),
      cantidad: String(cantidad || ''),
    }
  }).filter(item => item.palabra && item.silabas && item.cantidad)

  const [respuestas, setRespuestas] = useState({})
  const [verificado, setVerificado] = useState(false)
  const [intentos, setIntentos] = useState(0)
  const [agotado, setAgotado] = useState(false)
  const [showPista, setShowPista] = useState(false)
  const firedRef = useRef(false)

  const resultados = rows.map(row => {
    const dada = respuestas[row.id] || {}
    const silabasOk = normalizeSilabas(dada.silabas) === normalizeSilabas(row.silabas)
    const cantidadOk = String(dada.cantidad || '').trim() === row.cantidad
    return { ...row, dadaSilabas: dada.silabas || '', dadaCantidad: dada.cantidad || '', silabasOk, cantidadOk, esCorrecta: silabasOk && cantidadOk }
  })
  const allOk = rows.length > 0 && resultados.every(r => r.esCorrecta)
  const isLocked = completada || agotado || (verificado && allOk)
  const restantes = maxIntentos - intentos

  function update(id, key, value) {
    if (isLocked) return
    setRespuestas(prev => ({ ...prev, [id]: { ...prev[id], [key]: value } }))
    setVerificado(false)
  }

  function buildPayload() {
    return {
      respuestas: resultados.map(r => ({
        palabra: r.palabra,
        silabasDadas: r.dadaSilabas,
        cantidadDada: r.dadaCantidad,
        silabasCorrectas: r.silabas,
        cantidadCorrecta: r.cantidad,
        silabasOk: r.silabasOk,
        cantidadOk: r.cantidadOk,
        esCorrecta: r.esCorrecta,
      })),
    }
  }

  function verificar() {
    if (isLocked || firedRef.current) return
    setVerificado(true)
    if (allOk) {
      firedRef.current = true
      onComplete(buildPayload(), true)
      return
    }
    const next = intentos + 1
    setIntentos(next)
    if (next >= maxIntentos) {
      firedRef.current = true
      setAgotado(true)
      onComplete(buildPayload(), false)
    }
  }

  function reiniciar() {
    if (isLocked) return
    setRespuestas({})
    setVerificado(false)
  }

  if (rows.length === 0) return <MissingField campo="palabras" />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {pista && (
        <div style={{ background: '#FFFDEB', border: '2px solid #FDE047', color: '#92400E', borderRadius: 10, overflow: 'hidden' }}>
          <button
            type="button"
            onClick={() => setShowPista(prev => !prev)}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: 'transparent', border: 'none', padding: '10px 14px', color: '#92400E', fontFamily: 'Nunito', fontSize: 13, fontWeight: 900, cursor: 'pointer', textAlign: 'left' }}
          >
            <span>💡 <span style={{ marginLeft: 8 }}>Pista:</span></span>
            <span style={{ color: '#C2410C', fontSize: 12 }}>{showPista ? 'Ocultar pista ▲' : 'Ver pista ▼'}</span>
          </button>
          {showPista && <div style={{ padding: '0 14px 12px 42px', fontSize: 13, fontWeight: 700, lineHeight: 1.45 }}>{pista}</div>}
        </div>
      )}
      {instruccion && <p style={{ fontSize: 15, fontWeight: 600, color: C.text, lineHeight: 1.5, margin: 0 }}>{instruccion}</p>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {resultados.map(row => {
          const showState = verificado || agotado
          const silabasLine = showState ? (row.silabasOk ? C.green : C.red) : C.purple
          const cantidadLine = showState ? (row.cantidadOk ? C.green : C.red) : C.purple
          return (
            <div key={row.id} style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '90px 150px 80px', columnGap: 10, rowGap: 6, alignItems: 'end', width: 'fit-content', maxWidth: '100%' }}>
              <span style={{ color: '#6366F1', fontWeight: 900, fontSize: 15, paddingBottom: isMobile ? 0 : 7 }}>{row.palabra}</span>
              <input
                value={row.dadaSilabas}
                onChange={e => update(row.id, 'silabas', e.target.value)}
                disabled={isLocked}
                placeholder={row.silabas}
                style={{ border: 'none', borderBottom: `2px solid ${silabasLine}`, borderRadius: 0, padding: '5px 8px 6px', fontFamily: 'Nunito', fontWeight: 800, fontSize: 14, textAlign: 'center', color: showState ? (row.silabasOk ? C.green : C.red) : C.text, outline: 'none', background: 'transparent' }}
              />
              <input
                value={row.dadaCantidad}
                onChange={e => update(row.id, 'cantidad', e.target.value.replace(/[^\d]/g, ''))}
                disabled={isLocked}
                inputMode="numeric"
                placeholder="# sílabas"
                style={{ border: 'none', borderBottom: `2px solid ${cantidadLine}`, borderRadius: 0, padding: '5px 8px 6px', fontFamily: 'Nunito', fontWeight: 800, fontSize: 14, textAlign: 'center', color: showState ? (row.cantidadOk ? C.green : C.red) : C.text, outline: 'none', background: 'transparent' }}
              />
            </div>
          )
        })}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {!isLocked && <button onClick={verificar} style={btnP(C.purple)}>Verificar ✓</button>}
        {!isLocked && Object.keys(respuestas).length > 0 && <button onClick={reiniciar} style={btnS}>↺ Reiniciar</button>}
        <AttemptsLeft restantes={restantes} max={maxIntentos} locked={isLocked} />
      </div>

      {verificado && allOk && <FeedbackBox ok msg="¡Perfecto! Separaste todas las sílabas correctamente." />}
      {verificado && !allOk && !agotado && <FeedbackBox ok={false} msg="Algunas no son correctas. Recuerda: una palmada = una sílaba." />}
      {agotado && <FeedbackBox ok={false} msg="Intentos agotados. La actividad quedó registrada." />}
    </div>
  )
}

// ── Acróstico ─────────────────────────────────────────────────────────────────
function Acrostico({ actividadId, palabra, letras, lineas, instruccion, pista, banco, isMobile, onComplete, completada, maxIntentos = 2 }) {
  const baseLetters = (letras?.length ? letras : String(palabra || '').split('')).map((l, idx) => ({
    id: `linea-${idx + 1}`,
    letra: String(l || '').toUpperCase(),
    placeholder: `escribe algo con ${String(l || '').toUpperCase()}...`,
    pista: '',
    respuesta: '',
  }))
  const rows = (lineas.length ? lineas : baseLetters).map((item, idx) => ({
    id: String(item.id ?? `linea-${idx + 1}`),
    letra: String(item.letra ?? baseLetters[idx]?.letra ?? '').toUpperCase(),
    placeholder: item.placeholder || `escribe algo con ${String(item.letra ?? baseLetters[idx]?.letra ?? '').toUpperCase()}...`,
    pista: item.pista || item.ayuda || '',
    respuesta: item.respuesta || item.correcta || '',
  })).filter(row => row.letra)
  const hasAnswers = rows.some(row => row.respuesta)

  const storageKey = `acrostico_${actividadId}`
  const [respuestas, setRespuestas] = useState(() => {
    try { return JSON.parse(localStorage.getItem(storageKey)) || {} } catch { return {} }
  })
  const [estrellas, setEstrellas] = useState(() => {
    const saved = Number(localStorage.getItem(`${storageKey}_estrellas`))
    return Number.isFinite(saved) ? saved : 0
  })
  const [verificado, setVerificado] = useState(false)
  const [intentos, setIntentos] = useState(0)
  const [agotado, setAgotado] = useState(false)
  const [entregado, setEntregado] = useState(completada)
  const [showPista, setShowPista] = useState(false)
  const firedRef = useRef(false)

  const resultados = rows.map(row => {
    const texto = respuestas[row.id] || ''
    const empiezaBien = norm(texto).startsWith(norm(row.letra))
    const respuestaOk = !row.respuesta || norm(texto).startsWith(norm(String(row.respuesta).slice(0, 4))) || norm(texto) === norm(row.respuesta)
    return { ...row, texto, empiezaBien, respuestaOk, esCorrecta: empiezaBien && respuestaOk }
  })
  const allFilled = rows.length > 0 && rows.every(row => (respuestas[row.id] || '').trim())
  const allOk = resultados.every(row => row.esCorrecta)
  const isLocked = completada || entregado || agotado || (verificado && allOk)
  const canRate = !hasAnswers && !completada && !entregado
  const restantes = maxIntentos - intentos

  function update(id, value) {
    if (isLocked) return
    const next = { ...respuestas, [id]: value }
    setRespuestas(next)
    localStorage.setItem(storageKey, JSON.stringify(next))
    setVerificado(false)
  }

  function setRating(value) {
    if (!canRate) return
    setEstrellas(value)
    localStorage.setItem(`${storageKey}_estrellas`, String(value))
  }

  function buildPayload() {
    return {
      palabra: palabra || rows.map(row => row.letra).join(''),
      estrellas: hasAnswers ? null : estrellas,
      respuestas: resultados.map(row => ({
        letra: row.letra,
        texto: row.texto,
        respuestaCorrecta: row.respuesta || null,
        empiezaBien: row.empiezaBien,
        esCorrecta: hasAnswers ? row.esCorrecta : null,
      })),
    }
  }

  function verificar() {
    if (isLocked || !allFilled || firedRef.current) return
    if (!hasAnswers) {
      setEntregado(true)
      firedRef.current = true
      onComplete(buildPayload(), null)
      return
    }
    setVerificado(true)
    if (allOk) {
      firedRef.current = true
      onComplete(buildPayload(), true)
      return
    }
    const next = intentos + 1
    setIntentos(next)
    if (next >= maxIntentos) {
      firedRef.current = true
      setAgotado(true)
      onComplete(buildPayload(), false)
    }
  }

  function reiniciar() {
    if (isLocked) return
    setRespuestas({})
    setEstrellas(0)
    setVerificado(false)
    localStorage.removeItem(storageKey)
    localStorage.removeItem(`${storageKey}_estrellas`)
  }

  if (rows.length === 0) return <MissingField campo="palabra/letras" />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {pista && (
        <div style={{ background: '#FFFDEB', border: '2px solid #FDE047', color: '#92400E', borderRadius: 10, overflow: 'hidden' }}>
          <button
            type="button"
            onClick={() => setShowPista(prev => !prev)}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: 'transparent', border: 'none', padding: '10px 14px', color: '#92400E', fontFamily: 'Nunito', fontSize: 13, fontWeight: 900, cursor: 'pointer', textAlign: 'left' }}
          >
            <span>💡 <span style={{ marginLeft: 8 }}>Pista:</span></span>
            <span style={{ color: '#C2410C', fontSize: 12 }}>{showPista ? 'Ocultar pista ▲' : 'Ver pista ▼'}</span>
          </button>
          {showPista && <div style={{ padding: '0 14px 12px 42px', fontSize: 13, fontWeight: 700, lineHeight: 1.45 }}>{pista}</div>}
        </div>
      )}
      {instruccion && <p style={{ fontSize: 15, fontWeight: 600, color: C.text, lineHeight: 1.5, margin: 0 }}>{instruccion}</p>}
      {banco.length > 0 && <p style={{ fontSize: 13, fontWeight: 700, color: C.textMuted, margin: 0 }}>Banco de palabras: <em>{banco.join(' - ')}</em></p>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {resultados.map(row => {
          const showState = hasAnswers && (verificado || agotado)
          const border = showState ? (row.esCorrecta ? C.green : C.red) : C.orangeLight
          return (
            <div key={row.id} style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '46px minmax(0, 1fr)', gap: 10, alignItems: 'center' }}>
              <div style={{ width: 42, height: 42, borderRadius: 12, background: C.orange, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 20, boxShadow: `0 3px 10px ${C.orange}33` }}>{row.letra}</div>
              <div>
                <input
                  value={row.texto}
                  onChange={e => update(row.id, e.target.value)}
                  disabled={isLocked}
                  placeholder={row.placeholder}
                  style={{ width: '100%', boxSizing: 'border-box', border: `2px solid ${border}`, borderRadius: 12, padding: '11px 12px', fontFamily: 'Nunito', fontWeight: 700, fontSize: 14, outline: 'none', background: isLocked ? '#F9FAFB' : '#fff', color: showState ? (row.esCorrecta ? C.green : C.red) : C.text }}
                />
                {row.pista && <div style={{ marginTop: 4, fontSize: 11, color: C.textMuted, fontWeight: 700 }}>{row.pista}</div>}
              </div>
            </div>
          )
        })}
      </div>

      {!hasAnswers && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: C.textMuted }}>¿Qué tan creativo/a fuiste?</span>
          <div style={{ display: 'flex', gap: 4 }}>
            {[1, 2, 3, 4, 5].map(n => (
              <button
                key={n}
                type="button"
                onPointerDown={e => { e.preventDefault(); setRating(n) }}
                onClick={() => setRating(n)}
                aria-label={`Valorar con ${n} estrella${n !== 1 ? 's' : ''}`}
                style={{
                  width: 28,
                  height: 28,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'none',
                  border: 'none',
                  cursor: canRate ? 'pointer' : 'default',
                  color: n <= estrellas ? '#F59E0B' : '#D1D5DB',
                  fontSize: 27,
                  lineHeight: 1,
                  padding: 0,
                }}
              >
                {n <= estrellas ? '★' : '☆'}
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {!isLocked && <button onClick={verificar} disabled={!allFilled} style={btnP(allFilled ? C.orange : C.border)}>{hasAnswers ? 'Verificar ✓' : 'Guardar respuesta'}</button>}
        {!isLocked && Object.keys(respuestas).length > 0 && <button onClick={reiniciar} style={btnS}>↺ Reiniciar</button>}
        {hasAnswers && <AttemptsLeft restantes={restantes} max={maxIntentos} locked={isLocked} />}
      </div>

      {verificado && hasAnswers && allOk && <FeedbackBox ok msg="¡Acróstico completo! Excelente manejo del vocabulario." />}
      {verificado && hasAnswers && !allOk && !agotado && <FeedbackBox ok={false} msg="Algunos espacios no son correctos. Revisa las pistas o usa el banco de palabras." />}
      {agotado && <FeedbackBox ok={false} msg="Intentos agotados. La actividad quedó registrada." />}
      {(entregado || completada) && !hasAnswers && <FeedbackBox ok msg="Acróstico guardado." />}
    </div>
  )
}

// ── Crucigrama ────────────────────────────────────────────────────────────────
function Crucigrama({ actividadId, instruccion, pista, palabras, filas, columnas, pistas, isMobile, onComplete, completada }) {
  const words = palabras.map((item, idx) => {
    const texto = item.w || item.palabra || item.texto || ''
    const direccionRaw = item.d || item.direccion || item.dir || 'h'
    const direccion = String(direccionRaw).toLowerCase().startsWith('v') ? 'v' : 'h'
    return {
      id: String(item.id ?? `palabra-${idx + 1}`),
      texto: cleanCrosswordAnswer(texto),
      original: texto,
      fila: Number(item.r ?? item.fila ?? item.row ?? 0),
      columna: Number(item.c ?? item.columna ?? item.col ?? 0),
      direccion,
      pista: item.pista || item.clue || '',
    }
  }).filter(item => item.texto && Number.isFinite(item.fila) && Number.isFinite(item.columna))

  const computedRows = words.reduce((max, word) => Math.max(max, word.fila + (word.direccion === 'v' ? word.texto.length : 1)), 0)
  const computedCols = words.reduce((max, word) => Math.max(max, word.columna + (word.direccion === 'h' ? word.texto.length : 1)), 0)
  const configuredRows = Number(filas)
  const configuredCols = Number(columnas)
  const rowCount = Number.isFinite(configuredRows) && configuredRows > 0 ? configuredRows : computedRows
  const colCount = Number.isFinite(configuredCols) && configuredCols > 0 ? configuredCols : computedCols
  const storageKey = `crucigrama_${actividadId}`
  const inputRefs = useRef({})

  const [respuestas, setRespuestas] = useState(() => {
    try { return JSON.parse(localStorage.getItem(storageKey)) || {} } catch { return {} }
  })
  const [showPista, setShowPista] = useState(false)
  const [activeWordId, setActiveWordId] = useState(null)
  const firedRef = useRef(false)

  const { cells, numbers, conflict, cellWords } = buildCrosswordGrid(words, rowCount, colCount)
  const cellKeys = Object.keys(cells)
  const allOk = cellKeys.length > 0 && cellKeys.every(key => cleanCrosswordAnswer(respuestas[key]) === cells[key])
  const isLocked = completada || allOk
  const horizontalClues = pistas?.h || pistas?.horizontal || words.filter(w => w.direccion === 'h').map(w => `${numbers[`${w.fila},${w.columna}`]}. ${w.pista || w.original}`)
  const verticalClues = pistas?.v || pistas?.vertical || words.filter(w => w.direccion === 'v').map(w => `${numbers[`${w.fila},${w.columna}`]}. ${w.pista || w.original}`)
  const cellSize = isMobile ? 32 : 38
  const wordStatuses = Object.fromEntries(words.map(word => {
    const keys = crosswordWordKeys(word)
    const completa = keys.every(key => (respuestas[key] || '').trim())
    const correcta = completa && keys.every((key, i) => cleanCrosswordAnswer(respuestas[key]) === word.texto[i])
    return [word.id, { completa, correcta, keys }]
  }))

  function updateCell(key, value) {
    if (isLocked) return
    const letter = cleanCrosswordAnswer(value).slice(-1)
    const next = setCrosswordCellValue(respuestas, key, letter)
    setRespuestas(next)
    localStorage.setItem(storageKey, JSON.stringify(next))
    if (letter) window.setTimeout(() => focusSiblingCell(key, false), 0)
  }

  function buildPayload() {
    return {
      respuestas: cellKeys.map(key => ({
        celda: key,
        letraDada: respuestas[key] || '',
        letraCorrecta: cells[key],
        esCorrecta: cleanCrosswordAnswer(respuestas[key]) === cells[key],
      })),
      palabras: words.map(word => ({
        palabra: word.original,
        direccion: word.direccion === 'h' ? 'horizontal' : 'vertical',
        fila: word.fila,
        columna: word.columna,
        respuestaDada: Array.from({ length: word.texto.length }, (_, i) => {
          const key = word.direccion === 'h' ? `${word.fila},${word.columna + i}` : `${word.fila + i},${word.columna}`
          return respuestas[key] || ''
        }).join(''),
        esCorrecta: Array.from({ length: word.texto.length }, (_, i) => {
          const key = word.direccion === 'h' ? `${word.fila},${word.columna + i}` : `${word.fila + i},${word.columna}`
          return cleanCrosswordAnswer(respuestas[key]) === cells[key]
        }).every(Boolean),
      })),
    }
  }

  useEffect(() => {
    if (allOk && !firedRef.current) {
      firedRef.current = true
      onComplete(buildPayload(), true)
    }
  }, [allOk])

  function reiniciar() {
    if (isLocked) return
    setRespuestas({})
    localStorage.removeItem(storageKey)
  }

  function cellStatus(key) {
    const statuses = (cellWords[key] || []).map(wordId => wordStatuses[wordId]).filter(st => st?.completa)
    if (statuses.some(st => !st.correcta)) return 'no'
    if (statuses.some(st => st.correcta)) return 'ok'
    return null
  }

  function focusSiblingCell(key, reverse) {
    const wordIds = cellWords[key] || []
    const wordId = activeWordId && wordIds.includes(activeWordId) ? activeWordId : wordIds[0]
    const status = wordStatuses[wordId]
    if (!status) return false
    const idx = status.keys.indexOf(key)
    const nextKey = status.keys[idx + (reverse ? -1 : 1)]
    if (!nextKey) return false
    inputRefs.current[nextKey]?.focus()
    return true
  }

  function handleCellKeyDown(e, key) {
    if (e.key === 'Tab') {
      if (focusSiblingCell(key, e.shiftKey)) e.preventDefault()
      return
    }
    if (e.key === 'Backspace' || e.key === 'Delete') {
      if (isLocked) return
      e.preventDefault()
      const next = setCrosswordCellValue(respuestas, key, '')
      setRespuestas(next)
      localStorage.setItem(storageKey, JSON.stringify(next))
      window.setTimeout(() => focusSiblingCell(key, true), 0)
    }
  }

  if (words.length === 0 || rowCount === 0 || colCount === 0) return <MissingField campo="palabras" />
  if (conflict) return <MissingField campo={`cruce inválido en ${conflict}`} />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {pista && (
        <div style={{ background: '#EFF6FF', border: `2px solid ${C.blueLight}`, color: '#1D4ED8', borderRadius: 10, overflow: 'hidden' }}>
          <button
            type="button"
            onClick={() => setShowPista(prev => !prev)}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: 'transparent', border: 'none', padding: '10px 14px', color: '#1D4ED8', fontFamily: 'Nunito', fontSize: 13, fontWeight: 900, cursor: 'pointer', textAlign: 'left' }}
          >
            <span>💡 <span style={{ marginLeft: 8 }}>Pista:</span></span>
            <span style={{ color: C.blue, fontSize: 12 }}>{showPista ? 'Ocultar pista ▲' : 'Ver pista ▼'}</span>
          </button>
          {showPista && <div style={{ padding: '0 14px 12px 42px', fontSize: 13, fontWeight: 700, lineHeight: 1.45 }}>{pista}</div>}
        </div>
      )}
      {instruccion && <p style={{ fontSize: 15, fontWeight: 600, color: C.text, lineHeight: 1.5, margin: 0 }}>{instruccion}</p>}

      <div style={{ overflowX: 'auto', padding: '4px 0 8px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${colCount}, ${cellSize}px)`, gridTemplateRows: `repeat(${rowCount}, ${cellSize}px)`, gap: 3, width: 'fit-content', margin: '0 auto' }}>
          {Array.from({ length: rowCount }).map((_, r) => (
            Array.from({ length: colCount }).map((__, c) => {
              const key = `${r},${c}`
              const expected = cells[key]
              const status = expected ? cellStatus(key) : null
              const ok = status === 'ok'
              const no = status === 'no'
              return (
                <div key={key} style={{ position: 'relative', width: cellSize, height: cellSize, borderRadius: 5, background: expected ? (ok ? C.greenLight : no ? C.redLight : '#fff') : '#3B0764', border: expected ? `2px solid ${no ? C.red : ok ? C.green : '#93C5FD'}` : '2px solid #3B0764' }}>
                  {expected && numbers[key] && <span style={{ position: 'absolute', top: 2, left: 3, fontSize: 8, fontWeight: 900, color: C.blue, lineHeight: 1, pointerEvents: 'none' }}>{numbers[key]}</span>}
                  {expected && (
                    <input
                      ref={el => { if (el) inputRefs.current[key] = el }}
                      value={respuestas[key] || ''}
                      onChange={e => updateCell(key, e.target.value)}
                      onFocus={() => setActiveWordId((cellWords[key] || [])[0] || null)}
                      onKeyDown={e => handleCellKeyDown(e, key)}
                      disabled={isLocked}
                      maxLength={1}
                      aria-label={`Casilla ${r + 1}, ${c + 1}`}
                      style={{ width: '100%', height: '100%', border: 'none', textAlign: 'center', fontFamily: 'Nunito', fontSize: isMobile ? 15 : 18, fontWeight: 900, outline: 'none', background: 'transparent', textTransform: 'uppercase', color: ok ? C.green : no ? C.red : C.text, padding: '8px 0 0', boxSizing: 'border-box' }}
                    />
                  )}
                </div>
              )
            })
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 12 }}>
        <CrosswordClues title="→ Horizontales" clues={horizontalClues} />
        <CrosswordClues title="↓ Verticales" clues={verticalClues} />
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {!isLocked && Object.keys(respuestas).length > 0 && <button onClick={reiniciar} style={btnS}>↺ Borrar todo</button>}
      </div>

      {allOk && <FeedbackBox ok msg="¡Crucigrama completo! Excelente manejo del vocabulario." />}
    </div>
  )
}

function CrosswordClues({ title, clues }) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 12, padding: 12 }}>
      <p style={{ fontSize: 13, fontWeight: 900, color: C.blue, margin: '0 0 6px' }}>{title}</p>
      <ol style={{ margin: 0, paddingLeft: 18, color: C.text, fontSize: 13, fontWeight: 700, lineHeight: 1.45 }}>
        {(clues || []).map((clue, i) => <li key={`${title}-${i}`} style={{ marginBottom: 3 }}>{String(clue).replace(/^\d+V?\.\s*/, '')}</li>)}
      </ol>
    </div>
  )
}

function buildCrosswordGrid(words, rows, cols) {
  const cells = {}
  const numbers = {}
  const cellWords = {}
  let nextNum = 1
  for (const word of words) {
    for (let i = 0; i < word.texto.length; i++) {
      const r = word.fila + (word.direccion === 'v' ? i : 0)
      const c = word.columna + (word.direccion === 'h' ? i : 0)
      if (r < 0 || c < 0 || r >= rows || c >= cols) return { cells, numbers, conflict: `${r},${c}` }
      const key = `${r},${c}`
      if (cells[key] && cells[key] !== word.texto[i]) return { cells, numbers, conflict: key }
      cells[key] = word.texto[i]
      if (!cellWords[key]) cellWords[key] = []
      cellWords[key].push(word.id)
    }
  }
  for (const word of words) {
    const key = `${word.fila},${word.columna}`
    if (!numbers[key]) numbers[key] = nextNum++
  }
  return { cells, numbers, cellWords, conflict: null }
}

function crosswordWordKeys(word) {
  return Array.from({ length: word.texto.length }, (_, i) => (
    word.direccion === 'h' ? `${word.fila},${word.columna + i}` : `${word.fila + i},${word.columna}`
  ))
}

function setCrosswordCellValue(respuestas, key, value) {
  const next = { ...respuestas }
  if (value) next[key] = value
  else delete next[key]
  return next
}

// ── Respiración guiada ────────────────────────────────────────────────────────
function RespiracionGuiada({
  actividadId,
  instruccion,
  mensajeFinal = '¡Muy bien! Respiraste con calma.',
  ciclos = 3,
  duracionInhala = 3,
  duracionExhala = 3,
  textoInicio = 'Presiona para comenzar',
  textoInhala = 'Inhala',
  textoExhala = 'Exhala',
  onComplete,
  completada,
}) {
  const totalCycles = Math.max(1, Number(ciclos) || 3)
  const inhaleMs = Math.max(1000, (Number(duracionInhala) || 3) * 1000)
  const exhaleMs = Math.max(1000, (Number(duracionExhala) || 3) * 1000)
  const [running, setRunning] = useState(false)
  const [phase, setPhase] = useState('idle')
  const [cycle, setCycle] = useState(0)
  const [done, setDone] = useState(completada)
  const timeoutRef = useRef(null)
  const firedRef = useRef(false)

  useEffect(() => () => { if (timeoutRef.current) clearTimeout(timeoutRef.current) }, [])

  function finish() {
    setRunning(false)
    setPhase('done')
    setDone(true)
    if (!firedRef.current && !completada) {
      firedRef.current = true
      onComplete({
        ciclos: totalCycles,
        duracionInhala,
        duracionExhala,
        completado: true,
        mensajeFinal,
      }, null)
    }
  }

  function runCycle(nextCycle) {
    if (nextCycle >= totalCycles) {
      finish()
      return
    }
    setCycle(nextCycle)
    setPhase('inhale')
    timeoutRef.current = setTimeout(() => {
      setPhase('exhale')
      timeoutRef.current = setTimeout(() => runCycle(nextCycle + 1), exhaleMs)
    }, inhaleMs)
  }

  function start() {
    if (running) return
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    setDone(false)
    setRunning(true)
    runCycle(0)
  }

  function stop() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    setRunning(false)
    setPhase('idle')
    setCycle(0)
  }

  const isInhale = phase === 'inhale'
  const isExhale = phase === 'exhale'
  const transitionMs = isInhale ? inhaleMs : isExhale ? exhaleMs : 700
  const circleText = done || phase === 'done'
    ? 'Listo'
    : isInhale
      ? textoInhala
      : isExhale
        ? textoExhala
        : textoInicio
  const statusText = done || phase === 'done'
    ? mensajeFinal
    : isInhale
      ? `${textoInhala} suave...`
      : isExhale
        ? `${textoExhala} despacio...`
        : textoInicio

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center' }}>
      {instruccion && <p style={{ width: '100%', fontSize: 15, fontWeight: 600, color: C.text, lineHeight: 1.5, margin: 0 }}>{instruccion}</p>}

      <button
        type="button"
        onClick={start}
        disabled={running}
        aria-label="Iniciar respiración guiada"
        style={{
          width: 132,
          height: 132,
          borderRadius: '50%',
          border: `4px solid ${isExhale ? C.teal : C.blue}`,
          background: isExhale ? 'radial-gradient(circle, #D1FAE5, #99F6E4)' : 'radial-gradient(circle, #DBEAFE, #BFDBFE)',
          color: isExhale ? C.teal : C.blue,
          transform: isInhale ? 'scale(1.34)' : isExhale ? 'scale(0.88)' : 'scale(1)',
          transition: `transform ${transitionMs}ms ease-in-out, background ${transitionMs}ms ease-in-out, border-color ${transitionMs}ms ease-in-out`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          fontFamily: 'Nunito',
          fontSize: 15,
          fontWeight: 900,
          cursor: running ? 'default' : 'pointer',
          boxShadow: isInhale ? '0 0 28px rgba(30,136,229,0.28)' : isExhale ? '0 0 20px rgba(0,137,123,0.20)' : '0 6px 18px rgba(30,136,229,0.15)',
          userSelect: 'none',
        }}
      >
        {circleText}
      </button>

      <div style={{ minHeight: 28, fontSize: 17, fontWeight: 900, color: isExhale ? C.teal : C.blue, textAlign: 'center' }}>
        {statusText}
      </div>
      <div style={{ display: 'flex', gap: 6, minHeight: 20 }}>
        {Array.from({ length: totalCycles }).map((_, i) => (
          <span key={i} style={{ width: 20, height: 8, borderRadius: 99, background: i < cycle || done ? C.green : i === cycle && running ? C.blue : C.border, transition: 'background 240ms ease' }} />
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
        <button type="button" onClick={start} disabled={running} style={btnP(running ? C.border : C.blue)}>Comenzar</button>
        {running && <button type="button" onClick={stop} style={btnS}>Detener</button>}
      </div>

      {done && <FeedbackBox ok msg={mensajeFinal} />}
    </div>
  )
}

// ── Mini-juego de conteo ──────────────────────────────────────────────────────
function MiniJuegoConteo({
  actividadId,
  instruccion,
  emoji = '🎈',
  cantidad = 10,
  tiempoLimite = 0,
  textoContador = 'Contados',
  mensajeFinal = '¡Muy bien! Contaste todos los elementos.',
  mensajeTiempo = 'Se acabó el tiempo. Puedes intentarlo otra vez.',
  onComplete,
  completada,
}) {
  const total = Math.max(1, Math.min(30, Number(cantidad) || 10))
  const seconds = Math.max(0, Number(tiempoLimite) || 0)
  const [started, setStarted] = useState(false)
  const [clicked, setClicked] = useState(() => new Set())
  const [timeLeft, setTimeLeft] = useState(seconds)
  const [timeUp, setTimeUp] = useState(false)
  const [done, setDone] = useState(completada)
  const timerRef = useRef(null)
  const firedRef = useRef(false)

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current) }, [])

  function finish(nextClicked) {
    setDone(true)
    setStarted(false)
    if (timerRef.current) clearInterval(timerRef.current)
    if (!firedRef.current && !completada) {
      firedRef.current = true
      onComplete({
        total,
        contados: nextClicked.size,
        tiempoLimite: seconds,
        completado: true,
        mensajeFinal,
      }, null)
    }
  }

  function start() {
    if (timerRef.current) clearInterval(timerRef.current)
    firedRef.current = false
    setClicked(new Set())
    setDone(false)
    setTimeUp(false)
    setStarted(true)
    setTimeLeft(seconds)
    if (seconds > 0) {
      timerRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            clearInterval(timerRef.current)
            setStarted(false)
            setTimeUp(true)
            return 0
          }
          return prev - 1
        })
      }, 1000)
    }
  }

  function toggleItem(index) {
    if (!started || done || timeUp) return
    const next = new Set(clicked)
    next.add(index)
    setClicked(next)
    if (next.size >= total) finish(next)
  }

  const items = Array.from({ length: total })
  const progress = Math.round((clicked.size / total) * 100)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {instruccion && <p style={{ fontSize: 15, fontWeight: 600, color: C.text, lineHeight: 1.5, margin: 0 }}>{instruccion}</p>}

      <div style={{ background: '#fff', border: `2px solid ${C.pinkLight}`, borderRadius: 14, padding: 16, textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
          <span style={{ fontSize: 14, fontWeight: 900, color: C.pink, background: C.pinkLight, borderRadius: 20, padding: '5px 12px' }}>{textoContador}: {clicked.size} / {total}</span>
          {seconds > 0 && <span style={{ fontSize: 14, fontWeight: 900, color: timeLeft <= 3 && started ? C.red : C.blue, background: timeLeft <= 3 && started ? C.redLight : C.blueLight, borderRadius: 20, padding: '5px 12px' }}>Tiempo: {timeLeft}s</span>}
        </div>

        <div style={{ height: 8, borderRadius: 99, background: '#F3F4F6', overflow: 'hidden', marginBottom: 16 }}>
          <div style={{ width: `${progress}%`, height: '100%', background: C.pink, transition: 'width 180ms ease' }} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(46px, 1fr))', gap: 10, maxWidth: 520, margin: '0 auto' }}>
          {items.map((_, index) => {
            const counted = clicked.has(index)
            return (
              <button
                key={index}
                type="button"
                onClick={() => toggleItem(index)}
                disabled={!started || counted || done || timeUp}
                aria-label={`Contar elemento ${index + 1}`}
                style={{
                  height: 48,
                  borderRadius: 14,
                  border: `2px solid ${counted ? C.green : C.pinkLight}`,
                  background: counted ? C.greenLight : '#fff',
                  fontSize: counted ? 18 : 28,
                  cursor: !started || counted || done || timeUp ? 'default' : 'pointer',
                  transform: counted ? 'scale(0.88)' : 'scale(1)',
                  opacity: counted ? 0.72 : 1,
                  transition: 'transform 160ms ease, opacity 160ms ease, background 160ms ease',
                }}
              >
                {counted ? '✓' : emoji}
              </button>
            )
          })}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
        {!started && !done && <button type="button" onClick={start} style={btnP(C.pink)}>Iniciar</button>}
        {(started || clicked.size > 0 || timeUp || done) && <button type="button" onClick={start} style={btnS}>↺ Reiniciar</button>}
      </div>

      {done && <FeedbackBox ok msg={mensajeFinal} />}
      {timeUp && !done && <FeedbackBox ok={false} msg={mensajeTiempo} />}
    </div>
  )
}

// ── Tarjetas volteables ───────────────────────────────────────────────────────
function TarjetasVolteables({ instruccion, tarjetas, textoFrente = 'Haz clic para descubrir', mensajeFinal = '¡Descubriste todas las tarjetas!', onComplete, completada }) {
  const cards = tarjetas.map((card, idx) => ({
    id: String(card.id ?? `tarjeta-${idx + 1}`),
    emoji: card.emoji || card.icono || '❓',
    frente: card.frente || card.titulo || card.nombre || textoFrente,
    reverso: card.reverso || card.texto || card.descripcion || '',
    color: card.color || [C.purple, C.blue, C.teal, C.orange, C.pink][idx % 5],
  })).filter(card => card.frente && card.reverso)
  const [volteadas, setVolteadas] = useState(() => new Set())
  const [descubiertas, setDescubiertas] = useState(() => new Set())
  const firedRef = useRef(false)

  function voltear(card) {
    if (completada) return
    const nextFlipped = new Set(volteadas)
    nextFlipped.has(card.id) ? nextFlipped.delete(card.id) : nextFlipped.add(card.id)
    setVolteadas(nextFlipped)
    if (!nextFlipped.has(card.id)) return
    const nextDiscovered = new Set(descubiertas); nextDiscovered.add(card.id); setDescubiertas(nextDiscovered)
    if (nextDiscovered.size === cards.length && !firedRef.current) {
      firedRef.current = true
      onComplete({ tarjetasDescubiertas: cards.map(item => ({ id: item.id, frente: item.frente })), total: cards.length }, null)
    }
  }

  if (cards.length === 0) return <MissingField campo="tarjetas" />
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {instruccion && <p style={{ fontSize: 15, fontWeight: 700, color: C.text, lineHeight: 1.5, margin: 0 }}>{instruccion}</p>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 14 }}>
        {cards.map(card => {
          const flipped = volteadas.has(card.id)
          return (
            <button key={card.id} type="button" onClick={() => voltear(card)} aria-pressed={flipped} aria-label={`${flipped ? 'Ocultar' : 'Descubrir'} ${card.frente}`} style={{ height: 175, padding: 0, border: 'none', background: 'transparent', perspective: 900, cursor: completada ? 'default' : 'pointer', fontFamily: 'Nunito' }}>
              <span style={{ position: 'relative', display: 'block', width: '100%', height: '100%', transformStyle: 'preserve-3d', transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)', transition: 'transform 500ms cubic-bezier(.2,.7,.2,1)' }}>
                <span style={{ position: 'absolute', inset: 0, backfaceVisibility: 'hidden', borderRadius: 16, padding: 16, boxSizing: 'border-box', background: `linear-gradient(145deg, ${card.color}, ${card.color}CC)`, color: '#fff', border: '3px solid #fff', boxShadow: `0 7px 20px ${card.color}45`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                  <span style={{ fontSize: 38 }}>{card.emoji}</span>
                  <span style={{ fontSize: 16, fontWeight: 900 }}>{card.frente}</span>
                  <span style={{ fontSize: 10, fontWeight: 800, opacity: .85 }}>Toca para voltear</span>
                </span>
                <span style={{ position: 'absolute', inset: 0, backfaceVisibility: 'hidden', transform: 'rotateY(180deg)', borderRadius: 16, padding: 16, boxSizing: 'border-box', background: '#fff', color: C.text, border: `3px solid ${card.color}`, boxShadow: `0 7px 20px ${card.color}30`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 9 }}>
                  <span style={{ fontSize: 30 }}>{card.emoji}</span>
                  <span style={{ color: card.color, fontSize: 14, fontWeight: 900 }}>{card.frente}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.4 }}>{card.reverso}</span>
                </span>
              </span>
            </button>
          )
        })}
      </div>
      <span style={{ fontSize: 13, fontWeight: 800, color: descubiertas.size === cards.length ? C.green : C.textMuted }}>Descubiertas: {descubiertas.size} / {cards.length}</span>
      {(completada || descubiertas.size === cards.length) && <FeedbackBox ok msg={mensajeFinal} />}
    </div>
  )
}

// ── Mezcla y pintura guiada por colores ───────────────────────────────────────
function MezclaPinturaGuiada({ actividadId, instruccion, colores, mezclas, numMezclas = 1, mensajeFinal = '¡Descubriste una nueva mezcla!', pregunta = '', placeholder = 'Escribe tu respuesta...', onComplete, completada }) {
  const palette = colores.map((color, idx) => ({
    id: String(color.id ?? `color-${idx + 1}`),
    nombre: color.nombre || color.label || `Color ${idx + 1}`,
    hex: color.hex || color.color || '#94A3B8',
  })).filter(color => color.nombre)
  const recipes = mezclas.map(mix => ({
    color1Id: String(mix.color1Id || mix.color1 || ''),
    color2Id: String(mix.color2Id || mix.color2 || ''),
    nombre: mix.nombre || mix.resultado || 'Nuevo color',
    hex: mix.hex || mix.colorResultado || '',
    mensaje: mix.mensaje || '',
  }))
  const target = Math.max(1, Math.min(Number(numMezclas) || 1, recipes.length || 1))
  const [seleccion, setSeleccion] = useState([])
  const [resultado, setResultado] = useState(null)
  const [descubiertas, setDescubiertas] = useState(() => new Set())
  const [respuesta, setRespuesta] = useState(() => localStorage.getItem(`mezcla_respuesta_${actividadId}`) || '')
  const firedRef = useRef(false)

  function completar(discovered, result, selected, answer = respuesta) {
    if (firedRef.current) return
    firedRef.current = true
    onComplete({
      mezclas: [...discovered],
      ultimaMezcla: { colores: selected.map(item => item.nombre), nombre: result.nombre, hex: result.hex },
      totalDescubiertas: discovered.size,
      respuesta: answer.trim() || null,
    }, null)
  }

  function mezclar(color) {
    if (completada) return
    const base = seleccion.length >= 2 ? [] : seleccion
    if (base.some(item => item.id === color.id)) return
    const next = [...base, color]
    setSeleccion(next)
    if (next.length < 2) {
      setResultado(null)
      return
    }
    const recipe = recipes.find(mix => [mix.color1Id, mix.color2Id].includes(next[0].id) && [mix.color1Id, mix.color2Id].includes(next[1].id))
    const resultHex = recipe?.hex || blendHex(next[0].hex, next[1].hex)
    const result = { nombre: recipe?.nombre || 'Color mezclado', hex: resultHex, mensaje: recipe?.mensaje || '' }
    setResultado(result)
    const mixKey = [next[0].id, next[1].id].sort().join('+')
    const discovered = new Set(descubiertas); discovered.add(mixKey); setDescubiertas(discovered)
    if (discovered.size >= target && !pregunta) completar(discovered, result, next)
  }

  function cambiarRespuesta(value) {
    setRespuesta(value)
    localStorage.setItem(`mezcla_respuesta_${actividadId}`, value)
  }

  function guardarRespuesta() {
    if (!pregunta || !respuesta.trim() || descubiertas.size < target || !resultado || firedRef.current) return
    completar(descubiertas, resultado, seleccion, respuesta)
  }

  if (palette.length < 2) return <MissingField campo="colores" />
  const circles = [seleccion[0], seleccion[1]]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {instruccion && <p style={{ fontSize: 15, fontWeight: 700, color: C.text, lineHeight: 1.5, margin: 0 }}>{instruccion}</p>}
      <div style={{ padding: 18, borderRadius: 16, background: 'linear-gradient(135deg, #FDF2F8, #F5F3FF)', border: `2px solid ${C.purpleLight}`, textAlign: 'center' }}>
        <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 22 }}>
          {palette.map(color => <button key={color.id} type="button" onClick={() => mezclar(color)} disabled={completada} style={{ padding: '8px 15px', borderRadius: 22, border: `3px solid ${seleccion.some(item => item.id === color.id) ? C.text : 'transparent'}`, background: color.hex, color: contrastText(color.hex), fontFamily: 'Nunito', fontWeight: 900, cursor: completada ? 'default' : 'pointer', boxShadow: '0 3px 10px rgba(0,0,0,.14)' }}>{color.nombre}</button>)}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, flexWrap: 'wrap' }}>
          {circles.map((color, i) => <div key={i} style={{ width: 68, height: 68, borderRadius: '50%', background: color?.hex || '#E2E8F0', border: '4px solid white', boxShadow: '0 3px 14px rgba(0,0,0,.16)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textMuted, fontWeight: 900 }}>{color ? '' : '?'}</div>)}
          <span style={{ fontSize: 28, fontWeight: 900, color: C.purple }}>→</span>
          <div style={{ width: 92, height: 92, borderRadius: '50%', background: resultado?.hex || '#E2E8F0', border: '5px solid white', boxShadow: '0 5px 20px rgba(0,0,0,.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: resultado ? contrastText(resultado.hex) : C.textMuted, fontWeight: 900, transition: 'background 350ms ease' }}>{resultado ? '' : '?'}</div>
        </div>
        <div style={{ minHeight: 48, marginTop: 14, color: C.purple, fontSize: 15, fontWeight: 900 }}>
          {resultado ? <>{seleccion[0]?.nombre} + {seleccion[1]?.nombre} = {resultado.nombre}{resultado.mensaje && <div style={{ marginTop: 4, color: C.textMuted, fontSize: 12 }}>{resultado.mensaje}</div>}</> : seleccion.length === 1 ? 'Elige un segundo color' : 'Selecciona dos colores para mezclarlos'}
        </div>
      </div>
      {pregunta && (
        <div style={{ padding: 14, borderRadius: 13, background: C.purpleLight, border: '2px solid #D8B4FE' }}>
          <label style={{ display: 'block', marginBottom: 8, color: C.purple, fontSize: 13, fontWeight: 900 }}>💭 {pregunta}</label>
          <textarea value={respuesta} onChange={e => cambiarRespuesta(e.target.value)} onBlur={guardarRespuesta} disabled={completada || firedRef.current} placeholder={placeholder} style={{ width: '100%', minHeight: 76, boxSizing: 'border-box', resize: 'vertical', padding: '11px 12px', borderRadius: 11, border: '2px solid #C4B5FD', background: '#fff', color: C.text, fontFamily: 'Nunito', fontSize: 14, outline: 'none' }} />
          {descubiertas.size >= target && !respuesta.trim() && <div style={{ marginTop: 6, color: C.textMuted, fontSize: 11, fontWeight: 700 }}>Escribe tu respuesta para completar la actividad.</div>}
        </div>
      )}
      <span style={{ fontSize: 13, fontWeight: 800, color: descubiertas.size >= target ? C.green : C.textMuted }}>Mezclas descubiertas: {descubiertas.size} / {target}</span>
      {(completada || firedRef.current) && <FeedbackBox ok msg={mensajeFinal} />}
    </div>
  )
}

function blendHex(a, b) {
  const clean = value => String(value || '').replace('#', '').padEnd(6, '0').slice(0, 6)
  const x = clean(a), y = clean(b)
  const parts = [0, 2, 4].map(i => Math.round((parseInt(x.slice(i, i + 2), 16) + parseInt(y.slice(i, i + 2), 16)) / 2).toString(16).padStart(2, '0'))
  return `#${parts.join('')}`
}
function contrastText(hex) {
  const clean = String(hex || '').replace('#', '')
  if (clean.length !== 6) return '#fff'
  const value = parseInt(clean, 16), r = value >> 16, g = (value >> 8) & 255, b = value & 255
  return r * 299 + g * 587 + b * 114 > 150000 ? '#1F2937' : '#fff'
}

// ── Selector visual de emoción y color ────────────────────────────────────────
function SelectorEmocionColor({
  actividadId,
  instruccion,
  opciones,
  retroalimentacion = '¡Muy bien! Reconociste la emoción.',
  retroalimentacionError = 'Observa las pistas e inténtalo otra vez.',
  maxIntentos = 2,
  onComplete,
  completada,
}) {
  const normalized = opciones.map((op, idx) => ({
    id: String(op.id ?? `emocion-${idx + 1}`),
    emoji: op.emoji || op.icono || '🙂',
    nombre: op.nombre || op.label || op.texto || `Emoción ${idx + 1}`,
    descripcion: op.descripcion || op.cuando || '',
    color: op.color || [C.blue, C.green, '#D97706', C.orange, C.red, C.purple][idx % 6],
    etiquetaColor: op.etiquetaColor || op.nombreColor || '',
    esCorrecta: !!op.esCorrecta,
  })).filter(op => op.nombre)
  const key = `selector_emocion_${actividadId}`
  const [seleccionada, setSeleccionada] = useState('')
  const [intentos, setIntentos] = useState(0)
  const [resultado, setResultado] = useState(completada ? 'ok' : null)
  const firedRef = useRef(false)
  const locked = completada || resultado === 'ok' || resultado === 'agotado'

  function seleccionar(id) {
    if (locked || firedRef.current) return
    const selected = normalized.find(op => op.id === id)
    if (!selected) return
    setSeleccionada(id)
    localStorage.setItem(`${key}_seleccion`, id)
    const payload = {
      seleccion: selected ? { id: selected.id, emocion: selected.nombre, emoji: selected.emoji, color: selected.color, etiquetaColor: selected.etiquetaColor } : null,
      intento: intentos + 1,
    }
    if (selected.esCorrecta) {
      firedRef.current = true
      setResultado('ok')
      onComplete(payload, true)
      return
    }
    const next = intentos + 1
    setIntentos(next)
    if (next >= maxIntentos) {
      firedRef.current = true
      setResultado('agotado')
      onComplete(payload, false)
    } else {
      setResultado('error')
    }
  }

  if (normalized.length < 2) return <MissingField campo="opciones" />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {instruccion && <p style={{ fontSize: 15, fontWeight: 700, color: C.text, lineHeight: 1.5, margin: 0 }}>{instruccion}</p>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))', gap: 12 }}>
        {normalized.map(op => {
          const selected = op.id === seleccionada
          return (
            <button key={op.id} type="button" onClick={() => seleccionar(op.id)} disabled={locked} aria-pressed={selected} style={{
              minHeight: 150, padding: '16px 12px', borderRadius: 16,
              border: `3px solid ${selected ? op.color : `${op.color}88`}`,
              background: selected ? `${op.color}18` : '#fff', color: op.color,
              fontFamily: 'Nunito', cursor: locked ? 'default' : 'pointer',
              boxShadow: selected ? `0 6px 18px ${op.color}30` : 'none',
              transform: selected ? 'translateY(-3px)' : 'none', transition: 'all 160ms ease',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 7,
            }}>
              <span style={{ fontSize: 40, lineHeight: 1 }}>{op.emoji}</span>
              <span style={{ fontSize: 16, fontWeight: 900 }}>{op.nombre}</span>
              {op.etiquetaColor && <span style={{ padding: '3px 10px', borderRadius: 20, background: `${op.color}20`, fontSize: 11, fontWeight: 900 }}>{op.etiquetaColor}</span>}
              {op.descripcion && <span style={{ color: C.textMuted, fontSize: 12, fontWeight: 700, lineHeight: 1.35 }}>{op.descripcion}</span>}
            </button>
          )
        })}
      </div>
      <AttemptsLeft restantes={maxIntentos - intentos} max={maxIntentos} locked={locked} />
      {resultado === 'ok' && <FeedbackBox ok msg={retroalimentacion} />}
      {resultado === 'error' && <FeedbackBox ok={false} msg={retroalimentacionError} />}
      {resultado === 'agotado' && <FeedbackBox ok={false} msg="Intentos agotados. La respuesta quedó registrada." />}
    </div>
  )
}

// ── Exploración interactiva transformable ─────────────────────────────────────
function ExploracionInteractiva({
  actividadId,
  instruccion,
  escenaInicial = '❓',
  textoInicial = 'Elige una opción para explorar.',
  opciones,
  mensajeFinal = '¡Exploraste todas las opciones!',
  preguntaAbierta = '',
  placeholder = 'Escribe tu idea...',
  onComplete,
  completada,
}) {
  const normalized = opciones.map((op, idx) => ({
    id: String(op.id ?? `opcion-${idx + 1}`),
    icono: op.icono || op.emoji || '✨',
    label: op.label || op.titulo || `Opción ${idx + 1}`,
    texto: op.texto || op.descripcion || '',
    color: op.color || [C.teal, C.blue, C.purple, C.orange, C.green, C.pink][idx % 6],
  })).filter(op => op.label || op.texto)
  const storageKey = `exploracion_${actividadId}`
  const [activeId, setActiveId] = useState(null)
  const [visited, setVisited] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem(`${storageKey}_visited`)) || []) } catch { return new Set() }
  })
  const [respuesta, setRespuesta] = useState(() => localStorage.getItem(`${storageKey}_respuesta`) || '')
  const [finalizada, setFinalizada] = useState(completada)
  const firedRef = useRef(false)

  const active = normalized.find(op => op.id === activeId)
  const allVisited = normalized.length > 0 && normalized.every(op => visited.has(op.id))

  function selectOption(id) {
    const next = new Set(visited)
    next.add(id)
    setVisited(next)
    setActiveId(id)
    localStorage.setItem(`${storageKey}_visited`, JSON.stringify([...next]))
  }

  function saveRespuesta(value) {
    setRespuesta(value)
    localStorage.setItem(`${storageKey}_respuesta`, value)
  }

  function finalizar() {
    if (!allVisited || firedRef.current || completada) return
    firedRef.current = true
    setFinalizada(true)
    onComplete({
      exploradas: normalized.filter(op => visited.has(op.id)).map(op => op.id),
      total: normalized.length,
      respuesta: respuesta.trim() || null,
      completado: true,
    }, null)
  }

  if (normalized.length === 0) return <MissingField campo="opciones" />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {instruccion && <p style={{ fontSize: 15, fontWeight: 600, color: C.text, lineHeight: 1.5, margin: 0 }}>{instruccion}</p>}

      <div style={{ background: '#fff', border: `2px solid ${C.tealLight}`, borderRadius: 14, padding: 16, textAlign: 'center' }}>
        <div style={{ minHeight: 178, boxSizing: 'border-box', padding: '22px 18px 18px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10, background: '#0F172A', borderRadius: 14, border: '2px solid #334155', boxShadow: 'inset 0 0 28px rgba(0,0,0,0.28)', transition: 'border-color 180ms ease' }}>
          <div style={{ fontSize: 64, lineHeight: 1.15, transform: active ? 'scale(1.05)' : 'scale(1)', transition: 'transform 180ms ease', filter: 'drop-shadow(0 8px 8px rgba(0,0,0,0.35))' }}>
            {active?.icono || escenaInicial}
          </div>
          <div style={{ fontSize: 16, fontWeight: 900, color: active ? '#F8FAFC' : '#CBD5E1' }}>{active?.label || textoInicial}</div>
          <div style={{ maxWidth: 560, fontSize: 14, fontWeight: 700, color: '#CBD5E1', lineHeight: 1.45, padding: '0 12px' }}>
            {active?.texto || textoInicial}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginTop: 14 }}>
          {normalized.map(op => {
            const selected = op.id === activeId
            const seen = visited.has(op.id)
            return (
              <button
                key={op.id}
                type="button"
                onClick={() => selectOption(op.id)}
                style={{
                  minHeight: 72,
                  borderRadius: 12,
                  border: `2px solid ${selected ? op.color : seen ? C.green : C.border}`,
                  background: selected ? `${op.color}18` : seen ? C.greenLight : '#fff',
                  color: selected ? op.color : seen ? C.green : C.text,
                  cursor: 'pointer',
                  fontFamily: 'Nunito',
                  fontWeight: 900,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 5,
                  transition: 'transform 150ms ease, border-color 150ms ease, background 150ms ease',
                  transform: selected ? 'translateY(-2px)' : 'none',
                }}
              >
                <span style={{ fontSize: 24 }}>{op.icono}</span>
                <span style={{ fontSize: 13 }}>{op.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {preguntaAbierta && (
        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 900, color: C.textMuted, marginBottom: 6 }}>{preguntaAbierta}</label>
          <input
            value={respuesta}
            onChange={e => saveRespuesta(e.target.value)}
            placeholder={placeholder}
            style={{ width: '100%', boxSizing: 'border-box', border: `2px solid ${C.tealLight}`, borderRadius: 12, padding: '11px 12px', fontFamily: 'Nunito', fontSize: 14, fontWeight: 700, outline: 'none' }}
          />
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: allVisited ? C.green : C.textMuted }}>
          {allVisited ? '✓ Exploraste todas las opciones' : `Exploradas: ${visited.size} / ${normalized.length}`}
        </span>
        {!finalizada && !completada && (
          <button type="button" onClick={finalizar} disabled={!allVisited} style={btnP(allVisited ? C.teal : C.border)}>
            Finalizar actividad
          </button>
        )}
      </div>

      {(finalizada || completada) && <FeedbackBox ok msg={mensajeFinal} />}
    </div>
  )
}

// ── Selección múltiple ────────────────────────────────────────────────────────
function SeleccionMultiple({ pregunta, opciones, pista, estilo = 'lista', retroalimentacion, retroalimentacionError, onComplete, completada, maxIntentos = 2, primaryColor = C.pink }) {
  const [seleccionadas, setSeleccionadas] = useState(() => new Set())
  const [resultado, setResultado] = useState(null)
  const [intentos, setIntentos] = useState(0)
  const [showPista, setShowPista] = useState(false)
  const [resultadosChip, setResultadosChip] = useState({})
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
    if (estilo === 'chips') {
      if (resultadosChip[idx] === 'ok') return
      const correcta = !!opciones[idx]?.esCorrecta
      const nextResultados = { ...resultadosChip, [idx]: correcta ? 'ok' : 'no' }
      setResultadosChip(nextResultados)
      if (correcta) {
        const next = new Set(seleccionadas)
        next.add(idx)
        setSeleccionadas(next)
        const encontroTodas = correctas.length > 0 && correctas.every(correctIndex => next.has(correctIndex))
        if (encontroTodas) {
          setResultado('correct')
          if (!firedRef.current) {
            firedRef.current = true
            onCompleteRef.current({
              seleccionadas: [...next].map(index => opciones[index]?.texto || ''),
              correctas: correctas.map(index => opciones[index]?.texto || ''),
              seleccionadasIndices: [...next],
            }, true)
          }
        }
      } else {
        const nextIntentos = intentos + 1
        setIntentos(nextIntentos)
        if (nextIntentos >= maxIntentos) {
          setResultado('agotado')
          if (!firedRef.current) {
            firedRef.current = true
            onCompleteRef.current({
              seleccionadas: [...seleccionadas].map(index => opciones[index]?.texto || ''),
              correctas: correctas.map(index => opciones[index]?.texto || ''),
              seleccionadasIndices: [...seleccionadas],
            }, false)
          }
        }
      }
      return
    }
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
      {pista && (
        <div style={{ border: '2px solid #FDE047', background: '#FEFCE8', borderRadius: 12, color: '#854D0E', overflow: 'hidden' }}>
          <button type="button" onClick={() => setShowPista(value => !value)} style={{ width: '100%', border: 'none', background: 'transparent', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', color: 'inherit', fontFamily: 'Nunito', fontWeight: 800, cursor: 'pointer' }}>
            <span>💡 <span style={{ marginLeft: 8 }}>Pista:</span></span>
            <span style={{ fontSize: 12 }}>{showPista ? 'Ocultar pista ▲' : 'Ver pista ▼'}</span>
          </button>
          {showPista && <div style={{ padding: '0 14px 12px 42px', fontSize: 13, fontWeight: 700 }}>{pista}</div>}
        </div>
      )}
      {pregunta && <p style={{ fontSize: 18, fontWeight: 600, color: C.text, margin: 0, lineHeight: 1.5 }}>{pregunta}</p>}
      <p style={{ fontSize: 13, fontWeight: 700, color: C.textMuted, margin: 0 }}>
        {estilo === 'chips' ? 'Selecciona todas las palabras correctas.' : 'Marca todas las opciones correctas y luego verifica.'}
      </p>
      <div style={{ display: 'flex', flexDirection: estilo === 'chips' ? 'row' : 'column', flexWrap: estilo === 'chips' ? 'wrap' : 'nowrap', justifyContent: estilo === 'chips' ? 'center' : 'flex-start', gap: estilo === 'chips' ? 9 : 10 }}>
        {opciones.map((op, idx) => {
          const estado = estadoOpcion(idx)
          const ok = estado === 'ok'
          const bad = estado === 'no'
          const missed = estado === 'missed'
          const sel = estado === 'sel'
          const primaryLight = `${primaryColor}18`
          const bg = ok ? C.greenLight : bad ? C.redLight : missed ? '#FFF7ED' : sel ? primaryLight : '#fff'
          const border = ok ? C.green : bad ? C.red : missed ? '#F59E0B' : sel ? primaryColor : primaryLight
          const badgeBg = ok ? C.green : bad ? C.red : missed ? '#F59E0B' : sel ? primaryColor : primaryLight
          const badgeColor = ok || bad || missed || sel ? '#fff' : primaryColor
          if (estilo === 'chips') {
            const chipOk = resultadosChip[idx] === 'ok'
            const chipWrong = resultadosChip[idx] === 'no'
            return (
              <button key={idx} onClick={() => toggle(idx)} style={{
                padding: '8px 16px', borderRadius: 50,
                border: `2px solid ${chipOk ? C.green : chipWrong ? C.red : `${primaryColor}55`}`,
                background: chipOk ? C.greenLight : chipWrong ? C.redLight : `${primaryColor}0f`,
                color: chipOk ? C.green : chipWrong ? C.red : primaryColor,
                cursor: isLocked ? 'default' : 'pointer', fontFamily: 'Nunito',
                fontSize: 13, fontWeight: 800, textTransform: 'uppercase',
                transition: 'all 0.15s', transform: chipOk && !isLocked ? 'translateY(-2px)' : 'none',
                boxShadow: chipOk && !isLocked ? `0 3px 10px ${C.green}25` : 'none',
              }}>
                {chipOk ? '✓ ' : chipWrong ? '✗ ' : ''}{op.texto}
              </button>
            )
          }
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
                boxShadow: `0 2px 6px ${primaryColor}0f`,
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
        {estilo !== 'chips' && !isLocked && <button onClick={verificar} style={btnP(primaryColor)}>Verificar ✓</button>}
        {estilo !== 'chips' && resultado === 'wrong' && !isLocked && <button onClick={() => setResultado(null)} style={btnS}>↺ Revisar</button>}
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
function extractCompletionAnswers(texto) {
  const matches = [...String(texto || '').matchAll(/\[([^\]\n]+)\]|\{\{([^}\n]+)\}\}/g)]
  return matches.map(match => (match[1] ?? match[2] ?? '').trim()).filter(Boolean)
}

function CompletarPalabras({ texto, respuestas, onComplete, completada, maxIntentos = 2, primaryColor = C.pink }) {
  const detectedAnswers = extractCompletionAnswers(texto)
  const correctas = detectedAnswers.length > 0 ? detectedAnswers : respuestas
  const partes = String(texto || '').split(/(\[[^\]\n]+\]|\{\{[^}\n]+\}\})/g)
  const [valores, setValores] = useState(() => Array(correctas.length).fill(''))
  const [verificado, setVerificado] = useState(false)
  const [resultados, setResultados] = useState([])
  const [verificaciones, setVerificaciones] = useState(0)
  const [agotado, setAgotado] = useState(false)
  const [dropTarget, setDropTarget] = useState(null)
  const firedRef = useRef(false)
  const onCompleteRef = useRef(onComplete); onCompleteRef.current = onComplete

  function verificar() {
    const r = correctas.map((v, i) => String(valores[i] || '').trim() === String(v || '').trim())
    setResultados(r); setVerificado(true)
    if (r.every(Boolean)) {
      if (!firedRef.current) { firedRef.current = true; onCompleteRef.current({ respuestas: correctas.map((correcta, i) => ({ correcta, dada: valores[i] })) }, true) }
    } else {
      const n = verificaciones + 1; setVerificaciones(n)
      if (n >= maxIntentos && !firedRef.current) {
        firedRef.current = true; setAgotado(true)
        onCompleteRef.current({ respuestas: correctas.map((correcta, i) => ({ correcta, dada: valores[i] })) }, false)
      }
    }
  }
  function reiniciar() {
    if (agotado || completada) return
    setValores(Array(correctas.length).fill('')); setVerificado(false); setResultados([])
  }
  const allOk = verificado && resultados.every(Boolean)
  const isLocked = allOk || agotado || completada
  const restantes = maxIntentos - verificaciones
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {correctas.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {correctas.map((respuesta, index) => (
            <span
              key={`${respuesta}-${index}`}
              draggable={!isLocked}
              onDragStart={e => {
                e.dataTransfer.effectAllowed = 'copy'
                e.dataTransfer.setData('text/plain', respuesta)
              }}
              title="Arrastra esta palabra hasta un espacio"
              style={{ padding: '5px 12px', borderRadius: 50, border: `1.5px solid ${primaryColor}66`, background: `${primaryColor}10`, color: primaryColor, fontSize: 12, fontWeight: 800, cursor: isLocked ? 'default' : 'grab', userSelect: 'none' }}
            >
              {respuesta.toUpperCase()}
            </span>
          ))}
        </div>
      )}
      <p style={{ fontSize: 15, lineHeight: 3.2, color: C.text, fontWeight: 600, margin: 0, whiteSpace: 'pre-wrap' }}>
        {partes.map((parte, i) => {
          const isBlank = /^(\[[^\]\n]+\]|\{\{[^}\n]+\}\})$/.test(parte)
          if (!isBlank) return <span key={i}>{parte}</span>
          const answerIndex = partes.slice(0, i).filter(item => /^(\[[^\]\n]+\]|\{\{[^}\n]+\}\})$/.test(item)).length
          return <input
            key={i}
            value={valores[answerIndex] || ''}
            placeholder="…"
            onChange={e => { const v = [...valores]; v[answerIndex] = e.target.value; setValores(v) }}
            onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setDropTarget(answerIndex) }}
            onDragLeave={() => setDropTarget(current => current === answerIndex ? null : current)}
            onDrop={e => {
              e.preventDefault()
              const palabra = e.dataTransfer.getData('text/plain')
              if (palabra) {
                const v = [...valores]
                v[answerIndex] = palabra
                setValores(v)
                setVerificado(false)
                setResultados([])
              }
              setDropTarget(null)
            }}
            disabled={isLocked}
            style={{
              border: 'none',
              borderBottom: `2.5px solid ${!verificado ? primaryColor : resultados[answerIndex] ? C.green : C.red}`,
              padding: '0 6px', margin: '0 4px', height: 24, lineHeight: '22px',
              verticalAlign: 'baseline', transform: 'translateY(-2px)',
              fontFamily: 'Nunito', fontSize: '0.95em', fontWeight: 700,
              color: !verificado ? primaryColor : resultados[answerIndex] ? C.green : C.red,
              background: dropTarget === answerIndex ? `${primaryColor}18` : 'transparent',
              width: Math.max(72, Math.min(150, (correctas[answerIndex]?.length || 6) * 12)),
              outline: 'none', textAlign: 'center', borderRadius: '5px 5px 0 0',
            }}
          />
        })}
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {!isLocked && <button onClick={verificar} style={btnP(primaryColor)}>Verificar ✓</button>}
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
function normalizeSilabas(s) {
  return norm(s)
    .replace(/[‐‑‒–—−]/g, '-')
    .replace(/\s*-\s*/g, '-')
    .replace(/\s+/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}
function cleanCrosswordAnswer(s) {
  return String(s || '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-ZÑ]/g, '')
}

// ── Ordenar palabras ──────────────────────────────────────────────────────────
function mezclarIndices(total) {
  const indices = Array.from({ length: total }, (_, index) => index)
  if (total < 2) return indices
  const offset = 1 + Math.floor(Math.random() * (total - 1))
  return indices.map((_, index) => (index + offset) % total)
}

function OrdenarPalabras({ instruccion, pista, fraseCorrecta, palabras, textoArea = 'Tu oración:', onComplete, completada, maxIntentos = 2, primaryColor = C.teal }) {
  const correctas = palabras.length > 0 ? palabras : String(fraseCorrecta || '').trim().split(/\s+/).filter(Boolean)
  const wordsKey = JSON.stringify(correctas)
  const [ordenBanco, setOrdenBanco] = useState(() => mezclarIndices(correctas.length))
  const [seleccionadas, setSeleccionadas] = useState([])
  const [showPista, setShowPista] = useState(false)
  const [resultado, setResultado] = useState(null)
  const [intentos, setIntentos] = useState(0)
  const firedRef = useRef(false)
  const onCompleteRef = useRef(onComplete); onCompleteRef.current = onComplete

  useEffect(() => {
    const next = JSON.parse(wordsKey)
    setOrdenBanco(mezclarIndices(next.length))
    setSeleccionadas([])
    setResultado(null)
    setIntentos(0)
  }, [wordsKey])

  const isLocked = resultado === 'correcto' || resultado === 'agotado' || completada
  const disponibles = ordenBanco.filter(index => !seleccionadas.includes(index))
  const restantes = maxIntentos - intentos

  function seleccionar(index) {
    if (isLocked) return
    setSeleccionadas(prev => [...prev, index])
    setResultado(null)
  }

  function devolver(index) {
    if (isLocked) return
    setSeleccionadas(prev => prev.filter(item => item !== index))
    setResultado(null)
  }

  function verificar() {
    if (seleccionadas.length !== correctas.length || isLocked) return
    const ok = seleccionadas.every((wordIndex, position) => wordIndex === position)
    if (ok) {
      setResultado('correcto')
      if (!firedRef.current) {
        firedRef.current = true
        onCompleteRef.current({ frase: seleccionadas.map(index => correctas[index]).join(' '), palabras: correctas }, true)
      }
      return
    }
    const nextIntentos = intentos + 1
    setIntentos(nextIntentos)
    if (nextIntentos >= maxIntentos) {
      setResultado('agotado')
      if (!firedRef.current) {
        firedRef.current = true
        onCompleteRef.current({ frase: seleccionadas.map(index => correctas[index]).join(' '), palabras: correctas }, false)
      }
    } else {
      setResultado('incorrecto')
    }
  }

  function reiniciar() {
    if (isLocked) return
    setSeleccionadas([])
    setOrdenBanco(mezclarIndices(correctas.length))
    setResultado(null)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {pista && (
        <div style={{ border: '2px solid #FDE047', background: '#FEFCE8', borderRadius: 12, color: '#854D0E', overflow: 'hidden' }}>
          <button type="button" onClick={() => setShowPista(value => !value)} style={{ width: '100%', border: 'none', background: 'transparent', padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'inherit', fontFamily: 'Nunito', fontWeight: 800, cursor: 'pointer' }}>
            <span>💡 <span style={{ marginLeft: 8 }}>Pista:</span></span>
            <span style={{ fontSize: 12 }}>{showPista ? 'Ocultar pista ▲' : 'Ver pista ▼'}</span>
          </button>
          {showPista && <div style={{ padding: '0 14px 12px 42px', fontSize: 13, fontWeight: 700 }}>{pista}</div>}
        </div>
      )}
      {instruccion && <p style={{ margin: 0, color: C.text, fontSize: 15, fontWeight: 700, lineHeight: 1.5 }}>{instruccion}</p>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {disponibles.map(index => (
          <button key={index} type="button" onClick={() => seleccionar(index)} disabled={isLocked} style={{ padding: '8px 14px', borderRadius: 50, border: `2px solid ${primaryColor}55`, background: `${primaryColor}0f`, color: primaryColor, fontFamily: 'Nunito', fontSize: 13, fontWeight: 800, cursor: isLocked ? 'default' : 'pointer' }}>{correctas[index]}</button>
        ))}
      </div>
      <div>
        <div style={{ marginBottom: 6, color: C.textMuted, fontSize: 12, fontWeight: 800 }}>{textoArea}</div>
        <div style={{ minHeight: 54, padding: 10, display: 'flex', flexWrap: 'wrap', gap: 7, alignItems: 'center', border: `2px dashed ${primaryColor}55`, borderRadius: 12, background: '#fff' }}>
          {seleccionadas.map(index => (
            <button key={index} type="button" onClick={() => devolver(index)} disabled={isLocked} title="Haz clic para devolver esta palabra" style={{ padding: '7px 12px', borderRadius: 50, border: 'none', background: primaryColor, color: '#fff', fontFamily: 'Nunito', fontSize: 13, fontWeight: 800, cursor: isLocked ? 'default' : 'pointer' }}>{correctas[index]}</button>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {!isLocked && <button type="button" onClick={verificar} disabled={seleccionadas.length !== correctas.length} style={btnP(seleccionadas.length === correctas.length ? primaryColor : C.border)}>Verificar ✓</button>}
        {!isLocked && <button type="button" onClick={reiniciar} style={btnS}>↺ Reiniciar</button>}
        <AttemptsLeft restantes={restantes} max={maxIntentos} locked={isLocked} />
      </div>
      {resultado === 'correcto' && <FeedbackBox ok msg="¡Muy bien! Ordenaste correctamente la oración." />}
      {resultado === 'incorrecto' && <FeedbackBox ok={false} msg="El orden no es correcto. Inténtalo de nuevo." />}
      {resultado === 'agotado' && <FeedbackBox ok={false} msg="Intentos agotados. La actividad quedó registrada." />}
    </div>
  )
}

// ── Ordenar eventos ───────────────────────────────────────────────────────────
function OrdenarEventos({ instruccion, eventos, onComplete, completada, maxIntentos = 2 }) {
  const eventsKey = JSON.stringify(eventos)
  const [items, setItems] = useState(() => [...eventos].sort(() => Math.random() - 0.5))
  const [verificado, setVerificado] = useState(false)
  const [correcto, setCorrecto] = useState(false)
  const [verificaciones, setVerificaciones] = useState(0)
  const [agotado, setAgotado] = useState(false)
  const [draggingIndex, setDraggingIndex] = useState(null)
  const [dragOverIndex, setDragOverIndex] = useState(null)
  const firedRef = useRef(false)
  const onCompleteRef = useRef(onComplete); onCompleteRef.current = onComplete

  useEffect(() => {
    const nextEvents = JSON.parse(eventsKey)
    setItems([...nextEvents].sort(() => Math.random() - 0.5))
    setVerificado(false)
    setCorrecto(false)
    setVerificaciones(0)
    setAgotado(false)
    setDraggingIndex(null)
    setDragOverIndex(null)
    firedRef.current = false
  }, [eventsKey])

  function mover(idx, dir) {
    if (correcto || agotado || completada) return
    const arr = [...items], t = idx + dir
    if (t < 0 || t >= arr.length) return
    ;[arr[idx], arr[t]] = [arr[t], arr[idx]]; setItems(arr); setVerificado(false)
  }

  function soltarEn(targetIndex) {
    if (draggingIndex === null || draggingIndex === targetIndex || correcto || agotado || completada) {
      setDraggingIndex(null); setDragOverIndex(null)
      return
    }
    const next = [...items]
    const [moved] = next.splice(draggingIndex, 1)
    next.splice(targetIndex, 0, moved)
    setItems(next)
    setVerificado(false)
    setCorrecto(false)
    setDraggingIndex(null)
    setDragOverIndex(null)
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
          <div
            key={item.id || `${item.texto}-${idx}`}
            draggable={!isLocked}
            onDragStart={e => {
              setDraggingIndex(idx)
              e.dataTransfer.effectAllowed = 'move'
              e.dataTransfer.setData('text/plain', String(idx))
            }}
            onDragOver={e => {
              if (isLocked) return
              e.preventDefault()
              e.dataTransfer.dropEffect = 'move'
              setDragOverIndex(idx)
            }}
            onDragLeave={() => setDragOverIndex(current => current === idx ? null : current)}
            onDrop={e => { e.preventDefault(); soltarEn(idx) }}
            onDragEnd={() => { setDraggingIndex(null); setDragOverIndex(null) }}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
              background: isLocked ? C.greenLight : dragOverIndex === idx && draggingIndex !== idx ? '#fff' : C.blueLight,
              border: `2px ${dragOverIndex === idx && draggingIndex !== idx ? 'dashed' : 'solid'} ${isLocked ? C.green : C.blue}`,
              borderRadius: 10, fontWeight: 600, fontSize: 14, transition: 'all 0.2s',
              cursor: isLocked ? 'default' : 'grab', opacity: draggingIndex === idx ? 0.45 : 1,
              transform: dragOverIndex === idx && draggingIndex !== idx ? 'translateY(2px)' : 'none',
            }}
          >
            {!isLocked && <span title="Arrastrar" style={{ color: C.blue, fontSize: 18, lineHeight: 1, flexShrink: 0 }}>⠿</span>}
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
function EscribirCarta({ actividadId, destinatario, promptTexto, placeholder = 'Escribe aquí tu carta...', onComplete, completada }) {
  const key = `carta_${actividadId}`
  const [texto, setTexto] = useState(() => localStorage.getItem(key) || '')
  const [guardado, setGuardado] = useState(false)
  const saveTimer = useRef(null), onCompleteRef = useRef(onComplete); onCompleteRef.current = onComplete
  function handleChange(e) { const v = e.target.value; setTexto(v); setGuardado(false); if (saveTimer.current) clearTimeout(saveTimer.current); saveTimer.current = setTimeout(() => { localStorage.setItem(key, v); setGuardado(true) }, 500) }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {destinatario && <div style={{ background: C.orangeLight, border: `1px solid #ffcc80`, borderRadius: 12, padding: '10px 14px' }}><span style={{ fontSize: 13, fontWeight: 700, color: C.orange }}>Para: </span><span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{destinatario}</span></div>}
      {promptTexto && <p style={{ fontSize: 14, fontWeight: 600, color: C.textMuted, margin: 0, fontStyle: 'italic' }}>{promptTexto}</p>}
      <textarea value={texto} onChange={handleChange} placeholder={placeholder} style={{ width: '100%', minHeight: 150, padding: 14, boxSizing: 'border-box', border: `2px solid ${C.pinkLight}`, borderRadius: 12, fontFamily: 'Nunito', fontSize: 14, color: C.text, resize: 'vertical', outline: 'none', background: '#fff', lineHeight: 1.7 }} onFocus={e => { e.target.style.borderColor = C.pink }} onBlur={e => { e.target.style.borderColor = C.pinkLight }} />
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
function desordenarSinCoincidencias(pares) {
  if (pares.length < 2) return [...pares]
  const indexed = pares.map((par, index) => ({ par, index }))
  for (let attempt = 0; attempt < 30; attempt++) {
    const shuffled = [...indexed]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    if (shuffled.every((item, position) => item.index !== position)) {
      return shuffled.map(item => item.par)
    }
  }
  // Rotar siempre evita coincidencias y sirve como respaldo determinista.
  const offset = 1 + Math.floor(Math.random() * (pares.length - 1))
  return pares.map((_, index) => pares[(index + offset) % pares.length])
}

function Emparejar({ pares, instruccion, encabezadoIzquierda = 'Elemento', encabezadoDerecha = '¿Qué hace?', onComplete, completada, isMobile, maxIntentos = 2, primaryColor = C.blue }) {
  const pairKey = JSON.stringify(pares)
  const [derechaShuffled, setDerechaShuffled] = useState(() => desordenarSinCoincidencias(pares))
  const [selIzqIdx, setSelIzqIdx] = useState(null)
  const [matchedPairs, setMatchedPairs] = useState(() => new Set())
  const [wrongDerIdx, setWrongDerIdx] = useState(null)
  const [gameWon, setGameWon] = useState(completada)
  const [errores, setErrores] = useState(0)
  const wrongTimer = useRef(null)
  const firedRef = useRef(false)
  const onCompleteRef = useRef(onComplete); onCompleteRef.current = onComplete

  useEffect(() => {
    const nextPairs = JSON.parse(pairKey)
    setDerechaShuffled(desordenarSinCoincidencias(nextPairs))
    setSelIzqIdx(null)
    setMatchedPairs(new Set())
    setWrongDerIdx(null)
    setGameWon(completada)
    setErrores(0)
  }, [pairKey, completada])

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
      {instruccion && <p style={{ fontSize: 15, fontWeight: 700, color: C.text, lineHeight: 1.5, margin: 0 }}>{instruccion}</p>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: isMobile ? 8 : 14 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p style={{ fontSize: 11, fontWeight: 800, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, margin: '0 0 4px', textAlign: 'center' }}>{encabezadoIzquierda}</p>
          {pares.map((par, idx) => {
            const isMatched = matchedPairs.has(idx), isSel = selIzqIdx === idx
            return (
              <button key={idx} onClick={() => clickLeft(idx)} style={{
                padding: isMobile ? '10px 8px' : '12px 14px', borderRadius: 12,
                border: `2px solid ${isMatched ? C.green : isSel ? primaryColor : `${primaryColor}44`}`,
                background: isMatched ? C.greenLight : isSel ? `${primaryColor}18` : '#fff',
                color: isMatched ? C.green : isSel ? primaryColor : C.text,
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
          <p style={{ fontSize: 11, fontWeight: 800, color: C.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, margin: '0 0 4px', textAlign: 'center' }}>{encabezadoDerecha}</p>
          {derechaShuffled.map((par, sIdx) => {
            const pairIdx = derToPairIdx[sIdx]
            const isMatched = matchedPairs.has(pairIdx)
            const isWrong = wrongDerIdx === sIdx
            const isClickable = selIzqIdx !== null && !isMatched
            return (
              <button key={sIdx} onClick={() => clickRight(sIdx)} style={{
                padding: isMobile ? '10px 8px' : '12px 14px', borderRadius: 12,
                border: `2px solid ${isMatched ? C.green : isWrong ? C.red : isClickable ? primaryColor : `${primaryColor}44`}`,
                background: isMatched ? C.greenLight : isWrong ? C.redLight : isClickable ? `${primaryColor}18` : '#fff',
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
          Selecciona la descripción de <strong style={{ color: primaryColor }}>{pares[selIzqIdx]?.izquierda}</strong>
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
function IdentificarActividad({ instruccion, opciones, onComplete, completada, maxIntentos = 2, primaryColor = C.pink }) {
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
          const res = getRes(idx)
          const isSelected = sel.has(idx)
          const primaryLight = `${primaryColor}18`
          const primaryBorder = `${primaryColor}55`
          const borderCol = res === 'correct' ? C.green : res === 'wrong' ? C.red : res === 'missed' ? C.orange : primaryColor
          const bgCol = res === 'correct' ? C.greenLight : res === 'wrong' ? C.redLight : res === 'missed' ? C.orangeLight : isSelected ? primaryColor : primaryLight
          const textCol = res === 'correct' ? C.green : res === 'wrong' ? C.red : res === 'missed' ? C.orange : isSelected ? '#fff' : primaryColor
          return (
            <button key={idx} onClick={() => toggle(idx)} style={{
              flex: '1 1 130px', maxWidth: 180, padding: 14,
              border: `${isSelected && !isLocked ? 3 : 2}px solid ${isSelected || res ? borderCol : primaryBorder}`,
              background: bgCol, borderRadius: 10,
              cursor: isLocked ? 'default' : 'pointer',
              textAlign: 'center', fontFamily: 'Nunito', transition: 'all 0.2s',
              transform: isSelected && !isLocked ? 'translateY(-3px)' : 'none',
              boxShadow: isSelected && !isLocked ? `0 4px 12px ${primaryColor}44` : 'none',
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
          <button onClick={verificar} style={{ padding: '10px 24px', background: primaryColor, color: '#fff', border: 'none', borderRadius: 50, fontFamily: 'Nunito', fontWeight: 800, fontSize: 15, cursor: 'pointer' }}>
            Verificar ✓
          </button>
        )}
        {verificado && !isLocked && (
          <button onClick={reiniciar} style={{ padding: '10px 24px', background: 'transparent', color: primaryColor, border: `2px solid ${primaryColor}`, borderRadius: 50, fontFamily: 'Nunito', fontWeight: 800, fontSize: 15, cursor: 'pointer' }}>
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

// ── Línea de tiempo emocional ─────────────────────────────────────────────────
function LineaTiempoEmocional({
  instruccion, pista, momentos, retroalimentacion, retroalimentacionError,
  onComplete, completada, maxIntentos = 2, primaryColor = C.purple,
}) {
  const [selecciones, setSelecciones] = useState({})
  const [resultadosMomento, setResultadosMomento] = useState({})
  const [showPista, setShowPista] = useState(false)
  const [resultado, setResultado] = useState(null)
  const [intentos, setIntentos] = useState(0)
  const firedRef = useRef(false)
  const onCompleteRef = useRef(onComplete); onCompleteRef.current = onComplete
  const locked = resultado === 'correcto' || resultado === 'agotado' || completada

  function seleccionar(momentIndex, optionIndex) {
    if (locked || resultadosMomento[momentIndex] === 'correcto') return
    const esCorrecta = !!momentos[momentIndex]?.opciones?.[optionIndex]?.esCorrecta
    const nextSelecciones = { ...selecciones, [momentIndex]: optionIndex }
    const nextResultados = { ...resultadosMomento, [momentIndex]: esCorrecta ? 'correcto' : 'incorrecto' }
    setSelecciones(nextSelecciones)
    setResultadosMomento(nextResultados)
    const payload = {
      momentos: momentos.map((momento, index) => ({
        momento: momento.momento || momento.texto,
        seleccion: momento.opciones?.[nextSelecciones[index]]?.texto || '',
        esCorrecta: nextResultados[index] === 'correcto',
      })),
    }
    const todasCorrectas = momentos.length > 0 && momentos.every((_, index) => nextResultados[index] === 'correcto')
    if (todasCorrectas) {
      setResultado('correcto')
      if (!firedRef.current) { firedRef.current = true; onCompleteRef.current(payload, true) }
      return
    }
    if (!esCorrecta) {
      const nextIntentos = intentos + 1
      setIntentos(nextIntentos)
      if (nextIntentos >= maxIntentos) {
        setResultado('agotado')
        if (!firedRef.current) { firedRef.current = true; onCompleteRef.current(payload, false) }
      }
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {pista && (
        <div style={{ border: '2px solid #FDE047', background: '#FEFCE8', borderRadius: 12, color: '#854D0E', overflow: 'hidden' }}>
          <button type="button" onClick={() => setShowPista(value => !value)} style={{ width: '100%', border: 'none', background: 'transparent', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', color: 'inherit', fontFamily: 'Nunito', fontWeight: 800, cursor: 'pointer' }}>
            <span>💡 <span style={{ marginLeft: 8 }}>Pista:</span></span>
            <span style={{ fontSize: 12 }}>{showPista ? 'Ocultar pista ▲' : 'Ver pista ▼'}</span>
          </button>
          {showPista && <div style={{ padding: '0 14px 12px 42px', fontSize: 13, fontWeight: 700 }}>{pista}</div>}
        </div>
      )}
      {instruccion && <p style={{ margin: 0, color: C.text, fontSize: 15, fontWeight: 700 }}>{instruccion}</p>}
      {momentos.map((momento, momentIndex) => (
        <div key={momento.id || momentIndex} style={{ border: `2px solid ${primaryColor}44`, borderRadius: 12, padding: '11px 13px', background: '#fff' }}>
          <div style={{ marginBottom: 9, color: C.textMuted, fontSize: 13, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            {momento.emoji || '●'} {momento.momento || momento.texto || `Momento ${momentIndex + 1}`}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
            {(momento.opciones || []).map((opcion, optionIndex) => {
              const selected = selecciones[momentIndex] === optionIndex
              const momentResult = resultadosMomento[momentIndex]
              const reveal = resultado === 'agotado' || resultado === 'correcto'
              const color = opcion.color || primaryColor
              const correct = (reveal && opcion.esCorrecta) || (selected && momentResult === 'correcto')
              const wrong = selected && momentResult === 'incorrecto'
              return (
                <button key={opcion.id || optionIndex} type="button" onClick={() => seleccionar(momentIndex, optionIndex)} disabled={locked || momentResult === 'correcto'} style={{
                  padding: '6px 12px', borderRadius: 50,
                  border: `2px solid ${correct ? C.green : wrong ? C.red : selected ? color : `${color}77`}`,
                  background: correct ? C.greenLight : wrong ? C.redLight : selected ? `${color}20` : '#fff',
                  color: correct ? C.green : wrong ? C.red : color, fontFamily: 'Nunito', fontSize: 12,
                  fontWeight: 800, cursor: locked || momentResult === 'correcto' ? 'default' : 'pointer',
                }}>
                  {correct ? '✓ ' : wrong ? '✗ ' : ''}{opcion.emoji || '🙂'} {opcion.texto || `Emoción ${optionIndex + 1}`}
                </button>
              )
            })}
          </div>
          {resultadosMomento[momentIndex] === 'correcto' && <div style={{ marginTop: 8, color: C.green, fontSize: 12, fontWeight: 800 }}>✓ ¡Correcto!</div>}
          {resultadosMomento[momentIndex] === 'incorrecto' && !locked && <div style={{ marginTop: 8, color: C.red, fontSize: 12, fontWeight: 800 }}>✗ No es esa emoción. Inténtalo nuevamente.</div>}
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <AttemptsLeft restantes={maxIntentos - intentos} max={maxIntentos} locked={locked} />
      </div>
      {resultado === 'correcto' && <FeedbackBox ok msg={retroalimentacion || '¡Muy bien! Reconociste el viaje emocional.'} />}
      {resultado === 'incorrecto' && <FeedbackBox ok={false} msg={retroalimentacionError || 'Revisa cómo se siente el personaje en cada momento.'} />}
      {resultado === 'agotado' && <FeedbackBox ok={false} msg="Intentos agotados. Las respuestas correctas están marcadas." />}
    </div>
  )
}

// ── Reflexión personal: selección libre + respuesta abierta ──────────────────
function ReflexionPersonal({
  actividadId, instruccion, opciones, preguntaAbierta,
  placeholder = 'Escribe aquí tu reflexión…', textoBoton = 'Guardar reflexión',
  onComplete, completada, primaryColor = C.purple,
}) {
  const storageKey = `reflexion_personal_${actividadId}`
  const [seleccionadas, setSeleccionadas] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem(`${storageKey}_seleccionadas`)) || []) } catch { return new Set() }
  })
  const [respuesta, setRespuesta] = useState(() => localStorage.getItem(`${storageKey}_respuesta`) || '')
  const [guardada, setGuardada] = useState(completada)
  const firedRef = useRef(false)
  const onCompleteRef = useRef(onComplete); onCompleteRef.current = onComplete
  const primaryLight = `${primaryColor}18`
  const primaryBorder = `${primaryColor}55`

  function toggle(index) {
    if (guardada || completada) return
    setSeleccionadas(prev => {
      const next = new Set(prev)
      next.has(index) ? next.delete(index) : next.add(index)
      localStorage.setItem(`${storageKey}_seleccionadas`, JSON.stringify([...next]))
      return next
    })
  }

  function cambiarRespuesta(value) {
    if (guardada || completada) return
    setRespuesta(value)
    localStorage.setItem(`${storageKey}_respuesta`, value)
  }

  function guardar() {
    if (guardada || completada || firedRef.current || (!respuesta.trim() && seleccionadas.size === 0)) return
    firedRef.current = true
    setGuardada(true)
    onCompleteRef.current({
      seleccionadas: [...seleccionadas].map(index => opciones[index]?.texto || ''),
      seleccionadasIndices: [...seleccionadas],
      respuesta: respuesta.trim(),
    }, null)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {instruccion && <p style={{ fontSize: 16, fontWeight: 700, color: C.text, margin: 0, lineHeight: 1.5 }}>{instruccion}</p>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
        {opciones.map((op, index) => {
          const selected = seleccionadas.has(index)
          return (
            <button key={op.id || index} type="button" onClick={() => toggle(index)} disabled={guardada || completada} style={{
              flex: '1 1 125px', maxWidth: 170, minHeight: 92, padding: '12px 10px',
              border: `2px solid ${selected ? primaryColor : primaryBorder}`, borderRadius: 14,
              background: selected ? primaryColor : primaryLight, color: selected ? '#fff' : primaryColor,
              cursor: guardada || completada ? 'default' : 'pointer', fontFamily: 'Nunito', transition: 'all 0.18s',
              transform: selected ? 'translateY(-2px)' : 'none', boxShadow: selected ? `0 4px 12px ${primaryColor}35` : 'none',
            }}>
              <span style={{ display: 'block', fontSize: 30, marginBottom: 7 }}>{op.icono || op.emoji || '✨'}</span>
              <span style={{ fontSize: 13, fontWeight: 800, lineHeight: 1.3 }}>{op.texto || `Opción ${index + 1}`}</span>
            </button>
          )
        })}
      </div>
      {preguntaAbierta && (
        <div>
          <label style={{ display: 'block', marginBottom: 7, color: primaryColor, fontSize: 14, fontWeight: 800, fontStyle: 'italic' }}>{preguntaAbierta}</label>
          <textarea value={respuesta} onChange={e => cambiarRespuesta(e.target.value)} disabled={guardada || completada} placeholder={placeholder} style={{
            width: '100%', minHeight: 90, boxSizing: 'border-box', resize: 'vertical', padding: '12px 14px',
            borderRadius: 12, border: `2px solid ${primaryBorder}`, background: '#fff', color: C.text,
            fontFamily: 'Nunito', fontSize: 14, outlineColor: primaryColor,
          }} />
        </div>
      )}
      {!guardada && !completada && (
        <div><button type="button" onClick={guardar} disabled={!respuesta.trim() && seleccionadas.size === 0} style={btnP((respuesta.trim() || seleccionadas.size > 0) ? primaryColor : C.border)}>{textoBoton}</button></div>
      )}
      {(guardada || completada) && <FeedbackBox ok msg="Tu reflexión quedó guardada." />}
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
