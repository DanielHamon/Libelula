import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getActividad } from '../services/libros.service'
import { isActividadCompleta, marcarCompleta } from '../services/progreso.service'
import Sidebar from '../components/Sidebar'
import { useWindowWidth } from '../hooks/useWindowWidth'

const C = {
  primary: '#2563EB', primaryLight: '#DBEAFE',
  success: '#16A34A', successLight: '#DCFCE7',
  warning: '#F59E0B', warningLight: '#FEF3C7',
  text: '#1F2937', textLight: '#6B7280', border: '#E5E7EB', bg: '#F8FAFC',
}

// ── Word search data ──────────────────────────────────────────────────────────
const PALABRAS = ['FELIZ','AMIGOS','JUGAR','FAMILIA','AMOR','ALEGRE','SONRISA','CORAZON']

function generateGrid(palabras, size) {
  const grid = Array.from({ length: size }, () => Array(size).fill(''))
  const dirs = [[0,1],[0,-1],[1,0],[-1,0],[1,1]]

  for (const word of palabras) {
    if (word.length > size) continue
    let placed = false
    for (let attempt = 0; attempt < 300 && !placed; attempt++) {
      const [dr, dc] = dirs[Math.floor(Math.random() * dirs.length)]
      const minR = dr < 0 ? word.length - 1 : 0
      const maxR = dr > 0 ? size - word.length : size - 1
      const minC = dc < 0 ? word.length - 1 : 0
      const maxC = dc > 0 ? size - word.length : size - 1
      if (minR > maxR || minC > maxC) continue
      const r0 = minR + Math.floor(Math.random() * (maxR - minR + 1))
      const c0 = minC + Math.floor(Math.random() * (maxC - minC + 1))
      let ok = true
      for (let i = 0; i < word.length && ok; i++) {
        const cell = grid[r0 + dr * i][c0 + dc * i]
        if (cell !== '' && cell !== word[i]) ok = false
      }
      if (ok) {
        for (let i = 0; i < word.length; i++) grid[r0 + dr * i][c0 + dc * i] = word[i]
        placed = true
      }
    }
  }

  const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++)
      if (!grid[r][c]) grid[r][c] = ALPHA[Math.floor(Math.random() * 26)]

  return grid
}

