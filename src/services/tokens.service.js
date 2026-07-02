import { supabase } from '../lib/supabase'

export async function verificarToken(token) {
  const { data, error } = await supabase.rpc('verificar_token', { p_token: token })
  if (error) return { valido: false, motivo: 'error_servidor' }
  return data
}

export async function activarTokenLibro(token, usuarioId) {
  const { data, error } = await supabase.rpc('activar_token', {
    p_token: token,
    p_usuario_id: usuarioId,
  })
  if (error) return { ok: false, motivo: 'error_servidor' }
  return data
}

export async function activarTokenDocente(token, usuarioId, email) {
  const { data, error } = await supabase.rpc('activar_token_docente', {
    p_token: token,
    p_usuario_id: usuarioId,
    p_email: email,
  })
  if (error) return { ok: false, motivo: 'error_servidor' }
  return data
}
