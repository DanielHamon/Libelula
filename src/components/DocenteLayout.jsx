import { Outlet } from 'react-router-dom'
import DocenteSidebar from './DocenteSidebar'
import { useWindowWidth } from '../hooks/useWindowWidth'

export default function DocenteLayout() {
  const isMobile = useWindowWidth() < 768
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#F8FAFC' }}>
      <DocenteSidebar />
      <main className="docente-responsive-main" style={{ flex: 1, minWidth: 0, paddingTop: isMobile ? 56 : 0, overflowX: 'hidden' }}>
        <Outlet />
      </main>
    </div>
  )
}
