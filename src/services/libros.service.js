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
  if (error || !data) return { libro: null, unidades: [] }

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

  return { libro, unidades }
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

export async function getLibrosActivados(usuarioId) {
  const { data } = await supabase
    .from('libro_activaciones')
    .select('libro_id, libros(id, titulo, descripcion, emoji, portada_url)')
    .eq('usuario_id', usuarioId)
  return (data || []).map(r => ({ id: r.libros.id, ...r.libros }))
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
  const { data } = await supabase
    .from('actividades')
    .select('*')
    .eq('id', actividadId)
    .single()
  if (!data) return null
  return { ...data, ...data.campos }
}
