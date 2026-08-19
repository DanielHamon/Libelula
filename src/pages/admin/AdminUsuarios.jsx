import { useEffect, useState } from 'react'
import AdminLayout from '../../components/AdminLayout'
import { supabase } from '../../lib/supabase'
import { cambiarRolUsuario, getUsuarios, getEscuelasTodas } from '../../services/admin.service'
import { C, S, btn, btnOutline, badge } from '../../lib/adminStyles'

const PAGE_SIZE = 20

const ROL_COLORS = {
  estudiante: { color: C.primary, bg: C.primaryLight },
  docente:    { color: C.success, bg: C.successLight },
  admin:      { color: C.purple,  bg: C.purpleLight },
}

export default function AdminUsuarios() {
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [filtroRol, setFiltroRol] = useState('')
  const [filtroEscuela, setFiltroEscuela] = useState('')
  const [escuelas, setEscuelas] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [currentUserId, setCurrentUserId] = useState(null)
  const [cambioRol, setCambioRol] = useState(null)
  const [guardandoRol, setGuardandoRol] = useState(false)

  useEffect(() => {
    getEscuelasTodas().then(setEscuelas).catch(() => {})
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id || null))
  }, [])

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedQ(q); setPage(0) }, 300)
    return () => clearTimeout(t)
  }, [q])

  useEffect(() => { load() }, [page, debouncedQ, filtroRol, filtroEscuela])

  async function load() {
    setLoading(true); setError('')
    try {
      const { data, count } = await getUsuarios({
        q: debouncedQ,
        rol: filtroRol,
        escuelaId: filtroEscuela,
        offset: page * PAGE_SIZE,
        limit: PAGE_SIZE,
      })
      setItems(data); setTotal(count)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  async function confirmarCambioRol() {
    if (!cambioRol || guardandoRol || cambioRol.rol === cambioRol.nuevoRol) return
    setGuardandoRol(true)
    setError('')
    setMensaje('')
    try {
      const resultado = await cambiarRolUsuario(cambioRol.id, cambioRol.nuevoRol)
      if (resultado?.pendiente) {
        setMensaje('Solicitud creada. El rol cambiará cuando el superadministrador la apruebe con MFA.')
      } else {
        setItems(prev => prev.map(item => (
          item.id === cambioRol.id ? { ...item, rol: cambioRol.nuevoRol } : item
        )))
      }
      setCambioRol(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setGuardandoRol(false)
    }
  }

  const pages = Math.ceil(total / PAGE_SIZE)
  const hayFiltros = q || filtroRol || filtroEscuela

  return (
    <AdminLayout>
      <div className="admin-page" style={{ padding: '32px 40px' }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: C.text, margin: 0 }}>Usuarios</h1>
          <p style={{ fontSize: 13, color: C.textLight, margin: '4px 0 0' }}>{total} usuario{total !== 1 ? 's' : ''}</p>
        </div>

        <div className="admin-filters" style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            style={{ ...S.input, maxWidth: 280 }}
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Buscar por nombre o email…"
          />
          <select
            style={{ ...S.input, maxWidth: 180 }}
            value={filtroRol}
            onChange={e => { setFiltroRol(e.target.value); setPage(0) }}
          >
            <option value="">Todos los roles</option>
            <option value="estudiante">Estudiante</option>
            <option value="docente">Docente</option>
            <option value="admin">Admin</option>
          </select>
          <select
            style={{ ...S.input, maxWidth: 220 }}
            value={filtroEscuela}
            onChange={e => { setFiltroEscuela(e.target.value); setPage(0) }}
          >
            <option value="">Todas las escuelas</option>
            {escuelas.map(e => (
              <option key={e.id} value={e.id}>{e.codigo} — {e.nombre}</option>
            ))}
          </select>
          {hayFiltros && (
            <button
              onClick={() => { setQ(''); setFiltroRol(''); setFiltroEscuela(''); setPage(0) }}
              style={{ fontSize: 13, fontWeight: 600, color: C.danger, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'Nunito, sans-serif', whiteSpace: 'nowrap' }}
            >
              ✕ Limpiar filtros
            </button>
          )}
        </div>

        {error && (
          <div style={{ background: C.dangerLight, color: C.danger, borderRadius: 10, padding: '12px 16px', marginBottom: 16, fontSize: 14, fontWeight: 600 }}>{error}</div>
        )}
        {mensaje && (
          <div style={{ background: C.successLight, color: C.success, borderRadius: 10, padding: '12px 16px', marginBottom: 16, fontSize: 14, fontWeight: 600 }}>
            {mensaje}
          </div>
        )}

        <div className="admin-table-card" style={{ ...S.card, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
            <thead>
              <tr>
                {['Nombre', 'Email', 'Rol', 'Escuela', 'Grado', 'Acciones'].map(h => (
                  <th key={h} style={S.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} style={{ ...S.td, textAlign: 'center', color: C.textLight, padding: 32 }}>Cargando…</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={6} style={{ ...S.td, textAlign: 'center', color: C.textLight, padding: 32 }}>Sin usuarios</td></tr>
              ) : items.map(u => {
                const rc = ROL_COLORS[u.rol] || ROL_COLORS.estudiante
                const escuelaCodigo = u.escuelas?.codigo
                  || escuelas.find(e => e.id === u.escuela_id)?.codigo
                  || '—'
                return (
                  <tr key={u.id}>
                    <td style={{ ...S.td, fontWeight: 600 }}>{u.nombre || '—'}</td>
                    <td style={{ ...S.td, fontSize: 13, color: C.textLight }}>{u.email || '—'}</td>
                    <td style={S.td}><span style={badge(rc.color, rc.bg)}>{u.rol}</span></td>
                    <td style={{ ...S.td, fontSize: 13, color: C.textLight }}>{escuelaCodigo}</td>
                    <td style={{ ...S.td, fontSize: 13, color: C.textLight }}>{u.grados?.nombre || '—'}</td>
                    <td style={S.td}>
                      <button
                        type="button"
                        disabled={u.id === currentUserId}
                        title={u.id === currentUserId ? 'No puedes modificar tu propio rol' : 'Cambiar rol'}
                        onClick={() => setCambioRol({ ...u, nuevoRol: u.rol })}
                        style={{
                          ...btnOutline(C.primary, 'sm'),
                          opacity: u.id === currentUserId ? 0.45 : 1,
                          cursor: u.id === currentUserId ? 'not-allowed' : 'pointer',
                        }}
                      >
                        Cambiar rol
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {pages > 1 && (
          <div style={{ display: 'flex', gap: 8, marginTop: 16, alignItems: 'center' }}>
            <button onClick={() => setPage(p => p - 1)} disabled={page === 0} style={btnOutline(C.primary, 'sm')}>←</button>
            <span style={{ fontSize: 13, color: C.textLight, fontWeight: 600 }}>Pág. {page + 1} de {pages}</span>
            <button onClick={() => setPage(p => p + 1)} disabled={page >= pages - 1} style={btnOutline(C.primary, 'sm')}>→</button>
          </div>
        )}

        {cambioRol && (
          <div style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
            background: 'rgba(15, 23, 42, 0.5)',
          }}>
            <div style={{ ...S.card, width: '100%', maxWidth: 420, padding: 28 }}>
              <h2 style={{ margin: '0 0 8px', color: C.text, fontSize: 20 }}>
                Cambiar rol de usuario
              </h2>
              <p style={{ margin: '0 0 20px', color: C.textLight, fontSize: 14, lineHeight: 1.5 }}>
                {cambioRol.nombre || cambioRol.email || 'Usuario'} tiene actualmente el rol{' '}
                <strong>{cambioRol.rol}</strong>.
              </p>

              <label style={S.label} htmlFor="nuevo-rol">Nuevo rol</label>
              <select
                id="nuevo-rol"
                value={cambioRol.nuevoRol}
                onChange={e => setCambioRol(prev => ({ ...prev, nuevoRol: e.target.value }))}
                style={{ ...S.input, marginBottom: 16 }}
              >
                <option value="estudiante">Estudiante</option>
                <option value="docente">Docente</option>
                <option value="admin">Administrador</option>
              </select>

              {cambioRol.nuevoRol === 'docente' && !cambioRol.escuela_id && (
                <div style={{
                  padding: '10px 12px',
                  marginBottom: 16,
                  borderRadius: 9,
                  color: '#92400E',
                  background: '#FEF3C7',
                  fontSize: 13,
                  lineHeight: 1.45,
                }}>
                  Este usuario no tiene escuela asignada y no podrá crear clases hasta completar ese dato.
                </div>
              )}

              {cambioRol.nuevoRol === 'admin' && cambioRol.rol !== 'admin' && (
                <div style={{
                  padding: '10px 12px',
                  marginBottom: 16,
                  borderRadius: 9,
                  color: '#991B1B',
                  background: C.dangerLight,
                  fontSize: 13,
                  lineHeight: 1.45,
                }}>
                  Un administrador tendrá acceso completo a usuarios, tokens, escuelas y contenido.
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  disabled={guardandoRol}
                  onClick={() => setCambioRol(null)}
                  style={btnOutline(C.textLight)}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={guardandoRol || cambioRol.nuevoRol === cambioRol.rol}
                  onClick={confirmarCambioRol}
                  style={{
                    ...btn(C.primary),
                    opacity: guardandoRol || cambioRol.nuevoRol === cambioRol.rol ? 0.55 : 1,
                    cursor: guardandoRol || cambioRol.nuevoRol === cambioRol.rol ? 'not-allowed' : 'pointer',
                  }}
                >
                  {guardandoRol ? 'Guardando…' : 'Confirmar cambio'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  )
}
