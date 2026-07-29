import { supabase } from '../lib/supabase'

export async function solicitarAccionSensible(tipo, payload) {
  const { data, error } = await supabase.rpc('admin_solicitar_accion_sensible_v2', {
    p_tipo: tipo,
    p_payload: payload,
  })
  if (error) throw error
  return data
}

export async function getAccionesAdminPendientes({ estado = 'pendiente' } = {}) {
  let query = supabase
    .from('acciones_admin_pendientes')
    .select(`
      id, tipo, payload, estado, solicitado_en, resuelto_en, resultado, error,
      solicitante:profiles!acciones_admin_pendientes_solicitante_id_fkey(nombre, email),
      aprobador:profiles!acciones_admin_pendientes_aprobador_id_fkey(nombre, email)
    `)
    .order('solicitado_en', { ascending: false })
  if (estado) query = query.eq('estado', estado)
  const { data, error } = await query
  if (error) throw error
  return data
}

export async function getEstadoSuperadministrador() {
  const [{ data: esSuper, error: superError }, { data: nivel, error: nivelError }] = await Promise.all([
    supabase.rpc('es_superadministrador'),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
  ])
  if (superError) throw superError
  if (nivelError) throw nivelError
  return { esSuper: Boolean(esSuper), esAal2: nivel.currentLevel === 'aal2' }
}

export async function resolverAccionAdmin(id, aprobar) {
  const { data, error } = await supabase.rpc('superadmin_resolver_accion_v3', {
    p_accion_id: id,
    p_aprobar: aprobar,
  })
  if (error) throw error
  return data
}

function toSlug(str) {
  return str.toLowerCase()
    .replace(/[áàä]/g, 'a').replace(/[éèë]/g, 'e')
    .replace(/[íìï]/g, 'i').replace(/[óòö]/g, 'o').replace(/[úùü]/g, 'u')
    .replace(/[ñ]/g, 'n').replace(/[^a-z0-9\s_]/g, '').replace(/\s+/g, '_').slice(0, 60)
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
  return solicitarAccionSensible('crear_escuela', { nombre, ciudad, codigo })
}

export async function toggleEscuelaActiva(id, activa) {
  return solicitarAccionSensible('cambiar_estado_escuela', {
    escuela_id: id,
    activa,
  })
}

export async function asignarLibroEscuela(escuelaId, libroId) {
  return solicitarAccionSensible('asignar_libro_escuela', {
    escuela_id: escuelaId,
    libro_id: libroId,
  })
}

export async function removerLibroEscuela(escuelaId, libroId) {
  return solicitarAccionSensible('remover_libro_escuela', {
    escuela_id: escuelaId,
    libro_id: libroId,
  })
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
  return solicitarAccionSensible('crear_libro', {
    id, titulo, descripcion, emoji, grado_id: Number(grado_id), portada_url, pdf_url,
    color_acento, color_encabezado_inicio, color_encabezado_fin, color_fondo_actividades,
  })
}

export async function updateLibro(id, campos) {
  return solicitarAccionSensible('editar_libro', { libro_id: id, campos })
}

export async function toggleLibroActivo(id, activo) {
  return solicitarAccionSensible('cambiar_estado_libro', {
    libro_id: id,
    activo,
  })
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
  return solicitarAccionSensible('crear_unidad', {
    id, libro_id: libroId, titulo, subtitulo, texto, orden,
  })
}

export async function updateUnidad(id, { titulo, subtitulo, texto }) {
  return solicitarAccionSensible('editar_unidad', {
    unidad_id: id, titulo, subtitulo, texto,
  })
}

export async function deleteUnidad(id) {
  return solicitarAccionSensible('eliminar_unidad', { unidad_id: id })
}

export async function reorderUnidades(updates) {
  return solicitarAccionSensible('reordenar_unidades', { unidades: updates })
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
  return data
}

