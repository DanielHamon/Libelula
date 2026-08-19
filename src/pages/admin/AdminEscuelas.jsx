import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import AdminLayout from '../../components/AdminLayout'
import { getEscuelas, createEscuela, toggleEscuelaActiva } from '../../services/admin.service'
import { C, S, btn, btnOutline, badge } from '../../lib/adminStyles'

const PAGE_SIZE = 20

function Modal({ onClose, onSave }) {
  const [form, setForm] = useState({ nombre: '', ciudad: '', codigo: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function f(k) { return e => setForm(p => ({ ...p, [k]: e.target.value })) }

  async function submit(e) {
    e.preventDefault()
    if (!form.nombre.trim() || !form.codigo.trim()) { setError('Nombre y código son obligatorios'); return }
    setLoading(true); setError('')
    try {
      await onSave(form)
      onClose()
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div style={{ ...S.card, width: 420, padding: 28 }}>
        <h3 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 800, color: C.text }}>Nueva escuela</h3>
        <form onSubmit={submit}>
          <label style={S.label}>Nombre</label>
          <input style={{ ...S.input, marginBottom: 14 }} value={form.nombre} onChange={f('nombre')} placeholder="Ej: Colegio San José" />

          <label style={S.label}>Ciudad</label>
          <input style={{ ...S.input, marginBottom: 14 }} value={form.ciudad} onChange={f('ciudad')} placeholder="Ej: Monterrey" />

          <label style={S.label}>Código <span style={{ color: C.textLight, fontWeight: 400 }}>(único, visible para admin)</span></label>
          <input
            style={{ ...S.input, marginBottom: 20, fontFamily: 'monospace', textTransform: 'uppercase' }}
            value={form.codigo}
            onChange={f('codigo')}
            placeholder="Ej: COL-SANJOSE"
          />

          {error && <div style={{ background: C.dangerLight, color: C.danger, borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, fontWeight: 600 }}>{error}</div>}

          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" onClick={onClose} style={{ ...btnOutline(C.textLight), flex: 1 }}>Cancelar</button>
            <button type="submit" disabled={loading} style={{ ...btn(C.primary), flex: 1 }}>
              {loading ? 'Guardando…' : 'Crear escuela'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function AdminEscuelas() {
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [error, setError] = useState('')
  const [mensaje, setMensaje] = useState('')

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedQ(q); setPage(0) }, 300)
    return () => clearTimeout(t)
  }, [q])

  useEffect(() => { load() }, [page, debouncedQ])

  async function load() {
    setLoading(true); setError('')
    try {
      const { data, count } = await getEscuelas({ q: debouncedQ, offset: page * PAGE_SIZE, limit: PAGE_SIZE })
      setItems(data); setTotal(count)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  const [confirmToggle, setConfirmToggle] = useState(null) // { id, nombre }

  async function handleToggle(id, activa) {
    try {
      const resultado = await toggleEscuelaActiva(id, !activa)
      if (resultado?.pendiente) {
        setMensaje('Solicitud enviada para aprobación del superadministrador.')
      }
      setConfirmToggle(null)
    } catch (e) { setError(e.message) }
  }

  const pages = Math.ceil(total / PAGE_SIZE)

  return (
    <AdminLayout>
      <div className="admin-page" style={{ padding: '32px 40px' }}>
        <div className="admin-page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: C.text, margin: 0 }}>Escuelas</h1>
            <p style={{ fontSize: 13, color: C.textLight, margin: '4px 0 0' }}>{total} escuela{total !== 1 ? 's' : ''} registradas</p>
          </div>
          <button onClick={() => setModal(true)} style={btn(C.primary)}>+ Nueva escuela</button>
        </div>

        <div className="admin-filters" style={{ marginBottom: 16 }}>
          <input
            style={{ ...S.input, maxWidth: 320 }}
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Buscar por nombre…"
          />
        </div>

        {error && <div style={{ background: C.dangerLight, color: C.danger, borderRadius: 10, padding: '12px 16px', marginBottom: 16, fontSize: 14, fontWeight: 600 }}>{error}</div>}
        {mensaje && <div style={{ background: C.successLight, color: C.success, borderRadius: 10, padding: '12px 16px', marginBottom: 16, fontSize: 14, fontWeight: 600 }}>{mensaje}</div>}

        <div className="admin-table-card" style={{ ...S.card, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Código', 'Nombre', 'Ciudad', 'Estado', 'Acciones'].map(h => (
                  <th key={h} style={S.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} style={{ ...S.td, textAlign: 'center', color: C.textLight, padding: 32 }}>Cargando…</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={5} style={{ ...S.td, textAlign: 'center', color: C.textLight, padding: 32 }}>Sin resultados</td></tr>
              ) : items.map(item => (
                <tr key={item.id}>
                  <td style={{ ...S.td, fontFamily: 'monospace', fontSize: 13, fontWeight: 700, color: C.primary }}>
                    {item.codigo || '—'}
                  </td>
                  <td style={{ ...S.td, fontWeight: 600 }}>{item.nombre}</td>
                  <td style={{ ...S.td, color: C.textLight }}>{item.ciudad || '—'}</td>
                  <td style={S.td}>
                    <span style={badge(item.activa ? C.success : C.textLight, item.activa ? C.successLight : '#F3F4F6')}>
                      {item.activa ? 'Activa' : 'Inactiva'}
                    </span>
                  </td>
                  <td style={{ ...S.td, display: 'flex', gap: 8, alignItems: 'center' }}>
                    <Link to={`/admin/escuelas/${item.id}`} style={btnOutline(C.primary, 'sm')}>Ver</Link>
                    <button
                      onClick={() => item.activa ? setConfirmToggle({ id: item.id, nombre: item.nombre }) : handleToggle(item.id, item.activa)}
                      style={btnOutline(item.activa ? C.danger : C.success, 'sm')}
                    >
                      {item.activa ? 'Desactivar' : 'Activar'}
                    </button>
                  </td>
                </tr>
              ))}
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
      </div>

      {modal && (
        <Modal
          onClose={() => setModal(false)}
          onSave={async form => {
            const resultado = await createEscuela(form)
            if (resultado?.pendiente) setMensaje('La creación de la escuela quedó pendiente de aprobación.')
          }}
        />
      )}

      {confirmToggle && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ ...S.card, width: 380, padding: 28, textAlign: 'center' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>⚠️</div>
            <h3 style={{ margin: '0 0 8px', fontWeight: 800, color: C.text }}>¿Desactivar escuela?</h3>
            <p style={{ fontSize: 14, color: C.textLight, margin: '0 0 24px' }}>
              <strong>{confirmToggle.nombre}</strong> y todos sus docentes y estudiantes perderán acceso.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setConfirmToggle(null)} style={{ ...btnOutline(C.textLight), flex: 1 }}>Cancelar</button>
              <button onClick={() => handleToggle(confirmToggle.id, true)} style={{ ...btn(C.danger), flex: 1 }}>Desactivar</button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  )
}
