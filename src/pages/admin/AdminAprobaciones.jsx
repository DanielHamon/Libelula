import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import AdminLayout from '../../components/AdminLayout'
import {
  getAccionesAdminPendientes,
  getEstadoSuperadministrador,
  resolverAccionAdmin,
} from '../../services/admin.service'
import { C, S, btn, btnOutline, badge } from '../../lib/adminStyles'

const LABELS = {
  conceder_admin: 'Conceder rol administrador',
  cambiar_rol_usuario: 'Cambiar rol de usuario',
  crear_escuela: 'Crear escuela',
  cambiar_estado_escuela: 'Cambiar estado de escuela',
  crear_libro: 'Crear libro',
  editar_libro: 'Editar metadatos de libro',
  cambiar_estado_libro: 'Cambiar estado de libro',
  crear_unidad: 'Crear unidad',
  editar_unidad: 'Editar unidad',
  eliminar_unidad: 'Eliminar unidad',
  reordenar_unidades: 'Reordenar unidades',
  desactivar_escuela: 'Desactivar escuela',
  desactivar_libro: 'Desactivar libro',
  asignar_libro_escuela: 'Asignar licencia de libro',
  remover_libro_escuela: 'Retirar licencia de libro',
  crear_tokens_libro: 'Generar tokens de libro',
  crear_tokens_docente: 'Generar tokens docentes',
  revocar_token: 'Revocar token',
}

export default function AdminAprobaciones() {
  const [items, setItems] = useState([])
  const [estado, setEstado] = useState('pendiente')
  const [seguridad, setSeguridad] = useState({ esSuper: false, esAal2: false })
  const [loading, setLoading] = useState(true)
  const [procesando, setProcesando] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => { cargar() }, [estado])

  async function cargar() {
    setLoading(true)
    setError('')
    try {
      const [acciones, nivel] = await Promise.all([
        getAccionesAdminPendientes({ estado }),
        getEstadoSuperadministrador(),
      ])
      setItems(acciones)
      setSeguridad(nivel)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function resolver(id, aprobar) {
    setProcesando(id)
    setError('')
    try {
      await resolverAccionAdmin(id, aprobar)
      await cargar()
    } catch (e) {
      setError(e.message)
    } finally {
      setProcesando(null)
    }
  }

  const puedeResolver = seguridad.esSuper && seguridad.esAal2

  return (
    <AdminLayout>
      <div style={{ padding: '32px 40px', maxWidth: 1100 }}>
        <div style={{ marginBottom: 22 }}>
          <h1 style={{ margin: 0, fontSize: 22, color: C.text }}>Aprobaciones sensibles</h1>
          <p style={{ margin: '5px 0 0', color: C.textLight, fontSize: 13 }}>
            La aprobación y la modificación se guardan juntas en una transacción auditada.
          </p>
        </div>

        {!puedeResolver && (
          <div style={{ padding: 14, marginBottom: 18, borderRadius: 10, background: '#FEF3C7', color: '#92400E', fontSize: 14 }}>
            {!seguridad.esSuper
              ? 'Puedes consultar solicitudes, pero solo el superadministrador puede resolverlas.'
              : <>Para resolver solicitudes necesitas una sesión MFA aal2. <Link to="/seguridad/mfa">Verificar MFA</Link>.</>}
          </div>
        )}

        {error && (
          <div role="alert" style={{ padding: 12, marginBottom: 16, borderRadius: 10, background: C.dangerLight, color: C.danger }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {['pendiente', 'aprobada', 'rechazada'].map(value => (
            <button
              key={value}
              onClick={() => setEstado(value)}
              style={value === estado ? btn(C.primary, 'sm') : btnOutline(C.primary, 'sm')}
            >
              {value[0].toUpperCase() + value.slice(1)}
            </button>
          ))}
        </div>

        <div style={{ ...S.card, overflow: 'auto' }}>
          <table style={{ width: '100%', minWidth: 850, borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Acción', 'Solicitante', 'Datos', 'Fecha', 'Estado', 'Decisión'].map(title => (
                  <th key={title} style={S.th}>{title}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} style={{ ...S.td, textAlign: 'center', padding: 30 }}>Cargando…</td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={6} style={{ ...S.td, textAlign: 'center', padding: 30, color: C.textLight }}>Sin solicitudes</td></tr>
              ) : items.map(item => (
                <tr key={item.id}>
                  <td style={{ ...S.td, fontWeight: 700 }}>{LABELS[item.tipo] || item.tipo}</td>
                  <td style={{ ...S.td, fontSize: 13 }}>{item.solicitante?.email || '—'}</td>
                  <td style={{ ...S.td, maxWidth: 300 }}>
                    <code style={{ fontSize: 11, overflowWrap: 'anywhere' }}>{JSON.stringify(item.payload)}</code>
                  </td>
                  <td style={{ ...S.td, whiteSpace: 'nowrap', fontSize: 12 }}>
                    {new Date(item.solicitado_en).toLocaleString('es-CO')}
                  </td>
                  <td style={S.td}><span style={badge(C.primary, C.primaryLight)}>{item.estado}</span></td>
                  <td style={S.td}>
                    {item.estado === 'pendiente' && (
                      <div style={{ display: 'flex', gap: 7 }}>
                        <button
                          disabled={!puedeResolver || procesando === item.id}
                          onClick={() => resolver(item.id, true)}
                          style={btn(C.success, 'sm')}
                        >
                          Aprobar
                        </button>
                        <button
                          disabled={!puedeResolver || procesando === item.id}
                          onClick={() => resolver(item.id, false)}
                          style={btnOutline(C.danger, 'sm')}
                        >
                          Rechazar
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AdminLayout>
  )
}