function linePath(a, b) {
  const dr = b.r - a.r, dc = b.c - a.c
  const steps = Math.max(Math.abs(dr), Math.abs(dc))
  if (steps === 0) return [a]
  const sr = dr / steps, sc = dc / steps
  if (Math.abs(sr) > 0 && Math.abs(sr) < 1) return null
  if (Math.abs(sc) > 0 && Math.abs(sc) < 1) return null
  const path = []
  for (let i = 0; i <= steps; i++) path.push({ r: a.r + Math.round(sr * i), c: a.c + Math.round(sc * i) })
  return path
}
function matchWord(path, palabras, grid) {
  if (!path || path.length < 2) return null
  const fwd = path.map(p => grid[p.r][p.c]).join('')
  const rev = fwd.split('').reverse().join('')
  return palabras.find(w => w === fwd || w === rev) || null
}
function cellKey(r, c) { return `${r},${c}` }
function cellFromPoint(x, y) {
  const el = document.elementFromPoint(x, y)
  if (!el) return null
  const cell = el.closest('[data-row]')
  if (!cell) return null
  return { r: parseInt(cell.dataset.row, 10), c: parseInt(cell.dataset.col, 10) }
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Actividad() {
  const { libroId, unidadId, actividadId } = useParams()
  const navigate = useNavigate()
  const width = useWindowWidth()
  const isMobile = width < 768

  const [actividad, setActividad] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [completada, setCompletada] = useState(false)

  useEffect(() => { cargarActividad() }, [actividadId])

  async function cargarActividad() {
    setCargando(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const [actData, completadaResult] = await Promise.all([
        getActividad(actividadId),
        user ? isActividadCompleta(user.id, actividadId) : Promise.resolve(false),
      ])
      if (actData) setActividad(actData)
      setCompletada(completadaResult)
    } catch (err) { console.error(err) }
    finally { setCargando(false) }
  }

  async function guardarProgreso() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await marcarCompleta(user.id, libroId, actividadId)
    setCompletada(true)
  }

  const subtitulos = {
    sopaLetras: 'Encuentra las palabras escondidas. Arrastra para seleccionar.',
    colorear: 'Usa el lápiz para colorear el dibujo.',
  }

  const pad = isMobile ? '16px' : '24px 32px'

  if (cargando) return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'Nunito', background: C.bg }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', paddingTop: isMobile ? 56 : 0 }}>
        <Spinner />
      </div>
    </div>
  )

  const tipo = actividad?.tipo

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'Nunito', background: C.bg }}>
      <Sidebar />
      <div style={{ flex: 1, overflowY: 'auto', paddingTop: isMobile ? 56 : 0 }}>
        <div style={{ padding: pad }}>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
            <button onClick={() => navigate(`/libro/${libroId}/unidad/${unidadId}`)} style={{
              background: 'none', border: 'none', fontSize: 14, color: C.primary,
              fontWeight: 700, cursor: 'pointer', fontFamily: 'Nunito',
              display: 'flex', alignItems: 'center', gap: 6, padding: 0,
            }}>← Volver a la unidad</button>
            {completada && (
              <span style={{
                background: C.successLight, color: C.success, fontSize: 13, fontWeight: 700,
                padding: '6px 14px', borderRadius: 20, display: 'flex', alignItems: 'center', gap: 6,
              }}>✅ Completada</span>
            )}
          </div>

          <h1 style={{ fontSize: isMobile ? 18 : 22, fontWeight: 800, color: C.text, marginBottom: 4, marginTop: 0 }}>
            {actividad?.titulo || 'Actividad'}
          </h1>
          <p style={{ fontSize: 13, color: C.textLight, marginBottom: 20, marginTop: 0 }}>
            {subtitulos[tipo] || ''}
          </p>

          {tipo === 'sopaLetras' && (
            <SopaLetras
              key={actividadId}
              isMobile={isMobile}
              onComplete={guardarProgreso}
              alreadyComplete={completada}
              palabras={actividad?.palabras ?? PALABRAS}
              numPalabras={actividad?.numPalabras ?? actividad?.palabras?.length ?? PALABRAS.length}
              espacio={Math.min(Math.max(actividad?.espacio ?? 10, 5), 12)}
            />
          )}
          {tipo === 'colorear' && (
            <ColorearActividad
              imagenUrl={actividad?.imagenUrl}
              actividadId={actividadId}
              isMobile={isMobile}
              onComplete={guardarProgreso}
              alreadyComplete={completada}
            />
          )}
        </div>
      </div>
    </div>
  )
}

// ── Coloring activity ─────────────────────────────────────────────────────────
const CANVAS_SIZE = 800
const PRESET_COLORS = ['#EF4444', '#F97316', '#22C55E', '#3B82F6', '#A855F7']
const BRUSH_SIZES = [{ label: 'Fino', size: 4 }, { label: 'Normal', size: 11 }, { label: 'Grueso', size: 26 }]
const secTitle = { fontSize: 11, fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.6, margin: '0 0 8px' }

