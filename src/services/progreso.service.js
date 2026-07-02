import { supabase } from '../lib/supabase'

export async function getProgreso(usuarioId) {
  const { data } = await supabase
    .from('actividad_progreso')
    .select('actividad_id')
    .eq('usuario_id', usuarioId)
  return Object.fromEntries((data || []).map(r => [r.actividad_id, true]))
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
