import { useEffect, useState } from 'react'
import AdminLayout from '../../components/AdminLayout'
import { getLogs } from '../../services/admin.service'
import { C, S, btnOutline } from '../../lib/adminStyles'

const PAGE_SIZE = 50

const ACCION_LABEL = {
  creo_escuela: 'Creó escuela',
  activo_escuela: 'Activó escuela',
  desactivo_escuela: 'Desactivó escuela',
  asigno_libro_escuela: 'Asignó libro a escuela',
  removio_libro_escuela: 'Removió libro de escuela',
  creo_libro: 'Creó libro',
  edito_libro: 'Editó libro',
  activo_libro: 'Activó libro',
  desactivo_libro: 'Desactivó libro',
  creo_unidad: 'Creó unidad',
  creo_actividad: 'Creó actividad',
  edito_actividad: 'Editó actividad',
  genero_tokens_libro: 'Generó tokens de libro',
  genero_tokens_docente: 'Generó tokens de docente',
  revoco_token: 'Revocó token',
}

const ENTIDAD_ICON = {
  escuela: '🏫',
  libro: '📚',
  unidad: '📑',
  actividad: '🎮',
  token: '🎟️',
}

function formatFecha(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })
}

export default function AdminLogs() {
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expandedId, setExpandedId] = useState(null)

  useEffect(() => { load() }, [page])

  async function load() {
    setLoading(true); setError('')
    try {
      const { data, count } = await getLogs({ offset: page * PAGE_SIZE, limit: PAGE_SIZE })
      setItems(data); setTotal(count)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  const pages = Math.ceil(total / PAGE_SIZE)

  return (
    <AdminLayout>
      <div className="admin-page" style={{ padding: '32px 40px' }}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: C.text, margin: 0 }}>Logs de administración</h1>
          <p style={{ fontSize: 13, color: C.textLight, margin: '4px 0 0' }}>{total} acción{total !== 1 ? 'es' : ''} registrada{total !== 1 ? 's' : ''}</p>
        </div>

        {error && <div style={{ background: C.dangerLight, color: C.danger, borderRadius: 10, padding: '12px 16px', marginBottom: 16, fontSize: 14, fontWeight: 600 }}>{error}</div>}

        <div className="admin-table-card" style={{ ...S.card, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Fecha', 'Acción', 'Entidad', 'ID entidad', 'Payload'].map(h => (
                  <th key={h} style={S.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} style={{ ...S.td, textAlign: 'center', color: C.textLight, padding: 32 }}>Cargando…</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={5} style={{ ...S.td, textAlign: 'center', color: C.textLight, padding: 32 }}>Sin registros aún.</td></tr>
              ) : items.map(item => (
                <>
                  <tr key={item.id} style={{ cursor: item.payload ? 'pointer' : 'default' }} onClick={() => item.payload && setExpandedId(expandedId === item.id ? null : item.id)}>
                    <td style={{ ...S.td, color: C.textLight, whiteSpace: 'nowrap' }}>{formatFecha(item.created_at)}</td>
                    <td style={{ ...S.td, fontWeight: 600 }}>{ACCION_LABEL[item.accion] || item.accion}</td>
                    <td style={S.td}>
                      <span>{ENTIDAD_ICON[item.entidad] || '•'} <span style={{ textTransform: 'capitalize' }}>{item.entidad}</span></span>
                    </td>
                    <td style={{ ...S.td, fontFamily: 'monospace', fontSize: 12, color: C.textLight, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.entidad_id}
                    </td>
                    <td style={{ ...S.td, color: item.payload ? C.primary : C.textLight, fontSize: 13 }}>
                      {item.payload ? (expandedId === item.id ? '▲ Ocultar' : '▼ Ver') : '—'}
                    </td>
                  </tr>
                  {expandedId === item.id && (
                    <tr key={`${item.id}-payload`}>
                      <td colSpan={5} style={{ padding: '0 14px 14px', background: C.bg }}>
                        <pre style={{ margin: 0, fontSize: 12, background: C.white, border: `1px solid ${C.border}`, borderRadius: 8, padding: '12px 14px', overflowX: 'auto', color: C.text }}>
                          {JSON.stringify(item.payload, null, 2)}
                        </pre>
                      </td>
                    </tr>
                  )}
                </>
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
    </AdminLayout>
  )
}
