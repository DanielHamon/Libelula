import { registrarError } from '../lib/diagnostics'
import { supabase } from '../lib/supabase'

export async function prevalidarToken(token, captchaToken) {
  const { data, error } = await supabase.functions.invoke('prevalidar-token', {
    body: { token, captchaToken },
  })
  if (error) {
    registrarError("prevalidar-token falló:", error, 'warn')
    return { valido: false, motivo: 'error_servidor' }
  }
  return data
}

export async function verificarToken(token) {
  const { data, error } = await supabase.rpc('verificar_token', { p_token: token })
  if (error) {
    registrarError("verificar_token falló:", error, 'warn')
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
