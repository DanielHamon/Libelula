import { supabase } from '../lib/supabase'

// ─── Internos ────────────────────────────────────────────────────────────────

async function logAdminAction({ accion, entidad, entidad_id, payload = null }) {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return
  const { error } = await supabase.from('admin_logs').insert({
    admin_id: session.user.id,
    accion,
    entidad,
    entidad_id: String(entidad_id),
    payload,
  })
  if (error) console.error('admin_log error:', error.message)
}

function toSlug(str) {
  return str.toLowerCase()
    .replace(/[áàä]/g, 'a').replace(/[éèë]/g, 'e')
    .replace(/[íìï]/g, 'i').replace(/[óòö]/g, 'o').replace(/[úùü]/g, 'u')
    .replace(/[ñ]/g, 'n').replace(/[^a-z0-9\s_]/g, '').replace(/\s+/g, '_').slice(0, 60)
}

function genTokenId(tipo) {
  return `${tipo === 'libro' ? 'TL' : 'TD'}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
}

// ─── Grados (selector) ───────────────────────────────────────────────────────

export async function getGrados() {
  const { data, error } = await supabase.from('grados').select('*').order('orden')
  if (error) throw error
  return data
}

// ─── Escuelas ────────────────────────────────────────────────────────────────

export async function getEscuelas({ q = '', offset = 0, limit = 20 } = {}) {
  let query = supabase
    .from('escuelas')
    .select('id, nombre, ciudad, codigo, activa', { count: 'exact' })
    .order('nombre')
    .range(offset, offset + limit - 1)
  if (q) query = query.ilike('nombre', `%${q}%`)
  const { data, count, error } = await query
  if (error) throw error
  return { data, count }
}

export async function getEscuelasTodas() {
  const { data, error } = await supabase
    .from('escuelas')
    .select('id, nombre, codigo')
    .eq('activa', true)
    .order('nombre')
  if (error) throw error
  return data
}

export async function getEscuelasAdmin() {
  const { data, error } = await supabase
    .from('escuelas')
    .select('id, nombre, codigo, activa')
    .order('nombre')
  if (error) throw error
  return data
}

export async function getEscuelaDetalle(id) {
  const { data, error } = await supabase
    .from('escuelas')
    .select('*, escuela_libros(libro_id, libros(id, titulo, emoji, grado_id, grados(nombre)))')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

export async function createEscuela({ nombre, ciudad, codigo }) {
  const { data, error } = await supabase
    .from('escuelas')
    .insert({ nombre, ciudad, codigo: codigo.toUpperCase() })
    .select()
    .single()
  if (error) throw error
  await logAdminAction({ accion: 'creo_escuela', entidad: 'escuela', entidad_id: data.id, payload: { nombre, codigo } })
  return data
}

export async function toggleEscuelaActiva(id, activa) {
  const { error } = await supabase.from('escuelas').update({ activa }).eq('id', id)
  if (error) throw error
  await logAdminAction({ accion: activa ? 'activo_escuela' : 'desactivo_escuela', entidad: 'escuela', entidad_id: id })
}

export async function asignarLibroEscuela(escuelaId, libroId) {
  const { error } = await supabase
    .from('escuela_libros')
    .insert({ escuela_id: escuelaId, libro_id: libroId })
  if (error) throw error
  await logAdminAction({ accion: 'asigno_libro_escuela', entidad: 'escuela', entidad_id: escuelaId, payload: { libro_id: libroId } })
}

export async function removerLibroEscuela(escuelaId, libroId) {
  const { error } = await supabase
    .from('escuela_libros')
    .delete()
    .eq('escuela_id', escuelaId)
    .eq('libro_id', libroId)
  if (error) throw error
  await logAdminAction({ accion: 'removio_libro_escuela', entidad: 'escuela', entidad_id: escuelaId, payload: { libro_id: libroId } })
}

// ─── Libros ──────────────────────────────────────────────────────────────────

export async function getLibros({ q = '', gradoId, soloActivos, offset = 0, limit = 20 } = {}) {
  let query = supabase
    .from('libros')
    .select('id, titulo, descripcion, emoji, grado_id, activo, portada_url, pdf_url, grados(nombre)', { count: 'exact' })
    .order('titulo')
    .range(offset, offset + limit - 1)
  if (q) query = query.ilike('titulo', `%${q}%`)
  if (gradoId) query = query.eq('grado_id', gradoId)
  if (soloActivos) query = query.eq('activo', true)
  const { data, count, error } = await query
  if (error) throw error
  return { data, count }
}

export async function getLibrosTodos() {
  const { data, error } = await supabase
    .from('libros')
    .select('id, titulo, emoji, grado_id')
    .eq('activo', true)
    .order('titulo')
  if (error) throw error
  return data
}

export async function createLibro({
  titulo, descripcion, emoji, grado_id, portada_url, pdf_url, id: customId,
  color_acento, color_encabezado_inicio, color_encabezado_fin, color_fondo_actividades,
}) {
  const id = customId || toSlug(titulo)
  const { data, error } = await supabase
    .from('libros')
    .insert({
      id, titulo, descripcion, emoji, grado_id: Number(grado_id), portada_url, pdf_url,
      color_acento, color_encabezado_inicio, color_encabezado_fin, color_fondo_actividades,
      activo: true,
    })
    .select()
    .single()
  if (error) throw error
  await logAdminAction({ accion: 'creo_libro', entidad: 'libro', entidad_id: data.id, payload: { titulo, grado_id } })
  return data
}

export async function updateLibro(id, campos) {
  const { error } = await supabase.from('libros').update(campos).eq('id', id)
  if (error) throw error
  await logAdminAction({ accion: 'edito_libro', entidad: 'libro', entidad_id: id, payload: campos })
}

export async function toggleLibroActivo(id, activo) {
  const { error } = await supabase.from('libros').update({ activo }).eq('id', id)
  if (error) throw error
  await logAdminAction({ accion: activo ? 'activo_libro' : 'desactivo_libro', entidad: 'libro', entidad_id: id })
}

// ─── Unidades ────────────────────────────────────────────────────────────────

export async function getUnidades(libroId) {
  const { data, error } = await supabase
    .from('unidades')
    .select('*')
    .eq('libro_id', libroId)
    .order('orden')
  if (error) throw error
  return data
}

export async function createUnidad(libroId, { titulo, subtitulo, texto }, orden) {
  const id = `${libroId.slice(0, 20)}_u${Math.random().toString(36).slice(2, 7)}`
  const { data, error } = await supabase
    .from('unidades')
    .insert({ id, libro_id: libroId, titulo, subtitulo: subtitulo || null, texto: texto || null, orden })
    .select()
    .single()
  if (error) throw error
  await logAdminAction({ accion: 'creo_unidad', entidad: 'unidad', entidad_id: data.id, payload: { titulo, libro_id: libroId } })
  return data
}

export async function updateUnidad(id, { titulo, subtitulo, texto }) {
  const { error } = await supabase
    .from('unidades')
    .update({ titulo, subtitulo: subtitulo || null, texto: texto || null })
    .eq('id', id)
  if (error) throw error
  await logAdminAction({ accion: 'edito_unidad', entidad: 'unidad', entidad_id: id, payload: { titulo } })
}

export async function deleteUnidad(id) {
  const { error } = await supabase.from('unidades').delete().eq('id', id)
  if (error) throw error
  await logAdminAction({ accion: 'elimino_unidad', entidad: 'unidad', entidad_id: id })
}

export async function reorderUnidades(updates) {
  for (const { id, orden } of updates) {
    const { error } = await supabase.from('unidades').update({ orden }).eq('id', id)
    if (error) throw error
  }
}

// ─── Actividades ─────────────────────────────────────────────────────────────

export async function getActividades(unidadId) {
  const { data, error } = await supabase
    .from('actividades')
    .select('*')
    .eq('unidad_id', unidadId)
    .order('orden')
  if (error) throw error
  return data
}

export async function createActividad(unidadId, { tipo, orden, campos }) {
  const id = `${unidadId.slice(0, 20)}_a${Math.random().toString(36).slice(2, 7)}`
  const { data, error } = await supabase
    .from('actividades')
    .insert({ id, unidad_id: unidadId, tipo, orden, campos })
    .select()
    .single()
  if (error) throw error
  await logAdminAction({ accion: 'creo_actividad', entidad: 'actividad', entidad_id: data.id, payload: { tipo, unidad_id: unidadId } })
  return data
}

export async function updateActividad(id, campos) {
  const { error } = await supabase.from('actividades').update({ campos }).eq('id', id)
  if (error) throw error
  await logAdminAction({ accion: 'edito_actividad', entidad: 'actividad', entidad_id: id })
}

export async function updateAndPositionActivity(id, campos, unidadDestinoId, posicion) {
  const { data: actual, error: actualError } = await supabase
    .from('actividades')
    .select('id, unidad_id, orden')
    .eq('id', id)
    .single()
  if (actualError) throw actualError

  const { data: destino, error: destinoError } = await supabase
    .from('actividades')
    .select('id, orden')
    .eq('unidad_id', unidadDestinoId)
    .neq('id', id)
    .order('orden')
  if (destinoError) throw destinoError
  const maxPosicion = (destino || []).length + 1
  const nuevaPosicion = posicion === undefined || posicion === null
    ? (actual.unidad_id === unidadDestinoId ? Math.min(actual.orden, maxPosicion) : maxPosicion)
    : Number(posicion)
  if (!Number.isInteger(nuevaPosicion) || nuevaPosicion < 1) {
    throw new Error('La posición debe ser un número entero mayor o igual a 1.')
  }
  if (nuevaPosicion > maxPosicion) {
    throw new Error(`La unidad destino solo admite posiciones entre 1 y ${maxPosicion}.`)
  }

  const ordenDestino = [...(destino || [])]
  ordenDestino.splice(nuevaPosicion - 1, 0, { id })
  const cambios = [
    supabase.from('actividades').update({ campos, unidad_id: unidadDestinoId, orden: nuevaPosicion }).eq('id', id),
    ...ordenDestino
      .map((actividad, index) => actividad.id === id || actividad.orden === index + 1
        ? null
        : supabase.from('actividades').update({ orden: index + 1 }).eq('id', actividad.id))
      .filter(Boolean),
  ]

  if (actual.unidad_id !== unidadDestinoId) {
    const { data: origen, error: origenError } = await supabase
      .from('actividades')
      .select('id, orden')
      .eq('unidad_id', actual.unidad_id)
      .neq('id', id)
      .order('orden')
    if (origenError) throw origenError
    cambios.push(...(origen || [])
      .map((actividad, index) => actividad.orden === index + 1
        ? null
        : supabase.from('actividades').update({ orden: index + 1 }).eq('id', actividad.id))
      .filter(Boolean))
  }

  const results = await Promise.all(cambios)
  const failed = results.find(result => result.error)
  if (failed?.error) throw failed.error

  await logAdminAction({
    accion: 'edito_y_reubico_actividad',
    entidad: 'actividad',
    entidad_id: id,
    payload: {
      unidad_origen_id: actual.unidad_id,
      unidad_destino_id: unidadDestinoId,
      orden_anterior: actual.orden,
      orden_nuevo: nuevaPosicion,
    },
  })
}

export async function reorderActividades(actividades) {
  if (actividades.length < 2) return

  const ids = actividades.map(actividad => actividad.id)
  const { data: persisted, error: persistedError } = await supabase
    .from('actividades')
    .select('id, orden')
    .in('id', ids)
  if (persistedError) throw persistedError
  const originalOrder = new Map((persisted || []).map(actividad => [actividad.id, actividad.orden]))

  // La tabla tiene UNIQUE (unidad_id, orden). Al intercambiar posiciones no
  // podemos escribir el orden final directamente porque la posición destino
  // todavía está ocupada. Primero liberamos todas las posiciones usando
  // valores temporales únicos y luego aplicamos la numeración definitiva.
  const temporaryResults = await Promise.all(
    actividades.map((actividad, index) =>
      supabase.from('actividades').update({ orden: -(index + 1) }).eq('id', actividad.id)),
  )
  const temporaryFailure = temporaryResults.find(result => result.error)
  if (temporaryFailure?.error) {
    // Recuperación defensiva si solo una parte de la primera fase se guardó.
    await Promise.all(
      actividades.map(actividad =>
        supabase.from('actividades').update({ orden: originalOrder.get(actividad.id) }).eq('id', actividad.id)),
    )
    throw temporaryFailure.error
  }

  const finalResults = await Promise.all(
    actividades.map((actividad, index) =>
      supabase.from('actividades').update({ orden: index + 1 }).eq('id', actividad.id)),
  )
  const finalFailure = finalResults.find(result => result.error)
  if (finalFailure?.error) {
    // Vuelve a liberar las posiciones antes de restaurar el orden original,
    // evitando otra colisión UNIQUE durante la recuperación.
    await Promise.all(
      actividades.map((actividad, index) =>
        supabase.from('actividades').update({ orden: -(index + 1) }).eq('id', actividad.id)),
    )
    await Promise.all(
      actividades.map(actividad =>
        supabase.from('actividades').update({ orden: originalOrder.get(actividad.id) }).eq('id', actividad.id)),
    )
    throw finalFailure.error
  }

  await logAdminAction({
    accion: 'reordeno_actividades',
    entidad: 'actividad',
    entidad_id: actividades[0]?.unidad_id || null,
    payload: { orden: actividades.map((actividad, index) => ({ id: actividad.id, orden: index + 1 })) },
  })
}

// ─── Tokens ──────────────────────────────────────────────────────────────────

export async function getTokens({ tipo, escuelaId, libroId, estado, q = '', offset = 0, limit = 50 } = {}) {
  let query = supabase
    .from('tokens')
    .select('id, estado, tipo, libro_id, escuela_id, grado_id, email_autorizado, usuario_id, expira_en, escuelas(codigo, nombre)', { count: 'exact' })
    .range(offset, offset + limit - 1)
  if (tipo) query = query.eq('tipo', tipo)
  if (escuelaId) query = query.eq('escuela_id', escuelaId)
  if (libroId) query = query.eq('libro_id', libroId)
  if (estado) query = query.eq('estado', estado)
  if (q) query = query.ilike('id', `%${q}%`)
  const { data, count, error } = await query
  if (error) throw error
  return { data, count }
}

export async function uploadLibroArchivo(path, file) {
  const { error } = await supabase.storage
    .from('libros')
    .upload(path, file, { upsert: true, contentType: file.type })
  if (error) throw error
  return path
}

export async function listStorageFiles(folder) {
  const { data, error } = await supabase.storage
    .from('libros')
    .list(folder, { sortBy: { column: 'name', order: 'asc' } })
  if (error) throw error
  return (data || []).filter(f => f.name !== '.emptyFolderPlaceholder')
}

export async function createTokensLibro({ escuelaId, libroId, gradoId, cantidad, expiraEn }) {
  const rows = Array.from({ length: cantidad }, () => ({
    id: genTokenId('libro'),
    estado: 'valido',
    tipo: 'libro',
    libro_id: libroId,
    escuela_id: escuelaId,
    grado_id: Number(gradoId),
    expira_en: expiraEn || null,
    usos_maximos: 1,
  }))
  const { data, error } = await supabase.from('tokens').insert(rows).select('id')
  if (error) throw error
  await logAdminAction({
    accion: 'genero_tokens_libro',
    entidad: 'token',
    entidad_id: escuelaId,
    payload: { cantidad, libro_id: libroId, escuela_id: escuelaId, grado_id: gradoId },
  })
  return data.map(t => t.id)
}

export async function createTokenesDocente({ escuelaId, emails, expiraEn }) {
  const rows = emails.map(email => ({
    id: genTokenId('docente'),
    estado: 'valido',
    tipo: 'docente',
    escuela_id: escuelaId,
    email_autorizado: email.trim().toLowerCase(),
    expira_en: expiraEn || null,
    usos_maximos: 1,
  }))
  const { data, error } = await supabase.from('tokens').insert(rows).select('id')
  if (error) throw error
  await logAdminAction({
    accion: 'genero_tokens_docente',
    entidad: 'token',
    entidad_id: escuelaId,
    payload: { cantidad: emails.length, escuela_id: escuelaId },
  })
  return data.map(t => t.id)
}

export async function revocarToken(tokenId) {
  const { error } = await supabase.from('tokens').update({ estado: 'revocado' }).eq('id', tokenId)
  if (error) throw error
  await logAdminAction({ accion: 'revoco_token', entidad: 'token', entidad_id: tokenId })
}

export async function deleteActividad(id) {
  const { error } = await supabase.from('actividades').delete().eq('id', id)
  if (error) throw error
  await logAdminAction({ accion: 'elimino_actividad', entidad: 'actividad', entidad_id: id })
}

// ─── Usuarios ────────────────────────────────────────────────────────────────

export async function getUsuarios({ q = '', rol = '', escuelaId = '', offset = 0, limit = 20 } = {}) {
  let query = supabase
    .from('profiles')
    .select('id, nombre, email, rol, grado_id, escuela_id, grados(nombre), escuelas(codigo, nombre)', { count: 'exact' })
    .order('nombre')
    .range(offset, offset + limit - 1)
  if (q) query = query.or(`nombre.ilike.%${q}%,email.ilike.%${q}%`)
  if (rol) query = query.eq('rol', rol)
  if (escuelaId) query = query.eq('escuela_id', escuelaId)
  const { data, count, error } = await query
  if (error) throw error
  return { data, count }
}

export async function cambiarRolUsuario(id, nuevoRol) {
  const { error } = await supabase.from('profiles').update({ rol: nuevoRol }).eq('id', id)
  if (error) throw error
  await logAdminAction({ accion: 'cambio_rol', entidad: 'usuario', entidad_id: id, payload: { rol: nuevoRol } })
}

// ─── Logs ────────────────────────────────────────────────────────────────────

export async function getLogs({ offset = 0, limit = 50 } = {}) {
  const { data, count, error } = await supabase
    .from('admin_logs')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)
  if (error) throw error
  return { data, count }
}

// ─── Stats para dashboard ────────────────────────────────────────────────────

export async function getAdminStats() {
  const [escuelas, libros, tokens, logs] = await Promise.all([
    supabase.from('escuelas').select('*', { count: 'exact', head: true }).eq('activa', true),
    supabase.from('libros').select('*', { count: 'exact', head: true }).eq('activo', true),
    supabase.from('tokens').select('*', { count: 'exact', head: true }).eq('estado', 'valido'),
    supabase.from('admin_logs').select('accion, entidad, entidad_id, created_at').order('created_at', { ascending: false }).limit(5),
  ])
  if (escuelas.error) throw escuelas.error
  if (libros.error) throw libros.error
  if (tokens.error) throw tokens.error
  return {
    escuelasActivas: escuelas.count,
    librosActivos: libros.count,
    tokensValidos: tokens.count,
    logsRecientes: logs.data || [],
  }
}
