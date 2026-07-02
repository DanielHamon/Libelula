import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import AdminLayout from '../../components/AdminLayout'
import {
  getUnidades, createUnidad, updateUnidad, deleteUnidad, reorderUnidades,
  getActividades, createActividad, updateActividad, deleteActividad,
  updateLibro, getGrados,
} from '../../services/admin.service'
import StoragePicker from '../../components/StoragePicker'
import { supabase } from '../../lib/supabase'
import { C, S, btn, btnOutline, badge } from '../../lib/adminStyles'
import { TIPO_CONFIG } from '../../components/ActivityCard'

// ─── Campos por tipo de actividad ─────────────────────────────────────────────
const TIPOS = [
  'termometroEmocional',
  'sopaLetras', 'seleccionMultiple', 'identificar', 'verdaderoFalso', 'completarPalabras',
  'ordenarEventos', 'emparejar', 'completarMapa',
  'escribirCarta', 'dibujoLibre',
  'video', 'audio', 'imagen', 'colorear',
]

function camposInicialesPorTipo(tipo) {
  switch (tipo) {
    case 'sopaLetras':        return { palabras: [], numPalabras: 8, espacio: 12 }
    case 'termometroEmocional': return {
      instruccion: '',
      label: '¿Cómo se siente el personaje?',
      emoji: '🌡️',
      min: 0,
      max: 100,
      minLabel: 'Muy poco',
      maxLabel: 'Mucho',
      estados: [
        { id: '1', desde: 0, emoji: '😌', texto: 'Casi nada' },
        { id: '2', desde: 25, emoji: '😐', texto: 'Un poco' },
        { id: '3', desde: 50, emoji: '😰', texto: 'Bastante' },
        { id: '4', desde: 75, emoji: '😨', texto: 'Mucho' },
      ],
    }
    case 'seleccionMultiple': return { titulo: '', pregunta: '', opciones: [{ texto: '', esCorrecta: false }, { texto: '', esCorrecta: false }, { texto: '', esCorrecta: false }, { texto: '', esCorrecta: false }], retroalimentacion: '', retroalimentacionError: '', maxIntentos: 2 }
    case 'identificar':       return { instruccion: '', opciones: [{ icono: '😊', texto: '', esCorrecta: true }, { icono: '😢', texto: '', esCorrecta: false }], maxIntentos: 2 }
    case 'verdaderoFalso':    return { afirmaciones: [{ texto: '', esVerdadero: true }] }
    case 'completarPalabras': return { texto: 'El ___ salta sobre la ___', respuestas: ['perro', 'valla'], maxIntentos: 2 }
    case 'ordenarEventos':    return { instruccion: '', eventos: [{ id: '1', orden: 1, texto: '' }, { id: '2', orden: 2, texto: '' }], maxIntentos: 2 }
    case 'emparejar':         return { pares: [{ izquierda: '', derecha: '' }], maxIntentos: 2 }
    case 'completarMapa':     return { instruccion: '', nodos: [{ id: '1', label: '', icono: '' }] }
    case 'escribirCarta':     return { destinatario: '', promptTexto: '' }
    case 'dibujoLibre':       return { instruccion: '' }
    case 'video':             return { url: '', videoTitulo: '' }
    case 'audio':             return { url: '', titulo: '' }
    case 'imagen':            return { imagenUrl: '', descripcion: '' }
    case 'colorear':          return { imagenUrl: '' }
    default:                  return {}
  }
}

function JsonField({ label, value, onChange, placeholder }) {
  const [raw, setRaw] = useState(JSON.stringify(value, null, 2))
  const [err, setErr] = useState('')
  function handle(e) {
    setRaw(e.target.value)
    try { onChange(JSON.parse(e.target.value)); setErr('') }
    catch { setErr('JSON inválido') }
  }
  return (
    <>
      <label style={S.label}>{label} <span style={{ color: C.textLight, fontWeight: 400 }}>(JSON)</span></label>
      <textarea style={{ ...S.input, minHeight: 100, resize: 'vertical', fontFamily: 'monospace', fontSize: 12 }} value={raw} onChange={handle} placeholder={placeholder} />
      {err && <p style={{ color: C.danger, fontSize: 12, margin: '2px 0 8px' }}>{err}</p>}
    </>
  )
}

