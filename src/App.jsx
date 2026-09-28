import { lazy, Suspense } from 'react'
import RouteLoadBoundary from './components/RouteLoadBoundary'
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom'
import InactivityNotice from './components/InactivityNotice'
const Activar = lazy(() => import('./pages/Activar'))
const Login = lazy(() => import('./pages/Login'))
const Inicio = lazy(() => import('./pages/Inicio'))
const Libro = lazy(() => import('./pages/Libro'))
const Unidad = lazy(() => import('./pages/Unidad'))
const UnirseClase = lazy(() => import('./pages/UnirseClase'))
const PanelDocente = lazy(() => import('./pages/PanelDocente'))
const NuevaClase = lazy(() => import('./pages/NuevaClase'))
const ClaseDetalle = lazy(() => import('./pages/ClaseDetalle'))
const DocenteRespuestaEstudiante = lazy(() => import('./pages/DocenteRespuestaEstudiante'))
import RutaProtegida from './components/RutaProtegida'
import RutaProtegidaDocente from './components/RutaProtegidaDocente'
import RutaProtegidaAdmin from './components/RutaProtegidaAdmin'
import DocenteLayout from './components/DocenteLayout'
const PanelAdmin = lazy(() => import('./pages/admin/PanelAdmin'))
const AdminEscuelas = lazy(() => import('./pages/admin/AdminEscuelas'))
const AdminLibros = lazy(() => import('./pages/admin/AdminLibros'))
const AdminTokens = lazy(() => import('./pages/admin/AdminTokens'))
const AdminLogs = lazy(() => import('./pages/admin/AdminLogs'))
const AdminEscuelaDetalle = lazy(() => import('./pages/admin/AdminEscuelaDetalle'))
const AdminLibroDetalle = lazy(() => import('./pages/admin/AdminLibroDetalle'))
const AdminUsuarios = lazy(() => import('./pages/admin/AdminUsuarios'))
const AdminAprobaciones = lazy(() => import('./pages/admin/AdminAprobaciones'))
const SeguridadMFA = lazy(() => import('./pages/SeguridadMFA'))

function ActividadLegacyRedirect() {
  const { libroId, unidadId } = useParams()
  return <Navigate to={`/libro/${libroId}/unidad/${unidadId}`} replace />
}

function AppRoutes() {
  return (
    <>
      <InactivityNotice />
      <RouteLoadBoundary>
        <Suspense fallback={<div role="status" style={{ padding: 32, textAlign: 'center' }}>Cargando…</div>}>
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
        </Suspense>
      </RouteLoadBoundary>
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
