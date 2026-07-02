import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { cerrarSesion } from '../lib/session'

const TIMEOUT_MS     = 30 * 60 * 1000  // 30 min total
const WARNING_MS     =  5 * 60 * 1000  // aviso 5 min antes
const STORAGE_KEY    = 'iabooks_last_activity'

export function useInactivityTimeout() {
  const [mostrarAviso, setMostrarAviso]         = useState(false)
  const [segundosRestantes, setSegundosRestantes] = useState(300)
  const timers   = useRef({ warning: null, logout: null, countdown: null })
  const resetRef = useRef(null)

  useEffect(() => {
    async function cerrarSesionAuto() {
      setMostrarAviso(false)
      clearInterval(timers.current.countdown)
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      await cerrarSesion({ hard: true })
    }

    function reset() {
      localStorage.setItem(STORAGE_KEY, Date.now().toString())
      setMostrarAviso(false)
      clearTimeout(timers.current.warning)
      clearTimeout(timers.current.logout)
      clearInterval(timers.current.countdown)
      setSegundosRestantes(Math.floor(WARNING_MS / 1000))

      timers.current.warning = setTimeout(() => {
        setMostrarAviso(true)
        let secs = Math.floor(WARNING_MS / 1000)
        setSegundosRestantes(secs)
        timers.current.countdown = setInterval(() => {
          setSegundosRestantes(s => {
            if (s <= 1) { clearInterval(timers.current.countdown); return 0 }
            return s - 1
          })
        }, 1000)
      }, TIMEOUT_MS - WARNING_MS)

      timers.current.logout = setTimeout(cerrarSesionAuto, TIMEOUT_MS)
    }

    resetRef.current = reset

    // Si el usuario vuelve a la app después de más de 30 min inactivo, cerrar sesión
    const last = parseInt(localStorage.getItem(STORAGE_KEY) || '0')
    if (last && Date.now() - last > TIMEOUT_MS) {
      cerrarSesionAuto()
      return
    }

    const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart']
    events.forEach(ev => window.addEventListener(ev, reset, { passive: true }))
    reset()

    return () => {
      events.forEach(ev => window.removeEventListener(ev, reset))
      clearTimeout(timers.current.warning)
      clearTimeout(timers.current.logout)
      clearInterval(timers.current.countdown)
    }
  }, [])

  function extenderSesion() {
    if (resetRef.current) resetRef.current()
  }

  async function cerrarSesionManual() {
    clearTimeout(timers.current.warning)
    clearTimeout(timers.current.logout)
    clearInterval(timers.current.countdown)
    setMostrarAviso(false)
    await cerrarSesion({ hard: true })
  }

  return { mostrarAviso, segundosRestantes, extenderSesion, cerrarSesionManual }
}
