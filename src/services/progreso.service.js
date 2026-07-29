import { supabase } from '../lib/supabase'

export async function getProgreso(usuarioId) {
  const { data, error } = await supabase
    .from('actividad_progreso')
    .select('actividad_id')
    .eq('usuario_id', usuarioId)
  if (error) throw error
  return Object.fromEntries((data || []).map(r => [r.actividad_id, true]))
}

export async function getRespuestas(usuarioId, libroId) {
  let query = supabase
    .from('respuestas')
    .select('actividad_id, respuesta, es_correcta')
    .eq('usuario_id', usuarioId)

  if (libroId) query = query.eq('libro_id', libroId)

  const { data, error } = await query
  if (error) {
    console.warn('[Libelula] No se pudieron cargar las respuestas:', error.message)
    return {}
  }

  return Object.fromEntries((data || []).map(row => [row.actividad_id, {
    respuesta: row.respuesta,
    esCorrecta: row.es_correcta,
  }]))
}

export async function isActividadCompleta(usuarioId, actividadId) {
  const { data, error } = await supabase
    .from('actividad_progreso')
    .select('actividad_id')
    .eq('usuario_id', usuarioId)
    .eq('actividad_id', actividadId)
    .maybeSingle()
  if (error) throw error
  return !!data
}

export async function registrarProgreso(actividadId, respuesta) {
  const guardarRespuesta = respuesta !== undefined
  if (guardarRespuesta) validarPayloadRespuesta(respuesta.valor)
  const { data, error } = await supabase.rpc('registrar_progreso_actividad', {
    p_actividad_id: actividadId,
    p_respuesta: guardarRespuesta ? respuesta.valor : null,
    p_es_correcta: guardarRespuesta ? (respuesta.esCorrecta ?? null) : null,
    p_guardar_respuesta: guardarRespuesta,
  })
  if (error) throw error
  if (!data?.ok) throw new Error(data?.motivo || 'error_guardar_progreso')
  return {
    ...data,
    esCorrecta: data.es_correcta ?? null,
  }
}

export async function evaluarIntento(actividadId, respuesta) {
  validarPayloadRespuesta(respuesta)
  const { data, error } = await supabase.rpc('evaluar_intento_actividad', {
    p_actividad_id: actividadId,
    p_respuesta: respuesta,
  })
  if (error) throw error
  if (!data?.ok) throw new Error(data?.motivo || 'error_evaluar_intento')
  return {
    ...data,
    esCorrecta: data.es_correcta,
    maxIntentos: data.max_intentos,
    yaCompletada: data.ya_completada,
  }
}

function validarPayloadRespuesta(valor) {
  if (valor === null || typeof valor !== 'object') {
    throw new Error('formato_respuesta_invalido')
  }

  const serializada = JSON.stringify(valor)
  const bytes = new TextEncoder().encode(serializada).byteLength
  if (bytes > 65536) throw new Error('respuesta_demasiado_grande')
  if (/"data:[^"]*;base64,/i.test(serializada)) {
    throw new Error('respuesta_base64_no_permitida')
  }
}

export async function marcarCompleta(_usuarioId, _libroId, actividadId) {
  return registrarProgreso(actividadId)
}

export async function guardarRespuesta(_usuarioId, actividadId, _libroId, _unidadId, respuesta, esCorrecta) {
  return registrarProgreso(actividadId, { valor: respuesta, esCorrecta })
}
