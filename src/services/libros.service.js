import { registrarError } from '../lib/diagnostics'
import { supabase } from '../lib/supabase'

function storageFallbackUrl(path) {
  if (!path || path.startsWith('/')) return path || null
  const fileName = path.split('/').pop()
  if (!fileName) return null
  if (path.startsWith('pdfs/')) return `/libros/${fileName}`
  if (path.startsWith('portadas/') || path.startsWith('portada/')) return `/libros/portada/${fileName}`
  return null
}

const PDF_URL_TTL_SECONDS = 300

async function firmarPdf(path) {
  if (!path || path.startsWith('/') || /^https?:/i.test(path)) throw new Error('PDF no disponible')
  const issuedAt = Date.now()
  const { data, error } = await supabase.storage.from('libros').createSignedUrl(path, PDF_URL_TTL_SECONDS)
  if (error || !data?.signedUrl) throw new Error('No se pudo preparar el PDF')
  return { url: data.signedUrl, expiresAt: issuedAt + PDF_URL_TTL_SECONDS * 1000 }
}

export async function renovarPdfLibro(libroId) {
  // Revalidar acceso y ruta actuales antes de cada firma; no reutilizar la ruta
  // de una licencia retirada ni registrar la URL firmada en consola/storage.
  const { data, error } = await supabase.rpc('get_libro_completo', { p_libro_id: libroId })
  if (error || !data?.libro) throw new Error('Libro no disponible')
  return firmarPdf(data.libro.pdf_url)
}

export async function getLibroConUnidades(libroId) {
  const { data, error } = await supabase.rpc('get_libro_completo', { p_libro_id: libroId })
  if (error) {
    const accesoDenegado = error.code === '42501' || error.status === 403
    if (!accesoDenegado) {
      registrarError("No se pudo cargar el libro:", error, 'warn')
    }
    return {
      libro: null,
      unidades: [],
      error: accesoDenegado ? 'acceso_denegado' : 'error_servidor',
    }
  }
  if (!data) return { libro: null, unidades: [], error: 'no_encontrado' }

  const { libro, unidades } = data
  if (!libro) return { libro: null, unidades: [], error: 'no_encontrado' }

  const pdfPath = libro?.pdf_url
  libro.pdf_disponible = Boolean(pdfPath && !pdfPath.startsWith('/') && !/^https?:/i.test(pdfPath))
  libro.pdf_url = null
  libro.pdf_expires_at = null
  if (libro.pdf_disponible) {
    try {
      const signed = await firmarPdf(pdfPath)
      libro.pdf_url = signed.url
      libro.pdf_expires_at = signed.expiresAt
    } catch {
      // El lector permite reintentar sin volver a cargar actividades/progreso.
    }
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
    registrarError("No se pudo firmar portada desde Storage:", error, 'warn')
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
