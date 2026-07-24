import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getClaseDetalle, eliminarEstudianteDeClase, getLibrosDisponiblesParaClase, actualizarClase } from '../services/clases.service'
import { useWindowWidth } from '../hooks/useWindowWidth'
import { rememberRecentClass } from '../lib/recentClasses'

const C = {
  primary: '#2563EB', primaryLight: '#DBEAFE',
  success: '#16A34A', successLight: '#DCFCE7',
  accent: '#F97316', accentLight: '#FFF7ED',
  bg: '#F8FAFC',
  text: '#1F2937', textLight: '#6B7280',
  border: '#E5E7EB',
  danger: '#EF4444', dangerLight: '#FEE2E2',
  navy: '#1e3a8a', navyDark: '#1e2f6e',
  purple: '#7C3AED',
}

const card = {
  background: '#fff', borderRadius: 16, padding: 20,
  boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
  border: '1px solid #E5E7EB',
}

function barColor(pct) {
  if (pct >= 80) return C.success
  if (pct >= 50) return C.primary
  if (pct >= 20) return C.accent
  return C.danger
}

function formatNombreCorto(nombre) {
  const parts = nombre.trim().split(' ')
  if (parts.length < 2) return nombre
  return `${parts[0]} ${parts[1][0]}.`
}

function formatFecha(date) {
  if (!date) return '—'
  const now = new Date()
  const diff = now - date
  if (diff < 86400000) return 'Hoy'
  if (diff < 172800000) return 'Ayer'
  return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })
}

function ProgressBar({ value = 0, height = 6, color = C.primary }) {
  return (
    <div style={{ background: '#E5E7EB', borderRadius: height, height, width: '100%', overflow: 'hidden' }}>
      <div style={{
        background: color, height: '100%', borderRadius: height,
        width: `${Math.min(100, Math.max(0, value))}%`,
        transition: 'width 0.5s ease',
      }} />
    </div>
  )
}

function Avatar({ nombre, size = 36 }) {
  const initials = nombre.trim().split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: C.primary, color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 800, fontSize: size * 0.38,
    }}>{initials}</div>
  )
}

function ResumenFila({ bg, color, icon, label, valor }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '10px 14px', background: bg, borderRadius: 10, gap: 8,
    }}>
      <span style={{ fontSize: 13, fontWeight: 700, color, flexShrink: 0 }}>{icon} {label}</span>
      <span style={{
        fontSize: 13, fontWeight: 600, color: C.text,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'right',
      }}>{valor}</span>
    </div>
  )
}

