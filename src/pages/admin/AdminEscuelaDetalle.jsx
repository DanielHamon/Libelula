import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import AdminLayout from '../../components/AdminLayout'
import {
  getEscuelaDetalle, asignarLibroEscuela, removerLibroEscuela,
  getLibrosTodos, toggleEscuelaActiva,
} from '../../services/admin.service'
import { C, S, btn, btnOutline, badge } from '../../lib/adminStyles'

export default function AdminEscuelaDetalle() {
  const { id } = useParams()
  const [escuela, setEscuela] = useState(null)
  const [librosDisponibles, setLibrosDisponibles] = useState([])
  const [libroSel, setLibroSel] = useState('')
  const [loading, setLoading] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [copiado, setCopiado] = useState(false)

  useEffect(() => { load() }, [id])

  async function load() {
    setLoading(true); setError('')
    try {
      const [detalle, todos] = await Promise.all([
        getEscuelaDetalle(id),
        getLibrosTodos(),
      ])
      setEscuela(detalle)
      const asignadosIds = new Set((detalle.escuela_libros || []).map(r => r.libro_id))
      setLibrosDisponibles(todos.filter(l => !asignadosIds.has(l.id)))
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  async function handleAsignar() {
    if (!libroSel) return
    setGuardando(true); setError('')
    try {
      await asignarLibroEscuela(id, libroSel)
      setMensaje('Solicitud enviada para aprobación MFA.')
      setLibroSel('')
    } catch (e) { setError(e.message) }
    finally { setGuardando(false) }
  }

  async function handleRemover(libroId) {
    setError('')
    try {
      await removerLibroEscuela(id, libroId)
      setMensaje('Solicitud enviada para aprobación MFA.')
    } catch (e) { setError(e.message) }
  }

  const [confirmToggle, setConfirmToggle] = useState(false)

  async function handleToggle() {
    try {
      const nuevaActiva = !escuela.activa
      const resultado = await toggleEscuelaActiva(id, nuevaActiva)
      if (resultado?.pendiente) {
        setMensaje('La desactivación quedó pendiente de aprobación MFA.')
      } else {
        setEscuela(prev => ({ ...prev, activa: nuevaActiva }))
      }
      setConfirmToggle(false)
    } catch (e) { setError(e.message) }
  }

  function copiarCodigo() {
    navigator.clipboard.writeText(escuela.codigo || escuela.id)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 1500)
  }

  if (loading) return (
    <AdminLayout>
      <div style={{ padding: 40, color: C.textLight }}>Cargando…</div>
    </AdminLayout>
  )

  if (!escuela) return (
    <AdminLayout>
      <div style={{ padding: 40, color: C.danger }}>Escuela no encontrada.</div>
    </AdminLayout>
  )

  const librosAsignados = (escuela.escuela_libros || []).map(r => r.libros).filter(Boolean)

  return (
    <AdminLayout>
      <div className="admin-page" style={{ padding: '32px 40px', maxWidth: 820 }}>
        {/* Breadcrumb */}
        <div style={{ fontSize: 13, color: C.textLight, marginBottom: 20 }}>
          <Link to="/admin/escuelas" style={{ color: C.primary, textDecoration: 'none', fontWeight: 600 }}>Escuelas</Link>
          <span style={{ margin: '0 8px' }}>›</span>
          <span>{escuela.nombre}</span>
        </div>

        {/* Header */}
        <div style={{ ...S.card, padding: 24, marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <h1 style={{ fontSize: 22, fontWeight: 800, color: C.text, margin: 0 }}>{escuela.nombre}</h1>
                <span style={badge(escuela.activa ? C.success : C.textLight, escuela.activa ? C.successLight : '#F3F4F6')}>
                  {escuela.activa ? 'Activa' : 'Inactiva'}
                </span>
              </div>
              <p style={{ fontSize: 14, color: C.textLight, margin: '6px 0 0' }}>{escuela.ciudad || 'Sin ciudad'}</p>
            </div>
            <button
              onClick={() => escuela.activa ? setConfirmToggle(true) : handleToggle()}
              style={btnOutline(escuela.activa ? C.danger : C.success, 'sm')}
            >
              {escuela.activa ? 'Desactivar' : 'Activar'}
            </button>
          </div>

          {/* Código copiable */}
          <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ background: C.bg, borderRadius: 8, padding: '8px 14px', fontFamily: 'monospace', fontSize: 14, fontWeight: 700, color: C.primary, border: `1px solid ${C.border}` }}>
              {escuela.codigo || '—'}
            </div>
            {escuela.codigo && (
              <button onClick={copiarCodigo} style={btnOutline(C.primary, 'sm')}>
                {copiado ? '✓ Copiado' : 'Copiar código'}
              </button>
            )}
            <Link
              to={`/admin/tokens?escuela=${id}`}
              style={{ ...btnOutline(C.accent, 'sm'), textDecoration: 'none' }}
            >
              Ver tokens de esta escuela →
            </Link>
          </div>
        </div>

        {error && (
          <div style={{ background: C.dangerLight, color: C.danger, borderRadius: 10, padding: '12px 16px', marginBottom: 20, fontSize: 14, fontWeight: 600 }}>
            {error}
          </div>
        )}
        {mensaje && (
          <div style={{ background: C.successLight, color: C.success, borderRadius: 10, padding: '12px 16px', marginBottom: 20, fontSize: 14, fontWeight: 600 }}>
            {mensaje}
          </div>
        )}

        {/* Libros asignados */}
        <div className="admin-table-card" style={{ ...S.card, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>
              Libros asignados <span style={{ color: C.textLight, fontWeight: 400, fontSize: 13 }}>({librosAsignados.length})</span>
            </span>
            <div className="admin-filters" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <select
                style={{ ...S.input, width: 'auto', minWidth: 220, fontSize: 13, padding: '8px 12px' }}
                value={libroSel}
                onChange={e => setLibroSel(e.target.value)}
              >
                <option value="">Seleccionar libro…</option>
                {librosDisponibles.map(l => (
                  <option key={l.id} value={l.id}>{l.emoji || '📖'} {l.titulo}</option>
                ))}
              </select>
              <button
                onClick={handleAsignar}
                disabled={!libroSel || guardando}
                style={btn(C.primary, 'sm')}
              >
                {guardando ? 'Asignando…' : '+ Asignar'}
              </button>
            </div>
          </div>

          {librosAsignados.length === 0 ? (
            <div style={{ padding: '32px 20px', textAlign: 'center', color: C.textLight, fontSize: 14 }}>
              Esta escuela no tiene libros asignados aún.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['', 'Título', 'ID', 'Grado', 'Acciones'].map(h => (
                    <th key={h} style={S.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {librosAsignados.map(libro => (
                  <tr key={libro.id}>
                    <td style={{ ...S.td, fontSize: 20, width: 36, textAlign: 'center' }}>{libro.emoji || '📖'}</td>
                    <td style={{ ...S.td, fontWeight: 600 }}>{libro.titulo}</td>
                    <td style={{ ...S.td, fontFamily: 'monospace', fontSize: 12, color: C.textLight }}>{libro.id}</td>
                    <td style={{ ...S.td, color: C.textLight }}>{libro.grados?.nombre || '—'}</td>
                    <td style={S.td}>
                      <button onClick={() => handleRemover(libro.id)} style={btnOutline(C.danger, 'sm')}>
                        Quitar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {confirmToggle && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ ...S.card, width: 380, padding: 28, textAlign: 'center' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>⚠️</div>
            <h3 style={{ margin: '0 0 8px', fontWeight: 800, color: C.text }}>¿Desactivar escuela?</h3>
            <p style={{ fontSize: 14, color: C.textLight, margin: '0 0 24px' }}>
              <strong>{escuela.nombre}</strong> y todos sus docentes y estudiantes perderán acceso.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setConfirmToggle(false)} style={{ ...btnOutline(C.textLight), flex: 1 }}>Cancelar</button>
              <button onClick={handleToggle} style={{ ...btn(C.danger), flex: 1 }}>Desactivar</button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
