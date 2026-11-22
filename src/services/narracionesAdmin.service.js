import { supabase } from '../lib/supabase'

const BUCKET = 'audiobooks'
const MAX_MP3_BYTES = 10 * 1024 * 1024

async function rpc(name, params) {
  const { data, error } = await supabase.rpc(name, params)
  if (error) throw error
  return data
}

export async function listarLibrosNarracion() {
  const { data, error } = await supabase.from('libros')
    .select('id,titulo,pdf_url,narracion_habilitada,narracion_revision')
    .order('titulo')
  if (error) throw error
  return data || []
}

export async function obtenerEstadoNarracion(libroId) {
  const [{ data: versiones, error: versionesError }, { data: pendientes, error: pendientesError }] = await Promise.all([
    supabase.from('narraciones_libro')
      .select('id,version,estado,pdf_path,pdf_total_pages,pdf_updated_at,creada_en,publicada_en')
      .eq('libro_id', libroId).order('version', { ascending: false }),
    supabase.from('acciones_admin_pendientes')
      .select('id,payload,solicitado_en,estado')
      .eq('tipo', 'cambiar_narracion_libro').eq('estado', 'pendiente')
      .eq('payload->>libro_id', libroId),
  ])
  if (versionesError) throw versionesError
  if (pendientesError) throw pendientesError
  return { versiones: versiones || [], pendientes: pendientes || [] }
}

export async function obtenerPaginasNarracion(versionId) {
  const { data, error } = await supabase.from('narraciones_pagina')
    .select('pagina_pdf,storage_path,estado,duracion_segundos,tamano_bytes')
    .eq('narracion_id', versionId).order('pagina_pdf')
  if (error) throw error
  return data || []
}

export async function crearBorradorNarracion(libroId, paginas) {
  return rpc('admin_narracion_crear_borrador', { p_libro_id: libroId, p_total_paginas: paginas })
}

export async function descartarBorradorNarracion(id) {
  const paths = await rpc('admin_narracion_descartar_borrador', { p_narracion_id: id })
  for (const path of paths || []) await eliminarSiNoReferenciado(path)
}

export async function validarVersionNarracion(id) {
  return rpc('narracion_version_valida', { p_id: id })
}

export async function publicarVersionNarracion(id) {
  return rpc('admin_narracion_publicar', { p_narracion_id: id })
}

export async function solicitarEstadoNarracion(libroId, habilitar) {
  return rpc('admin_narracion_solicitar_estado', { p_libro_id: libroId, p_habilitar: habilitar })
}

async function comprobarMp3(file) {
  if (!file || file.size < 2049 || file.size > MAX_MP3_BYTES) {
    throw new Error('El MP3 debe medir entre 2 KB y 10 MB.')
  }
  const bytes = new Uint8Array(await file.slice(0, 4).arrayBuffer())
  const id3 = bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33
  const frame = bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0
  if (!id3 && !frame) throw new Error('El archivo no tiene una cabecera MP3 válida.')
  const url = URL.createObjectURL(file)
  try {
    const duration = await new Promise((resolve, reject) => {
      const audio = document.createElement('audio')
      audio.preload = 'metadata'
      audio.onloadedmetadata = () => resolve(audio.duration)
      audio.onerror = () => reject(new Error('No se pudo leer la duración del MP3.'))
      audio.src = url
    })
    if (!Number.isFinite(duration) || duration <= 0 || duration > 7200) {
      throw new Error('La duración del MP3 no es válida.')
    }
    return duration
  } finally {
    URL.revokeObjectURL(url)
  }
}

async function eliminarSiNoReferenciado(path) {
  if (!path) return
  // Storage impide borrar objetos aún usados por versiones publicadas o archivadas.
  const { error } = await supabase.storage.from(BUCKET).remove([path])
  if (error) return
  // Solo elimina la reserva si el archivo desapareció y ninguna versión lo usa.
  try { await rpc('admin_narracion_olvidar_carga', { p_path: path }) }
  catch { /* Se conserva la reserva para reintentar la limpieza. */ }
}

export async function limpiarCargasNarracion(libroId) {
  const paths = await rpc('admin_narracion_archivos_huerfanos', { p_libro_id: libroId })
  for (const path of paths || []) {
    const { error } = await supabase.storage.from(BUCKET).remove([path])
    if (error) throw error
    await rpc('admin_narracion_olvidar_carga', { p_path: path })
  }
  return paths?.length || 0
}

export async function cargarMp3Narracion(versionId, pagina, file) {
  const duracion = await comprobarMp3(file)
  const path = await rpc('admin_narracion_reservar_carga', {
    p_narracion_id: versionId, p_pagina: pagina,
  })
  let confirmado = false
  try {
    const { error: uploadError } = await supabase.storage.from(BUCKET)
      .upload(path, file, { contentType: 'audio/mpeg', upsert: false })
    if (uploadError) throw uploadError
    const anterior = await rpc('admin_narracion_confirmar_carga', {
      p_path: path, p_duracion: Number(duracion.toFixed(3)),
    })
    confirmado = true
    await eliminarSiNoReferenciado(anterior)
    return path
  } finally {
    if (!confirmado) await eliminarSiNoReferenciado(path)
  }
}

export async function cambiarPaginaNarracion(versionId, pagina, estado) {
  const anterior = await rpc('admin_narracion_cambiar_pagina', {
    p_narracion_id: versionId, p_pagina: pagina, p_estado: estado,
  })
  await eliminarSiNoReferenciado(anterior)
}

export async function escucharMp3Narracion(path) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 120)
  if (error) throw error
  return data.signedUrl
}
