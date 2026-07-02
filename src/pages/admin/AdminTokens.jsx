import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import AdminLayout from '../../components/AdminLayout'
import {
  getTokens, revocarToken,
  createTokensLibro, createTokenesDocente,
  getEscuelasTodas, getEscuelasAdmin, getLibrosTodos, getGrados,
} from '../../services/admin.service'
import { C, S, btn, btnOutline, badge } from '../../lib/adminStyles'

const PAGE_SIZE = 50

function descargarCSV(tokens) {
  const headers = ['ID', 'Estado', 'Tipo', 'Escuela', 'Libro/Email', 'Grado', 'Expira']
  const rows = tokens.map(t => [
    t.id,
    t.estado,
    t.tipo,
    t.escuelas?.codigo || t.escuelas?.nombre || '',
    t.tipo === 'docente' ? (t.email_autorizado || '') : (t.libro_id || ''),
    t.grado_id || '',
    t.expira_en ? new Date(t.expira_en).toLocaleDateString('es-MX') : '',
  ])
  const csv = [headers, ...rows]
    .map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `tokens_${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function descargarIds(ids) {
  const csv = ['Token', ...ids].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `tokens_generados_${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

const ESTADO_COLOR = {
  valido:   { color: C.success, bg: C.successLight },
  activado: { color: C.primary, bg: C.primaryLight },
  expirado: { color: C.accent,  bg: C.accentLight },
  revocado: { color: C.danger,  bg: C.dangerLight },
}

function isExpirado(expira_en) {
  return expira_en && new Date(expira_en) < new Date()
}

function formatFecha(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  const vencido = d < new Date()
  return <span style={{ color: vencido ? C.danger : 'inherit' }}>{d.toLocaleDateString('es-MX')}</span>
}

// ─── Modal libro ─────────────────────────────────────────────────────────────
function ModalLibro({ escuelas, libros, grados, onClose, onSave }) {
  const [form, setForm] = useState({ escuelaId: '', gradoId: '', libroId: '', cantidad: 1, expiraEn: '' })
  const [generados, setGenerados] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function f(k) { return e => setForm(p => ({ ...p, [k]: e.target.value })) }

  function onEscuelaChange(e) {
    setForm(p => ({ ...p, escuelaId: e.target.value, gradoId: '', libroId: '' }))
  }

  function onGradoChange(e) {
    setForm(p => ({ ...p, gradoId: e.target.value, libroId: '' }))
  }

  const librosFiltrados = form.gradoId
    ? libros.filter(l => String(l.grado_id) === String(form.gradoId))
    : []

  async function submit(e) {
    e.preventDefault()
    if (!form.escuelaId || !form.gradoId || !form.libroId) { setError('Escuela, grado y libro son obligatorios'); return }
    setLoading(true); setError('')
    try {
      const ids = await onSave(form)
      setGenerados(ids)
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  if (generados) return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div style={{ ...S.card, width: 520, padding: 28 }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: C.success, marginBottom: 4 }}>✅ {generados.length} token{generados.length !== 1 ? 's' : ''} generado{generados.length !== 1 ? 's' : ''}</div>
        <p style={{ fontSize: 13, color: C.textLight, marginBottom: 16 }}>Copia los tokens y compártelos con los estudiantes.</p>
        <div style={{ background: C.bg, borderRadius: 10, padding: 14, fontFamily: 'monospace', fontSize: 14, lineHeight: 1.8, maxHeight: 240, overflowY: 'auto', marginBottom: 16 }}>
          {generados.join('\n')}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => descargarIds(generados)} style={{ ...btnOutline(C.success), flex: 1 }}>Descargar CSV</button>
          <button onClick={onClose} style={{ ...btn(C.primary), flex: 1 }}>Cerrar</button>
        </div>
      </div>
    </div>
  )

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div style={{ ...S.card, width: 440, padding: 28 }}>
        <h3 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 800, color: C.text }}>Generar tokens de libro</h3>
        <form onSubmit={submit}>

          <label style={S.label}>Escuela</label>
          <select style={{ ...S.input, marginBottom: 14 }} value={form.escuelaId} onChange={onEscuelaChange}>
            <option value="">Seleccionar…</option>
            {escuelas.map(e => <option key={e.id} value={e.id}>{e.codigo} — {e.nombre}</option>)}
          </select>

          <label style={S.label}>Grado</label>
          <select style={{ ...S.input, marginBottom: 14 }} value={form.gradoId} onChange={onGradoChange} disabled={!form.escuelaId}>
            <option value="">{form.escuelaId ? 'Seleccionar grado…' : 'Primero elige una escuela'}</option>
            {grados.map(g => <option key={g.id} value={g.id}>{g.nombre}</option>)}
          </select>

          <label style={S.label}>
            Libro
            {form.gradoId && librosFiltrados.length === 0 && (
              <span style={{ color: C.danger, fontWeight: 400, marginLeft: 8 }}>— sin libros para este grado</span>
            )}
          </label>
          <select style={{ ...S.input, marginBottom: 14 }} value={form.libroId} onChange={f('libroId')} disabled={!form.gradoId || librosFiltrados.length === 0}>
            <option value="">{!form.gradoId ? 'Primero elige un grado' : 'Seleccionar libro…'}</option>
            {librosFiltrados.map(l => <option key={l.id} value={l.id}>{l.emoji || '📖'} {l.titulo}</option>)}
          </select>

          <label style={S.label}>Cantidad</label>
          <input style={{ ...S.input, marginBottom: 14 }} type="number" min={1} max={500} value={form.cantidad} onChange={f('cantidad')} />

          <label style={S.label}>Expira en <span style={{ color: C.textLight, fontWeight: 400 }}>(opcional)</span></label>
          <input style={{ ...S.input, marginBottom: 20 }} type="date" value={form.expiraEn} onChange={f('expiraEn')} />

          {error && <div style={{ background: C.dangerLight, color: C.danger, borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, fontWeight: 600 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" onClick={onClose} style={{ ...btnOutline(C.textLight), flex: 1 }}>Cancelar</button>
            <button type="submit" disabled={loading} style={{ ...btn(C.primary), flex: 1 }}>{loading ? 'Generando…' : 'Generar tokens'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Modal docente ────────────────────────────────────────────────────────────
function ModalDocente({ escuelas, onClose, onSave }) {
  const [form, setForm] = useState({ escuelaId: '', emailsRaw: '', expiraEn: '' })
  const [generados, setGenerados] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function f(k) { return e => setForm(p => ({ ...p, [k]: e.target.value })) }

  async function submit(e) {
    e.preventDefault()
    const emails = form.emailsRaw.split('\n').map(s => s.trim()).filter(Boolean)
    if (!form.escuelaId || emails.length === 0) { setError('Escuela y al menos un email son obligatorios'); return }
    setLoading(true); setError('')
    try {
      const ids = await onSave({ escuelaId: form.escuelaId, emails, expiraEn: form.expiraEn || null })
      setGenerados(ids)
    } catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  if (generados) return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div style={{ ...S.card, width: 520, padding: 28 }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: C.success, marginBottom: 4 }}>✅ {generados.length} token{generados.length !== 1 ? 's' : ''} generado{generados.length !== 1 ? 's' : ''}</div>
        <p style={{ fontSize: 13, color: C.textLight, marginBottom: 16 }}>Envía cada token al docente correspondiente.</p>
        <div style={{ background: C.bg, borderRadius: 10, padding: 14, fontFamily: 'monospace', fontSize: 14, lineHeight: 1.8, maxHeight: 240, overflowY: 'auto', marginBottom: 16 }}>
          {generados.join('\n')}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => descargarIds(generados)} style={{ ...btnOutline(C.success), flex: 1 }}>Descargar CSV</button>
          <button onClick={onClose} style={{ ...btn(C.primary), flex: 1 }}>Cerrar</button>
        </div>
      </div>
    </div>
  )

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div style={{ ...S.card, width: 440, padding: 28 }}>
        <h3 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 800, color: C.text }}>Generar tokens de docente</h3>
        <form onSubmit={submit}>
          <label style={S.label}>Escuela</label>
          <select style={{ ...S.input, marginBottom: 14 }} value={form.escuelaId} onChange={f('escuelaId')}>
            <option value="">Seleccionar…</option>
            {escuelas.map(e => <option key={e.id} value={e.id}>{e.codigo} — {e.nombre}</option>)}
          </select>

          <label style={S.label}>Emails de docentes <span style={{ color: C.textLight, fontWeight: 400 }}>(uno por línea)</span></label>
          <textarea
            style={{ ...S.input, marginBottom: 14, resize: 'vertical', minHeight: 100, fontFamily: 'monospace', fontSize: 13 }}
            value={form.emailsRaw}
            onChange={f('emailsRaw')}
            placeholder={'docente1@escuela.mx\ndocente2@escuela.mx'}
          />

          <label style={S.label}>Expira en <span style={{ color: C.textLight, fontWeight: 400 }}>(opcional)</span></label>
          <input style={{ ...S.input, marginBottom: 20 }} type="date" value={form.expiraEn} onChange={f('expiraEn')} />

          {error && <div style={{ background: C.dangerLight, color: C.danger, borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 13, fontWeight: 600 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" onClick={onClose} style={{ ...btnOutline(C.textLight), flex: 1 }}>Cancelar</button>
            <button type="submit" disabled={loading} style={{ ...btn(C.primary), flex: 1 }}>{loading ? 'Generando…' : 'Generar tokens'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────
export default function AdminTokens() {
  const [searchParams] = useSearchParams()
  const [tab, setTab] = useState('libro')
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('')
  const [filtroEscuela, setFiltroEscuela] = useState(() => searchParams.get('escuela') || '')
  const [filtroLibro, setFiltroLibro] = useState('')
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)
  const [error, setError] = useState('')
  const [revocarId, setRevocarId] = useState(null)

  const [escuelas, setEscuelas] = useState([])
  const [escuelasMap, setEscuelasMap] = useState({})
  const [libros, setLibros] = useState([])
  const [grados, setGrados] = useState([])

  useEffect(() => {
    getEscuelasTodas().then(setEscuelas).catch(() => {})
    getEscuelasAdmin().then(rows => {
      const m = {}
      rows.forEach(e => { m[e.id] = e.codigo || e.nombre })
      setEscuelasMap(m)
    }).catch(() => {})
    getLibrosTodos().then(setLibros).catch(() => {})
    getGrados().then(setGrados).catch(() => {})
  }, [])

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedQ(q); setPage(0) }, 300)
    return () => clearTimeout(t)
  }, [q])

  useEffect(() => { load() }, [tab, page, debouncedQ, filtroEstado, filtroEscuela, filtroLibro])

  async function load() {
    setLoading(true); setError('')
    try {
      const { data, count } = await getTokens({
        tipo: tab,
        estado: filtroEstado || undefined,
        escuelaId: filtroEscuela || undefined,
        libroId: filtroLibro || undefined,
        q: debouncedQ,
        offset: page * PAGE_SIZE,
        limit: PAGE_SIZE,
      })
      setItems(data); setTotal(count)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  function cambiarTab(key) {
    setTab(key)
    setFiltroLibro('')
    setPage(0)
  }

  async function handleRevocar() {
    if (!revocarId) return
    try {
      await revocarToken(revocarId)
      setItems(prev => prev.map(i => i.id === revocarId ? { ...i, estado: 'revocado' } : i))
      setRevocarId(null)
    } catch (e) { setError(e.message) }
  }

  const pages = Math.ceil(total / PAGE_SIZE)

  return (
    <AdminLayout>
      <div style={{ padding: '32px 40px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: C.text, margin: 0 }}>Tokens</h1>
            <p style={{ fontSize: 13, color: C.textLight, margin: '4px 0 0' }}>{total} token{total !== 1 ? 's' : ''}</p>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => descargarCSV(items)} disabled={items.length === 0} style={btnOutline(C.success)}>Exportar CSV</button>
            <button onClick={() => setModal('docente')} style={btnOutline(C.primary)}>+ Docente</button>
            <button onClick={() => setModal('libro')} style={btn(C.primary)}>+ Libro</button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 20, borderBottom: `1px solid ${C.border}`, paddingBottom: -1 }}>
          {[['libro', '📚 Libro'], ['docente', '👩‍🏫 Docente']].map(([key, label]) => (
            <button key={key} onClick={() => cambiarTab(key)} style={{
              padding: '9px 18px', border: 'none', borderRadius: '8px 8px 0 0',
              background: tab === key ? C.white : 'transparent',
              color: tab === key ? C.primary : C.textLight,
              fontWeight: 700, fontSize: 14, cursor: 'pointer',
              borderBottom: tab === key ? `2px solid ${C.primary}` : '2px solid transparent',
              fontFamily: 'Nunito, sans-serif',
            }}>{label}</button>
          ))}
        </div>

        {/* Filtros */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            style={{ ...S.input, maxWidth: 220 }}
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Buscar por ID…"
          />
          <select
            style={{ ...S.input, maxWidth: 180 }}
            value={filtroEstado}
            onChange={e => { setFiltroEstado(e.target.value); setPage(0) }}
          >
            <option value="">Todos los estados</option>
            <option value="valido">Válido</option>
            <option value="activado">Activado</option>
            <option value="expirado">Expirado</option>
            <option value="revocado">Revocado</option>
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
          {tab === 'libro' && (
            <select
              style={{ ...S.input, maxWidth: 220 }}
              value={filtroLibro}
              onChange={e => { setFiltroLibro(e.target.value); setPage(0) }}
            >
              <option value="">Todos los libros</option>
              {libros.map(l => (
                <option key={l.id} value={l.id}>{l.emoji || '📖'} {l.titulo}</option>
              ))}
            </select>
          )}
          {(filtroEstado || filtroEscuela || filtroLibro) && (
            <button
              onClick={() => { setFiltroEstado(''); setFiltroEscuela(''); setFiltroLibro(''); setPage(0) }}
              style={{ fontSize: 13, fontWeight: 600, color: C.danger, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'Nunito, sans-serif', whiteSpace: 'nowrap' }}
            >
              ✕ Limpiar filtros
            </button>
          )}
        </div>

        {error && <div style={{ background: C.dangerLight, color: C.danger, borderRadius: 10, padding: '12px 16px', marginBottom: 16, fontSize: 14, fontWeight: 600 }}>{error}</div>}

        <div style={{ ...S.card, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
            <thead>
              <tr>
                {['ID', 'Escuela', tab === 'libro' ? 'Grado' : 'Email autorizado', 'Estado', 'Expira', 'Acciones'].map(h => (
                  <th key={h} style={S.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} style={{ ...S.td, textAlign: 'center', color: C.textLight, padding: 32 }}>Cargando…</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={6} style={{ ...S.td, textAlign: 'center', color: C.textLight, padding: 32 }}>Sin tokens</td></tr>
              ) : items.map(item => {
                const estadoEfectivo = item.estado === 'valido' && isExpirado(item.expira_en) ? 'expirado' : item.estado
                const ec = ESTADO_COLOR[estadoEfectivo] || ESTADO_COLOR.valido
                return (
                  <tr key={item.id}>
                    <td style={{ ...S.td, fontFamily: 'monospace', fontWeight: 700, fontSize: 13, color: C.primary }}>{item.id}</td>
                    <td style={{ ...S.td, fontSize: 13 }}>{item.escuelas?.codigo || item.escuelas?.nombre || escuelasMap[item.escuela_id] || '—'}</td>
                    <td style={{ ...S.td, fontSize: 13, color: C.textLight }}>
                      {tab === 'libro' ? (item.grado_id ?? '—') : (item.email_autorizado || '—')}
                    </td>
                    <td style={S.td}>
                      <span style={badge(ec.color, ec.bg)}>{estadoEfectivo}</span>
                    </td>
                    <td style={S.td}>{formatFecha(item.expira_en)}</td>
                    <td style={S.td}>
                      {item.estado === 'valido' && (
                        <button onClick={() => setRevocarId(item.id)} style={btnOutline(C.danger, 'sm')}>Revocar</button>
                      )}
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
      </div>

      {/* Confirmar revocación */}
      {revocarId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ ...S.card, width: 380, padding: 28, textAlign: 'center' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>⚠️</div>
            <h3 style={{ margin: '0 0 8px', fontWeight: 800, color: C.text }}>¿Revocar token?</h3>
            <p style={{ fontSize: 14, color: C.textLight, margin: '0 0 8px' }}>ID: <code style={{ fontWeight: 700 }}>{revocarId}</code></p>
            <p style={{ fontSize: 13, color: C.textLight, margin: '0 0 24px' }}>Esta acción no se puede deshacer.</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setRevocarId(null)} style={{ ...btnOutline(C.textLight), flex: 1 }}>Cancelar</button>
              <button onClick={handleRevocar} style={{ ...btn(C.danger), flex: 1 }}>Revocar</button>
            </div>
          </div>
        </div>
      )}

      {modal === 'libro' && (
        <ModalLibro
          escuelas={escuelas} libros={libros} grados={grados}
          onClose={() => setModal(null)}
          onSave={async form => createTokensLibro(form)}
        />
      )}
      {modal === 'docente' && (
        <ModalDocente
          escuelas={escuelas}
          onClose={() => setModal(null)}
          onSave={async form => createTokenesDocente(form)}
        />
      )}
    </AdminLayout>
  )
}
