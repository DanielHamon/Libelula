import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { cerrarSesion } from '../lib/session'
import { getRecentClasses, RECENT_CLASSES_EVENT } from '../lib/recentClasses'
import { useWindowWidth } from '../hooks/useWindowWidth'

const C = {
  primary: '#2563EB', primaryLight: '#DBEAFE', navy: '#1E3A8A',
  text: '#1F2937', textLight: '#6B7280', border: '#E5E7EB',
}

export default function DocenteSidebar() {
  const navigate = useNavigate()
  const location = useLocation()
  const isMobile = useWindowWidth() < 768
  const [open, setOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('docente_sidebar_collapsed') === 'true')
  const [user, setUser] = useState(null)
  const [recentClasses, setRecentClasses] = useState([])

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user: currentUser } }) => {
      setUser(currentUser)
      setRecentClasses(getRecentClasses(currentUser?.id))
    })
  }, [])

  useEffect(() => {
    if (!user?.id) return undefined
    const update = event => {
      if (!event.detail?.userId || event.detail.userId === user.id) {
        setRecentClasses(getRecentClasses(user.id))
      }
    }
    window.addEventListener(RECENT_CLASSES_EVENT, update)
    return () => window.removeEventListener(RECENT_CLASSES_EVENT, update)
  }, [user?.id])

  const go = path => {
    navigate(path)
    setOpen(false)
  }
  const name = user?.user_metadata?.nombre || 'Docente'
  const initials = name.split(' ').map(word => word[0]).join('').slice(0, 2).toUpperCase()
  const toggleCollapsed = () => setCollapsed(current => {
    const next = !current
    localStorage.setItem('docente_sidebar_collapsed', String(next))
    return next
  })

  const content = (
    <>
      <div style={{ height: 64, padding: collapsed && !isMobile ? '0 10px' : '0 12px', display: 'flex', alignItems: 'center', justifyContent: collapsed && !isMobile ? 'center' : 'flex-start', gap: 8, borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        {(!collapsed || isMobile) && <div style={{ width: 34, height: 34, borderRadius: 9, background: 'linear-gradient(135deg, #2563EB, #F97316)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17 }}>📚</div>}
        {(!collapsed || isMobile) && <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 900, color: C.text }}>Libelula</div>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.textLight }}>Panel Docente</div>
        </div>}
        {!isMobile && (
          <button
            onClick={toggleCollapsed}
            title={collapsed ? 'Expandir panel' : 'Colapsar panel'}
            style={{ width: 25, height: 25, flexShrink: 0, border: `1px solid ${C.border}`, borderRadius: 6, background: '#fff', color: C.textLight, cursor: 'pointer', padding: 0 }}
          >
            {collapsed ? '›' : '‹'}
          </button>
        )}
      </div>
      <nav style={{ flex: 1, overflowY: 'auto', padding: '12px 10px' }}>
        <NavButton compact={collapsed && !isMobile} active={location.pathname === '/panel-docente'} icon="🏠" label="Inicio" onClick={() => go('/panel-docente')} />
        <div style={{ marginTop: 22, paddingTop: 16, borderTop: `1px solid ${C.border}` }}>
          {(!collapsed || isMobile) && <div style={{ padding: '0 8px 8px', color: C.textLight, fontSize: 10, fontWeight: 800, letterSpacing: 0.8, textTransform: 'uppercase' }}>
            Últimas clases
          </div>}
          {recentClasses.length === 0 && (!collapsed || isMobile) ? (
            <div style={{ padding: '4px 8px', color: '#9CA3AF', fontSize: 11, lineHeight: 1.4 }}>
              Las clases que abras aparecerán aquí.
            </div>
          ) : recentClasses.map(clase => (
            <NavButton
              key={clase.id}
              active={location.pathname.includes(`/clase/${clase.id}`)}
              icon={clase.emoji || '🏫'}
              label={clase.nombre}
              compact={collapsed && !isMobile}
              onClick={() => go(`/panel-docente/clase/${clase.id}`)}
            />
          ))}
        </div>
      </nav>
      <div style={{ padding: collapsed && !isMobile ? '12px 0' : 14, borderTop: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: collapsed && !isMobile ? 'center' : 'flex-start', gap: 9 }}>
        <div title={collapsed && !isMobile ? name : undefined} style={{ width: 34, height: 34, borderRadius: '50%', background: C.primary, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, flexShrink: 0 }}>{initials}</div>
        {(!collapsed || isMobile) && <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
          <button onClick={async () => { await cerrarSesion(); navigate('/login') }} style={{ border: 'none', background: 'none', padding: 0, color: C.textLight, fontFamily: 'Nunito', fontSize: 11, cursor: 'pointer' }}>Cerrar sesión</button>
        </div>}
      </div>
    </>
  )

  if (isMobile) return (
    <>
      <div style={{ position: 'fixed', inset: '0 0 auto 0', height: 56, zIndex: 150, background: '#fff', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', padding: '0 16px', gap: 12 }}>
        <button onClick={() => setOpen(true)} style={{ border: 'none', background: 'none', fontSize: 22, cursor: 'pointer' }}>☰</button>
        <strong style={{ color: C.navy }}>Panel Docente</strong>
      </div>
      {open && (
        <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,.4)' }}>
          <aside onClick={event => event.stopPropagation()} style={{ width: 250, height: '100%', background: '#fff', display: 'flex', flexDirection: 'column', boxShadow: '4px 0 24px rgba(0,0,0,.16)' }}>{content}</aside>
        </div>
      )}
    </>
  )

  return <aside style={{ width: collapsed ? 64 : 220, height: '100vh', position: 'sticky', top: 0, flexShrink: 0, background: '#fff', borderRight: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', transition: 'width .22s ease', overflow: 'hidden' }}>{content}</aside>
}

function NavButton({ active, icon, label, onClick, compact = false }) {
  return (
    <button onClick={onClick} title={label} style={{
      width: '100%', border: 'none', borderRadius: 10, padding: '10px 9px',
      display: 'flex', alignItems: 'center', justifyContent: compact ? 'center' : 'flex-start', gap: compact ? 0 : 10, marginBottom: 3,
      background: active ? C.primaryLight : 'transparent',
      color: active ? C.primary : C.textLight, cursor: 'pointer',
      fontFamily: 'Nunito', fontSize: 13, fontWeight: active ? 800 : 600, textAlign: 'left',
    }}>
      <span style={{ fontSize: 17, flexShrink: 0 }}>{icon}</span>
      {!compact && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>}
    </button>
  )
}