export async function updateActividad(id, campos) {
  const { error } = await supabase.from('actividades').update({ campos }).eq('id', id)
  if (error) throw error
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

const STORAGE_RULES = {
  portada: {
    maxBytes: 5 * 1024 * 1024,
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    extensions: ['jpg', 'jpeg', 'png', 'webp'],
    stagingFolder: 'portadas',
  },
  pdfs: {
    maxBytes: 50 * 1024 * 1024,
    mimeTypes: ['application/pdf'],
    extensions: ['pdf'],
    stagingFolder: 'pdfs',
  },
}

function extensionOf(name) {
  return name.split('.').pop()?.toLowerCase() || ''
}

async function validateFileSignature(file, kind) {
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  if (kind === 'pdfs') {
    return bytes.length >= 5
      && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44
      && bytes[3] === 0x46 && bytes[4] === 0x2d
  }
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  const png = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
  const webp = bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
    && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  return jpeg || png || webp
}

export async function uploadLibroArchivo(kind, file) {
  const rule = STORAGE_RULES[kind]
  if (!rule) throw new Error('Tipo de archivo no permitido')
  const extension = extensionOf(file.name)
  if (!rule.extensions.includes(extension) || !rule.mimeTypes.includes(file.type)) {
    throw new Error(kind === 'pdfs' ? 'El archivo debe ser un PDF válido' : 'La portada debe ser JPG, PNG o WebP')
  }
  if (file.size <= 0 || file.size > rule.maxBytes) {
    throw new Error(`El archivo supera el límite de ${rule.maxBytes / 1024 / 1024} MB`)
  }
  if (!await validateFileSignature(file, kind)) {
    throw new Error('El contenido del archivo no coincide con su tipo')
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Sesión no válida')
  const { data: isSuperadmin, error: superadminError } = await supabase.rpc('es_superadministrador')
  if (superadminError) throw superadminError
  if (!isSuperadmin) throw new Error('Solo el superadministrador puede subir archivos')
  if (file.name.includes('/') || file.name.includes('\\') || file.name.startsWith('.') || file.name.length > 180) {
    throw new Error('El nombre del archivo no es válido')
  }
  const path = `${kind}/${file.name}`
  const { error } = await supabase.storage
    .from('libros')
    .upload(path, file, {
      upsert: false,
      contentType: file.type,
      cacheControl: '3600',
    })
  if (error) {
    if (error.statusCode === '409' || /already exists|duplicate/i.test(error.message)) {
      throw new Error(`Ya existe un archivo llamado "${file.name}"`)
    }
    throw error
  }
  return path
}

export async function deleteLibroArchivo(path) {
  if (!/^(portada|pdfs)\/[^/]+$/.test(path)) {
    throw new Error('Ruta de archivo no válida')
  }
  const { data: isSuperadmin, error: superadminError } = await supabase.rpc('es_superadministrador')
  if (superadminError) throw superadminError
  if (!isSuperadmin) throw new Error('Solo el superadministrador puede eliminar archivos')
  const { data, error } = await supabase.storage.from('libros').remove([path])
  if (error) throw error
  if (!data?.length) throw new Error('No se pudo eliminar el archivo')
}

export async function listStorageFiles(kind) {
  const rule = STORAGE_RULES[kind]
  if (!rule) throw new Error('Tipo de archivo no permitido')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Sesión no válida')
  const { data: isSuperadmin, error: superadminError } = await supabase.rpc('es_superadministrador')
  if (superadminError) throw superadminError

  const publishedFolder = kind
  const { data: published, error: publishedError } = await supabase.storage
    .from('libros')
    .list(publishedFolder, { sortBy: { column: 'name', order: 'asc' } })
  if (publishedError) throw publishedError
  const files = (published || [])
    .filter(file => file.name !== '.emptyFolderPlaceholder')
    .map(file => ({ ...file, path: `${publishedFolder}/${file.name}`, staging: false }))

  return { files, canUpload: Boolean(isSuperadmin) }
}

export async function createTokensLibro({ escuelaId, libroId, gradoId, cantidad, expiraEn }) {
  const { data, error } = await supabase.rpc('admin_crear_tokens_libro', {
    p_escuela_id: escuelaId,
    p_libro_id: libroId,
    p_grado_id: Number(gradoId),
    p_cantidad: Number(cantidad),
    p_expira_en: expiraEn || null,
  })
  if (error) throw error
  return data
}

export async function createTokenesDocente({ escuelaId, emails, expiraEn }) {
  const { data, error } = await supabase.rpc('admin_crear_tokens_docente', {
    p_escuela_id: escuelaId,
    p_emails: emails.map(email => email.trim().toLowerCase()),
    p_expira_en: expiraEn || null,
  })
  if (error) throw error
  return data
}

export async function revocarToken(tokenId) {
  return solicitarAccionSensible('revocar_token', { token_id: tokenId })
}

export async function deleteActividad(id) {
  const { error } = await supabase.from('actividades').delete().eq('id', id)
  if (error) throw error
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
  const { data, error } = await supabase.rpc('admin_cambiar_rol_usuario', {
    p_usuario_id: id,
    p_rol: nuevoRol,
  })
  if (error) throw error
  if (!data?.ok) {
    const mensajes = {
      rol_invalido: 'El rol seleccionado no es válido.',
      usuario_no_encontrado: 'El usuario ya no existe.',
      rol_sin_cambios: 'El usuario ya tiene ese rol.',
      no_puedes_cambiar_tu_rol: 'No puedes modificar tu propio rol.',
      ultimo_admin: 'No se puede quitar el rol al último administrador.',
    }
    throw new Error(mensajes[data?.motivo] || 'No se pudo cambiar el rol')
  }
  return data
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