function ColorearActividad({ imagenUrl, actividadId, isMobile, onComplete, alreadyComplete }) {
  const canvasRef = useRef(null)
  const [tool, setTool] = useState('pencil')
  const [brushSize, setBrushSize] = useState(11)
  const [color, setColor] = useState('#EF4444')
  const [customColor, setCustomColor] = useState('#FF69B4')
  const [undoStack, setUndoStack] = useState([])
  const [saveStatus, setSaveStatus] = useState(null)

  const isDrawingRef = useRef(false)
  const lastPosRef = useRef(null)
  const hasCompletedRef = useRef(alreadyComplete)
  const onCompleteRef = useRef(onComplete)
  const toolRef = useRef(tool)
  const brushSizeRef = useRef(brushSize)
  const colorRef = useRef(color)
  const saveTimerRef = useRef(null)

  onCompleteRef.current = onComplete
  toolRef.current = tool
  brushSizeRef.current = brushSize
  colorRef.current = color

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE)
    const savedData = localStorage.getItem(`colorear_${actividadId}`)
    if (savedData) {
      const saved = new Image()
      saved.onload = () => ctx.drawImage(saved, 0, 0)
      saved.src = savedData
    }
  }, [actividadId])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const prevent = e => e.preventDefault()
    canvas.addEventListener('touchstart', prevent, { passive: false })
    canvas.addEventListener('touchmove', prevent, { passive: false })
    return () => {
      canvas.removeEventListener('touchstart', prevent)
      canvas.removeEventListener('touchmove', prevent)
    }
  }, [])

  useEffect(() => {
    function onUp() { if (isDrawingRef.current) stopDrawing() }
    document.addEventListener('mouseup', onUp)
    document.addEventListener('touchend', onUp)
    return () => {
      document.removeEventListener('mouseup', onUp)
      document.removeEventListener('touchend', onUp)
    }
  }, [])

  function getPos(e) {
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const sx = CANVAS_SIZE / rect.width, sy = CANVAS_SIZE / rect.height
    const src = e.touches ? e.touches[0] : e
    return { x: (src.clientX - rect.left) * sx, y: (src.clientY - rect.top) * sy }
  }

  function startDraw(e) {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    setUndoStack(prev => [...prev.slice(-19), ctx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE)])
    isDrawingRef.current = true
    const pos = getPos(e)
    lastPosRef.current = pos
    const sz = toolRef.current === 'eraser' ? brushSizeRef.current * 2.5 : brushSizeRef.current
    ctx.beginPath()
    ctx.arc(pos.x, pos.y, sz / 2, 0, Math.PI * 2)
    if (toolRef.current === 'eraser') {
      ctx.save(); ctx.globalCompositeOperation = 'destination-out'
      ctx.fillStyle = 'rgba(0,0,0,1)'; ctx.fill(); ctx.restore()
    } else {
      ctx.fillStyle = colorRef.current; ctx.fill()
    }
  }

  function draw(e) {
    if (!isDrawingRef.current) return
    const ctx = canvasRef.current.getContext('2d')
    const pos = getPos(e)
    const sz = toolRef.current === 'eraser' ? brushSizeRef.current * 2.5 : brushSizeRef.current
    ctx.beginPath()
    ctx.moveTo(lastPosRef.current.x, lastPosRef.current.y)
    ctx.lineTo(pos.x, pos.y)
    ctx.lineWidth = sz; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    if (toolRef.current === 'eraser') {
      ctx.save(); ctx.globalCompositeOperation = 'destination-out'
      ctx.strokeStyle = 'rgba(0,0,0,1)'; ctx.stroke(); ctx.restore()
    } else {
      ctx.strokeStyle = colorRef.current; ctx.stroke()
    }
    lastPosRef.current = pos
  }

  function stopDrawing() {
    if (!isDrawingRef.current) return
    isDrawingRef.current = false
    triggerSave()
    if (!hasCompletedRef.current) {
      hasCompletedRef.current = true
      onCompleteRef.current()
    }
  }

  function triggerSave() {
    setSaveStatus('saving')
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      const dataUrl = canvasRef.current.toDataURL('image/png')
      localStorage.setItem(`colorear_${actividadId}`, dataUrl)
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus(null), 2000)
    }, 80)
  }

  function undo() {
    if (undoStack.length === 0) return
    const stack = [...undoStack]
    const snapshot = stack.pop()
    setUndoStack(stack)
    canvasRef.current.getContext('2d').putImageData(snapshot, 0, 0)
    triggerSave()
  }

  const canvasArea = isMobile ? '100%' : 'min(calc(100vh - 190px), calc(100vw - 520px))'
  const activeColor = tool === 'pencil' ? color : null

  return (
    <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 16, alignItems: 'flex-start', width: '100%' }}>
      <div style={{
        position: 'relative', flexShrink: 0, width: canvasArea, aspectRatio: '1 / 1',
        borderRadius: 20, overflow: 'hidden',
        border: `1px solid ${C.border}`, boxShadow: '0 2px 8px rgba(0,0,0,0.07)',
        background: '#fff',
      }}>
        <canvas
          ref={canvasRef}
          width={CANVAS_SIZE} height={CANVAS_SIZE}
          style={{ width: '100%', height: '100%', display: 'block', cursor: tool === 'eraser' ? 'cell' : 'crosshair', touchAction: 'none' }}
          onMouseDown={startDraw}
          onMouseMove={draw}
          onTouchStart={startDraw}
          onTouchMove={draw}
        />
        {imagenUrl && (
          <img src={imagenUrl} alt="" draggable={false} style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            objectFit: 'fill', pointerEvents: 'none', userSelect: 'none',
            mixBlendMode: 'multiply',
          }} />
        )}
      </div>

      <div style={{
        background: '#fff', borderRadius: 20, padding: '20px 18px',
        border: `1px solid ${C.border}`, boxShadow: '0 2px 8px rgba(0,0,0,0.07)',
        width: isMobile ? '100%' : 200, flexShrink: 0,
      }}>
        <p style={secTitle}>Lápiz</p>
        <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
          {BRUSH_SIZES.map(b => (
            <button key={b.size} onClick={() => { setBrushSize(b.size); setTool('pencil') }} style={{
              flex: 1, padding: '8px 2px', borderRadius: 10, border: '2px solid',
              borderColor: tool === 'pencil' && brushSize === b.size ? C.primary : C.border,
              background: tool === 'pencil' && brushSize === b.size ? C.primaryLight : '#F9FAFB',
              color: tool === 'pencil' && brushSize === b.size ? C.primary : C.textLight,
              fontFamily: 'Nunito', fontWeight: 700, fontSize: 11, cursor: 'pointer',
            }}>{b.label}</button>
          ))}
        </div>

        <p style={secTitle}>Colores</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7, marginBottom: 20 }}>
          {PRESET_COLORS.map(c => (
            <button key={c} onClick={() => { setColor(c); setTool('pencil') }} style={{
              width: '100%', aspectRatio: '1 / 1', borderRadius: 10, background: c,
              border: `3px solid ${activeColor === c ? '#111' : 'transparent'}`,
              cursor: 'pointer', transition: 'border-color 0.1s',
              boxShadow: activeColor === c ? `0 0 0 2px #fff inset` : 'none',
            }} />
          ))}
          <label title="Color personalizado" onClick={() => { setColor(customColor); setTool('pencil') }} style={{
            width: '100%', aspectRatio: '1 / 1', borderRadius: 10, cursor: 'pointer',
            background: 'conic-gradient(red 0%,yellow 17%,lime 33%,cyan 50%,blue 67%,magenta 83%,red 100%)',
            border: `3px solid ${activeColor === customColor ? '#111' : 'transparent'}`,
            position: 'relative', overflow: 'hidden', display: 'block',
          }}>
            <input type="color" value={customColor}
              onChange={e => { setCustomColor(e.target.value); setColor(e.target.value); setTool('pencil') }}
              style={{ opacity: 0, position: 'absolute', inset: 0, width: '100%', height: '100%', cursor: 'pointer' }} />
          </label>
        </div>

        <p style={secTitle}>Herramientas</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
          <button onClick={() => setTool('eraser')} style={{
            width: '100%', padding: '10px 8px', borderRadius: 10, border: '2px solid',
            borderColor: tool === 'eraser' ? C.warning : C.border,
            background: tool === 'eraser' ? C.warningLight : '#F9FAFB',
            color: tool === 'eraser' ? '#92400E' : C.textLight,
            fontFamily: 'Nunito', fontWeight: 700, fontSize: 13, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>◻ Borrador</button>
          <button onClick={undo} disabled={undoStack.length === 0} style={{
            width: '100%', padding: '10px 8px', borderRadius: 10, border: `2px solid ${C.border}`,
            background: undoStack.length === 0 ? '#F9FAFB' : '#fff',
            color: undoStack.length === 0 ? '#D1D5DB' : C.text,
            fontFamily: 'Nunito', fontWeight: 700, fontSize: 13,
            cursor: undoStack.length === 0 ? 'default' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          }}>↩ Deshacer</button>
        </div>

        <div style={{
          fontSize: 12, borderTop: `1px solid ${C.border}`, paddingTop: 10,
          color: saveStatus === 'saved' ? C.success : C.textLight,
          display: 'flex', alignItems: 'center', gap: 5,
        }}>
          {saveStatus === 'saving' ? '💾 Guardando...' : saveStatus === 'saved' ? '✓ Guardado' : '💾 Autoguardado activo'}
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

  const isSelectingRef = useRef(false)
  const startCellRef = useRef(null)
  const currentCellRef = useRef(null)
  const foundWordsRef = useRef(foundWords)
  const foundCellKeysRef = useRef(foundCellKeys)
  const onCompleteRef = useRef(onComplete)
  const gameWonRef = useRef(gameWon)
  const palabrasRef = useRef(palabras)
  const numPalabrasRef = useRef(numPalabras)
  const gridRef = useRef(grid)
  const wrongTimerRef = useRef(null)
  const gridInnerRef = useRef(null)
  const [letterSize, setLetterSize] = useState(20)

  useEffect(() => {
    const el = gridInnerRef.current
    if (!el) return
    const obs = new ResizeObserver(([entry]) => {
      setLetterSize(Math.floor(entry.contentRect.width / espacio * 0.8))
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [espacio])

  isSelectingRef.current = isSelecting
  startCellRef.current = startCell
  currentCellRef.current = currentCell
  foundWordsRef.current = foundWords
  foundCellKeysRef.current = foundCellKeys
  onCompleteRef.current = onComplete
  gameWonRef.current = gameWon
  palabrasRef.current = palabras
  numPalabrasRef.current = numPalabras

  const selPath = startCell && currentCell ? linePath(startCell, currentCell) : null

  const commitSelection = useCallback(() => {
    if (!isSelectingRef.current) return
    const path = startCellRef.current && currentCellRef.current
      ? linePath(startCellRef.current, currentCellRef.current) : null
    setIsSelecting(false)
    isSelectingRef.current = false
    if (!path || path.length < 2) { setStartCell(null); setCurrentCell(null); return }
    const matched = matchWord(path, palabrasRef.current, gridRef.current)
    if (matched && !foundWordsRef.current.has(matched)) {
      const newWords = new Set(foundWordsRef.current)
      newWords.add(matched)
      const newKeys = new Set(foundCellKeysRef.current)
      path.forEach(p => newKeys.add(cellKey(p.r, p.c)))
      setFoundWords(newWords); setFoundCellKeys(newKeys)
      foundWordsRef.current = newWords; foundCellKeysRef.current = newKeys
      if (newWords.size >= numPalabrasRef.current && !gameWonRef.current) {
        gameWonRef.current = true; setGameWon(true); onCompleteRef.current()
      }
    } else if (!matched) {
      setWrongPath(path.map(p => cellKey(p.r, p.c)))
      if (wrongTimerRef.current) clearTimeout(wrongTimerRef.current)
      wrongTimerRef.current = setTimeout(() => setWrongPath(null), 600)
    }
    setStartCell(null); setCurrentCell(null)
  }, [])

  useEffect(() => {
    function onMouseUp() { commitSelection() }
    function onTouchEnd() { commitSelection() }
    document.addEventListener('mouseup', onMouseUp)
    document.addEventListener('touchend', onTouchEnd)
    return () => {
      document.removeEventListener('mouseup', onMouseUp)
      document.removeEventListener('touchend', onTouchEnd)
      if (wrongTimerRef.current) clearTimeout(wrongTimerRef.current)
    }
  }, [commitSelection])

  function onCellMouseDown(r, c) {
    if (gameWonRef.current) return
    setIsSelecting(true); setStartCell({ r, c }); setCurrentCell({ r, c })
  }
  function onCellMouseEnter(r, c) {
    if (!isSelectingRef.current) return
    setCurrentCell({ r, c })
  }
  function onTouchStart(e, r, c) {
    if (gameWonRef.current) return
    e.preventDefault(); setIsSelecting(true); setStartCell({ r, c }); setCurrentCell({ r, c })
  }
  function onTouchMove(e) {
    e.preventDefault()
    if (!isSelectingRef.current) return
    const touch = e.touches[0]
    const cell = cellFromPoint(touch.clientX, touch.clientY)
    if (cell) setCurrentCell(cell)
  }

  function cellColor(r, c) {
    const k = cellKey(r, c)
    const inSel = selPath && selPath.some(p => p.r === r && p.c === c)
    const inWrong = wrongPath && wrongPath.includes(k)
    if (inWrong) return { bg: '#FEE2E2', text: '#DC2626' }
    if (foundCellKeys.has(k)) return { bg: '#DCFCE7', text: '#16A34A' }
    if (inSel) return { bg: '#DBEAFE', text: '#1D4ED8' }
    return { bg: '#fff', text: C.text }
  }

  const gridSize = isMobile ? '100%' : 'min(calc(100vh - 190px), calc(100vw - 520px))'

  return (
    <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: 'flex-start', gap: 16, width: '100%' }}>
      <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12, width: isMobile ? '100%' : 'auto' }}>
        {gameWon && (
          <div style={{
            background: 'linear-gradient(135deg, #16A34A, #22C55E)', color: '#fff',
            borderRadius: 16, padding: '12px 20px', fontSize: 15, fontWeight: 800, textAlign: 'center',
            boxShadow: '0 4px 16px rgba(22,163,74,0.3)', width: '100%', boxSizing: 'border-box',
          }}>¡Felicidades! Encontraste todas las palabras 🎉</div>
        )}
        <div style={{
          background: '#fff', borderRadius: 20, padding: isMobile ? 10 : 14,
          border: `1px solid ${C.border}`, boxShadow: '0 2px 8px rgba(0,0,0,0.07)',
          userSelect: 'none', WebkitUserSelect: 'none',
          width: gridSize, boxSizing: 'border-box',
        }} onTouchMove={onTouchMove}>
          <div ref={gridInnerRef} style={{ display: 'grid', gridTemplateColumns: `repeat(${espacio}, 1fr)`, gridTemplateRows: `repeat(${espacio}, 1fr)`, gap: isMobile ? 2 : 3, width: '100%', aspectRatio: '1 / 1' }}>
            {grid.flat().map((letter, i) => {
              const r = Math.floor(i / espacio), c = i % espacio
              const { bg, text: textCol } = cellColor(r, c)
              return (
                <div key={i} data-row={r} data-col={c}
                  onMouseDown={() => onCellMouseDown(r, c)}
                  onMouseEnter={() => onCellMouseEnter(r, c)}
                  onTouchStart={e => onTouchStart(e, r, c)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: letterSize, fontWeight: 700,
                    background: bg, color: textCol, borderRadius: 5,
                    cursor: 'default', transition: 'background 0.12s, color 0.12s',
                    border: `1px solid ${C.border}`,
                  }}>{letter}</div>
              )
            })}
          </div>
        </div>
      </div>

      <div style={{
        background: '#fff', borderRadius: 20, padding: isMobile ? '16px 14px' : '20px 18px',
        border: `1px solid ${C.border}`, boxShadow: '0 2px 8px rgba(0,0,0,0.07)',
        width: isMobile ? '100%' : 200, flexShrink: 0,
      }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: C.textLight, textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 0 12px' }}>
          Palabras
        </p>
        <div style={{ display: 'flex', flexDirection: isMobile ? 'row' : 'column', flexWrap: 'wrap', gap: 7 }}>
          {palabras.map(word => {
            const found = foundWords.has(word)
            return (
              <span key={word} style={{
                padding: '6px 12px', borderRadius: 10, fontSize: 13, fontWeight: 700,
                background: found ? C.successLight : '#F3F4F6',
                color: found ? C.success : C.textLight,
                textDecoration: found ? 'line-through' : 'none',
                transition: 'background 0.2s, color 0.2s',
                display: 'flex', alignItems: 'center', gap: 4,
              }}>{found ? '✓ ' : ''}{word}</span>
            )
          })}
        </div>
        <div style={{ marginTop: 14, fontSize: 12, color: C.textLight, borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
          {foundWords.size} / {numPalabras} encontradas
        </div>
      </div>
    </div>
  )
}

function Spinner() {
  return (
    <>
      <div style={{ width: 36, height: 36, border: '4px solid #2563EB', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </>
  )
}
