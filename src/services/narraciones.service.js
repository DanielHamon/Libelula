import { supabase } from '../lib/supabase'

const AUDIO_BUCKET = 'audiobooks'
const AUDIO_URL_TTL_SECONDS = 120

export async function getNarracionPublicada(libroId) {
  const { data: libro, error: libroError } = await supabase
    .from('libros').select('narracion_habilitada').eq('id', libroId).maybeSingle()
  if (libroError) throw libroError
  if (!libro?.narracion_habilitada) return null

  const { data: narracion, error: narracionError } = await supabase
    .from('narraciones_libro')
    .select('id, libro_id, version')
    .eq('libro_id', libroId)
    .eq('estado', 'published')
    .maybeSingle()
  if (narracionError) throw narracionError
  if (!narracion) return null
  const { data: valida, error: validaError } = await supabase.rpc('narracion_version_valida', { p_id: narracion.id })
  if (validaError) throw validaError
  if (!valida) return null

  const { data: paginas, error: paginasError } = await supabase
    .from('narraciones_pagina')
    .select('pagina_pdf, storage_path, duracion_segundos')
    .eq('narracion_id', narracion.id)
    .eq('estado', 'ready')
    .order('pagina_pdf')
  if (paginasError) throw paginasError

  return {
    ...narracion,
    paginas: new Map((paginas || []).map(pagina => [pagina.pagina_pdf, pagina])),
  }
}

export async function firmarNarracionPagina(pagina) {
  if (!pagina?.storage_path) throw new Error('Narración no disponible')
  const { data, error } = await supabase.storage
    .from(AUDIO_BUCKET)
    .createSignedUrl(pagina.storage_path, AUDIO_URL_TTL_SECONDS)
  if (error || !data?.signedUrl) throw new Error('No se pudo preparar el audio')
  return data.signedUrl
}
