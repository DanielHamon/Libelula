import { supabase } from './supabase'

const STORAGE_PREFIXES = ['colorear_', 'carta_', 'mapa_', 'iabooks_spread_']
const STORAGE_EXACT    = ['iabooks_last_activity']

function limpiarStorage() {
  Object.keys(localStorage)
    .filter(k => STORAGE_PREFIXES.some(p => k.startsWith(p)))
    .forEach(k => localStorage.removeItem(k))
  STORAGE_EXACT.forEach(k => localStorage.removeItem(k))
}

export async function cerrarSesion({ hard = false } = {}) {
  limpiarStorage()
  await supabase.auth.signOut()
  if (hard) window.location.replace('/login')
}
