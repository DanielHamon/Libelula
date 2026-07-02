import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import AdminLayout from '../../components/AdminLayout'
import { getLibros, createLibro, toggleLibroActivo, getGrados } from '../../services/admin.service'
import { C, S, btn, btnOutline, badge } from '../../lib/adminStyles'
import StoragePicker from '../../components/StoragePicker'

const PAGE_SIZE = 20

function toSlugPreview(str) {
  return str.toLowerCase()
    .replace(/[áàä]/g, 'a').replace(/[éèë]/g, 'e')
    .replace(/[íìï]/g, 'i').replace(/[óòö]/g, 'o').replace(/[úùü]/g, 'u')
    .replace(/[ñ]/g, 'n').replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, '_').slice(0, 60)
}

function ModalCrear({ grados, onClose, onSave }) {
  const [form, setForm] = useState({ titulo: '', descripcion: '', emoji: '📖', grado_id: '', portada_url: '', pdf_url: '', id: '' })
  const [picker, setPicker] = useState(null) // 'portada' | 'pdf'
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function f(k) { return e => setForm(p => ({ ...p, [k]: e.target.value })) }

  function onTituloChange(e) {
    const titulo = e.target.value
    setForm(p => ({ ...p, titulo, id: toSlugPreview(titulo) }))
  }

  async function submit(e) {
    e.preventDefault()
    if (!form.titulo.trim() || !form.grado_id) { setError('Título y grado son obligatorios'); return }
    setLoading(true); setError('')
    try { await onSave(form); onClose() }
    catch (err) { setError(err.message); setLoading(false) }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, overflowY: 'auto', padding: 20 }}>
      <div style={{ ...S.card, width: 480, padding: 28, margin: 'auto' }}>
        <h3 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 800, color: C.text }}>Nuevo libro</h3>
        <form onSubmit={submit}>
          <div style={{ display: 'grid', gridTemplateColumns: '64px 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <label style={S.label}>Emoji</label>
              <input style={{ ...S.input, textAlign: 'center', fontSize: 22 }} value={form.emoji} onChange={f('emoji')} maxLength={2} />
            </div>
            <div>
              <label style={S.label}>Título</label>
              <input style={S.input} value={form.titulo} onChange={onTituloChange} placeholder="Ej: Roja como un tomate" />
            </div>
          </div>

          <label style={S.label}>ID <span style={{ color: C.textLight, fontWeight: 400 }}>(slug único)</span></label>
          <input style={{ ...S.input, marginBottom: 14, fontFamily: 'monospace', fontSize: 13 }} value={form.id} onChange={f('id')} placeholder="roja_como_un_tomate" />

          <label style={S.label}>Grado</label>
          <select style={{ ...S.input, marginBottom: 14 }} value={form.grado_id} onChange={f('grado_id')}>
            <option value="">Seleccionar…</option>
            {grados.map(g => <option key={g.id} value={g.id}>{g.nombre}</option>)}
          </select>

          <label style={S.label}>Descripción</label>
          <textarea style={{ ...S.input, marginBottom: 14, resize: 'vertical', minHeight: 64 }} value={form.descripcion} onChange={f('descripcion')} placeholder="Descripción breve del libro" />

          <label style={S.label}>Portada</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <button type="button" onClick={() => setPicker('portada')} style={btnOutline(C.primary, 'sm')}>
              Seleccionar imagen
            </button>
            <span style={{ fontSize: 12, color: C.textLight, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 240 }}>
              {form.portada_url ? form.portada_url.split('/').pop() : 'Sin archivo'}
            </span>
          </div>

          <label style={S.label}>PDF</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <button type="button" onClick={() => setPicker('pdf')} style={btnOutline(C.primary, 'sm')}>
              Seleccionar PDF
            </button>
            <span style={{ fontSize: 12, color: C.textLight, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 240 }}>
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

          {error && <div style={{ background: C.dangerLight, color: C.danger, borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, fontWeight: 600 }}>{error}</div>}

          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" onClick={onClose} style={{ ...btnOutline(C.textLight), flex: 1 }}>Cancelar</button>
            <button type="submit" disabled={loading} style={{ ...btn(C.primary), flex: 1 }}>
              {loading ? 'Guardando…' : 'Crear libro'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function AdminLibros() {
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [filtroGrado, setFiltroGrado] = useState('')
  const [soloActivos, setSoloActivos] = useState(true)
  const [grados, setGrados] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { getGrados().then(setGrados).catch(() => {}) }, [])

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedQ(q); setPage(0) }, 300)
    return () => clearTimeout(t)
  }, [q])

  useEffect(() => { load() }, [page, debouncedQ, filtroGrado, soloActivos])

  async function load() {
    setLoading(true); setError('')
    try {
      const { data, count } = await getLibros({
        q: debouncedQ,
        gradoId: filtroGrado || undefined,
        soloActivos,
        offset: page * PAGE_SIZE,
        limit: PAGE_SIZE,
      })
      setItems(data); setTotal(count)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  const [confirmToggle, setConfirmToggle] = useState(null) // { id, titulo }

  async function handleToggle(id, activo) {
    try {
      await toggleLibroActivo(id, !activo)
      setItems(prev => prev.map(i => i.id === id ? { ...i, activo: !activo } : i))
      setConfirmToggle(null)
    } catch (e) { setError(e.message) }
  }

  const pages = Math.ceil(total / PAGE_SIZE)

  return (
    <AdminLayout>
      <div style={{ padding: '32px 40px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: C.text, margin: 0 }}>Libros</h1>
            <p style={{ fontSize: 13, color: C.textLight, margin: '4px 0 0' }}>{total} libro{total !== 1 ? 's' : ''} registrados</p>
          </div>
          <button onClick={() => setModal(true)} style={btn(C.primary)}>+ Nuevo libro</button>
        </div>

        <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <input style={{ ...S.input, maxWidth: 280 }} value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por título…" />
          <select
            style={{ ...S.input, maxWidth: 200 }}
            value={filtroGrado}
            onChange={e => { setFiltroGrado(e.target.value); setPage(0) }}
          >
            <option value="">Todos los grados</option>
            {grados.map(g => <option key={g.id} value={g.id}>{g.nombre}</option>)}
          </select>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: C.text, cursor: 'pointer', userSelect: 'none' }}>
            <input
              type="checkbox"
              checked={soloActivos}
              onChange={e => { setSoloActivos(e.target.checked); setPage(0) }}
              style={{ width: 16, height: 16, cursor: 'pointer' }}
            />
            Solo activos
          </label>
          {(filtroGrado || soloActivos) && (
            <button
              onClick={() => { setFiltroGrado(''); setSoloActivos(false); setPage(0) }}
              style={{ fontSize: 13, fontWeight: 600, color: C.danger, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'Nunito, sans-serif' }}
            >
              ✕ Limpiar filtros
            </button>
          )}
        </div>

        {error && <div style={{ background: C.dangerLight, color: C.danger, borderRadius: 10, padding: '12px 16px', marginBottom: 16, fontSize: 14, fontWeight: 600 }}>{error}</div>}

        <div style={{ ...S.card, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['', 'Título', 'ID', 'Grado', 'Estado', 'Acciones'].map(h => (
                  <th key={h} style={S.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} style={{ ...S.td, textAlign: 'center', color: C.textLight, padding: 32 }}>Cargando…</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={6} style={{ ...S.td, textAlign: 'center', color: C.textLight, padding: 32 }}>Sin resultados</td></tr>
              ) : items.map(item => (
                <tr key={item.id}>
                  <td style={{ ...S.td, fontSize: 22, width: 40, textAlign: 'center' }}>{item.emoji || '📖'}</td>
                  <td style={{ ...S.td, fontWeight: 700 }}>{item.titulo}</td>
                  <td style={{ ...S.td, fontFamily: 'monospace', fontSize: 12, color: C.textLight }}>{item.id}</td>
                  <td style={{ ...S.td, color: C.textLight }}>{item.grados?.nombre || '—'}</td>
                  <td style={S.td}>
                    <span style={badge(item.activo ? C.success : C.textLight, item.activo ? C.successLight : '#F3F4F6')}>
                      {item.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td style={{ ...S.td, display: 'flex', gap: 8, alignItems: 'center' }}>
                    <Link to={`/admin/libros/${item.id}`} style={btnOutline(C.primary, 'sm')}>Editar</Link>
                    <button
                      onClick={() => item.activo ? setConfirmToggle({ id: item.id, titulo: item.titulo }) : handleToggle(item.id, item.activo)}
                      style={btnOutline(item.activo ? C.danger : C.success, 'sm')}
                    >
                      {item.activo ? 'Desactivar' : 'Activar'}
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
        <ModalCrear
          grados={grados}
          onClose={() => setModal(false)}
          onSave={async form => { await createLibro(form); load() }}
        />
      )}

      {confirmToggle && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ ...S.card, width: 380, padding: 28, textAlign: 'center' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>⚠️</div>
            <h3 style={{ margin: '0 0 8px', fontWeight: 800, color: C.text }}>¿Desactivar libro?</h3>
            <p style={{ fontSize: 14, color: C.textLight, margin: '0 0 24px' }}>
              <strong>{confirmToggle.titulo}</strong> dejará de estar disponible para los estudiantes.
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
