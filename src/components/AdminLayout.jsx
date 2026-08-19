import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { cerrarSesion } from '../lib/session'
import { C } from '../lib/adminStyles'
import { useWindowWidth } from '../hooks/useWindowWidth'
import { getEstadoSuperadministrador } from '../services/admin.service'

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
  const width = useWindowWidth()
  const isMobile = width < 768
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [isSuperadmin, setIsSuperadmin] = useState(false)
  const [collapsed, setCollapsed] = useState(() => {
    const saved = localStorage.getItem('admin_sidebar_collapsed')
    return saved === null ? window.innerWidth < 1024 : saved === 'true'
  })
  const drawerRef = useRef(null)
  const menuButtonRef = useRef(null)

  const currentSection = NAV.find(item => item.exact ? pathname === item.path : pathname.startsWith(item.path))

  useEffect(() => {
    getEstadoSuperadministrador()
      .then(({ esSuper }) => setIsSuperadmin(esSuper))
      .catch(() => setIsSuperadmin(false))
  }, [])

  useEffect(() => {
    if (!isMobile || !drawerOpen) return undefined
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    drawerRef.current?.querySelector('a, button')?.focus()

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setDrawerOpen(false)
        menuButtonRef.current?.focus()
        return
      }
      if (event.key === 'Tab') {
        const focusable = [...drawerRef.current.querySelectorAll('a[href], button:not([disabled])')]
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last?.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first?.focus()
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [drawerOpen, isMobile])

  function toggleCollapsed() {
    setCollapsed(value => {
      const next = !value
      localStorage.setItem('admin_sidebar_collapsed', String(next))
      return next
    })
  }

  function closeDrawer() {
    if (isMobile) setDrawerOpen(false)
  }

  function closeDrawerAndRestoreFocus() {
    setDrawerOpen(false)
    menuButtonRef.current?.focus()
  }

  async function handleCerrarSesion() {
    await cerrarSesion()
    navigate('/login')
  }

  return (
    <div className="admin-shell" style={{ display: 'flex', minHeight: '100vh', background: C.bg, fontFamily: 'Nunito, sans-serif' }}>
      {isMobile && (
        <header className="admin-mobile-header">
          <button
            ref={menuButtonRef}
            type="button"
            className="admin-menu-button"
            aria-label="Abrir menú de administración"
            aria-expanded={drawerOpen}
            aria-controls="admin-navigation"
            onClick={() => setDrawerOpen(true)}
          >
            <span aria-hidden="true">☰</span>
          </button>
          <div className="admin-mobile-brand">
            <span>Libelula</span>
            <strong>{currentSection?.label || 'Administración'}</strong>
          </div>
        </header>
      )}

      {isMobile && drawerOpen && (
        <button
          type="button"
          className="admin-drawer-backdrop"
          aria-label="Cerrar menú de administración"
          onClick={closeDrawerAndRestoreFocus}
        />
      )}

      <aside ref={drawerRef} id="admin-navigation" className={`admin-sidebar${isMobile ? ' admin-sidebar-mobile' : ''}${drawerOpen ? ' is-open' : ''}`} style={{
        width: isMobile ? 260 : collapsed ? 72 : 220, flexShrink: 0, background: C.white,
        borderRight: `1px solid ${C.border}`,
        display: 'flex', flexDirection: 'column',
        position: isMobile ? 'fixed' : 'sticky', top: 0, height: '100dvh', overflowY: 'auto',
      }}>
        <div className="admin-sidebar-brand" style={{ padding: collapsed && !isMobile ? '16px 10px 12px' : '20px 16px 14px', borderBottom: `1px solid ${C.border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: collapsed && !isMobile ? 'center' : 'space-between', gap: 8 }}>
            <div aria-label="Libelula" style={{ fontSize: collapsed && !isMobile ? 22 : 18, fontWeight: 800, color: C.primary }}>{collapsed && !isMobile ? 'L' : 'Libelula'}</div>
            {isMobile && <button type="button" className="admin-close-button" aria-label="Cerrar menú" onClick={closeDrawerAndRestoreFocus}>×</button>}
          </div>
          {(!collapsed || isMobile) && <div style={{ fontSize: 11, fontWeight: 700, color: isSuperadmin ? C.purple : C.textLight, marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {isSuperadmin ? 'Superadministración' : 'Administración'}
          </div>}
        </div>

        <nav aria-label="Navegación administrativa" style={{ padding: '10px', flex: 1 }}>
          {NAV.map(item => {
            const active = item.exact ? pathname === item.path : pathname.startsWith(item.path)
            return (
              <Link
                key={item.path}
                to={item.path}
                title={collapsed && !isMobile ? item.label : undefined}
                aria-label={collapsed && !isMobile ? item.label : undefined}
                onClick={closeDrawer}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: collapsed && !isMobile ? 'center' : 'flex-start', gap: 10,
                  padding: '9px 12px', borderRadius: 9, marginBottom: 2,
                  textDecoration: 'none', fontWeight: 600, fontSize: 14,
                  background: active ? C.primaryLight : 'transparent',
                  color: active ? C.primary : C.text,
                  transition: 'background 0.15s',
                }}
              >
                <span aria-hidden="true" style={{ fontSize: 17, flexShrink: 0 }}>{item.icon}</span>
                {(!collapsed || isMobile) && item.label}
              </Link>
            )
          })}
        </nav>

        <div style={{ padding: '10px', borderTop: `1px solid ${C.border}` }}>
          {!isMobile && <button
            type="button"
            onClick={toggleCollapsed}
            title={collapsed ? 'Expandir menú' : 'Colapsar menú'}
            aria-label={collapsed ? 'Expandir menú' : 'Colapsar menú'}
            aria-expanded={!collapsed}
            style={{
              width: '100%', padding: '9px 12px', marginBottom: 2, borderRadius: 9,
              border: 'none', background: 'transparent', cursor: 'pointer',
              display: 'flex', justifyContent: collapsed ? 'center' : 'flex-start', alignItems: 'center', gap: 10,
              fontSize: 14, fontWeight: 600, color: C.textLight, fontFamily: 'Nunito, sans-serif',
            }}
          >
            <span aria-hidden="true">{collapsed ? '»' : '«'}</span>
            {!collapsed && 'Colapsar menú'}
          </button>}
          <button
            onClick={handleCerrarSesion}
            title={collapsed && !isMobile ? 'Cerrar sesión' : undefined}
            aria-label={collapsed && !isMobile ? 'Cerrar sesión' : undefined}
            style={{
              width: '100%', padding: '9px 12px', borderRadius: 9,
              border: 'none', background: 'transparent', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: collapsed && !isMobile ? 'center' : 'flex-start', gap: 10,
              fontSize: 14, fontWeight: 600, color: C.danger,
              fontFamily: 'Nunito, sans-serif',
            }}
          >
            <span aria-hidden="true" style={{ fontSize: 17 }}>🚪</span>
            {(!collapsed || isMobile) && 'Cerrar sesión'}
          </button>
        </div>
      </aside>

      <main className="admin-main" style={{ flex: 1, overflowY: 'auto', minWidth: 0 }}>
        {children}
      </main>
    </div>
  )
}
