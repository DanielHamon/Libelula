import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export function useUser() {
  const [user, setUser] = useState(undefined) // undefined = cargando, null = no autenticado

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUser(user ?? null))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  return user
}
