import { Link, useLocation, useNavigate } from 'react-router-dom'
import { cerrarSesion } from '../lib/session'
import { C } from '../lib/adminStyles'

const NAV = [
  { path: '/admin', label: 'Dashboard', icon: '📊', exact: true },
  { path: '/admin/escuelas', label: 'Escuelas', icon: '🏫' },
  { path: '/admin/libros', label: 'Libros', icon: '📚' },
  { path: '/admin/tokens', label: 'Tokens', icon: '🎟️' },
  { path: '/admin/usuarios', label: 'Usuarios', icon: '👥' },
  { path: '/admin/aprobaciones', label: 'Aprobaciones', icon: '✅' },
  { path: '/admin/logs', label: 'Logs', icon: '📋' },
  { path: '/seguridad/mfa', label: 'Seguridad MFA', icon: '🛡️' },
]

export default function AdminLayout({ children }) {
  const { pathname } = useLocation()
  const navigate = useNavigate()

  async function handleCerrarSesion() {
    await cerrarSesion()
    navigate('/login')
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: C.bg, fontFamily: 'Nunito, sans-serif' }}>
      <aside style={{
        width: 220, flexShrink: 0, background: C.white,
        borderRight: `1px solid ${C.border}`,
        display: 'flex', flexDirection: 'column',
        position: 'sticky', top: 0, height: '100vh', overflowY: 'auto',
      }}>
        <div style={{ padding: '20px 16px 14px', borderBottom: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: C.primary }}>Libelula</div>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.textLight, marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Administración
          </div>
        </div>

        <nav style={{ padding: '10px 10px', flex: 1 }}>
          {NAV.map(item => {
            const active = item.exact ? pathname === item.path : pathname.startsWith(item.path)
            return (
              <Link
                key={item.path}
                to={item.path}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '9px 12px', borderRadius: 9, marginBottom: 2,
                  textDecoration: 'none', fontWeight: 600, fontSize: 14,
                  background: active ? C.primaryLight : 'transparent',
                  color: active ? C.primary : C.text,
                  transition: 'background 0.15s',
                }}
              >
                <span style={{ fontSize: 17 }}>{item.icon}</span>
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div style={{ padding: '12px 10px', borderTop: `1px solid ${C.border}` }}>
          <button
            onClick={handleCerrarSesion}
            style={{
              width: '100%', padding: '9px 12px', borderRadius: 9,
              border: 'none', background: 'transparent', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 10,
              fontSize: 14, fontWeight: 600, color: C.danger,
              fontFamily: 'Nunito, sans-serif',
            }}
          >
            <span style={{ fontSize: 17 }}>🚪</span>
            Cerrar sesión
          </button>
        </div>
      </aside>

      <main style={{ flex: 1, overflowY: 'auto', minWidth: 0 }}>
        {children}
      </main>
    </div>
  )
}
