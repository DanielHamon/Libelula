import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom'
import { useInactivityTimeout } from './hooks/useInactivityTimeout'
import Activar from './pages/Activar'
import Login from './pages/Login'
import Inicio from './pages/Inicio'
import Libro from './pages/Libro'
import Unidad from './pages/Unidad'
import UnirseClase from './pages/UnirseClase'
import PanelDocente from './pages/PanelDocente'
import NuevaClase from './pages/NuevaClase'
import ClaseDetalle from './pages/ClaseDetalle'
import DocenteRespuestaEstudiante from './pages/DocenteRespuestaEstudiante'
import RutaProtegida from './components/RutaProtegida'
import RutaProtegidaDocente from './components/RutaProtegidaDocente'
import RutaProtegidaAdmin from './components/RutaProtegidaAdmin'
import DocenteLayout from './components/DocenteLayout'
import PanelAdmin from './pages/admin/PanelAdmin'
import AdminEscuelas from './pages/admin/AdminEscuelas'
import AdminLibros from './pages/admin/AdminLibros'
import AdminTokens from './pages/admin/AdminTokens'
import AdminLogs from './pages/admin/AdminLogs'
import AdminEscuelaDetalle from './pages/admin/AdminEscuelaDetalle'
import AdminLibroDetalle from './pages/admin/AdminLibroDetalle'
import AdminUsuarios from './pages/admin/AdminUsuarios'
import AdminAprobaciones from './pages/admin/AdminAprobaciones'
import SeguridadMFA from './pages/SeguridadMFA'

function ActividadLegacyRedirect() {
  const { libroId, unidadId } = useParams()
  return <Navigate to={`/libro/${libroId}/unidad/${unidadId}`} replace />
}

function AppRoutes() {
  const { mostrarAviso, segundosRestantes, extenderSesion, cerrarSesionManual } = useInactivityTimeout()

  const mins = Math.floor(segundosRestantes / 60)
  const secs = String(segundosRestantes % 60).padStart(2, '0')

  return (
    <>
      {mostrarAviso && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.55)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 20, fontFamily: 'Nunito',
        }}>
          <div style={{
            background: '#fff', borderRadius: 20, padding: '36px 32px',
            maxWidth: 380, width: '100%',
            boxShadow: '0 24px 64px rgba(0,0,0,0.25)',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>⏳</div>
            <h3 style={{ fontSize: 20, fontWeight: 800, color: '#1F2937', margin: '0 0 8px' }}>
              Sesión por expirar
            </h3>
            <p style={{ fontSize: 14, color: '#6B7280', margin: '0 0 20px', lineHeight: 1.5 }}>
              Tu sesión cerrará automáticamente por inactividad.
            </p>
            <div style={{
              fontSize: 40, fontWeight: 900, color: segundosRestantes <= 60 ? '#EF4444' : '#F59E0B',
              marginBottom: 24, letterSpacing: 2, fontVariantNumeric: 'tabular-nums',
            }}>
              {mins}:{secs}
            </div>
            <button
              onClick={extenderSesion}
              style={{
                width: '100%', padding: '13px 0', fontSize: 15, fontWeight: 700,
                background: '#2563EB', color: '#fff', border: 'none',
                borderRadius: 12, cursor: 'pointer', fontFamily: 'Nunito', marginBottom: 10,
              }}
            >
              Continuar sesión
            </button>
            <button
              onClick={cerrarSesionManual}
              style={{
                width: '100%', padding: '11px 0', fontSize: 14, fontWeight: 700,
                background: 'transparent', color: '#6B7280',
                border: '1px solid #E5E7EB', borderRadius: 12,
                cursor: 'pointer', fontFamily: 'Nunito',
              }}
            >
              Cerrar sesión ahora
            </button>
          </div>
        </div>
      )}
      <Routes>
        <Route path="/activar" element={<Activar />} />
        <Route path="/login" element={<Login />} />
        <Route path="/seguridad/mfa" element={<SeguridadMFA />} />
        <Route path="/inicio" element={<RutaProtegida><Inicio /></RutaProtegida>} />
        <Route path="/libro/:libroId" element={<RutaProtegida><Libro /></RutaProtegida>} />
        <Route path="/libro/:libroId/unidad/:unidadId" element={<RutaProtegida><Unidad /></RutaProtegida>} />
        <Route path="/libro/:libroId/unidad/:unidadId/actividad/:actividadId" element={<RutaProtegida><ActividadLegacyRedirect /></RutaProtegida>} />
        <Route path="/unirse-clase" element={<RutaProtegida><UnirseClase /></RutaProtegida>} />
        <Route element={<RutaProtegidaDocente><DocenteLayout /></RutaProtegidaDocente>}>
          <Route path="/panel-docente" element={<PanelDocente />} />
          <Route path="/panel-docente/clase/nueva" element={<NuevaClase />} />
          <Route path="/panel-docente/clase/:claseId" element={<ClaseDetalle />} />
          <Route path="/panel-docente/clase/:claseId/estudiante/:estudianteId" element={<DocenteRespuestaEstudiante />} />
        </Route>

        <Route path="/admin" element={<RutaProtegidaAdmin><PanelAdmin /></RutaProtegidaAdmin>} />
        <Route path="/admin/escuelas" element={<RutaProtegidaAdmin><AdminEscuelas /></RutaProtegidaAdmin>} />
        <Route path="/admin/escuelas/:id" element={<RutaProtegidaAdmin><AdminEscuelaDetalle /></RutaProtegidaAdmin>} />
        <Route path="/admin/libros" element={<RutaProtegidaAdmin><AdminLibros /></RutaProtegidaAdmin>} />
        <Route path="/admin/libros/:id" element={<RutaProtegidaAdmin><AdminLibroDetalle /></RutaProtegidaAdmin>} />
        <Route path="/admin/tokens" element={<RutaProtegidaAdmin><AdminTokens /></RutaProtegidaAdmin>} />
        <Route path="/admin/usuarios" element={<RutaProtegidaAdmin><AdminUsuarios /></RutaProtegidaAdmin>} />
        <Route path="/admin/aprobaciones" element={<RutaProtegidaAdmin><AdminAprobaciones /></RutaProtegidaAdmin>} />
        <Route path="/admin/logs" element={<RutaProtegidaAdmin><AdminLogs /></RutaProtegidaAdmin>} />

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  )
}
