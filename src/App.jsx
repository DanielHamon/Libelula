import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom'
import InactivityNotice from './components/InactivityNotice'
import RouteLoadBoundary from './components/RouteLoadBoundary'
import RutaProtegida from './components/RutaProtegida'
import RutaProtegidaDocente from './components/RutaProtegidaDocente'
import RutaProtegidaAdmin from './components/RutaProtegidaAdmin'
import DocenteLayout from './components/DocenteLayout'

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
const AdminWorkspace = lazy(() => import('./components/AdminWorkspace'))
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

            <Route path="/admin/*" element={<RutaProtegidaAdmin><AdminWorkspace /></RutaProtegidaAdmin>} />

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
