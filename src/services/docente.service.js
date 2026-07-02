import { supabase } from '../lib/supabase'

export async function getProgresoConRespuestas(estudianteId, libroId, unidadId = null) {
  let q = supabase
    .from('unidades')
    .select('id, titulo, orden, actividades(*)')
    .eq('libro_id', libroId)
    .order('orden')
  if (unidadId) q = q.eq('id', unidadId)

  const { data: unidades, error } = await q
  if (error) throw error

  const allActIds = (unidades || []).flatMap(u => (u.actividades || []).map(a => a.id))
  if (allActIds.length === 0) return unidades || []

  const [respRes, progRes] = await Promise.all([
    supabase.from('respuestas')
      .select('actividad_id, respuesta, es_correcta, created_at')
      .eq('usuario_id', estudianteId)
      .in('actividad_id', allActIds),
    supabase.from('actividad_progreso')
      .select('actividad_id, completada_en')
      .eq('usuario_id', estudianteId)
      .in('actividad_id', allActIds),
  ])

  const rMap = Object.fromEntries((respRes.data || []).map(r => [r.actividad_id, r]))
  const pMap = Object.fromEntries((progRes.data || []).map(p => [p.actividad_id, p]))

  return (unidades || []).map(u => ({
    ...u,
    actividades: (u.actividades || [])
      .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
      .map(act => ({
        ...act,
        ...(act.campos || {}),
        completada: !!pMap[act.id],
        completada_en: pMap[act.id]?.completada_en || null,
        respuesta: rMap[act.id]?.respuesta || null,
        es_correcta: rMap[act.id]?.es_correcta ?? null,
      })),
  }))
}

export async function getProgresoClaseCompleta(claseId, libroId, unidadId = null) {
  const { data: inscripciones, error: ie } = await supabase
    .from('inscripciones')
    .select('estudiante_id, profiles(nombre, email)')
    .eq('clase_id', claseId)
  if (ie) throw ie

  const estudiantes = (inscripciones || []).map(i => ({
    id: i.estudiante_id,
    nombre: i.profiles?.nombre || 'Sin nombre',
    email: i.profiles?.email || '',
  }))

  if (estudiantes.length === 0) return { estudiantes, unidades: [], rIdx: {}, pIdx: {} }

  let q = supabase
    .from('unidades')
    .select('id, titulo, orden, actividades(*)')
    .eq('libro_id', libroId)
    .order('orden')
  if (unidadId) q = q.eq('id', unidadId)

  const { data: unidades, error: ue } = await q
  if (ue) throw ue

  const allActIds = (unidades || []).flatMap(u => (u.actividades || []).map(a => a.id))
  const estudianteIds = estudiantes.map(e => e.id)

  if (allActIds.length === 0) return { estudiantes, unidades: unidades || [], rIdx: {}, pIdx: {} }

  const [respRes, progRes] = await Promise.all([
    supabase.from('respuestas')
      .select('usuario_id, actividad_id, respuesta, es_correcta')
      .in('usuario_id', estudianteIds)
      .in('actividad_id', allActIds),
    supabase.from('actividad_progreso')
      .select('usuario_id, actividad_id')
      .in('usuario_id', estudianteIds)
      .in('actividad_id', allActIds),
  ])

  const rIdx = {}
  for (const r of (respRes.data || [])) {
    if (!rIdx[r.usuario_id]) rIdx[r.usuario_id] = {}
    rIdx[r.usuario_id][r.actividad_id] = r
  }
  const pIdx = {}
  for (const p of (progRes.data || [])) {
    if (!pIdx[p.usuario_id]) pIdx[p.usuario_id] = new Set()
    pIdx[p.usuario_id].add(p.actividad_id)
  }

  return {
    estudiantes,
    unidades: (unidades || []).map(u => ({
      ...u,
      actividades: (u.actividades || [])
        .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
        .map(act => ({ ...act, ...(act.campos || {}) })),
    })),
    rIdx,
    pIdx,
  }
}
