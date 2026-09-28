import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { cerrarSesion } from '../lib/session'
import { createInactivityTimer } from '../lib/inactivityTimer'

const INITIAL_STATE = { mostrarAviso: false, segundosRestantes: 300 }

export function useInactivityTimeout() {
  const [state, setState] = useState(INITIAL_STATE)
  const controller = useRef(null)

  useEffect(() => {
    let disposed = false
    let userId = null
    let generation = 0

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      if (disposed || (session?.user?.id ?? null) === userId) return
      userId = session?.user?.id ?? null
      const current = ++generation
      controller.current?.stop()
      controller.current = null
      setState(INITIAL_STATE)
      if (!userId) return
      controller.current = createInactivityTimer({
        onChange: setState,
        onExpire: () => {
          // No llamar Auth dentro de su callback de notificación.
          Promise.resolve().then(async () => {
            if (disposed || current !== generation) return
            await cerrarSesion({ hard: true })
          }).catch(() => {
            if (!disposed && current === generation) window.location.replace('/login')
          })
        },
      })
    })

    return () => {
      disposed = true
      subscription.unsubscribe()
      controller.current?.stop({ flush: true })
      controller.current = null
    }
  }, [])

  function extenderSesion() {
    controller.current?.extend()
  }

  async function cerrarSesionManual() {
    controller.current?.stop()
    setState(INITIAL_STATE)
    await cerrarSesion({ hard: true })
  }

  return { ...state, extenderSesion, cerrarSesionManual }
}
