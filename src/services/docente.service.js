import { supabase } from '../lib/supabase'
import { leerPaginas, leerPorIds } from './lecturaPaginada.js'

export async function getProgresoConRespuestas(estudianteId, libroId, unidadId = null) {
  const unidades = await leerUnidades(libroId, unidadId)

  const allActIds = (unidades || []).flatMap(u => (u.actividades || []).map(a => a.id))
  if (allActIds.length === 0) return unidades || []

  const [respuestas, progreso] = await Promise.all([
    leerPorIds(allActIds, ids => supabase.from('respuestas')
      .select('actividad_id, respuesta, es_correcta, created_at')
      .eq('usuario_id', estudianteId)
      .in('actividad_id', ids).order('usuario_id').order('actividad_id')),
    leerPorIds(allActIds, ids => supabase.from('actividad_progreso')
      .select('actividad_id, completada_en')
      .eq('usuario_id', estudianteId)
      .in('actividad_id', ids).order('usuario_id').order('actividad_id')),
  ])

  const rMap = Object.fromEntries(respuestas.map(r => [r.actividad_id, r]))
  const pMap = Object.fromEntries(progreso.map(p => [p.actividad_id, p]))

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
  const inscripciones = await leerPaginas(() => supabase
    .from('inscripciones')
    .select('estudiante_id, profiles(nombre, email)')
    .eq('clase_id', claseId).order('estudiante_id'))

  const estudiantes = (inscripciones || []).map(i => ({
    id: i.estudiante_id,
    nombre: i.profiles?.nombre || 'Sin nombre',
    email: i.profiles?.email || '',
  }))

  if (estudiantes.length === 0) return { estudiantes, unidades: [], rIdx: {}, pIdx: {} }

  const unidades = await leerUnidades(libroId, unidadId)

  const allActIds = (unidades || []).flatMap(u => (u.actividades || []).map(a => a.id))
  const estudianteIds = estudiantes.map(e => e.id)

  if (allActIds.length === 0) return { estudiantes, unidades: unidades || [], rIdx: {}, pIdx: {} }

  const [respuestas, progreso] = await Promise.all([
    leerPorIds(estudianteIds, alumnos => leerPorIds(allActIds, ids => supabase.from('respuestas')
      .select('usuario_id, actividad_id, respuesta, es_correcta')
      .in('usuario_id', alumnos)
      .in('actividad_id', ids).order('usuario_id').order('actividad_id')), false),
    leerPorIds(estudianteIds, alumnos => leerPorIds(allActIds, ids => supabase.from('actividad_progreso')
      .select('usuario_id, actividad_id')
      .in('usuario_id', alumnos)
      .in('actividad_id', ids).order('usuario_id').order('actividad_id')), false),
  ])

  const rIdx = {}
  for (const r of respuestas) {
    if (!rIdx[r.usuario_id]) rIdx[r.usuario_id] = {}
    rIdx[r.usuario_id][r.actividad_id] = r
  }
  const pIdx = {}
  for (const p of progreso) {
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

async function leerUnidades(libroId, unidadId) {
  const unidades = await leerPaginas(() => {
    let q = supabase.from('unidades').select('id, titulo, orden')
      .eq('libro_id', libroId).order('orden').order('id')
    if (unidadId) q = q.eq('id', unidadId)
    return q
  })
  const actividades = await leerPorIds(unidades.map(u => u.id), ids =>
    supabase.from('actividades').select('*').in('unidad_id', ids).order('id'))
  return unidades.map(u => ({ ...u, actividades: actividades.filter(a => a.unidad_id === u.id) }))
}
