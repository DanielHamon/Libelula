import { useEffect, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function RutaProtegida({ children }) {
  const [estado, setEstado] = useState('cargando')
  const [rol, setRol] = useState(null)
  const location = useLocation()

  useEffect(() => {
    async function check() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setEstado('sinSesion'); return }
      const { data } = await supabase.from('profiles').select('rol').eq('id', session.user.id).single()
      const r = data?.rol || 'estudiante'
      setRol(r)
      setEstado(r === 'estudiante' ? 'ok' : 'rolIncorrecto')
    }
    check()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      if (!session) setEstado('sinSesion')
    })
    return () => subscription.unsubscribe()
  }, [])

  if (estado === 'cargando') return <Spinner />

  if (estado === 'sinSesion') {
    const redirect = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/login?redirect=${redirect}`} replace />
  }

  if (estado === 'rolIncorrecto') {
    if (rol === 'docente') return <Navigate to="/panel-docente" replace />
    if (rol === 'admin') return <Navigate to="/admin" replace />
    return <Navigate to="/login" replace />
  }

  return children
}

function Spinner() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F1F5F9' }}>
      <div style={{ width: 40, height: 40, border: '4px solid #1e3a8a', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