function FormCampos({ tipo, campos, onChange }) {
  function f(k) { return e => onChange({ ...campos, [k]: e.target.value }) }

  if (tipo === 'sopaLetras') {
    const palabrasStr = Array.isArray(campos.palabras) ? campos.palabras.join(', ') : (campos.palabras || '')
    return (
      <>
        <label style={S.label}>Palabras <span style={{ color: C.textLight, fontWeight: 400 }}>(separadas por coma)</span></label>
        <input
          style={{ ...S.input, marginBottom: 12 }} value={palabrasStr}
          onChange={e => onChange({ ...campos, palabras: e.target.value.split(',').map(p => p.trim().toUpperCase()).filter(Boolean) })}
          placeholder="GATO, PERRO, PATO"
        />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={S.label}>Num. palabras</label>
            <input style={S.input} type="number" value={campos.numPalabras || 8} onChange={e => onChange({ ...campos, numPalabras: Number(e.target.value) })} />
          </div>
          <div>
            <label style={S.label}>Espacio (grid)</label>
            <input style={S.input} type="number" value={campos.espacio || 12} onChange={e => onChange({ ...campos, espacio: Number(e.target.value) })} />
          </div>
        </div>
      </>
    )
  }

  if (tipo === 'termometroEmocional') {
    const estados = campos.estados || [
      { id: '1', desde: campos.min ?? 0, emoji: '😌', texto: 'Casi nada' },
      { id: '2', desde: Math.round(((campos.max ?? 100) - (campos.min ?? 0)) * 0.33 + (campos.min ?? 0)), emoji: '😐', texto: 'Un poco' },
      { id: '3', desde: Math.round(((campos.max ?? 100) - (campos.min ?? 0)) * 0.66 + (campos.min ?? 0)), emoji: '😨', texto: 'Mucho' },
    ]
    function setEstados(next) { onChange({ ...campos, estados: next.map((estado, i) => ({ ...estado, id: String(i + 1) })) }) }
    function setEstado(i, key, val) { setEstados(estados.map((estado, j) => j === i ? { ...estado, [key]: val } : estado)) }
    const safeMin = Number(campos.min ?? 0)
    const safeMax = Number(campos.max ?? 100)
    const rango = Math.max(1, safeMax - safeMin)
    const estadosOrdenados = [...estados].sort((a, b) => Number(a.desde ?? safeMin) - Number(b.desde ?? safeMin))
    const escalaLegacy = campos.escalas?.[0] || {}
    return (
      <>
        <label style={S.label}>Instrucción</label>
        <textarea
          style={{ ...S.input, marginBottom: 12, minHeight: 72, resize: 'vertical' }}
          value={campos.instruccion || ''}
          onChange={f('instruccion')}
          placeholder="Mide cómo se siente el personaje en este momento."
        />
        <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <label style={S.label}>Emoji</label>
            <input style={{ ...S.input, textAlign: 'center', fontSize: 18 }} value={campos.emoji || escalaLegacy.emoji || ''} onChange={f('emoji')} placeholder="🌡️" maxLength={2} />
          </div>
          <div>
            <label style={S.label}>Texto del termómetro</label>
            <input style={S.input} value={campos.label || escalaLegacy.label || ''} onChange={f('label')} placeholder="¿Qué tan grande es el miedo?" />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <label style={S.label}>Valor mínimo</label>
            <input style={S.input} type="number" value={campos.min ?? 0} onChange={e => onChange({ ...campos, min: Number(e.target.value) })} />
          </div>
          <div>
            <label style={S.label}>Valor máximo</label>
            <input style={S.input} type="number" value={campos.max ?? 5} onChange={e => onChange({ ...campos, max: Number(e.target.value) })} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          <div>
            <label style={S.label}>Etiqueta mínima</label>
            <input style={S.input} value={campos.minLabel || ''} onChange={f('minLabel')} placeholder="Muy poco" />
          </div>
          <div>
            <label style={S.label}>Etiqueta máxima</label>
            <input style={S.input} value={campos.maxLabel || ''} onChange={f('maxLabel')} placeholder="Mucho" />
          </div>
        </div>
        <label style={S.label}>Estados visibles según el valor</label>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          {estadosOrdenados.map((estado, i) => {
            const desde = Number(estado.desde ?? safeMin)
            const percent = Math.max(0, Math.min(100, ((desde - safeMin) / rango) * 100))
            return (
              <span key={estado.id || i} style={{ border: `1px solid ${C.border}`, borderRadius: 20, padding: '4px 10px', background: '#fff', fontSize: 12, fontWeight: 700, color: C.textMuted }}>
                {estado.emoji || '🙂'} {estado.texto || 'Estado'} · {Math.round(percent)}%
              </span>
            )
          })}
        </div>
        {estados.map((estado, i) => (
          <div key={estado.id || i} style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: 12, marginBottom: 10, background: C.bg }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              <span style={{ flexShrink: 0, width: 24, height: 24, borderRadius: '50%', background: '#fff3e0', color: '#e65100', fontWeight: 800, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</span>
              <input
                style={{ ...S.input, width: 52, flexShrink: 0, textAlign: 'center', fontSize: 18 }}
                value={estado.emoji || ''}
                onChange={e => setEstado(i, 'emoji', e.target.value)}
                placeholder="🙂"
                maxLength={2}
              />
              <input
                style={{ ...S.input, flex: 1 }}
                value={estado.texto || ''}
                onChange={e => setEstado(i, 'texto', e.target.value)}
                placeholder="Casi nada, un poco, bastante..."
              />
              <input
                style={{ ...S.input, width: 90, flexShrink: 0 }}
                type="number"
                value={estado.desde ?? safeMin}
                onChange={e => setEstado(i, 'desde', Number(e.target.value))}
                title="Valor desde el que se muestra este estado"
              />
              <button
                type="button"
                onClick={() => setEstados(estados.filter((_, j) => j !== i))}
                style={{ background: 'none', border: 'none', color: C.danger, cursor: 'pointer', fontSize: 18, flexShrink: 0, lineHeight: 1 }}
              >✕</button>
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setEstados([...estados, { id: '', desde: safeMin, emoji: '🙂', texto: '' }])}
          style={{ marginTop: 4, background: 'none', border: `1.5px dashed ${C.primary}`, color: C.primary, borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontWeight: 700, fontSize: 13, fontFamily: 'inherit' }}
        >
          + Agregar estado
        </button>
      </>
    )
  }

  if (tipo === 'seleccionMultiple') {
    const opciones = campos.opciones || [{ texto: '', esCorrecta: false }, { texto: '', esCorrecta: false }, { texto: '', esCorrecta: false }, { texto: '', esCorrecta: false }]
    const L = ['A', 'B', 'C', 'D']
    return (
      <>
        <label style={S.label}>Título <span style={{ color: C.textLight, fontWeight: 400 }}>(aparece como encabezado)</span></label>
        <input style={{ ...S.input, marginBottom: 12 }} value={campos.titulo || ''} onChange={f('titulo')} placeholder="¿Quién es la protagonista?" />
        <label style={S.label}>Pregunta <span style={{ color: C.textLight, fontWeight: 400 }}>(debajo del título)</span></label>
        <input style={{ ...S.input, marginBottom: 12 }} value={campos.pregunta || ''} onChange={f('pregunta')} placeholder="¿Cómo se llama la niña de la historia?" />
        <label style={S.label}>Opciones <span style={{ color: C.textLight, fontWeight: 400 }}>(marca todas las correctas)</span></label>
        {opciones.map((op, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <input
              type="checkbox"
              checked={!!op.esCorrecta}
              onChange={e => {
                const next = opciones.map((o, j) => ({ ...o, esCorrecta: j === i ? e.target.checked : o.esCorrecta }))
                onChange({ ...campos, opciones: next })
              }}
              style={{ flexShrink: 0 }}
            />
            <span style={{ flexShrink: 0, width: 24, height: 24, borderRadius: '50%', background: '#fce4f3', color: '#e91e8c', fontWeight: 800, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{L[i]}</span>
            <input
              style={{ ...S.input, flex: 1 }}
              value={op.texto || ''}
              onChange={e => {
                const next = opciones.map((o, j) => j === i ? { ...o, texto: e.target.value } : o)
                onChange({ ...campos, opciones: next })
              }}
              placeholder={`Opción ${L[i]}`}
            />
          </div>
        ))}
        <label style={{ ...S.label, marginTop: 8 }}>Retroalimentación correcta <span style={{ color: C.textLight, fontWeight: 400 }}>(opcional)</span></label>
        <input style={{ ...S.input, marginBottom: 12 }} value={campos.retroalimentacion || ''} onChange={f('retroalimentacion')} placeholder="¡Muy bien! La protagonista se llama…" />
        <label style={S.label}>Retroalimentación error <span style={{ color: C.textLight, fontWeight: 400 }}>(opcional)</span></label>
        <input style={{ ...S.input, marginBottom: 12 }} value={campos.retroalimentacionError || ''} onChange={f('retroalimentacionError')} placeholder="¡Inténtalo de nuevo! Busca el nombre en las primeras páginas." />
        <label style={S.label}>Máx. intentos <span style={{ color: C.textLight, fontWeight: 400 }}>(la actividad se completa aunque falle)</span></label>
        <input style={S.input} type="number" min={1} max={10} value={campos.maxIntentos ?? 2} onChange={e => onChange({ ...campos, maxIntentos: Number(e.target.value) })} />
      </>
    )
  }

  if (tipo === 'identificar') {
    const opciones = campos.opciones || []
    function setOpciones(next) { onChange({ ...campos, opciones: next }) }
    function setOp(i, key, val) { setOpciones(opciones.map((o, j) => j === i ? { ...o, [key]: val } : o)) }
    return (
      <>
        <label style={S.label}>Instrucción / pregunta</label>
        <input style={{ ...S.input, marginBottom: 16 }} value={campos.instruccion || ''} onChange={f('instruccion')} placeholder="¿Cuáles de estas sensaciones sintió el personaje?" />
        <label style={S.label}>Opciones <span style={{ color: C.textLight, fontWeight: 400 }}>(✓ = correcta)</span></label>
        {opciones.map((op, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <input
              type="checkbox"
              checked={!!op.esCorrecta}
              onChange={e => setOp(i, 'esCorrecta', e.target.checked)}
              style={{ flexShrink: 0, width: 16, height: 16 }}
            />
            <input
              style={{ ...S.input, width: 52, flexShrink: 0, textAlign: 'center', fontSize: 18 }}
              value={op.icono || ''}
              onChange={e => setOp(i, 'icono', e.target.value)}
              placeholder="🔥"
              maxLength={2}
            />
            <input
              style={{ ...S.input, flex: 1 }}
              value={op.texto || ''}
              onChange={e => setOp(i, 'texto', e.target.value)}
              placeholder={`Opción ${i + 1}`}
            />
            <button
              type="button"
              onClick={() => setOpciones(opciones.filter((_, j) => j !== i))}
              style={{ background: 'none', border: 'none', color: C.danger, cursor: 'pointer', fontSize: 18, flexShrink: 0 }}
            >✕</button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setOpciones([...opciones, { icono: '😊', texto: '', esCorrecta: false }])}
          style={{ marginTop: 4, background: 'none', border: `1.5px dashed ${C.primary}`, color: C.primary, borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontWeight: 700, fontSize: 13, fontFamily: 'inherit' }}
        >
          + Agregar opción
        </button>
        <label style={{ ...S.label, marginTop: 14 }}>Máx. intentos <span style={{ color: C.textLight, fontWeight: 400 }}>(la actividad se completa aunque falle)</span></label>
        <input style={S.input} type="number" min={1} max={10} value={campos.maxIntentos ?? 2} onChange={e => onChange({ ...campos, maxIntentos: Number(e.target.value) })} />
      </>
    )
  }

  if (tipo === 'verdaderoFalso') {
    const afirmaciones = campos.afirmaciones || []
    function setAfirmaciones(next) { onChange({ ...campos, afirmaciones: next }) }
    function setAf(i, key, val) { setAfirmaciones(afirmaciones.map((a, j) => j === i ? { ...a, [key]: val } : a)) }
    return (
      <>
        <label style={S.label}>Afirmaciones <span style={{ color: C.textLight, fontWeight: 400 }}>(indica si cada una es verdadera o falsa)</span></label>
        {afirmaciones.map((af, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
            <span style={{ flexShrink: 0, width: 24, height: 24, borderRadius: '50%', background: '#fce4f3', color: '#e91e8c', fontWeight: 800, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</span>
            <input
              style={{ ...S.input, flex: 1 }}
              value={af.texto || ''}
              onChange={e => setAf(i, 'texto', e.target.value)}
              placeholder={`Afirmación ${i + 1}`}
            />
            <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
              <button
                type="button"
                onClick={() => setAf(i, 'esVerdadero', true)}
                style={{ padding: '5px 10px', borderRadius: 8, border: `2px solid ${af.esVerdadero ? '#16A34A' : '#E5E7EB'}`, background: af.esVerdadero ? '#DCFCE7' : '#fff', color: af.esVerdadero ? '#16A34A' : '#9CA3AF', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}
              >V</button>
              <button
                type="button"
                onClick={() => setAf(i, 'esVerdadero', false)}
                style={{ padding: '5px 10px', borderRadius: 8, border: `2px solid ${!af.esVerdadero ? '#EF4444' : '#E5E7EB'}`, background: !af.esVerdadero ? '#FEE2E2' : '#fff', color: !af.esVerdadero ? '#EF4444' : '#9CA3AF', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}
              >F</button>
            </div>
            <button
              type="button"
              onClick={() => setAfirmaciones(afirmaciones.filter((_, j) => j !== i))}
              style={{ background: 'none', border: 'none', color: C.danger, cursor: 'pointer', fontSize: 18, flexShrink: 0, lineHeight: 1 }}
            >✕</button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setAfirmaciones([...afirmaciones, { texto: '', esVerdadero: true }])}
          style={{ marginTop: 4, background: 'none', border: `1.5px dashed ${C.primary}`, color: C.primary, borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontWeight: 700, fontSize: 13, fontFamily: 'inherit' }}
        >
          + Agregar afirmación
        </button>
      </>
    )
  }

  if (tipo === 'completarPalabras') {
    const texto = campos.texto || ''
    const autoRespuestas = (texto.match(/\{\{([^}]*)\}\}/g) || []).map(m => m.slice(2, -2).trim()).filter(Boolean)
    function handleTexto(e) {
      const t = e.target.value
      const r = (t.match(/\{\{([^}]*)\}\}/g) || []).map(m => m.slice(2, -2).trim()).filter(Boolean)
      onChange({ ...campos, texto: t, respuestas: r })
    }
    return (
      <>
        <label style={S.label}>
          Texto <span style={{ color: C.textLight, fontWeight: 400 }}>— pon cada respuesta entre {'{{ }}'}, ej: <code style={{ fontFamily: 'monospace' }}>{'El {{perro}} corre'}</code></span>
        </label>
        <textarea style={{ ...S.input, marginBottom: 8, minHeight: 80, resize: 'vertical' }} value={texto} onChange={handleTexto} placeholder={'El {{perro}} salta sobre la {{valla}}'} />
        {autoRespuestas.length > 0 ? (
          <div style={{ marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: C.textLight, fontWeight: 600 }}>Respuestas detectadas:</span>
            {autoRespuestas.map((r, i) => (
              <span key={i} style={{ background: '#e3f2fd', color: '#1e88e5', borderRadius: 6, padding: '2px 10px', fontSize: 12, fontWeight: 700 }}>{i + 1}. {r}</span>
            ))}
          </div>
        ) : (
          <p style={{ fontSize: 12, color: C.textLight, margin: '0 0 12px' }}>Escribe el texto con al menos una respuesta entre {'{{ }}'} para ver la vista previa.</p>
        )}
        <label style={S.label}>Máx. intentos <span style={{ color: C.textLight, fontWeight: 400 }}>(la actividad se completa aunque falle)</span></label>
        <input style={S.input} type="number" min={1} max={10} value={campos.maxIntentos ?? 2} onChange={e => onChange({ ...campos, maxIntentos: Number(e.target.value) })} />
      </>
    )
  }

  if (tipo === 'ordenarEventos') {
    const eventos = campos.eventos || []
    function setEventos(next) { onChange({ ...campos, eventos: next.map((e, i) => ({ ...e, id: String(i + 1), orden: i + 1 })) }) }
    return (
      <>
        <label style={S.label}>Instrucción</label>
        <input style={{ ...S.input, marginBottom: 16 }} value={campos.instruccion || ''} onChange={f('instruccion')} placeholder="Ordena los eventos de la historia" />
        <label style={S.label}>Eventos <span style={{ color: C.textLight, fontWeight: 400 }}>(en el orden correcto)</span></label>
        {eventos.map((ev, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <span style={{ flexShrink: 0, width: 24, height: 24, borderRadius: '50%', background: '#e3f2fd', color: '#1e88e5', fontWeight: 800, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</span>
            <input
              style={{ ...S.input, flex: 1 }}
              value={ev.texto || ''}
              onChange={e => setEventos(eventos.map((ev2, j) => j === i ? { ...ev2, texto: e.target.value } : ev2))}
              placeholder={`Evento ${i + 1}`}
            />
            <button
              type="button"
              onClick={() => setEventos(eventos.filter((_, j) => j !== i))}
              style={{ background: 'none', border: 'none', color: C.danger, cursor: 'pointer', fontSize: 18, flexShrink: 0, lineHeight: 1 }}
            >✕</button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setEventos([...eventos, { id: '', texto: '' }])}
          style={{ marginTop: 4, background: 'none', border: `1.5px dashed ${C.primary}`, color: C.primary, borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontWeight: 700, fontSize: 13, fontFamily: 'inherit' }}
        >
          + Agregar evento
        </button>
        <label style={{ ...S.label, marginTop: 16 }}>Máx. intentos <span style={{ color: C.textLight, fontWeight: 400 }}>(la actividad se completa aunque falle)</span></label>
        <input style={S.input} type="number" min={1} max={10} value={campos.maxIntentos ?? 2} onChange={e => onChange({ ...campos, maxIntentos: Number(e.target.value) })} />
      </>
    )
  }

  if (tipo === 'emparejar') {
    const pares = campos.pares || []
    function setPares(next) { onChange({ ...campos, pares: next }) }
    return (
      <>
        <label style={S.label}>Pares <span style={{ color: C.textLight, fontWeight: 400 }}>(izquierda ↔ derecha)</span></label>
        {pares.map((par, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <span style={{ flexShrink: 0, width: 24, height: 24, borderRadius: '50%', background: '#fce4f3', color: '#e91e8c', fontWeight: 800, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</span>
            <input
              style={{ ...S.input, flex: 1 }}
              value={par.izquierda || ''}
              onChange={e => setPares(pares.map((p, j) => j === i ? { ...p, izquierda: e.target.value } : p))}
              placeholder="Izquierda"
            />
            <span style={{ color: C.textLight, fontWeight: 700, flexShrink: 0 }}>↔</span>
            <input
              style={{ ...S.input, flex: 1 }}
              value={par.derecha || ''}
              onChange={e => setPares(pares.map((p, j) => j === i ? { ...p, derecha: e.target.value } : p))}
              placeholder="Derecha"
            />
            <button
              type="button"
              onClick={() => setPares(pares.filter((_, j) => j !== i))}
              style={{ background: 'none', border: 'none', color: C.danger, cursor: 'pointer', fontSize: 18, flexShrink: 0, lineHeight: 1 }}
            >✕</button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setPares([...pares, { izquierda: '', derecha: '' }])}
          style={{ marginTop: 4, background: 'none', border: `1.5px dashed ${C.primary}`, color: C.primary, borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontWeight: 700, fontSize: 13, fontFamily: 'inherit' }}
        >
          + Agregar par
        </button>
        <label style={{ ...S.label, marginTop: 16 }}>Máx. intentos <span style={{ color: C.textLight, fontWeight: 400 }}>(la actividad se completa aunque falle)</span></label>
        <input style={S.input} type="number" min={1} max={10} value={campos.maxIntentos ?? 2} onChange={e => onChange({ ...campos, maxIntentos: Number(e.target.value) })} />
      </>
    )
  }

  if (tipo === 'completarMapa') {
    const nodos = campos.nodos || []
    function setNodos(next) { onChange({ ...campos, nodos: next.map((n, i) => ({ ...n, id: String(i + 1) })) }) }
    function setNodo(i, key, val) { setNodos(nodos.map((n, j) => j === i ? { ...n, [key]: val } : n)) }
    return (
      <>
        <label style={S.label}>Instrucción</label>
        <input style={{ ...S.input, marginBottom: 16 }} value={campos.instruccion || ''} onChange={f('instruccion')} placeholder="Completa el mapa conceptual" />
        <label style={S.label}>Nodos <span style={{ color: C.textLight, fontWeight: 400 }}>(cada nodo es un campo que el estudiante debe completar)</span></label>
        {nodos.map((nodo, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <span style={{ flexShrink: 0, width: 24, height: 24, borderRadius: '50%', background: '#e8f5e9', color: '#4caf50', fontWeight: 800, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</span>
            <input
              style={{ ...S.input, width: 52, flexShrink: 0, textAlign: 'center', fontSize: 18 }}
              value={nodo.icono || ''}
              onChange={e => setNodo(i, 'icono', e.target.value)}
              placeholder="🗺️"
              maxLength={2}
            />
            <input
              style={{ ...S.input, flex: 1 }}
              value={nodo.label || ''}
              onChange={e => setNodo(i, 'label', e.target.value)}
              placeholder={`Ej: Personaje principal`}
            />
            <button
              type="button"
              onClick={() => setNodos(nodos.filter((_, j) => j !== i))}
              style={{ background: 'none', border: 'none', color: C.danger, cursor: 'pointer', fontSize: 18, flexShrink: 0, lineHeight: 1 }}
            >✕</button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setNodos([...nodos, { id: '', label: '', icono: '' }])}
          style={{ marginTop: 4, background: 'none', border: `1.5px dashed ${C.primary}`, color: C.primary, borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontWeight: 700, fontSize: 13, fontFamily: 'inherit' }}
        >
          + Agregar nodo
        </button>
      </>
    )
  }

  if (tipo === 'escribirCarta') return (
    <>
      <label style={S.label}>Destinatario</label>
      <input style={{ ...S.input, marginBottom: 12 }} value={campos.destinatario || ''} onChange={f('destinatario')} placeholder="Mi abuela" />
      <label style={S.label}>Instrucción / prompt</label>
      <textarea style={{ ...S.input, minHeight: 80, resize: 'vertical' }} value={campos.promptTexto || ''} onChange={f('promptTexto')} placeholder="Escribe una carta contando lo que aprendiste…" />
    </>
  )

  if (tipo === 'dibujoLibre') return (
    <>
      <label style={S.label}>Instrucción</label>
      <input style={S.input} value={campos.instruccion || ''} onChange={f('instruccion')} placeholder="Dibuja el personaje de la historia" />
    </>
  )

  if (tipo === 'video') return (
    <>
      <label style={S.label}>URL del video</label>
      <input style={{ ...S.input, marginBottom: 12 }} value={campos.url || ''} onChange={f('url')} placeholder="https://youtube.com/..." />
      <label style={S.label}>Título</label>
      <input style={S.input} value={campos.videoTitulo || ''} onChange={f('videoTitulo')} placeholder="Nombre del video" />
    </>
  )

  if (tipo === 'audio') return (
    <>
      <label style={S.label}>URL del audio</label>
      <input style={{ ...S.input, marginBottom: 12 }} value={campos.url || ''} onChange={f('url')} placeholder="/audio/cancion.mp3" />
      <label style={S.label}>Título</label>
      <input style={S.input} value={campos.titulo || ''} onChange={f('titulo')} placeholder="Nombre del audio" />
    </>
  )

  if (tipo === 'imagen') return (
    <>
      <label style={S.label}>URL de la imagen</label>
      <input style={{ ...S.input, marginBottom: 12 }} value={campos.imagenUrl || ''} onChange={f('imagenUrl')} placeholder="/img/foto.jpg" />
      <label style={S.label}>Descripción <span style={{ color: C.textLight, fontWeight: 400 }}>(opcional)</span></label>
      <input style={S.input} value={campos.descripcion || ''} onChange={f('descripcion')} placeholder="Descripción de la imagen" />
    </>
  )

  if (tipo === 'colorear') return (
    <>
      <label style={S.label}>URL de la imagen para colorear</label>
      <input style={S.input} value={campos.imagenUrl || ''} onChange={f('imagenUrl')} placeholder="/img/dibujo.png" />
    </>
  )

  return null
}

// ─── Modal nueva actividad ─────────────────────────────────────────────────────
function ModalActividad({ unidadId, orden, onClose, onSave }) {
  const [tipo, setTipo] = useState('sopaLetras')
  const [campos, setCampos] = useState(camposInicialesPorTipo('sopaLetras'))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function onTipoChange(e) {
    const t = e.target.value
    setTipo(t)
    setCampos(camposInicialesPorTipo(t))
  }

  async function submit(e) {
    e.preventDefault()
    setLoading(true); setError('')
    try { await onSave({ tipo, orden, campos }); onClose() }
    catch (err) { setError(err.message); setLoading(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20, overflowY: 'auto' }}>
      <div style={{ ...S.card, width: 500, padding: 28, margin: 'auto' }}>
        <h3 style={{ margin: '0 0 20px', fontSize: 17, fontWeight: 800, color: C.text }}>Nueva actividad</h3>
        <form onSubmit={submit}>
          <label style={S.label}>Tipo</label>
          <select style={{ ...S.input, marginBottom: 20 }} value={tipo} onChange={onTipoChange}>
            {TIPOS.map(t => <option key={t} value={t}>{TIPO_CONFIG[t]?.label ?? t}</option>)}
          </select>

          <FormCampos tipo={tipo} campos={campos} onChange={setCampos} />

          {error && <div style={{ background: C.dangerLight, color: C.danger, borderRadius: 8, padding: '10px 14px', marginTop: 16, fontSize: 13, fontWeight: 600 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
            <button type="button" onClick={onClose} style={{ ...btnOutline(C.textLight), flex: 1 }}>Cancelar</button>
            <button type="submit" disabled={loading} style={{ ...btn(C.primary), flex: 1 }}>{loading ? 'Guardando…' : 'Crear actividad'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Modal editar actividad ───────────────────────────────────────────────────
function ModalEditarActividad({ actividad, onClose, onSave }) {
  const [campos, setCampos] = useState(actividad.campos || camposInicialesPorTipo(actividad.tipo))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function submit(e) {
    e.preventDefault()
    setLoading(true); setError('')
    try { await onSave(campos); onClose() }
    catch (err) { setError(err.message); setLoading(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20, overflowY: 'auto' }}>
      <div style={{ ...S.card, width: 500, padding: 28, margin: 'auto' }}>
        <h3 style={{ margin: '0 0 6px', fontSize: 17, fontWeight: 800, color: C.text }}>Editar actividad</h3>
        <p style={{ margin: '0 0 20px', fontSize: 13, color: C.textLight }}>
          Tipo: <span style={{ fontWeight: 700, color: C.primary }}>{actividad.tipo}</span> · #{actividad.orden}
        </p>
        <form onSubmit={submit}>
          <FormCampos tipo={actividad.tipo} campos={campos} onChange={setCampos} />
          {error && <div style={{ background: C.dangerLight, color: C.danger, borderRadius: 8, padding: '10px 14px', marginTop: 16, fontSize: 13, fontWeight: 600 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
            <button type="button" onClick={onClose} style={{ ...btnOutline(C.textLight), flex: 1 }}>Cancelar</button>
            <button type="submit" disabled={loading} style={{ ...btn(C.primary), flex: 1 }}>{loading ? 'Guardando…' : 'Guardar cambios'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Formulario de campos de unidad (reutilizado en crear y editar) ───────────
function CamposUnidad({ form, onChange }) {
  const f = k => e => onChange({ ...form, [k]: e.target.value })
  return (
    <>
      <label style={S.label}>Título <span style={{ color: C.danger }}>*</span></label>
      <input style={{ ...S.input, marginBottom: 12 }} value={form.titulo || ''} onChange={f('titulo')} placeholder="Ej: Páginas 1 – 7" />
      <label style={S.label}>Subtítulo</label>
      <input style={{ ...S.input, marginBottom: 12 }} value={form.subtitulo || ''} onChange={f('subtitulo')} placeholder="Ej: Conocemos a Sofía" />
      <label style={S.label}>Texto descriptivo</label>
      <textarea
        style={{ ...S.input, minHeight: 72, resize: 'vertical' }}
        value={form.texto || ''}
        onChange={f('texto')}
        placeholder="Ej: Actividades sobre la presentación de la historia y la protagonista"
      />
    </>
  )
}

// ─── Fila de unidad expandible ─────────────────────────────────────────────────
function UnidadRow({ unidad, index, total, onMover, onNuevaActividad, onUpdate, onDelete }) {
  const [open, setOpen] = useState(false)
  const [editando, setEditando] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [form, setForm] = useState({ titulo: unidad.titulo, subtitulo: unidad.subtitulo || '', texto: unidad.texto || '' })
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [actividades, setActividades] = useState(null)
  const [editandoAct, setEditandoAct] = useState(null)
  const [confirmActDelete, setConfirmActDelete] = useState(null)
  const [actLoading, setActLoading] = useState(false)

  async function toggleOpen() {
    if (editando) return
    if (!open && actividades === null) {
      const data = await getActividades(unidad.id)
      setActividades(data)
    }
    setOpen(o => !o)
  }

  function reloadActs() {
    getActividades(unidad.id).then(setActividades)
  }

  async function handleUpdateActividad(actId, campos) {
    await updateActividad(actId, campos)
    setActividades(prev => prev.map(a => a.id === actId ? { ...a, campos } : a))
  }

  async function handleDeleteActividad(actId) {
    setActLoading(true)
    try {
      await deleteActividad(actId)
      setActividades(prev => prev.filter(a => a.id !== actId))
      setConfirmActDelete(null)
    } catch (err) { setError(err.message) }
    finally { setActLoading(false) }
  }

  async function handleGuardar(e) {
    e.preventDefault()
    if (!form.titulo.trim()) { setError('El título es obligatorio'); return }
    setGuardando(true); setError('')
    try {
      await updateUnidad(unidad.id, form)
      onUpdate(unidad.id, form)
      setEditando(false)
    } catch (err) { setError(err.message) }
    finally { setGuardando(false) }
  }

  async function handleDelete() {
    setGuardando(true)
    try {
      await deleteUnidad(unidad.id)
      onDelete(unidad.id)
    } catch (err) { setError(err.message); setGuardando(false) }
  }

  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, marginBottom: 8, overflow: 'hidden' }}>
      {/* Header de la unidad */}
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: C.white, cursor: editando ? 'default' : 'pointer', userSelect: 'none' }}
        onClick={!editando ? toggleOpen : undefined}
      >
        <span style={{ fontSize: 13, fontWeight: 700, color: C.textLight, width: 24, textAlign: 'center', flexShrink: 0 }}>{unidad.orden}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{unidad.titulo}</div>
          {unidad.subtitulo && <div style={{ fontSize: 12, color: C.textLight, marginTop: 1 }}>{unidad.subtitulo}</div>}
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
          <button onClick={() => onMover(index, -1)} disabled={index === 0} style={btnOutline(C.textLight, 'sm')}>↑</button>
          <button onClick={() => onMover(index, 1)} disabled={index === total - 1} style={btnOutline(C.textLight, 'sm')}>↓</button>
          <button onClick={() => { setEditando(e => !e); setOpen(false); setError('') }} style={btnOutline(C.primary, 'sm')}>
            {editando ? 'Cancelar' : 'Editar'}
          </button>
          <button onClick={() => setConfirmDelete(true)} style={btnOutline(C.danger, 'sm')}>Borrar</button>
        </div>
        {!editando && <span style={{ fontSize: 18, color: C.textLight, flexShrink: 0 }}>{open ? '▲' : '▼'}</span>}
      </div>

      {/* Formulario de edición */}
      {editando && (
        <div style={{ background: '#FFFBF0', borderTop: `1px solid ${C.border}`, padding: '16px 20px' }}>
          <form onSubmit={handleGuardar}>
            <CamposUnidad form={form} onChange={setForm} />
            {error && <div style={{ background: C.dangerLight, color: C.danger, borderRadius: 8, padding: '8px 12px', marginTop: 12, fontSize: 13, fontWeight: 600 }}>{error}</div>}
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button type="button" onClick={() => { setEditando(false); setError('') }} style={{ ...btnOutline(C.textLight), flex: 1 }}>Cancelar</button>
              <button type="submit" disabled={guardando} style={{ ...btn(C.primary), flex: 1 }}>{guardando ? 'Guardando…' : 'Guardar cambios'}</button>
            </div>
          </form>
        </div>
      )}

      {/* Confirmación de borrado */}
      {confirmDelete && (
        <div style={{ background: C.dangerLight, borderTop: `1px solid ${C.border}`, padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: C.danger }}>¿Borrar "{unidad.titulo}" y todas sus actividades?</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setConfirmDelete(false)} style={btnOutline(C.textLight, 'sm')}>Cancelar</button>
            <button onClick={handleDelete} disabled={guardando} style={btn(C.danger, 'sm')}>{guardando ? 'Borrando…' : 'Sí, borrar'}</button>
          </div>
        </div>
      )}

      {/* Actividades */}
      {open && !editando && (
        <div style={{ background: C.bg, borderTop: `1px solid ${C.border}`, padding: '12px 16px' }}>
          {actividades === null ? (
            <p style={{ fontSize: 13, color: C.textLight }}>Cargando…</p>
          ) : actividades.length === 0 ? (
            <p style={{ fontSize: 13, color: C.textLight, marginBottom: 10 }}>Sin actividades aún.</p>
          ) : (
            <>
              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 12 }}>
                <thead>
                  <tr>{['#', 'Tipo', 'Campos', ''].map(h => <th key={h} style={{ ...S.th, background: C.bg }}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {actividades.map(act => (
                    <tr key={act.id}>
                      <td style={{ ...S.td, width: 32, color: C.textLight, fontSize: 13 }}>{act.orden}</td>
                      <td style={S.td}><span style={badge(C.primary)}>{act.tipo}</span></td>
                      <td style={{ ...S.td, fontFamily: 'monospace', fontSize: 11, color: C.textLight, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {JSON.stringify(act.campos)}
                      </td>
                      <td style={{ ...S.td, whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => setEditandoAct(act)} style={btnOutline(C.primary, 'sm')}>Editar</button>
                          <button onClick={() => setConfirmActDelete(act.id)} style={btnOutline(C.danger, 'sm')}>Borrar</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {confirmActDelete && (
                <div style={{ background: C.dangerLight, borderRadius: 8, padding: '12px 14px', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: C.danger }}>¿Borrar esta actividad?</span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => setConfirmActDelete(null)} style={btnOutline(C.textLight, 'sm')}>Cancelar</button>
                    <button onClick={() => handleDeleteActividad(confirmActDelete)} disabled={actLoading} style={btn(C.danger, 'sm')}>
                      {actLoading ? 'Borrando…' : 'Sí, borrar'}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
          <button onClick={() => onNuevaActividad(unidad.id, (actividades?.length ?? 0) + 1, reloadActs)} style={btn(C.success, 'sm')}>
            + Nueva actividad
          </button>
        </div>
      )}

      {editandoAct && (
        <ModalEditarActividad
          actividad={editandoAct}
          onClose={() => setEditandoAct(null)}
          onSave={campos => handleUpdateActividad(editandoAct.id, campos)}
        />
      )}
    </div>
  )
}

// ─── Página principal ──────────────────────────────────────────────────────────
export default function AdminLibroDetalle() {
  const { id } = useParams()
  const [libro, setLibro] = useState(null)
  const [unidades, setUnidades] = useState([])
  const [grados, setGrados] = useState([])
  const [form, setForm] = useState({})
  const [picker, setPicker] = useState(null) // 'portada' | 'pdf'
  const [editando, setEditando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [nuevaUnidad, setNuevaUnidad] = useState({ titulo: '', subtitulo: '', texto: '' })
  const [nuevaUnidadOpen, setNuevaUnidadOpen] = useState(false)
  const [modalAct, setModalAct] = useState(null) // { unidadId, orden, reload }
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [exito, setExito] = useState('')

  useEffect(() => { load() }, [id])

  async function load() {
    setLoading(true); setError('')
    try {
      const [{ data: libroData }, uData, gData] = await Promise.all([
        supabase.from('libros').select('*, grados(nombre)').eq('id', id).single(),
        getUnidades(id),
        getGrados(),
      ])
      if (!libroData) throw new Error('Libro no encontrado')
      setLibro(libroData)
      setForm({ titulo: libroData.titulo, descripcion: libroData.descripcion || '', emoji: libroData.emoji || '📖', grado_id: libroData.grado_id, color_acento: libroData.color_acento || '#e91e8c', portada_url: libroData.portada_url || '', pdf_url: libroData.pdf_url || '' })
      setUnidades(uData)
      setGrados(gData)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  async function handleGuardarMeta(e) {
    e.preventDefault()
    setGuardando(true); setError(''); setExito('')
    try {
      const updates = { ...form, grado_id: Number(form.grado_id) }
      await updateLibro(id, updates)
      setLibro(prev => ({ ...prev, ...updates }))
      setEditando(false)
      setExito('Cambios guardados.')
      setTimeout(() => setExito(''), 2500)
    } catch (err) { setError(err.message) }
    finally { setGuardando(false) }
  }

  async function handleNuevaUnidad(e) {
    e.preventDefault()
    if (!nuevaUnidad.titulo.trim()) { setError('El título de la unidad es obligatorio'); return }
    try {
      const data = await createUnidad(id, nuevaUnidad, unidades.length + 1)
      setUnidades(prev => [...prev, data])
      setNuevaUnidad({ titulo: '', subtitulo: '', texto: '' })
      setNuevaUnidadOpen(false)
    } catch (err) { setError(err.message) }
  }

  function handleUnidadUpdate(unidadId, campos) {
    setUnidades(prev => prev.map(u => u.id === unidadId ? { ...u, ...campos } : u))
  }

  function handleUnidadDelete(unidadId) {
    setUnidades(prev => prev.filter(u => u.id !== unidadId).map((u, i) => ({ ...u, orden: i + 1 })))
  }

  async function handleMover(index, dir) {
    const arr = [...unidades]
    const target = index + dir
    if (target < 0 || target >= arr.length) return
    ;[arr[index], arr[target]] = [arr[target], arr[index]]
    const updates = arr.map((u, i) => ({ id: u.id, orden: i + 1 }))
    try {
      await reorderUnidades(updates)
      setUnidades(arr.map((u, i) => ({ ...u, orden: i + 1 })))
    } catch (err) { setError(err.message) }
  }

  if (loading) return <AdminLayout><div style={{ padding: 40, color: C.textLight }}>Cargando…</div></AdminLayout>
  if (!libro) return <AdminLayout><div style={{ padding: 40, color: C.danger }}>{error || 'Libro no encontrado.'}</div></AdminLayout>

  return (
    <AdminLayout>
      <div style={{ padding: '32px 40px', maxWidth: 860 }}>
        {/* Breadcrumb */}
        <div style={{ fontSize: 13, color: C.textLight, marginBottom: 20 }}>
          <Link to="/admin/libros" style={{ color: C.primary, textDecoration: 'none', fontWeight: 600 }}>Libros</Link>
          <span style={{ margin: '0 8px' }}>›</span>
          <span>{libro.titulo}</span>
        </div>

        {error && <div style={{ background: C.dangerLight, color: C.danger, borderRadius: 10, padding: '12px 16px', marginBottom: 20, fontSize: 14, fontWeight: 600 }}>{error}</div>}
        {exito && <div style={{ background: C.successLight, color: C.success, borderRadius: 10, padding: '12px 16px', marginBottom: 20, fontSize: 14, fontWeight: 600 }}>{exito}</div>}

        {/* Metadatos */}
        <div style={{ ...S.card, padding: 24, marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: editando ? 20 : 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 32 }}>{libro.emoji || '📖'}</span>
              <div>
                <h1 style={{ fontSize: 20, fontWeight: 800, color: C.text, margin: 0 }}>{libro.titulo}</h1>
                <p style={{ fontSize: 13, color: C.textLight, margin: '3px 0 0' }}>{libro.grados?.nombre || '—'} · ID: <code style={{ fontSize: 12 }}>{libro.id}</code></p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <a href={`/libro/${libro.id}`} target="_blank" rel="noreferrer" style={{ ...btnOutline(C.textLight, 'sm'), textDecoration: 'none' }}>
                Vista previa ↗
              </a>
              {!editando && (
                <button onClick={() => setEditando(true)} style={btnOutline(C.primary, 'sm')}>Editar metadatos</button>
              )}
            </div>
          </div>

          {editando && (
            <form onSubmit={handleGuardarMeta}>
              <div style={{ display: 'grid', gridTemplateColumns: '64px 1fr', gap: 12, marginBottom: 14 }}>
                <div>
                  <label style={S.label}>Emoji</label>
                  <input style={{ ...S.input, textAlign: 'center', fontSize: 22 }} value={form.emoji} onChange={e => setForm(p => ({ ...p, emoji: e.target.value }))} maxLength={2} />
                </div>
                <div>
                  <label style={S.label}>Título</label>
                  <input style={S.input} value={form.titulo} onChange={e => setForm(p => ({ ...p, titulo: e.target.value }))} />
                </div>
              </div>
              <label style={S.label}>Grado</label>
              <select style={{ ...S.input, marginBottom: 14 }} value={form.grado_id} onChange={e => setForm(p => ({ ...p, grado_id: e.target.value }))}>
                <option value="">—</option>
                {grados.map(g => <option key={g.id} value={g.id}>{g.nombre}</option>)}
              </select>
              <label style={S.label}>Descripción</label>
              <textarea style={{ ...S.input, marginBottom: 14, minHeight: 64, resize: 'vertical' }} value={form.descripcion} onChange={e => setForm(p => ({ ...p, descripcion: e.target.value }))} />
              <label style={S.label}>Color del libro</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                <input
                  type="color"
                  value={form.color_acento || '#e91e8c'}
                  onChange={e => setForm(p => ({ ...p, color_acento: e.target.value }))}
                  style={{ width: 48, height: 36, borderRadius: 8, border: `1px solid ${C.border}`, cursor: 'pointer', padding: 2 }}
                />
                <code style={{ fontSize: 13, color: C.textLight }}>{form.color_acento || '#e91e8c'}</code>
                <div style={{ width: 80, height: 28, borderRadius: 8, background: `linear-gradient(135deg, ${form.color_acento || '#e91e8c'}, ${form.color_acento || '#e91e8c'}cc)` }} />
              </div>
              <label style={S.label}>Portada</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <button type="button" onClick={() => setPicker('portada')} style={btnOutline(C.primary, 'sm')}>
                  {form.portada_url ? 'Reemplazar' : 'Seleccionar imagen'}
                </button>
                <span style={{ fontSize: 12, color: C.textLight, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 260 }}>
                  {form.portada_url ? form.portada_url.split('/').pop() : 'Sin archivo'}
                </span>
              </div>
              <label style={S.label}>PDF</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                <button type="button" onClick={() => setPicker('pdf')} style={btnOutline(C.primary, 'sm')}>
                  {form.pdf_url ? 'Reemplazar' : 'Seleccionar PDF'}
                </button>
                <span style={{ fontSize: 12, color: C.textLight, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 260 }}>
                  {form.pdf_url ? form.pdf_url.split('/').pop() : 'Sin archivo'}
                </span>
              </div>

              {picker === 'portada' && (
                <StoragePicker
                  folder="portada"
                  accept="image/*"
                  title="Seleccionar portada"
                  onSelect={path => setForm(p => ({ ...p, portada_url: path }))}
                  onClose={() => setPicker(null)}
                />
              )}
              {picker === 'pdf' && (
                <StoragePicker
                  folder="pdfs"
                  accept="application/pdf"
                  title="Seleccionar PDF"
                  onSelect={path => setForm(p => ({ ...p, pdf_url: path }))}
                  onClose={() => setPicker(null)}
                />
              )}
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="button" onClick={() => setEditando(false)} style={{ ...btnOutline(C.textLight), flex: 1 }}>Cancelar</button>
                <button type="submit" disabled={guardando} style={{ ...btn(C.primary), flex: 1 }}>{guardando ? 'Guardando…' : 'Guardar cambios'}</button>
              </div>
            </form>
          )}
        </div>

        {/* Unidades */}
        <div style={{ ...S.card, padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>
              Unidades <span style={{ color: C.textLight, fontWeight: 400, fontSize: 13 }}>({unidades.length})</span>
            </span>
          </div>

          {unidades.length === 0 ? (
            <p style={{ fontSize: 14, color: C.textLight, marginBottom: 16 }}>Este libro no tiene unidades aún.</p>
          ) : (
            unidades.map((u, i) => (
              <UnidadRow
                key={u.id}
                unidad={u}
                index={i}
                total={unidades.length}
                onMover={handleMover}
                onNuevaActividad={(unidadId, orden, reload) => setModalAct({ unidadId, orden, reload })}
                onUpdate={handleUnidadUpdate}
                onDelete={handleUnidadDelete}
              />
            ))
          )}

          {!nuevaUnidadOpen ? (
            <button onClick={() => setNuevaUnidadOpen(true)} style={{ ...btn(C.success, 'sm'), marginTop: 8 }}>
              + Nueva unidad
            </button>
          ) : (
            <form onSubmit={handleNuevaUnidad} style={{ marginTop: 12, border: `1px solid ${C.border}`, borderRadius: 10, padding: '16px 20px', background: '#F0FDF4' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.success, marginBottom: 14 }}>Nueva unidad</div>
              <CamposUnidad form={nuevaUnidad} onChange={setNuevaUnidad} />
              <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                <button type="button" onClick={() => { setNuevaUnidadOpen(false); setNuevaUnidad({ titulo: '', subtitulo: '', texto: '' }) }} style={{ ...btnOutline(C.textLight), flex: 1 }}>
                  Cancelar
                </button>
                <button type="submit" style={{ ...btn(C.success), flex: 1 }}>Crear unidad</button>
              </div>
            </form>
          )}
        </div>
      </div>

      {modalAct && (
        <ModalActividad
          unidadId={modalAct.unidadId}
          orden={modalAct.orden}
          onClose={() => setModalAct(null)}
          onSave={async (data) => {
            await createActividad(modalAct.unidadId, data)
            modalAct.reload()
          }}
        />
      )}
    </AdminLayout>
  )
}
