import { supabase } from '../lib/supabase'

export async function prevalidarToken(token) {
  let deviceId = ''
  try {
    deviceId = localStorage.getItem('libelula_device_id') || crypto.randomUUID()
    localStorage.setItem('libelula_device_id', deviceId)
  } catch {
    // La Edge Function conserva el límite por red aunque no haya storage local.
  }
  const { data, error } = await supabase.functions.invoke('prevalidar-token', {
    body: { token },
    headers: deviceId ? { 'x-device-id': deviceId } : undefined,
  })
  if (error) {
    console.warn('[Libelula] prevalidar-token falló:', error.message)
    return { valido: false, motivo: 'error_servidor' }
  }
  return data
}

export async function verificarToken(token) {
  const { data, error } = await supabase.rpc('verificar_token', { p_token: token })
  if (error) {
    console.warn('[Libelula] verificar_token falló:', error.code, error.message)
    return { valido: false, motivo: 'error_servidor' }
  }
  return data
}

export async function activarTokenLibro(token) {
  const { data, error } = await supabase.rpc('activar_token', {
    p_token: token,
  })
  if (error) return { ok: false, motivo: 'error_servidor' }
  return data
}

export async function activarTokenDocente(token) {
  const { data, error } = await supabase.rpc('activar_token_docente', {
    p_token: token,
  })
  if (error) return { ok: false, motivo: 'error_servidor' }
  return data
}