export default function ClaseDetalle() {
  const { claseId } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const width = useWindowWidth()
  const isMobile = width < 768

  const [clase, setClase] = useState(null)
  const [estudiantes, setEstudiantes] = useState([])
  // { uid, nombre, email, progresoData: { libroId: { ids: Set, ultimaActividad: Date|null } } }
  const [unidadesPorLibro, setUnidadesPorLibro] = useState({})
  const [totalPorLibro, setTotalPorLibro] = useState({})
  const [libroSel, setLibroSel] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [librosDisponibles, setLibrosDisponibles] = useState([])
  const [agregarLibroOpen, setAgregarLibroOpen] = useState(false)
  const [editarOpen, setEditarOpen] = useState(false)
  const [editNombre, setEditNombre] = useState('')
  const [editEmoji, setEditEmoji] = useState('🏫')
  const [editLibros, setEditLibros] = useState([])
  const [guardandoEdicion, setGuardandoEdicion] = useState(false)
  const [errorEdicion, setErrorEdicion] = useState('')
  const [estudianteAEliminar, setEstudianteAEliminar] = useState(null)
  const [eliminandoEstudiante, setEliminandoEstudiante] = useState(false)
  const [menuEstudianteId, setMenuEstudianteId] = useState(null)

  useEffect(() => { cargarDatos() }, [claseId])

  useEffect(() => {
    if (!clase || searchParams.get('editar') !== '1') return
    abrirEdicion()
    setSearchParams({}, { replace: true })
  }, [clase, searchParams, setSearchParams])

  async function cargarDatos() {
    try {
      const [claseData, todosLosLibros] = await Promise.all([
        getClaseDetalle(claseId),
        getLibrosDisponiblesParaClase(claseId),
      ])
      if (!claseData) { navigate('/panel-docente'); return }
      const { data: { user } } = await supabase.auth.getUser()
      if (user) rememberRecentClass(user.id, claseData)

      setLibrosDisponibles(todosLosLibros)

      const libros = (claseData.clase_libros || []).map(l => ({
        libroId: l.libro_id,
        libroTitulo: l.libro_titulo,
      }))
      const uids = (claseData.inscripciones || []).map(i => i.estudiante_id)
      const profilesMap = Object.fromEntries(
        (claseData.inscripciones || []).map(i => [i.estudiante_id, i.profiles])
      )

      setClase({ ...claseData, libros, estudiantes: uids })
      if (libros.length > 0) setLibroSel(libros[0].libroId)

      // Unidades + actividades de cada libro (2 queries totales via join)
      const totales = {}
      const unidades = {}
      await Promise.all(libros.map(async ({ libroId }) => {
        const { data } = await supabase
          .from('unidades')
          .select('id, titulo, orden, actividades(id)')
          .eq('libro_id', libroId)
          .order('orden')

        let total = 0
        const lista = (data || []).map(u => {
          const actividadIds = (u.actividades || []).map(a => a.id)
          total += actividadIds.length
          return { unidadId: u.id, titulo: u.titulo, orden: u.orden, actividadIds, total: actividadIds.length }
        })
        unidades[libroId] = lista
        totales[libroId] = total
      }))
      setUnidadesPorLibro(unidades)
      setTotalPorLibro(totales)

      if (uids.length === 0) { setEstudiantes([]); return }

      // Progreso: 2 queries para todos los estudiantes (en lugar de N*2)
      const allActividadIds = Object.values(unidades).flatMap(lista => lista.flatMap(u => u.actividadIds))

      const [actProgRes, progRes] = await Promise.all([
        allActividadIds.length > 0
          ? supabase.from('actividad_progreso').select('usuario_id, actividad_id')
              .in('usuario_id', uids).in('actividad_id', allActividadIds)
          : Promise.resolve({ data: [] }),
        supabase.from('progreso').select('usuario_id, libro_id, ultima_actividad').in('usuario_id', uids),
      ])

      // Indexar progreso por usuario
      const completedByUid = {}
      for (const r of (actProgRes.data || [])) {
        if (!completedByUid[r.usuario_id]) completedByUid[r.usuario_id] = new Set()
        completedByUid[r.usuario_id].add(r.actividad_id)
      }
      const ultimaByUid = {}
      for (const p of (progRes.data || [])) {
        if (!ultimaByUid[p.usuario_id]) ultimaByUid[p.usuario_id] = {}
        ultimaByUid[p.usuario_id][p.libro_id] = p.ultima_actividad ? new Date(p.ultima_actividad) : null
      }

      const estudiantesData = uids.map(uid => {
        const profile = profilesMap[uid] || {}
        const userCompleted = completedByUid[uid] || new Set()
        const progresoData = {}
        for (const { libroId } of libros) {
          const idsDelLibro = (unidades[libroId] || []).flatMap(u => u.actividadIds)
          progresoData[libroId] = {
            ids: new Set(idsDelLibro.filter(id => userCompleted.has(id))),
            ultimaActividad: ultimaByUid[uid]?.[libroId] || null,
          }
        }
        return { uid, nombre: profile?.nombre || 'Sin nombre', email: profile?.email || '', progresoData }
      })

      setEstudiantes(estudiantesData)
    } catch (err) { console.error(err) }
    finally { setCargando(false) }
  }

  async function handleAgregarLibro(libro) {
    try {
      const { error } = await supabase.from('clase_libros').insert({
        clase_id: claseId,
        libro_id: libro.libroId,
        libro_titulo: libro.libroTitulo,
      })
      if (error) throw error
      setAgregarLibroOpen(false)
      await cargarDatos()
    } catch (err) { console.error(err) }
  }

  function abrirEdicion() {
    setEditNombre(clase?.nombre || '')
    setEditEmoji(clase?.emoji || '🏫')
    setEditLibros(clase?.libros || [])
    setErrorEdicion('')
    setEditarOpen(true)
  }

  function toggleEditLibro(libro) {
    setEditLibros(current => current.some(item => item.libroId === libro.libroId)
      ? current.filter(item => item.libroId !== libro.libroId)
      : [...current, libro])
  }

  async function guardarEdicion() {
    if (!editNombre.trim()) {
      setErrorEdicion('El nombre de la clase es obligatorio.')
      return
    }
    setGuardandoEdicion(true)
    setErrorEdicion('')
    try {
      await actualizarClase({
        claseId,
        nombre: editNombre,
        emoji: editEmoji,
        libros: editLibros,
      })
      setEditarOpen(false)
      await cargarDatos()
    } catch (error) {
      console.error('guardarEdicion:', error)
      setErrorEdicion('No se pudieron guardar los cambios.')
    } finally {
      setGuardandoEdicion(false)
    }
  }

  async function confirmarEliminarEstudiante() {
    if (!estudianteAEliminar || eliminandoEstudiante) return
    setEliminandoEstudiante(true)
    try {
      await eliminarEstudianteDeClase(claseId, estudianteAEliminar.uid)
      setEstudiantes(prev => prev.filter(e => e.uid !== estudianteAEliminar.uid))
      setEstudianteAEliminar(null)
    } catch (err) {
      console.error(err)
    } finally {
      setEliminandoEstudiante(false)
    }
  }

  if (cargando) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg }}>
      <Spinner />
    </div>
  )

  // Stats derivadas del libro seleccionado
  const libros = clase?.libros || []
  const disponibles = librosDisponibles.filter(l => !libros.some(cl => cl.libroId === l.libroId))
  const libroSelObj = libros.find(l => l.libroId === libroSel)
  const unidadesDelLibro = libroSel ? (unidadesPorLibro[libroSel] || []) : []
  const totalDelLibro = libroSel ? (totalPorLibro[libroSel] || 0) : 0

  const progresoPorEstudiante = estudiantes.map(est => {
    const prog = est.progresoData[libroSel] || { ids: new Set(), ultimaActividad: null }
    return {
      ...est,
      completadas: prog.ids.size,
      pct: totalDelLibro > 0 ? prog.ids.size / totalDelLibro : 0,
      ultimaActividad: prog.ultimaActividad,
      idsSet: prog.ids,
    }
  })

  const promedioGeneral = progresoPorEstudiante.length > 0
    ? Math.round(progresoPorEstudiante.reduce((s, e) => s + e.pct, 0) / progresoPorEstudiante.length * 100)
    : 0

  const estudiantesActivos = progresoPorEstudiante.filter(e => e.completadas > 0).length

  const progresoUnidades = unidadesDelLibro.map(unidad => {
    if (unidad.total === 0 || estudiantes.length === 0) return { ...unidad, pct: 0 }
    const sum = estudiantes.reduce((acc, est) => {
      const ids = est.progresoData[libroSel]?.ids || new Set()
      const comp = unidad.actividadIds.filter(id => ids.has(id)).length
      return acc + comp / unidad.total
    }, 0)
    return { ...unidad, pct: Math.round(sum / estudiantes.length * 100) }
  })

  const unidadesConActs = progresoUnidades.filter(u => u.total > 0)
  const mejorUnidad = unidadesConActs.length > 0 ? unidadesConActs.reduce((a, b) => b.pct > a.pct ? b : a) : null
  const peorUnidad = unidadesConActs.length > 1 ? unidadesConActs.reduce((a, b) => b.pct < a.pct ? b : a) : null
  const mejorEstudiante = progresoPorEstudiante.length > 0 ? progresoPorEstudiante.reduce((a, b) => b.pct > a.pct ? b : a) : null

  return (
    <div style={{ minHeight: '100vh', fontFamily: 'Nunito', background: C.bg }}>

      {/* Nav */}
      <nav className="responsive-teacher-nav" style={{
        background: `linear-gradient(135deg, ${C.navy}, ${C.navyDark})`,
        padding: isMobile ? '8px 12px' : '0 24px', height: isMobile ? 'auto' : 60, minHeight: 60, display: 'flex', alignItems: 'center', gap: 16,
        position: 'sticky', top: 0, zIndex: 100, boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
      }}>
        <button onClick={() => navigate('/panel-docente')} style={{
          background: 'rgba(255,255,255,0.12)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)',
          borderRadius: 8, padding: '6px 14px', fontSize: 13, fontWeight: 700,
          cursor: 'pointer', fontFamily: 'Nunito', flexShrink: 0,
        }}>← Mis clases</button>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', lineHeight: 1 }}>Panel Docente</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {clase?.nombre}
          </div>
        </div>
      </nav>

      <div style={{ padding: isMobile ? '20px 16px' : '32px 40px', maxWidth: 1100, margin: '0 auto' }}>

        {/* Info card de clase */}
        <div style={{ ...card, marginBottom: 20, display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 180 }}>
            <div style={{ fontSize: isMobile ? 18 : 22, fontWeight: 800, color: C.text }}>
              <span style={{ marginRight: 8 }}>{clase?.emoji || '🏫'}</span>{clase?.nombre}
            </div>
            <div style={{ fontSize: 13, color: C.textLight, marginTop: 4 }}>
              {libros.length} libro{libros.length !== 1 ? 's' : ''} asignado{libros.length !== 1 ? 's' : ''}
            </div>
          </div>
          <div className="responsive-class-actions" style={{ display: 'flex', flexDirection: isMobile ? 'row' : 'column', flexWrap: 'wrap', gap: 8, alignItems: isMobile ? 'center' : 'flex-end' }}>
            <button onClick={abrirEdicion} style={{
              background: '#fff', color: C.primary, border: `1px solid ${C.primary}`,
              borderRadius: 9, padding: '6px 14px', fontSize: 12, fontWeight: 800,
              cursor: 'pointer', fontFamily: 'Nunito',
            }}>✏️ Editar clase</button>
            <div style={{
              background: C.primaryLight, color: C.primary,
              borderRadius: 10, padding: '6px 16px', fontSize: 15, fontWeight: 800,
              fontFamily: 'monospace', letterSpacing: 2,
            }}>{clase?.codigo}</div>
            <div style={{ fontSize: 12, color: C.textLight }}>
              <span style={{ fontWeight: 700, color: C.text }}>{estudiantes.length}</span>{' '}
              estudiante{estudiantes.length !== 1 ? 's' : ''}
            </div>
            {/* "+ Libro" button */}
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setAgregarLibroOpen(o => !o)}
                style={{
                  background: C.primary, color: '#fff', border: 'none',
                  borderRadius: 10, padding: '6px 14px', fontSize: 12, fontWeight: 700,
                  cursor: 'pointer', fontFamily: 'Nunito',
                }}
              >+ Libro</button>
              {agregarLibroOpen && (
                <div
                  style={{
                    position: 'absolute', top: '110%', right: 0, zIndex: 50,
                    background: '#fff', borderRadius: 12,
                    boxShadow: '0 4px 20px rgba(0,0,0,0.14)',
                    border: `1px solid ${C.border}`, minWidth: 220, overflow: 'hidden',
                  }}
                >
                  {disponibles.length === 0 ? (
                    <div style={{ padding: '12px 16px', fontSize: 13, color: C.textLight }}>
                      No hay más libros disponibles
                    </div>
                  ) : disponibles.map(l => (
                    <button
                      key={l.libroId}
                      onClick={() => handleAgregarLibro(l)}
                      style={{
                        display: 'block', width: '100%', padding: '10px 16px',
                        textAlign: 'left', background: 'none', border: 'none',
                        borderBottom: `1px solid ${C.border}`,
                        fontSize: 13, fontWeight: 600, color: C.text,
                        cursor: 'pointer', fontFamily: 'Nunito',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = C.primaryLight }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'none' }}
                    >
                      📖 {l.libroTitulo}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Slicer de libros ── */}
        {libros.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.textLight, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 }}>
              Libros de la clase
            </div>
            <div
              aria-label="Libros asignados a la clase"
              style={{
                display: 'flex', gap: 12, flexWrap: 'nowrap',
                width: '100%', overflowX: 'auto', overflowY: 'hidden',
                padding: '2px 2px 12px',
                scrollSnapType: 'x mandatory',
                WebkitOverflowScrolling: 'touch',
                scrollbarWidth: 'thin',
                overscrollBehaviorX: 'contain',
              }}
            >
              {libros.map(l => {
                const isSelected = libroSel === l.libroId
                const total = totalPorLibro[l.libroId] || 0
                const nUnidades = (unidadesPorLibro[l.libroId] || []).length
                const promLibro = total > 0 && estudiantes.length > 0
                  ? Math.round(
                      estudiantes.reduce((s, est) => s + (est.progresoData[l.libroId]?.ids.size || 0) / total, 0)
                      / estudiantes.length * 100
                    )
                  : 0
                return (
                  <button
                    key={l.libroId}
                    onClick={() => setLibroSel(l.libroId)}
                    style={{
                      background: isSelected ? C.primary : '#fff',
                      border: `2px solid ${isSelected ? C.primary : C.border}`,
                      borderRadius: 14, padding: '14px 18px',
                      cursor: 'pointer', fontFamily: 'Nunito',
                      textAlign: 'left', transition: 'all 0.15s',
                      width: isMobile ? 216 : 240,
                      minWidth: isMobile ? 216 : 240,
                      flex: '0 0 auto',
                      scrollSnapAlign: 'start',
                      boxShadow: isSelected ? `0 4px 14px ${C.primary}40` : '0 1px 3px rgba(0,0,0,0.06)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                        background: isSelected ? 'rgba(255,255,255,0.2)' : C.primaryLight,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
                      }}>📖</div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{
                          fontSize: 13, fontWeight: 800,
                          color: isSelected ? '#fff' : C.text,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>{l.libroTitulo}</div>
                        <div style={{ fontSize: 11, color: isSelected ? 'rgba(255,255,255,0.7)' : C.textLight, marginTop: 1 }}>
                          {nUnidades} unidad{nUnidades !== 1 ? 'es' : ''} · {total} act.
                        </div>
                      </div>
                    </div>
                    <div style={{
                      background: isSelected ? 'rgba(255,255,255,0.25)' : '#E5E7EB',
                      borderRadius: 6, height: 5, overflow: 'hidden',
                    }}>
                      <div style={{
                        background: isSelected ? '#fff' : C.primary,
                        height: '100%', borderRadius: 6,
                        width: `${promLibro}%`, transition: 'width 0.5s',
                      }} />
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: isSelected ? 'rgba(255,255,255,0.9)' : C.primary, marginTop: 5 }}>
                      {promLibro}% promedio clase
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Stats row */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
          gap: 14, marginBottom: 20,
        }}>
          {[
            { label: 'Total alumnos', value: estudiantes.length, icon: '👥', color: C.primary },
            { label: 'Progreso promedio', value: `${promedioGeneral}%`, icon: '📊', color: C.success },
            { label: 'Estudiantes activos', value: estudiantesActivos, icon: '🟢', color: C.purple },
          ].map((s, i) => (
            <div key={i} style={{ ...card, display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{
                width: 48, height: 48, borderRadius: 14, flexShrink: 0,
                background: s.color + '18',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24,
              }}>{s.icon}</div>
              <div>
                <div style={{ fontSize: 26, fontWeight: 800, color: s.color, lineHeight: 1.1 }}>{s.value}</div>
                <div style={{ fontSize: 12, color: C.textLight, fontWeight: 600 }}>{s.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Actividades del grupo + Resumen */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
          gap: 16, marginBottom: 28,
        }}>
          <div style={card}>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 14 }}>
              Actividades del grupo
            </div>
            {progresoUnidades.length === 0 ? (
              <div style={{ fontSize: 13, color: C.textLight, padding: '8px 0' }}>No hay unidades para este libro.</div>
            ) : progresoUnidades.map(u => {
              const color = barColor(u.pct)
              return (
                <div key={u.unidadId} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                  <span style={{
                    fontSize: 13, fontWeight: 600, color: C.text,
                    width: isMobile ? 100 : 130, flexShrink: 0,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }} title={u.titulo}>{u.titulo}</span>
                  <div style={{ flex: 1 }}>
                    <ProgressBar value={u.pct} height={6} color={color} />
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color, width: 36, textAlign: 'right', flexShrink: 0 }}>
                    {u.pct}%
                  </span>
                </div>
              )
            })}
          </div>

          <div style={card}>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 14 }}>Resumen</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <ResumenFila bg={C.successLight} color={C.success} icon="✅" label="Más completada"
                valor={mejorUnidad ? mejorUnidad.titulo : '—'} />
              <ResumenFila bg={C.dangerLight} color={C.danger} icon="⚠️" label="Menos completada"
                valor={peorUnidad ? peorUnidad.titulo : '—'} />
              <ResumenFila bg={C.primaryLight} color={C.primary} icon="📖" label="Libros activos"
                valor={`${libros.length} libro${libros.length !== 1 ? 's' : ''}`} />
              <ResumenFila bg={C.accentLight} color={C.accent} icon="⭐" label="Mejor calificación"
                valor={mejorEstudiante && mejorEstudiante.pct > 0
                  ? `${formatNombreCorto(mejorEstudiante.nombre)} (${Math.round(mejorEstudiante.pct * 100)}%)`
                  : '—'} />
            </div>
          </div>
        </div>

        {/* Encabezado tabla */}
        <div style={{ marginBottom: 14 }}>
          <h3 style={{ fontSize: 18, fontWeight: 800, color: C.text, margin: '0 0 2px' }}>Estudiantes</h3>
          {libroSelObj && (
            <div style={{ fontSize: 13, color: C.textLight, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>Progreso en</span>
              <span style={{
                background: C.primaryLight, color: C.primary,
                borderRadius: 6, padding: '1px 8px', fontSize: 12, fontWeight: 700,
              }}>📖 {libroSelObj.libroTitulo}</span>
            </div>
          )}
        </div>

        {/* Lista de estudiantes */}
        {estudiantes.length === 0 ? (
          <div style={{ ...card, padding: '48px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: 44, marginBottom: 12 }}>🧑‍🎓</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 6 }}>Sin estudiantes todavía</div>
            <div style={{ fontSize: 14, color: C.textLight }}>
              Comparte el código{' '}
              <strong style={{ fontFamily: 'monospace', color: C.primary }}>{clase?.codigo}</strong>{' '}
              con tus estudiantes.
            </div>
          </div>
        ) : isMobile ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {progresoPorEstudiante.map(est => {
              const pct = Math.round(est.pct * 100)
              const color = barColor(pct)
              return (
                <div key={est.uid} style={{ ...card, position: 'relative', display: 'flex', alignItems: 'center', gap: 12, paddingRight: 48 }}>
                  <button
                    type="button"
                    aria-label={`Opciones de ${est.nombre}`}
                    aria-expanded={menuEstudianteId === est.uid}
                    onClick={() => setMenuEstudianteId(current => current === est.uid ? null : est.uid)}
                    style={{
                      position: 'absolute', top: 10, right: 10,
                      width: 30, height: 30, border: 'none', borderRadius: 8,
                      background: menuEstudianteId === est.uid ? C.primaryLight : 'transparent',
                      color: C.textLight, fontSize: 20, lineHeight: 1,
                      fontWeight: 900, cursor: 'pointer', padding: 0,
                    }}
                  >
                    ⋯
                  </button>
                  {menuEstudianteId === est.uid && (
                    <>
                      <div
                        onClick={() => setMenuEstudianteId(null)}
                        style={{ position: 'fixed', inset: 0, zIndex: 40 }}
                      />
                      <div style={{
                        position: 'absolute', top: 42, right: 10, zIndex: 50,
                        minWidth: 180, padding: 5, background: '#fff',
                        border: `1px solid ${C.border}`, borderRadius: 10,
                        boxShadow: '0 8px 24px rgba(15,23,42,.16)',
                      }}>
                        <button
                          type="button"
                          onClick={() => {
                            setMenuEstudianteId(null)
                            setEstudianteAEliminar(est)
                          }}
                          style={{
                            width: '100%', border: 'none', borderRadius: 7,
                            background: 'transparent', color: C.danger,
                            padding: '9px 11px', textAlign: 'left',
                            fontFamily: 'Nunito', fontSize: 12,
                            fontWeight: 800, cursor: 'pointer',
                          }}
                        >
                          🗑️ Eliminar estudiante
                        </button>
                      </div>
                    </>
                  )}
                  <Avatar nombre={est.nombre} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, color: C.text, fontSize: 14 }}>{est.nombre}</div>
                    {est.email && <div style={{ fontSize: 11, color: C.textLight, marginBottom: 2 }}>{est.email}</div>}
                    <div style={{ fontSize: 11, color: C.textLight, marginBottom: 5 }}>
                      {libroSelObj?.libroTitulo} · {formatFecha(est.ultimaActividad)}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ flex: 1 }}><ProgressBar value={pct} height={4} color={color} /></div>
                      <span style={{ fontSize: 11, fontWeight: 700, color, flexShrink: 0 }}>
                        {est.completadas}/{totalDelLibro}
                      </span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0, alignSelf: 'flex-end' }}>
                    <button onClick={() => navigate(`/panel-docente/clase/${claseId}/estudiante/${est.uid}?libroId=${encodeURIComponent(libroSel)}`)} style={{
                      background: C.primaryLight, border: 'none', borderRadius: 8,
                      padding: '5px 10px', fontSize: 11, color: C.primary,
                      cursor: 'pointer', fontFamily: 'Nunito', fontWeight: 700,
                    }}>Ver respuestas</button>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ background: C.bg }}>
                  {['Alumno', 'Libro', 'Progreso', 'Actividades', 'Última actividad', ''].map(h => (
                    <th key={h} style={{
                      padding: '12px 18px', textAlign: 'left',
                      fontWeight: 700, color: C.textLight, fontSize: 11,
                      textTransform: 'uppercase', letterSpacing: 0.5,
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {progresoPorEstudiante.map((est, idx) => {
                  const pct = Math.round(est.pct * 100)
                  const color = barColor(pct)
                  return (
                    <tr key={est.uid} style={{
                      borderTop: `1px solid ${C.border}`,
                      background: idx % 2 === 1 ? '#FAFAFA' : '#fff',
                    }}>
                      <td style={{ padding: '12px 18px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <Avatar nombre={est.nombre} />
                          <div>
                            <div style={{ fontWeight: 700, color: C.text }}>{est.nombre}</div>
                            {est.email && <div style={{ fontSize: 12, color: C.textLight }}>{est.email}</div>}
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '12px 18px', color: C.textLight }}>
                        <span style={{
                          background: C.successLight, color: C.success,
                          borderRadius: 8, padding: '3px 10px', fontSize: 12, fontWeight: 700,
                        }}>📖 {libroSelObj?.libroTitulo || '—'}</span>
                      </td>
                      <td style={{ padding: '12px 18px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ width: 80 }}>
                            <ProgressBar value={pct} height={5} color={color} />
                          </div>
                          <span style={{ fontWeight: 700, color, fontSize: 13 }}>{pct}%</span>
                        </div>
                      </td>
                      <td style={{ padding: '12px 18px' }}>
                        <span style={{
                          background: est.completadas > 0 ? color + '18' : C.bg,
                          color: est.completadas > 0 ? color : C.textLight,
                          borderRadius: 8, padding: '4px 12px', fontSize: 13, fontWeight: 800,
                        }}>
                          {est.completadas} / {totalDelLibro}
                        </span>
                      </td>
                      <td style={{ padding: '12px 18px', color: C.textLight, fontSize: 13 }}>
                        {formatFecha(est.ultimaActividad)}
                      </td>
                      <td style={{ padding: '12px 18px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                          <button onClick={() => navigate(`/panel-docente/clase/${claseId}/estudiante/${est.uid}?libroId=${encodeURIComponent(libroSel)}`)} style={{
                            background: C.primaryLight, border: 'none', borderRadius: 8,
                            padding: '5px 12px', fontSize: 12, color: C.primary,
                            cursor: 'pointer', fontFamily: 'Nunito', fontWeight: 700,
                          }}>Ver respuestas</button>
                          <button onClick={() => setEstudianteAEliminar(est)} style={{
                            background: 'none', border: `1px solid ${C.border}`, borderRadius: 8,
                            padding: '5px 12px', fontSize: 12, color: C.textLight,
                            cursor: 'pointer', fontFamily: 'Nunito', fontWeight: 600,
                          }}>Eliminar</button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editarOpen && (
        <div onClick={() => !guardandoEdicion && setEditarOpen(false)} style={{
          position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.48)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }}>
          <div onClick={event => event.stopPropagation()} style={{
            width: '100%', maxWidth: 560, maxHeight: '88vh', overflowY: 'auto',
            background: '#fff', borderRadius: 18, padding: isMobile ? 22 : 28,
            boxShadow: '0 20px 60px rgba(0,0,0,.22)',
          }}>
            <h2 style={{ margin: '0 0 20px', color: C.text, fontSize: 20 }}>Editar clase</h2>

            <label style={{ display: 'block', color: C.text, fontSize: 13, fontWeight: 800, marginBottom: 7 }}>Nombre</label>
            <input value={editNombre} onChange={event => setEditNombre(event.target.value)} maxLength={80} style={{
              width: '100%', boxSizing: 'border-box', border: `2px solid ${C.border}`,
              borderRadius: 10, padding: '10px 12px', fontFamily: 'Nunito', fontSize: 14,
              color: C.text, outlineColor: C.primary, marginBottom: 18,
            }} />

            <div style={{ marginBottom: 18 }}>
              <div style={{ color: C.text, fontSize: 13, fontWeight: 800, marginBottom: 8 }}>Emoji</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {['🏫', '📚', '✏️', '🎨', '🔬', '🌎', '🚀', '⭐', '🦋', '🌈', '🧠', '🎵'].map(emoji => (
                  <button key={emoji} type="button" onClick={() => setEditEmoji(emoji)} style={{
                    width: 40, height: 40, borderRadius: 9, fontSize: 20, cursor: 'pointer',
                    background: editEmoji === emoji ? C.primaryLight : '#fff',
                    border: `2px solid ${editEmoji === emoji ? C.primary : C.border}`,
                  }}>{emoji}</button>
                ))}
              </div>
            </div>

            <label style={{ display: 'block', color: C.text, fontSize: 13, fontWeight: 800, marginBottom: 7 }}>
              Grado <span style={{ color: C.textLight, fontWeight: 600 }}>(no se puede modificar)</span>
            </label>
            <input disabled value={clase?.grados?.nombre || `Grado ${clase?.grado_id || ''}`} style={{
              width: '100%', boxSizing: 'border-box', border: `1px solid ${C.border}`,
              borderRadius: 10, padding: '10px 12px', fontFamily: 'Nunito', fontSize: 14,
              color: C.textLight, background: '#F3F4F6', marginBottom: 18,
            }} />

            <div style={{ color: C.text, fontSize: 13, fontWeight: 800, marginBottom: 8 }}>Libros asignados</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 18 }}>
              {librosDisponibles.length === 0 ? (
                <div style={{ fontSize: 13, color: C.textLight }}>No hay libros disponibles para este grado.</div>
              ) : librosDisponibles.map(libro => {
                const selected = editLibros.some(item => item.libroId === libro.libroId)
                return (
                  <button key={libro.libroId} type="button" onClick={() => toggleEditLibro(libro)} style={{
                    display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                    border: `2px solid ${selected ? C.primary : C.border}`, borderRadius: 10,
                    padding: '9px 11px', background: selected ? C.primaryLight : '#fff',
                    color: selected ? C.primary : C.text, fontFamily: 'Nunito', cursor: 'pointer',
                    fontSize: 13, fontWeight: 700,
                  }}>
                    <span>{selected ? '✅' : '⬜'}</span>
                    <span>{libro.emoji || '📖'} {libro.libroTitulo}</span>
                  </button>
                )
              })}
            </div>

            {errorEdicion && <div style={{ color: C.danger, background: C.dangerLight, borderRadius: 9, padding: '9px 12px', fontSize: 12, fontWeight: 700, marginBottom: 12 }}>{errorEdicion}</div>}
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={guardarEdicion} disabled={guardandoEdicion} style={{
                flex: 1, border: 'none', borderRadius: 10, padding: 11,
                background: guardandoEdicion ? '#93C5FD' : C.primary, color: '#fff',
                fontFamily: 'Nunito', fontWeight: 800, cursor: guardandoEdicion ? 'wait' : 'pointer',
              }}>{guardandoEdicion ? 'Guardando…' : 'Guardar cambios'}</button>
              <button onClick={() => setEditarOpen(false)} disabled={guardandoEdicion} style={{
                border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 16px',
                background: '#fff', color: C.textLight, fontFamily: 'Nunito', fontWeight: 700, cursor: 'pointer',
              }}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {estudianteAEliminar && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="eliminar-estudiante-titulo"
          onClick={() => !eliminandoEstudiante && setEstudianteAEliminar(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 1100,
            background: 'rgba(15,23,42,.55)', backdropFilter: 'blur(2px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
          }}
        >
          <div onClick={event => event.stopPropagation()} style={{
            width: '100%', maxWidth: 420, background: '#fff', borderRadius: 20,
            padding: isMobile ? 24 : 30, boxShadow: '0 24px 64px rgba(15,23,42,.25)',
            border: `1px solid ${C.border}`,
          }}>
            <div style={{
              width: 54, height: 54, margin: '0 auto 14px', borderRadius: '50%',
              background: C.dangerLight, color: C.danger,
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 25,
            }}>🗑️</div>
            <h2 id="eliminar-estudiante-titulo" style={{
              margin: '0 0 8px', color: C.text, fontSize: 19,
              fontWeight: 900, textAlign: 'center',
            }}>
              Eliminar estudiante
            </h2>
            <p style={{ margin: '0 0 8px', color: C.textLight, fontSize: 14, lineHeight: 1.5, textAlign: 'center' }}>
              ¿Quieres eliminar a <strong style={{ color: C.text }}>{estudianteAEliminar.nombre}</strong> de esta clase?
            </p>
            <div style={{
              background: C.dangerLight, color: C.danger, borderRadius: 10,
              padding: '9px 12px', fontSize: 12, fontWeight: 700,
              textAlign: 'center', margin: '0 0 22px',
            }}>
              Perderá el acceso a la clase, pero sus libros y su cuenta no serán eliminados.
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 10 }}>
              <button
                onClick={() => setEstudianteAEliminar(null)}
                disabled={eliminandoEstudiante}
                style={{
                  padding: 11, borderRadius: 10, border: `1px solid ${C.border}`,
                  background: '#fff', color: C.textLight, fontFamily: 'Nunito',
                  fontSize: 14, fontWeight: 800, cursor: eliminandoEstudiante ? 'not-allowed' : 'pointer',
                }}
              >
                Cancelar
              </button>
              <button
                onClick={confirmarEliminarEstudiante}
                disabled={eliminandoEstudiante}
                style={{
                  padding: 11, borderRadius: 10, border: 'none',
                  background: eliminandoEstudiante ? '#FCA5A5' : C.danger,
                  color: '#fff', fontFamily: 'Nunito', fontSize: 14,
                  fontWeight: 800, cursor: eliminandoEstudiante ? 'wait' : 'pointer',
                }}
              >
                {eliminandoEstudiante ? 'Eliminando…' : 'Sí, eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
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
