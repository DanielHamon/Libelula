import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getProgresoConRespuestas, getProgresoClaseCompleta } from '../services/docente.service'
import { useWindowWidth } from '../hooks/useWindowWidth'
import { C as Cact, TIPO_CONFIG as TipoConfig } from '../components/ActivityCard'

const C = {
  navy: '#1e3a8a', navyDark: '#1e2f6e',
  primary: '#2563EB', primaryLight: '#DBEAFE',
  success: '#16A34A', successLight: '#DCFCE7',
  warning: '#F59E0B', warningLight: '#FEF3C7',
  danger: '#EF4444', dangerLight: '#FEE2E2',
  text: '#1F2937', textLight: '#6B7280',
  border: '#E5E7EB', bg: '#F8FAFC',
}

const card = {
  background: '#fff', borderRadius: 16, padding: 20,
  boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
  border: '1px solid #E5E7EB',
}

const TIPO_LABEL = {
  sopaLetras: 'Sopa letras', seleccionMultiple: 'Selección múlt.', verdaderoFalso: 'V/F',
  completarPalabras: 'Completar', ordenarEventos: 'Ordenar', escribirCarta: 'Carta',
  completarMapa: 'Mapa', emparejar: 'Emparejar', identificar: 'Identificar',
  termometroEmocional: 'Termómetro',
  colorear: 'Colorear', dibujoLibre: 'Dibujo', video: 'Video', audio: 'Audio', imagen: 'Imagen',
}

const TIPO_COLOR = {
  sopaLetras: '#16A34A', seleccionMultiple: '#e91e8c', verdaderoFalso: '#00897b',
  completarPalabras: '#7b1fa2', ordenarEventos: '#1e88e5', escribirCarta: '#e65100',
  completarMapa: '#4caf50', emparejar: '#1e88e5', identificar: '#e65100',
  termometroEmocional: '#e65100',
  colorear: '#e91e8c', dibujoLibre: '#e91e8c', video: '#1e88e5', audio: '#7b1fa2', imagen: '#00897b',
}

const NO_COMPLETE_TYPES = new Set(['video', 'audio', 'imagen'])
const TIPOS_INCOMPLETA = new Set(['sopaLetras', 'verdaderoFalso', 'emparejar', 'ordenarEventos'])

function formatEstado(tipo, completada, es_correcta) {
  if (NO_COMPLETE_TYPES.has(tipo)) return 'N/A'
  if (!completada) return TIPOS_INCOMPLETA.has(tipo) ? 'Incompleta' : 'Sin realizar'
  if (es_correcta === true) return 'Correcta'
  if (es_correcta === false) return 'Incorrecta'
  return 'Completada'
}

function formatRespuesta(tipo, respuesta) {
  if (!respuesta) return null
  try {
    switch (tipo) {
      case 'seleccionMultiple':
        {
          const selecciones = Array.isArray(respuesta.seleccionadas)
            ? respuesta.seleccionadas.filter(Boolean)
            : respuesta.opcionElegida
              ? [respuesta.opcionElegida]
              : []
          return selecciones.length ? `Seleccionó: ${selecciones.join(' | ')}` : 'Sin selección'
        }
      case 'verdaderoFalso':
        return (respuesta.respuestas || [])
          .map(r => `${r.esCorrecta ? '✅' : '❌'} ${r.texto?.slice(0, 40) ?? ''} → ${r.respondio ? 'Verdadero' : 'Falso'}`)
          .join('\n')
      case 'completarPalabras':
        return (respuesta.respuestas || []).map((r, i) => `(${i + 1}) "${r.dada}" ← correcta: "${r.correcta}"`).join(' | ')
      case 'ordenarEventos':
        return (respuesta.orden || []).map((t, i) => `${i + 1}. ${t}`).join(' → ')
      case 'escribirCarta': {
        const txt = respuesta.texto || ''
        return txt.length > 120 ? txt.slice(0, 120) + '…' : txt
      }
      case 'completarMapa':
        return Object.values(respuesta.valores || {}).filter(Boolean).join(' | ')
      case 'emparejar':
        return `${(respuesta.parejas || []).length} pares: ${(respuesta.parejas || []).map(p => `${p.izquierda}↔${p.derecha}`).join(', ')}`
      case 'identificar':
        return `Identificó: ${(respuesta.seleccionadas || []).join(', ')}`
      case 'termometroEmocional': {
        const termometro = normalizarTermometroRespuesta(respuesta)[0]
        return termometro ? `${termometro.label}: ${termometro.valor}/${termometro.max}${termometro.estado?.texto ? ` · ${termometro.estado.emoji || ''} ${termometro.estado.texto}` : ''}` : ''
      }
      case 'sopaLetras':
        return `Palabras: ${(respuesta.palabrasEncontradas || []).join(', ')}`
      case 'colorear':
      case 'dibujoLibre':
        return 'Completó el dibujo'
      default:
        return null
    }
  } catch { return null }
}

