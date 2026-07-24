import { supabase } from '../lib/supabase'

export async function getProgreso(usuarioId) {
  const { data } = await supabase
    .from('actividad_progreso')
    .select('actividad_id')
    .eq('usuario_id', usuarioId)
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
  const { data } = await supabase
    .from('actividad_progreso')
    .select('actividad_id')
    .eq('usuario_id', usuarioId)
    .eq('actividad_id', actividadId)
    .single()
  return !!data
}

export async function marcarCompleta(usuarioId, libroId, actividadId) {
  await supabase
    .from('actividad_progreso')
    .upsert({ usuario_id: usuarioId, actividad_id: actividadId })

  await supabase
    .from('progreso')
    .upsert(
      { usuario_id: usuarioId, libro_id: libroId, ultima_actividad: new Date().toISOString() },
      { onConflict: 'usuario_id,libro_id' }
    )
}

export async function guardarRespuesta(usuarioId, actividadId, libroId, unidadId, respuesta, esCorrecta) {
  const { error } = await supabase
    .from('respuestas')
    .upsert({
      usuario_id: usuarioId,
      actividad_id: actividadId,
      libro_id: libroId,
      unidad_id: unidadId,
      respuesta,
      es_correcta: esCorrecta,
    }, { onConflict: 'usuario_id,actividad_id' })
  if (error) throw error
}
