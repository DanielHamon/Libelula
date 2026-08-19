import { useEffect, useState } from 'react'
import AdminLayout from '../../components/AdminLayout'
import { getAdminStats } from '../../services/admin.service'
import { C, S } from '../../lib/adminStyles'

const STATS = [
  { key: 'escuelasActivas', label: 'Escuelas activas', icon: '🏫', color: C.primary },
  { key: 'librosActivos',   label: 'Libros activos',   icon: '📚', color: C.success },
  { key: 'tokensValidos',   label: 'Tokens válidos',   icon: '🎟️', color: C.accent },
]

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

function formatFecha(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })
}

export default function PanelAdmin() {
  const [stats, setStats] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    getAdminStats()
      .then(setStats)
      .catch(e => setError(e.message))
  }, [])

  return (
    <AdminLayout>
      <div className="admin-page admin-dashboard" style={{ padding: '32px 40px', maxWidth: 900 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: C.text, margin: '0 0 6px' }}>Dashboard</h1>
        <p style={{ fontSize: 14, color: C.textLight, margin: '0 0 28px' }}>Resumen del sistema Libelula</p>

        {error && (
          <div style={{ background: C.dangerLight, color: C.danger, borderRadius: 10, padding: '12px 16px', marginBottom: 24, fontSize: 14, fontWeight: 600 }}>
            {error}
          </div>
        )}

        <div className="admin-stat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 32 }}>
          {STATS.map(s => (
            <div key={s.key} style={{ ...S.card, padding: 20, display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: s.color + '15', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>
                {s.icon}
              </div>
              <div>
                <div style={{ fontSize: 28, fontWeight: 800, color: s.color, lineHeight: 1 }}>
                  {stats ? stats[s.key] ?? '—' : '…'}
                </div>
                <div style={{ fontSize: 12, color: C.textLight, fontWeight: 600, marginTop: 4 }}>{s.label}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="admin-table-card" style={{ ...S.card, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.border}` }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>Actividad reciente</span>
          </div>
          {!stats ? (
            <div style={{ padding: 20, color: C.textLight, fontSize: 14 }}>Cargando…</div>
          ) : stats.logsRecientes.length === 0 ? (
            <div style={{ padding: 20, color: C.textLight, fontSize: 14 }}>Sin actividad registrada aún.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Acción', 'Entidad', 'ID', 'Fecha'].map(h => (
                    <th key={h} style={S.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stats.logsRecientes.map((log, i) => (
                  <tr key={i}>
                    <td style={S.td}>{ACCION_LABEL[log.accion] || log.accion}</td>
                    <td style={S.td}><span style={{ textTransform: 'capitalize' }}>{log.entidad}</span></td>
                    <td style={{ ...S.td, fontFamily: 'monospace', fontSize: 12, color: C.textLight }}>{log.entidad_id}</td>
                    <td style={{ ...S.td, color: C.textLight }}>{formatFecha(log.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AdminLayout>
  )
}