function formatCSVCell(tipo, respuesta) {
  if (!respuesta) return ''
  try {
    switch (tipo) {
      case 'seleccionMultiple': {
        const selecciones = Array.isArray(respuesta.seleccionadas)
          ? respuesta.seleccionadas.filter(Boolean)
          : respuesta.opcionElegida
            ? [respuesta.opcionElegida]
            : []
        return selecciones.join('; ')
      }
      case 'verdaderoFalso':
        return (respuesta.respuestas || [])
          .map(r => `${r.texto}: ${r.respondio ? 'V' : 'F'} (${r.esCorrecta ? 'ok' : 'mal'})`)
          .join('; ')
      case 'completarPalabras':
        return (respuesta.respuestas || []).map(r => `"${r.dada}" (correcta: "${r.correcta}")`).join('; ')
      case 'ordenarEventos': return (respuesta.orden || []).join(' > ')
      case 'escribirCarta': return (respuesta.texto || '').replace(/\n/g, ' ')
      case 'completarMapa': return Object.values(respuesta.valores || {}).filter(Boolean).join('; ')
      case 'emparejar': return (respuesta.parejas || []).map(p => `${p.izquierda}=${p.derecha}`).join('; ')
      case 'identificar': return (respuesta.seleccionadas || []).join('; ')
      case 'termometroEmocional': {
        const termometro = normalizarTermometroRespuesta(respuesta)[0]
        return termometro ? `${termometro.label}: ${termometro.valor}/${termometro.max}${termometro.estado?.texto ? ` - ${termometro.estado.emoji || ''} ${termometro.estado.texto}` : ''}` : ''
      }
      case 'sopaLetras': return (respuesta.palabrasEncontradas || []).join('; ')
      case 'colorear': case 'dibujoLibre': return 'Completado'
      default: return ''
    }
  } catch { return '' }
}

