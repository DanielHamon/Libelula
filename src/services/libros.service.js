import { supabase } from '../lib/supabase'

function storageFallbackUrl(path) {
  if (!path || path.startsWith('/')) return path || null
  const fileName = path.split('/').pop()
  if (!fileName) return null
  if (path.startsWith('pdfs/')) return `/libros/${fileName}`
  if (path.startsWith('portadas/') || path.startsWith('portada/')) return `/libros/portada/${fileName}`
  return null
}

export async function getLibroConUnidades(libroId) {
  const { data, error } = await supabase.rpc('get_libro_completo', { p_libro_id: libroId })
  if (error) {
    const accesoDenegado = error.code === '42501' || error.status === 403
    if (!accesoDenegado) {
      console.warn('[Libelula] No se pudo cargar el libro:', error.code, error.message)
    }
    return {
      libro: null,
      unidades: [],
      error: accesoDenegado ? 'acceso_denegado' : 'error_servidor',
    }
  }
  if (!data) return { libro: null, unidades: [], error: 'no_encontrado' }

  const { libro, unidades } = data

  if (libro?.pdf_url && !libro.pdf_url.startsWith('/')) {
    const originalPath = libro.pdf_url
    const { data: signed, error: storageError } = await supabase.storage
      .from('libros').createSignedUrl(libro.pdf_url, 3600)
    if (storageError) {
      console.warn('[Libelula] No se pudo firmar PDF desde Storage:', originalPath, storageError.message)
    }
    libro.pdf_url = signed?.signedUrl ?? storageFallbackUrl(originalPath)
  }

  for (const u of unidades) {
    u.actividades = (u.actividades || []).map(a => ({ ...a, ...a.campos }))
  }

  return { libro, unidades, error: null }
}

export async function getLibrosDisponibles() {
  const { data } = await supabase
    .from('libros')
    .select('id, titulo, descripcion, emoji, portada_url')
  return (data || []).map(l => ({ libroId: l.id, libroTitulo: l.titulo, ...l }))
}

export async function getLibrosEscuela(escuelaId = null) {
  let query = supabase
    .from('escuela_libros')
    .select('libro_id, libros(id, titulo, descripcion, emoji, portada_url, grado_id)')
  if (escuelaId) query = query.eq('escuela_id', escuelaId)
  const { data } = await query
  return (data || []).map(r => ({ libroId: r.libros.id, libroTitulo: r.libros.titulo, ...r.libros }))
}

export async function getLibrosActivados() {
  const { data, error } = await supabase.rpc('get_mis_libros_estado')
  if (error) throw error
  return (data || [])
}

export async function getPortadaUrl(portadaPath) {
  if (!portadaPath) return null
  if (portadaPath.startsWith('/')) return portadaPath
  const { data, error } = await supabase.storage
    .from('libros').createSignedUrl(portadaPath, 3600)
  if (error) {
    console.warn('[Libelula] No se pudo firmar portada desde Storage:', portadaPath, error.message)
  }
  return data?.signedUrl ?? storageFallbackUrl(portadaPath)
}

export async function getActividad(actividadId) {
  const { data, error } = await supabase.rpc('get_actividad_publica', {
    p_actividad_id: actividadId,
  })
  if (error) throw error
  if (!data) return null
  return { ...data, ...data.campos }
}
