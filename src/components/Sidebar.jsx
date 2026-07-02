import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { cerrarSesion } from '../lib/session'
import { useWindowWidth } from '../hooks/useWindowWidth'

const links = [
  { path: '/inicio', icon: '🏠', label: 'Inicio' },
  { path: '/activar', icon: '📱', label: 'Activar libro' },
]

const C = { primary: '#2563EB', primaryLight: '#DBEAFE', text: '#1F2937', textLight: '#6B7280', border: '#E5E7EB' }

const COLLAPSED_W = 56

export default function Sidebar() {
  const navigate = useNavigate()
  const location = useLocation()
  const width = useWindowWidth()
  const isMobile = width < 768
  const [open, setOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('sidebar_collapsed') === 'true')
  const [nombreUsuario, setNombreUsuario] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setNombreUsuario(user?.user_metadata?.nombre || '')
    })
  }, [])

  function toggleCollapsed() {
    setCollapsed(c => {
      const next = !c
      localStorage.setItem('sidebar_collapsed', String(next))
      return next
    })
  }

  const initials = (nombreUsuario || 'U').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()

  async function handleLogout() {
    await cerrarSesion()
    navigate('/login')
  }

  // ── Mobile ──────────────────────────────────────────────────────────────────
  if (isMobile) {
    const navLinks = links.map(l => {
      const active = location.pathname === l.path || (l.path !== '/inicio' && location.pathname.startsWith(l.path))
      return (
        <button key={l.path} onClick={() => { navigate(l.path); setOpen(false) }} style={{
          display: 'flex', alignItems: 'center', gap: 10, width: '100%',
          padding: '10px 12px', border: 'none', borderRadius: 10, marginBottom: 2,
          background: active ? C.primaryLight : 'transparent',
          color: active ? C.primary : C.textLight,
          fontSize: 14, fontWeight: active ? 700 : 500,
          cursor: 'pointer', fontFamily: 'Nunito', textAlign: 'left', transition: 'all 0.15s',
        }}>
          <span style={{ fontSize: 18 }}>{l.icon}</span>{l.label}
        </button>
      )
    })

    return (
      <>
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
          background: '#fff', borderBottom: `1px solid ${C.border}`,
          display: 'flex', alignItems: 'center', padding: '10px 16px', gap: 12, height: 56,
        }}>
          <button onClick={() => setOpen(true)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', padding: 4, color: C.text }}>☰</button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: 'linear-gradient(135deg, #2563EB, #F97316)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>📖</div>
            <span style={{ fontSize: 16, fontWeight: 800, color: C.text }}>Libelula</span>
          </div>
        </div>
        <div style={{ height: 56, flexShrink: 0 }} />
        {open && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.4)' }} onClick={() => setOpen(false)}>
            <div style={{ width: 260, height: '100%', background: '#fff', display: 'flex', flexDirection: 'column', boxShadow: '4px 0 24px rgba(0,0,0,0.15)' }} onClick={e => e.stopPropagation()}>
              <div style={{ padding: '20px 20px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg, #2563EB, #F97316)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>📖</div>
                <span style={{ fontSize: 18, fontWeight: 800, color: C.text }}>Libelula</span>
              </div>
              <nav style={{ flex: 1, padding: '8px 12px' }}>{navLinks}</nav>
              <div style={{ padding: 16, borderTop: `1px solid ${C.border}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 34, height: 34, borderRadius: '50%', background: C.primary, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>{initials}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nombreUsuario || 'Estudiante'}</div>
                    <button onClick={handleLogout} style={{ fontSize: 11, color: C.textLight, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'Nunito' }}>Cerrar sesión</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </>
    )
  }

  // ── Desktop ─────────────────────────────────────────────────────────────────
  return (
    <div style={{
      width: collapsed ? COLLAPSED_W : 220,
      background: '#fff',
      borderRight: `1px solid ${C.border}`,
      display: 'flex', flexDirection: 'column',
      flexShrink: 0,
      height: '100vh',
      position: 'sticky', top: 0,
      transition: 'width 0.22s ease',
      overflow: 'hidden',
    }}>

      {/* Logo + toggle */}
      <div style={{
        height: 64, padding: '0 12px',
        display: 'flex', alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'flex-start',
        gap: 8, flexShrink: 0,
        borderBottom: `1px solid ${C.border}`,
      }}>
        {!collapsed && (
          <>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg, #2563EB, #F97316)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>📖</div>
            <span style={{ fontSize: 16, fontWeight: 800, color: C.text, flex: 1, whiteSpace: 'nowrap', fontFamily: 'Nunito' }}>Libelula</span>
          </>
        )}
        <button
          onClick={toggleCollapsed}
          title={collapsed ? 'Expandir panel' : 'Colapsar panel'}
          style={{
            background: 'none', border: `1px solid ${C.border}`, borderRadius: 6,
            width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: C.textLight, fontSize: 13,
            flexShrink: 0, padding: 0,
            marginLeft: collapsed ? 0 : 'auto',
            transition: 'background 0.15s',
          }}
          onMouseEnter={e => e.currentTarget.style.background = '#F3F4F6'}
          onMouseLeave={e => e.currentTarget.style.background = 'none'}
        >
          {collapsed ? '›' : '‹'}
        </button>
      </div>

      {/* Nav links */}
      <nav style={{ flex: 1, padding: '8px 8px', overflowY: 'auto' }}>
        {links.map(l => {
          const active = location.pathname === l.path || (l.path !== '/inicio' && location.pathname.startsWith(l.path))
          return (
            <button
              key={l.path}
              onClick={() => navigate(l.path)}
              title={collapsed ? l.label : undefined}
              style={{
                display: 'flex', alignItems: 'center',
                gap: collapsed ? 0 : 10,
                width: '100%',
                padding: collapsed ? '10px 0' : '10px 8px',
                justifyContent: collapsed ? 'center' : 'flex-start',
                border: 'none', borderRadius: 10, marginBottom: 2,
                background: active ? C.primaryLight : 'transparent',
                color: active ? C.primary : C.textLight,
                fontSize: 14, fontWeight: active ? 700 : 500,
                cursor: 'pointer', fontFamily: 'Nunito',
                transition: 'all 0.15s', whiteSpace: 'nowrap',
              }}
            >
              <span style={{ fontSize: 18, flexShrink: 0 }}>{l.icon}</span>
              {!collapsed && <span>{l.label}</span>}
            </button>
          )
        })}
      </nav>

      {/* User block */}
      <div style={{
        padding: collapsed ? '12px 0' : 16,
        borderTop: `1px solid ${C.border}`,
        display: 'flex', alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'flex-start',
        gap: 10,
      }}>
        <div style={{
          width: 34, height: 34, borderRadius: '50%', background: C.primary,
          color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 13, fontWeight: 700, flexShrink: 0,
        }}
          title={collapsed ? (nombreUsuario || 'Estudiante') : undefined}
        >
          {initials}
        </div>
        {!collapsed && (
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {nombreUsuario || 'Estudiante'}
            </div>
            <button onClick={handleLogout} style={{ fontSize: 11, color: C.textLight, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'Nunito' }}>
              Cerrar sesión
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
