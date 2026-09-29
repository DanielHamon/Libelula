import { useEffect, useRef } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import PanelAdmin from '../pages/admin/PanelAdmin'
import AdminEscuelas from '../pages/admin/AdminEscuelas'
import AdminEscuelaDetalle from '../pages/admin/AdminEscuelaDetalle'
import AdminLibros from '../pages/admin/AdminLibros'
import AdminLibroDetalle from '../pages/admin/AdminLibroDetalle'
import AdminTokens from '../pages/admin/AdminTokens'
import AdminUsuarios from '../pages/admin/AdminUsuarios'
import AdminAprobaciones from '../pages/admin/AdminAprobaciones'
import AdminLogs from '../pages/admin/AdminLogs'
import {
  getAdminSection,
  getAdminWorkspaceLocation,
  recordAdminWorkspaceLocation,
} from '../lib/adminNavigationMemory'
import { ADMIN_SECTION_ACTIVATED_EVENT } from '../hooks/useAdminSectionRefresh'

const SECTION_ROUTES = {
  dashboard: <Route index element={<PanelAdmin />} />,
  escuelas: (
    <>
      <Route path="escuelas" element={<AdminEscuelas />} />
      <Route path="escuelas/:id" element={<AdminEscuelaDetalle />} />
    </>
  ),
  libros: (
    <>
      <Route path="libros" element={<AdminLibros />} />
      <Route path="libros/:id" element={<AdminLibroDetalle />} />
    </>
  ),
  tokens: <Route path="tokens" element={<AdminTokens />} />,
  usuarios: <Route path="usuarios" element={<AdminUsuarios />} />,
  aprobaciones: <Route path="aprobaciones" element={<AdminAprobaciones />} />,
  logs: <Route path="logs" element={<AdminLogs />} />,
}

export default function AdminWorkspace() {
  const location = useLocation()
  const activeSection = getAdminSection(location.pathname)
  const previousSection = useRef(activeSection)
  const renderedSections = recordAdminWorkspaceLocation(location)

  useEffect(() => {
    if (previousSection.current !== activeSection) {
      window.dispatchEvent(new CustomEvent(ADMIN_SECTION_ACTIVATED_EVENT, {
        detail: { section: activeSection },
      }))
      previousSection.current = activeSection
    }
  }, [activeSection])

  return renderedSections.map(section => (
    <div
      key={section}
      style={{ display: section === activeSection ? 'block' : 'none' }}
      aria-hidden={section !== activeSection}
    >
      <Routes location={section === activeSection ? location : getAdminWorkspaceLocation(section)}>
        {SECTION_ROUTES[section]}
      </Routes>
    </div>
  ))
}