function downloadCSV(filename, rows) {
  const content = 'sep=;\n' + rows.map(row =>
    row.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(';')
  ).join('\n')
  const blob = new Blob(['﻿' + content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

function exportarEstudiante(nombreEst, actividades) {
  const rows = [['Unidad', 'Actividad', 'Tipo', 'Estado', 'Respuesta']]
  for (const act of actividades) {
    rows.push([
      act.unidadTitulo, act.titulo, TIPO_LABEL[act.tipo] || act.tipo,
      formatEstado(act.tipo, act.completada, act.es_correcta),
      formatCSVCell(act.tipo, act.respuesta),
    ])
  }
  downloadCSV(`respuestas_${nombreEst.replace(/\s+/g, '_')}.csv`, rows)
}

export default function DocenteRespuestaEstudiante() {
  const { claseId, estudianteId } = useParams()
  const navigate = useNavigate()
  const width = useWindowWidth()
  const isMobile = width < 768

  const [estudiante, setEstudiante] = useState(null)
  const [clase, setClase] = useState(null)
  const [libros, setLibros] = useState([])
  const [libroSel, setLibroSel] = useState('')
  const [unidades, setUnidades] = useState([])
  const [unidadSel, setUnidadSel] = useState('all')
  const [unidadesData, setUnidadesData] = useState([])
  const [tipoFiltro, setTipoFiltro] = useState('')
  const [estadoFiltro, setEstadoFiltro] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadingActs, setLoadingActs] = useState(false)
  const [exportandoClase, setExportandoClase] = useState(false)
  const [detalleOpen, setDetalleOpen] = useState(false)

  useEffect(() => { init() }, [])

  async function init() {
    try {
      const [claseRes, estRes] = await Promise.all([
        supabase.from('clases').select('nombre, codigo, clase_libros(libro_id, libro_titulo)').eq('id', claseId).single(),
        supabase.from('profiles').select('nombre, email').eq('id', estudianteId).single(),
      ])
      const claseData = claseRes.data
      const librosList = (claseData?.clase_libros || []).map(l => ({ id: l.libro_id, titulo: l.libro_titulo }))
      setClase(claseData)
      setLibros(librosList)
      setEstudiante(estRes.data)
      if (librosList.length > 0) setLibroSel(librosList[0].id)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  useEffect(() => {
    if (!libroSel) return
    cargarUnidades()
  }, [libroSel])

  async function cargarUnidades() {
    const { data } = await supabase.from('unidades').select('id, titulo, orden').eq('libro_id', libroSel).order('orden')
    setUnidades(data || [])
    setUnidadSel('all')
  }

  useEffect(() => {
    if (!libroSel) return
    cargarActividades()
  }, [libroSel, unidadSel])

  async function cargarActividades() {
    setLoadingActs(true)
    setTipoFiltro('')
    setEstadoFiltro('')
    try {
      const uid = unidadSel === 'all' ? null : unidadSel
      const data = await getProgresoConRespuestas(estudianteId, libroSel, uid)
      setUnidadesData(data)
    } catch (e) { console.error(e) }
    finally { setLoadingActs(false) }
  }

  async function handleExportarClase() {
    setExportandoClase(true)
    try {
      const uid = unidadSel === 'all' ? null : unidadSel
      const { estudiantes, unidades: uds, rIdx, pIdx } = await getProgresoClaseCompleta(claseId, libroSel, uid)
      const libroTitulo = libros.find(l => l.id === libroSel)?.titulo || libroSel
      const rows = [['Estudiante', 'Email', 'Unidad', 'Actividad', 'Tipo', 'Estado', 'Respuesta']]
      for (const est of estudiantes) {
        const pSet = pIdx[est.id] || new Set()
        const rData = rIdx[est.id] || {}
        for (const u of uds) {
          for (const act of u.actividades) {
            if (tipoFiltro && act.tipo !== tipoFiltro) continue
            const comp = pSet.has(act.id)
            const resp = rData[act.id]
            const estado = formatEstado(act.tipo, comp, resp?.es_correcta ?? null)
            if (estadoFiltro && estado !== estadoFiltro) continue
            rows.push([
              est.nombre, est.email, u.titulo, act.titulo,
              TIPO_LABEL[act.tipo] || act.tipo,
              estado,
              formatCSVCell(act.tipo, resp?.respuesta || null),
            ])
          }
        }
      }
      downloadCSV(`respuestas_clase_${libroTitulo.replace(/\s+/g, '_')}.csv`, rows)
    } catch (e) { console.error(e) }
    finally { setExportandoClase(false) }
  }

  const todasActividades = unidadesData.flatMap(u =>
    u.actividades.map(a => ({ ...a, unidadTitulo: u.titulo }))
  )
  const tiposDisponibles = [...new Set(todasActividades.map(a => a.tipo))]
  const actividadesFiltradas = todasActividades
    .filter(a => !tipoFiltro || a.tipo === tipoFiltro)
    .filter(a => !estadoFiltro || formatEstado(a.tipo, a.completada, a.es_correcta) === estadoFiltro)

  const completadas = actividadesFiltradas.filter(a => a.completada && !NO_COMPLETE_TYPES.has(a.tipo)).length
  const totales = actividadesFiltradas.filter(a => !NO_COMPLETE_TYPES.has(a.tipo)).length
  const correctas = actividadesFiltradas.filter(a => a.es_correcta === true).length
  const incorrectas = actividadesFiltradas.filter(a => a.es_correcta === false).length

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg }}>
      <Spinner />
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', fontFamily: 'Nunito', background: C.bg }}>
      <nav style={{
        background: `linear-gradient(135deg, ${C.navy}, ${C.navyDark})`,
        padding: '0 24px', height: 60, display: 'flex', alignItems: 'center', gap: 16,
        position: 'sticky', top: 0, zIndex: 100, boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
      }}>
        <button onClick={() => navigate(`/panel-docente/clase/${claseId}`)} style={{
          background: 'rgba(255,255,255,0.12)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)',
          borderRadius: 8, padding: '6px 14px', fontSize: 13, fontWeight: 700,
          cursor: 'pointer', fontFamily: 'Nunito', flexShrink: 0,
        }}>← Clase</button>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', lineHeight: 1 }}>Respuestas del estudiante</div>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {estudiante?.nombre || '…'}
          </div>
        </div>
      </nav>

      <div style={{ padding: isMobile ? '20px 16px' : '28px 40px', maxWidth: 1100, margin: '0 auto' }}>

        {/* Student + class info */}
        <div style={{ ...card, marginBottom: 20, display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center' }}>
          <div style={{
            width: 48, height: 48, borderRadius: '50%', flexShrink: 0,
            background: C.primary, color: '#fff', display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontWeight: 800, fontSize: 20,
          }}>
            {(estudiante?.nombre || '?').trim().split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: C.text }}>{estudiante?.nombre || 'Estudiante'}</div>
            {estudiante?.email && <div style={{ fontSize: 13, color: C.textLight }}>{estudiante.email}</div>}
            <div style={{ fontSize: 12, color: C.textLight, marginTop: 2 }}>Clase: <strong style={{ color: C.text }}>{clase?.nombre}</strong></div>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <StatBadge label="Completadas" value={`${completadas}/${totales}`} color={C.primary} bg={C.primaryLight} />
            <StatBadge label="Correctas" value={correctas} color={C.success} bg={C.successLight} />
            {incorrectas > 0 && <StatBadge label="Incorrectas" value={incorrectas} color={C.danger} bg={C.dangerLight} />}
          </div>
        </div>

        {/* Filters */}
        <div style={{ ...card, marginBottom: 20, display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center' }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: C.textLight, textTransform: 'uppercase', letterSpacing: 0.6, display: 'block', marginBottom: 4 }}>Libro</label>
            <select
              value={libroSel}
              onChange={e => setLibroSel(e.target.value)}
              style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 12px', fontSize: 13, fontWeight: 600, color: C.text, background: '#fff', fontFamily: 'Nunito' }}
            >
              {libros.map(l => <option key={l.id} value={l.id}>{l.titulo}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: C.textLight, textTransform: 'uppercase', letterSpacing: 0.6, display: 'block', marginBottom: 4 }}>Unidad</label>
            <select
              value={unidadSel}
              onChange={e => setUnidadSel(e.target.value)}
              style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 12px', fontSize: 13, fontWeight: 600, color: C.text, background: '#fff', fontFamily: 'Nunito' }}
            >
              <option value="all">Todas las unidades</option>
              {unidades.map(u => <option key={u.id} value={u.id}>{u.titulo}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: C.textLight, textTransform: 'uppercase', letterSpacing: 0.6, display: 'block', marginBottom: 4 }}>Tipo</label>
            <select
              value={tipoFiltro}
              onChange={e => setTipoFiltro(e.target.value)}
              style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 12px', fontSize: 13, fontWeight: 600, color: C.text, background: '#fff', fontFamily: 'Nunito' }}
            >
              <option value="">Todos los tipos</option>
              {tiposDisponibles.map(t => <option key={t} value={t}>{TIPO_LABEL[t] || t}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: C.textLight, textTransform: 'uppercase', letterSpacing: 0.6, display: 'block', marginBottom: 4 }}>Estado</label>
            <select
              value={estadoFiltro}
              onChange={e => setEstadoFiltro(e.target.value)}
              style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 12px', fontSize: 13, fontWeight: 600, color: C.text, background: '#fff', fontFamily: 'Nunito' }}
            >
              <option value="">Todos los estados</option>
              {['Correcta', 'Incorrecta', 'Completada', 'Incompleta', 'Sin realizar', 'N/A'].map(e => (
                <option key={e} value={e}>{e}</option>
              ))}
            </select>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              onClick={() => setDetalleOpen(true)}
              disabled={actividadesFiltradas.length === 0}
              style={exportBtn('#7b1fa2', actividadesFiltradas.length === 0)}
            >
              👁 Ver detalle
            </button>
            <button
              onClick={() => exportarEstudiante(estudiante?.nombre || 'estudiante', actividadesFiltradas)}
              disabled={actividadesFiltradas.length === 0}
              style={exportBtn(C.primary, actividadesFiltradas.length === 0)}
            >
              ↓ Exportar este estudiante
            </button>
            <button
              onClick={handleExportarClase}
              disabled={exportandoClase || !libroSel}
              style={exportBtn(C.navy, exportandoClase || !libroSel)}
            >
              {exportandoClase ? 'Exportando…' : '↓ Exportar clase completa'}
            </button>
          </div>
        </div>

        {/* Activities table */}
        {loadingActs ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><Spinner /></div>
        ) : actividadesFiltradas.length === 0 ? (
          <div style={{ ...card, padding: '48px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>Sin actividades</div>
            <div style={{ fontSize: 13, color: C.textLight, marginTop: 4 }}>No hay actividades para la selección actual.</div>
          </div>
        ) : (
          <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
            {isMobile ? (
              <div>
                {actividadesFiltradas.map((act, idx) => (
                  <ActividadMobileRow key={act.id} act={act} idx={idx} total={actividadesFiltradas.length} />
                ))}
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: C.bg }}>
                    {['#', 'Unidad', 'Actividad', 'Tipo', 'Estado', 'Correcta'].map(h => (
                      <th key={h} style={{ padding: '11px 14px', textAlign: 'left', fontWeight: 700, color: C.textLight, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {actividadesFiltradas.map((act, idx) => {
                    const esNA = NO_COMPLETE_TYPES.has(act.tipo)
                    const tipoColor = TIPO_COLOR[act.tipo] || C.textLight
                    return (
                      <tr key={act.id} style={{ borderTop: `1px solid ${C.border}`, background: idx % 2 === 1 ? '#FAFAFA' : '#fff' }}>
                        <td style={{ padding: '10px 14px', color: C.textLight, fontWeight: 700, width: 32 }}>{idx + 1}</td>
                        <td style={{ padding: '10px 14px', color: C.textLight, maxWidth: 120 }}>
                          <span style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{act.unidadTitulo}</span>
                        </td>
                        <td style={{ padding: '10px 14px', fontWeight: 700, color: C.text, maxWidth: 200 }}>
                          <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{act.titulo}</span>
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{ background: tipoColor + '18', color: tipoColor, borderRadius: 6, padding: '3px 8px', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>
                            {TIPO_LABEL[act.tipo] || act.tipo}
                          </span>
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          {esNA
                            ? <span style={{ color: C.textLight, fontSize: 12 }}>—</span>
                            : act.completada
                              ? <span style={{ background: C.successLight, color: C.success, borderRadius: 6, padding: '3px 10px', fontSize: 12, fontWeight: 700 }}>✅ Completa</span>
                              : TIPOS_INCOMPLETA.has(act.tipo)
                                ? <span style={{ background: C.warningLight, color: C.warning, borderRadius: 6, padding: '3px 10px', fontSize: 12, fontWeight: 700 }}>⏳ Incompleta</span>
                                : <span style={{ background: '#F3F4F6', color: C.textLight, borderRadius: 6, padding: '3px 10px', fontSize: 12, fontWeight: 700 }}>Sin realizar</span>
                          }
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <CorrectaCell act={act} />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
      {detalleOpen && (
        <DetalleModal
          actividadesFiltradas={actividadesFiltradas}
          estudiante={estudiante}
          isMobile={isMobile}
          onClose={() => setDetalleOpen(false)}
        />
      )}
    </div>
  )
}

function ActividadMobileRow({ act, idx, total }) {
  const esNA = NO_COMPLETE_TYPES.has(act.tipo)
  const tipoColor = TIPO_COLOR[act.tipo] || C.textLight

  return (
    <div style={{ borderBottom: idx < total - 1 ? `1px solid ${C.border}` : 'none', padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <span style={{ background: tipoColor + '18', color: tipoColor, borderRadius: 6, padding: '3px 8px', fontSize: 11, fontWeight: 700, flexShrink: 0, marginTop: 2 }}>
          {TIPO_LABEL[act.tipo] || act.tipo}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, color: C.text, fontSize: 13, marginBottom: 2 }}>{act.titulo}</div>
          <div style={{ fontSize: 11, color: C.textLight }}>{act.unidadTitulo}</div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0, alignItems: 'center' }}>
          {!esNA && (act.completada
            ? <span style={{ color: C.success, fontWeight: 700, fontSize: 13 }}>✅</span>
            : TIPOS_INCOMPLETA.has(act.tipo)
              ? <span style={{ color: C.warning, fontWeight: 700, fontSize: 13 }}>⏳</span>
              : <span style={{ color: C.textLight, fontSize: 13 }}>—</span>
          )}
          {act.tipo === 'verdaderoFalso' && act.respuesta?.respuestas?.length > 0
            ? (() => {
                const total = act.respuesta.respuestas.length
                const correct = act.respuesta.respuestas.filter(r => r.esCorrecta).length
                return <span style={{ color: correct === total ? C.success : C.warning, fontWeight: 700, fontSize: 13 }}>{correct}/{total}</span>
              })()
            : act.es_correcta === true
              ? <span style={{ color: C.success, fontWeight: 700, fontSize: 13 }}>✓</span>
              : act.es_correcta === false
                ? <span style={{ color: C.danger, fontWeight: 700, fontSize: 13 }}>✗</span>
                : null
          }
        </div>
      </div>
    </div>
  )
}

function CorrectaCell({ act }) {
  if (!act.completada) return <span style={{ color: C.textLight, fontSize: 12 }}>—</span>
  if (act.tipo === 'verdaderoFalso' && act.respuesta?.respuestas?.length > 0) {
    const total = act.respuesta.respuestas.length
    const correct = act.respuesta.respuestas.filter(r => r.esCorrecta).length
    return <span style={{ fontWeight: 700, fontSize: 13, color: correct === total ? C.success : C.warning }}>{correct}/{total}</span>
  }
  if (act.es_correcta === true) return <span style={{ color: C.success, fontWeight: 700, fontSize: 13 }}>✅</span>
  if (act.es_correcta === false) return <span style={{ color: C.danger, fontWeight: 700, fontSize: 13 }}>❌</span>
  return <span style={{ color: C.textLight, fontSize: 12 }}>N/A</span>
}

function StatBadge({ label, value, color, bg }) {
  return (
    <div style={{ background: bg, borderRadius: 10, padding: '8px 14px', textAlign: 'center' }}>
      <div style={{ fontSize: 20, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, color, fontWeight: 600, marginTop: 2 }}>{label}</div>
    </div>
  )
}

function exportBtn(color, disabled) {
  return {
    background: disabled ? '#E5E7EB' : color,
    color: disabled ? '#9CA3AF' : '#fff',
    border: 'none', borderRadius: 10,
    padding: '8px 16px', fontSize: 13, fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: 'Nunito',
  }
}

// ── Modal de detalle completo ─────────────────────────────────────────────────
function DetalleModal({ actividadesFiltradas, estudiante, isMobile, onClose }) {
  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: isMobile ? 0 : '24px' }}
    >
      <div style={{ background: '#f8fafb', borderRadius: isMobile ? 0 : 20, width: isMobile ? '100%' : '92%', maxWidth: 820, height: isMobile ? '100dvh' : '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,0.28)' }}>
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff', flexShrink: 0 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16, color: '#1F2937' }}>Vista del estudiante</div>
            {estudiante?.nombre && <div style={{ fontSize: 12, color: '#6B7280', marginTop: 1 }}>{estudiante.nombre}</div>}
          </div>
          <button onClick={onClose} style={{ background: '#F3F4F6', border: 'none', borderRadius: 10, width: 36, height: 36, cursor: 'pointer', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Nunito' }}>✕</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '16px 12px' : '24px 28px', background: '#fff9fb' }}>
          {actividadesFiltradas.map((act, idx) => (
            <ActivityReadOnly key={act.id} act={act} numero={idx + 1} isMobile={isMobile} />
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Tarjeta read-only de actividad ────────────────────────────────────────────
function ActivityReadOnly({ act, numero, isMobile }) {
  const cfg = TipoConfig[act.tipo] || { icon: '📄', label: act.tipo || 'Actividad', color: '#757575', bg: '#F3F4F6' }
  const resp = act.respuesta

  return (
    <div style={{ background: '#fff', border: '2px solid #fce4f3', borderRadius: 18, boxShadow: '0 4px 24px rgba(233,30,140,0.09)', padding: isMobile ? '20px 16px 24px' : '28px 32px 32px', marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 20 }}>
        <div style={{ width: isMobile ? 40 : 48, height: isMobile ? 40 : 48, borderRadius: '50%', flexShrink: 0, background: cfg.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Fredoka One', cursive", fontSize: isMobile ? 17 : 21, boxShadow: `0 3px 12px ${cfg.color}55` }}>{numero}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: isMobile ? 17 : 21, fontWeight: 800, color: Cact.text, lineHeight: 1.3 }}>{act.titulo}</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
            <span style={{ background: cfg.bg, color: cfg.color, fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 20 }}>{cfg.icon} {cfg.label}</span>
            {act.completada
              ? <span style={{ background: Cact.greenLight, color: Cact.green, fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 20 }}>✅ Completada</span>
              : !NO_COMPLETE_TYPES.has(act.tipo) && <span style={{ background: '#F3F4F6', color: Cact.textMuted, fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 20 }}>Sin realizar</span>
            }
          </div>
        </div>
      </div>
      <ReadOnlyContent act={act} resp={resp} isMobile={isMobile} />
    </div>
  )
}

function ReadOnlyContent({ act, resp, isMobile }) {
  if (NO_COMPLETE_TYPES.has(act.tipo)) {
    if (act.tipo === 'video') return <ROVideo url={act.url} titulo={act.videoTitulo} />
    if (act.tipo === 'audio') return <ROAudio url={act.url} titulo={act.titulo} />
    if (act.tipo === 'imagen') return <ROImagen imagenUrl={act.imagenUrl} descripcion={act.descripcion} />
  }
  if (!resp) return <div style={{ color: Cact.textMuted, fontSize: 14, fontStyle: 'italic', textAlign: 'center', padding: '20px 0' }}>No hay respuesta guardada.</div>
  switch (act.tipo) {
    case 'seleccionMultiple': return <ROSeleccion act={act} resp={resp} />
    case 'verdaderoFalso':    return <ROVerdaderoFalso act={act} resp={resp} />
    case 'completarPalabras': return <ROCompletarPalabras act={act} resp={resp} />
    case 'ordenarEventos':    return <ROOrdenarEventos act={act} resp={resp} />
    case 'escribirCarta':     return <ROEscribirCarta resp={resp} />
    case 'completarMapa':     return <ROCompletarMapa act={act} resp={resp} />
    case 'emparejar':         return <ROEmparejar act={act} resp={resp} />
    case 'sopaLetras':        return <ROSopaLetras act={act} resp={resp} />
    case 'identificar':       return <ROIdentificar act={act} resp={resp} />
    case 'termometroEmocional': return <ROTermometro resp={resp} />
    case 'colorear':          return <ROColorear resp={resp} />
    case 'dibujoLibre':       return <RODibujoLibre resp={resp} />
    default: return null
  }
}

function ROVideo({ url, titulo }) {
  if (!url) return null
  const embedUrl = url.includes('youtu') ? url.replace('watch?v=', 'embed/').replace('youtu.be/', 'www.youtube.com/embed/') : url
  return (
    <div>
      {titulo && <p style={{ fontSize: 13, color: Cact.textMuted, margin: '0 0 8px' }}>{titulo}</p>}
      <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0, borderRadius: 12, overflow: 'hidden', border: `1px solid ${Cact.border}` }}>
        <iframe src={embedUrl} title={titulo || 'video'} allowFullScreen style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }} />
      </div>
    </div>
  )
}
function ROAudio({ url, titulo }) {
  if (!url) return null
  return (
    <div style={{ background: Cact.purpleLight, borderRadius: 14, padding: 16 }}>
      {titulo && <p style={{ fontSize: 13, fontWeight: 600, color: Cact.purple, margin: '0 0 10px' }}>{titulo}</p>}
      <audio controls src={url} style={{ width: '100%' }} />
    </div>
  )
}
function ROImagen({ imagenUrl, descripcion }) {
  if (!imagenUrl) return null
  return (
    <div>
      <img src={imagenUrl} alt={descripcion || ''} style={{ width: '100%', maxHeight: 380, objectFit: 'contain', borderRadius: 12, border: `1px solid ${Cact.border}` }} />
      {descripcion && <p style={{ fontSize: 13, color: Cact.textMuted, margin: '8px 0 0' }}>{descripcion}</p>}
    </div>
  )
}

function ROSeleccion({ act, resp }) {
  const opciones = act.opciones || []
  const seleccionadas = new Set(Array.isArray(resp?.seleccionadasIndices) ? resp.seleccionadasIndices : [])
  const respSingle = resp?.indice ?? -1
  const hasMulti = Array.isArray(resp?.respuestas) || Array.isArray(resp?.seleccionadasIndices) || Array.isArray(resp?.seleccionadas)
  return (
    <div>
      {act.pregunta && <p style={{ fontSize: 15, fontWeight: 700, color: Cact.text, marginBottom: 14 }}>{act.pregunta}</p>}
      {hasMulti ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {opciones.map((op, i) => {
            const r = Array.isArray(resp?.respuestas) ? resp.respuestas[i] : null
            const sel = r ? !!r.seleccionada : seleccionadas.has(i)
            const ok = r ? !!r.esCorrecta && !!r.seleccionada : !!op.esCorrecta
            const missed = r ? !!r.esCorrecta && !r.seleccionada : !!op.esCorrecta && !sel
            const bad = r ? !!r.seleccionada && !r.esCorrecta : sel && !op.esCorrecta
            const bg = ok ? Cact.greenLight : bad ? Cact.redLight : missed ? '#FFF7ED' : sel ? Cact.pinkLight : '#F9FAFB'
            const border = ok ? `2px solid ${Cact.green}` : bad ? `2px solid ${Cact.red}` : missed ? '2px solid #F59E0B' : sel ? '2px solid #E91E8C' : '2px solid #E5E7EB'
            const textColor = ok ? Cact.green : bad ? Cact.red : missed ? '#B45309' : Cact.text
            return (
              <div key={i} style={{ background: bg, border, borderRadius: 12, padding: '11px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ width: 28, height: 28, borderRadius: 8, background: sel || ok ? (ok ? Cact.green : bad ? Cact.red : '#E91E8C') : '#E5E7EB', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                  {ok ? '✓' : bad ? '✗' : missed ? '!' : String.fromCharCode(65 + i)}
                </span>
                <span style={{ fontSize: 15, fontWeight: sel || ok || bad || missed ? 700 : 500, color: textColor }}>{op.texto}</span>
              </div>
            )
          })}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {opciones.map((op, i) => {
            const sel = i === respSingle
            const ok = !!op.esCorrecta
            const bg = sel && ok ? Cact.greenLight : sel && !ok ? Cact.redLight : ok ? Cact.greenLight + '60' : '#F9FAFB'
            const border = sel && ok ? `2px solid ${Cact.green}` : sel && !ok ? `2px solid ${Cact.red}` : ok ? `2px solid ${Cact.green}50` : '2px solid #E5E7EB'
            const textColor = sel && ok ? Cact.green : sel && !ok ? Cact.red : Cact.text
            return (
              <div key={i} style={{ background: bg, border, borderRadius: 12, padding: '11px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ width: 28, height: 28, borderRadius: '50%', background: sel ? (ok ? Cact.green : Cact.red) : '#E5E7EB', color: sel ? '#fff' : '#9CA3AF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                  {sel ? (ok ? '✓' : '✗') : String.fromCharCode(65 + i)}
                </span>
                <span style={{ fontSize: 15, fontWeight: sel ? 700 : 500, color: textColor }}>{op.texto}</span>
              </div>
            )
          })}
        </div>
      )}
      {hasMulti && act.retroalimentacionError && Array.isArray(resp?.respuestas) && resp.respuestas.some(r => r.seleccionada && !r.esCorrecta) && (
        <div style={{ marginTop: 12, padding: '10px 14px', background: Cact.redLight, borderRadius: 10, fontSize: 14, color: Cact.red }}>❌ {act.retroalimentacionError}</div>
      )}
    </div>
  )
}

function ROVerdaderoFalso({ act, resp }) {
  const afirmaciones = act.afirmaciones || []
  const respData = resp?.respuestas || []
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {afirmaciones.map((af, i) => {
        const rData = respData.find(r => r.texto === af.texto)
        const respondio = rData?.respondio
        const esCorrecta = rData?.esCorrecta
        const responded = rData !== undefined
        return (
          <div key={i} style={{ borderRadius: 14, padding: '14px 16px', border: `2px solid ${responded && esCorrecta ? Cact.green : responded && !esCorrecta ? Cact.red : '#E5E7EB'}`, background: responded && esCorrecta ? Cact.greenLight : responded && !esCorrecta ? Cact.redLight : '#F9FAFB' }}>
            <p style={{ margin: '0 0 12px', fontWeight: 600, fontSize: 15, color: Cact.text }}>{af.texto}</p>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              {[true, false].map(val => {
                const sel = respondio === val
                const btnBg = sel ? (esCorrecta ? Cact.green : Cact.red) : '#fff'
                const btnBorder = sel ? `2px solid ${esCorrecta ? Cact.green : Cact.red}` : '2px solid #E5E7EB'
                return (
                  <div key={String(val)} style={{ background: btnBg, border: btnBorder, borderRadius: 10, padding: '8px 20px', fontSize: 14, fontWeight: 700, color: sel ? '#fff' : Cact.textMuted }}>
                    {val ? 'Verdadero' : 'Falso'}
                  </div>
                )
              })}
              {responded && <span style={{ marginLeft: 'auto', fontSize: 18 }}>{esCorrecta ? '✅' : '❌'}</span>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ROCompletarPalabras({ act, resp }) {
  const partes = (act.texto || '').split(/\{\{[^}]*\}\}/)
  const respuestas = resp?.respuestas || []
  return (
    <div style={{ fontSize: 16, lineHeight: 2.2, color: Cact.text }}>
      {partes.map((parte, i) => (
        <span key={i}>
          {parte}
          {i < partes.length - 1 && (() => {
            const r = respuestas[i]
            const ok = r?.dada?.trim().toLowerCase() === r?.correcta?.trim().toLowerCase()
            return (
              <span style={{ display: 'inline-block', minWidth: 72, padding: '2px 10px', borderRadius: 8, background: r?.dada ? (ok ? Cact.greenLight : Cact.redLight) : '#F3F4F6', color: Cact.text, fontWeight: 700, margin: '0 4px', border: `2px solid ${r?.dada ? (ok ? Cact.green : Cact.red) : '#E5E7EB'}`, fontSize: 15 }}>
                {r?.dada || ''}
              </span>
            )
          })()}
        </span>
      ))}
    </div>
  )
}

function ROOrdenarEventos({ act, resp }) {
  const orden = resp?.orden || []
  const originales = (act.eventos || []).map(e => e.texto)
  return (
    <div>
      {act.instruccion && <p style={{ fontSize: 14, color: Cact.textMuted, marginBottom: 12 }}>{act.instruccion}</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {orden.map((texto, i) => {
          const correcto = originales[i] === texto
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#F0F9FF', borderRadius: 12, padding: '11px 16px', border: `2px solid ${Cact.blue}25` }}>
              <span style={{ width: 28, height: 28, borderRadius: '50%', background: Cact.blue, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14, flexShrink: 0 }}>{i + 1}</span>
              <span style={{ flex: 1, fontSize: 15, fontWeight: 600, color: Cact.text }}>{texto}</span>
              <span style={{ fontSize: 16 }}>{correcto ? '✅' : '❌'}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ROEscribirCarta({ resp }) {
  return (
    <div style={{ border: `2px solid ${Cact.pinkLight}`, borderRadius: 12, background: '#fff', padding: 16, minHeight: 100 }}>
      <p style={{ margin: 0, fontFamily: 'Nunito', fontSize: 15, lineHeight: 1.8, color: Cact.text, whiteSpace: 'pre-wrap' }}>
        {resp?.texto || <span style={{ color: Cact.textMuted, fontStyle: 'italic' }}>Sin texto</span>}
      </p>
    </div>
  )
}

function ROCompletarMapa({ act, resp }) {
  const nodos = act.nodos || []
  const valores = resp?.valores || {}
  return (
    <div>
      {act.instruccion && <p style={{ fontSize: 14, color: Cact.textMuted, marginBottom: 12 }}>{act.instruccion}</p>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        {nodos.map(n => (
          <div key={n.id} style={{ background: Cact.tealLight, borderRadius: 12, padding: '10px 16px', minWidth: 130, border: `2px solid ${Cact.teal}40` }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: Cact.teal, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{n.label}</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: valores[n.id] ? Cact.text : Cact.textMuted, fontStyle: valores[n.id] ? 'normal' : 'italic' }}>{valores[n.id] || 'vacío'}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ROEmparejar({ act, resp }) {
  const pares = act.pares || []
  const parejas = resp?.parejas || []
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {parejas.map((p, i) => {
        const correcto = pares.some(par => par.izquierda === p.izquierda && par.derecha === p.derecha)
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 12, background: '#F0F9FF', border: `2px solid ${Cact.blue}20` }}>
            <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: Cact.text, background: Cact.blueLight, padding: '8px 12px', borderRadius: 8, textAlign: 'center' }}>{p.izquierda}</span>
            <span style={{ fontSize: 16, color: Cact.textMuted }}>↔</span>
            <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: Cact.text, background: Cact.blueLight, padding: '8px 12px', borderRadius: 8, textAlign: 'center' }}>{p.derecha}</span>
            <span style={{ fontSize: 16, flexShrink: 0 }}>{correcto ? '✅' : '❌'}</span>
          </div>
        )
      })}
    </div>
  )
}

function ROSopaLetras({ act, resp }) {
  const palabras = act.palabras || []
  const encontradas = new Set(resp?.palabrasEncontradas || [])
  return (
    <div>
      <p style={{ fontSize: 13, color: Cact.textMuted, marginBottom: 12 }}>Palabras encontradas por el estudiante:</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {palabras.map(p => (
          <span key={p} style={{ padding: '6px 14px', borderRadius: 20, fontWeight: 700, fontSize: 14, background: encontradas.has(p) ? Cact.greenLight : '#F3F4F6', color: encontradas.has(p) ? Cact.green : Cact.textMuted, border: `2px solid ${encontradas.has(p) ? Cact.green : '#E5E7EB'}` }}>
            {p} {encontradas.has(p) ? '✓' : ''}
          </span>
        ))}
      </div>
      <p style={{ fontSize: 12, color: Cact.textMuted, marginTop: 10 }}>{encontradas.size} de {palabras.length} palabras encontradas</p>
    </div>
  )
}

function ROIdentificar({ act, resp }) {
  const opciones = act.opciones || []
  const seleccionadas = new Set(resp?.seleccionadas || [])
  return (
    <div>
      {act.instruccion && <p style={{ fontSize: 14, color: Cact.textMuted, marginBottom: 12 }}>{act.instruccion}</p>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        {opciones.map((op, i) => {
          const sel = seleccionadas.has(op.texto)
          const ok = !!op.esCorrecta
          const bg = sel && ok ? Cact.greenLight : sel && !ok ? Cact.redLight : ok ? Cact.greenLight + '60' : '#F3F4F6'
          const border = sel && ok ? `2px solid ${Cact.green}` : sel && !ok ? `2px solid ${Cact.red}` : ok ? `2px solid ${Cact.green}40` : '2px solid #E5E7EB'
          const textColor = sel && ok ? Cact.green : sel && !ok ? Cact.red : Cact.textMuted
          return (
            <div key={i} style={{ padding: '8px 16px', borderRadius: 20, fontWeight: 700, fontSize: 14, background: bg, color: textColor, border }}>
              {op.texto}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function normalizarTermometroRespuesta(resp) {
  if (!resp) return []
  if (Array.isArray(resp.respuestas) && resp.respuestas.length > 0) return resp.respuestas
  if (resp.valor !== undefined) return [resp]
  return []
}

function ROTermometro({ resp }) {
  const respuestas = normalizarTermometroRespuesta(resp)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {respuestas.map((r, i) => {
        const min = Number(r.min ?? 0)
        const max = Number(r.max ?? 5)
        const valor = Number(r.valor ?? min)
        const percent = max > min ? ((valor - min) / (max - min)) * 100 : 0
        return (
          <div key={r.id || i} style={{ background: '#fff', border: `1px solid ${Cact.border}`, borderRadius: 12, padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 800, color: Cact.text }}>{r.emoji || ''} {r.label || `Termómetro ${i + 1}`}</span>
              <span style={{ fontSize: 13, fontWeight: 800, color: Cact.orange, background: Cact.orangeLight, borderRadius: 20, padding: '4px 10px' }}>{valor} / {max}</span>
            </div>
            <div style={{ height: 10, borderRadius: 999, background: '#F3F4F6', overflow: 'hidden', border: `1px solid ${Cact.border}` }}>
              <div style={{ width: `${Math.max(0, Math.min(100, percent))}%`, height: '100%', background: Cact.orange }} />
            </div>
            {r.estado?.texto && (
              <div style={{ marginTop: 8, fontSize: 15, fontWeight: 800, color: Cact.orange, textAlign: 'center' }}>
                {r.estado.emoji || ''} {r.estado.texto}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, gap: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: Cact.textMuted }}>{r.minLabel || 'Mínimo'}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: Cact.textMuted, textAlign: 'right' }}>{r.maxLabel || 'Máximo'}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ROColorear({ resp }) {
  if (resp?.imageData) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <img src={resp.imageData} alt="Dibujo del estudiante" style={{ width: '100%', maxWidth: 400, borderRadius: 14, border: `1px solid ${Cact.border}`, display: 'block' }} />
      </div>
    )
  }
  return (
    <div style={{ padding: '28px 16px', textAlign: 'center', background: Cact.pinkLight, borderRadius: 14 }}>
      <div style={{ fontSize: 40, marginBottom: 8 }}>🎨</div>
      <p style={{ fontSize: 15, fontWeight: 600, margin: 0, color: Cact.pink }}>El estudiante completó la actividad de colorear.</p>
    </div>
  )
}

function RODibujoLibre({ resp }) {
  if (resp?.imageData) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <img src={resp.imageData} alt="Dibujo del estudiante" style={{ width: '100%', maxWidth: 400, borderRadius: 14, border: `1px solid ${Cact.border}`, display: 'block' }} />
      </div>
    )
  }
  return (
    <div style={{ padding: '28px 16px', textAlign: 'center', background: Cact.pinkLight, borderRadius: 14 }}>
      <div style={{ fontSize: 40, marginBottom: 8 }}>✏️</div>
      <p style={{ fontSize: 15, fontWeight: 600, margin: 0, color: Cact.pink }}>El estudiante completó el dibujo libre.</p>
    </div>
  )
}

function Spinner() {
  return (
    <>
      <div style={{ width: 36, height: 36, border: '4px solid #1e3a8a', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </>
  )
}
