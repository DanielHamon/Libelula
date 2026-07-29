import { supabase } from '../lib/supabase'

export async function getClasesDocente(docenteId) {
  const { data } = await supabase
    .from('clases')
    .select('*, clase_libros(libro_id, libro_titulo), inscripciones(estudiante_id)')
    .eq('docente_id', docenteId)

  if (!data || data.length === 0) return []

  const allLibroIds = [...new Set(data.flatMap(c => (c.clase_libros || []).map(l => l.libro_id)))]
  const allEstudianteIds = [...new Set(data.flatMap(c => (c.inscripciones || []).map(i => i.estudiante_id)))]

  const actividadesPorLibro = {}
  const completadosPorEstudiante = {}

  if (allLibroIds.length > 0) {
    const { data: unidades } = await supabase
      .from('unidades')
      .select('libro_id, actividades(id)')
      .in('libro_id', allLibroIds)

    for (const u of (unidades || [])) {
      if (!actividadesPorLibro[u.libro_id]) actividadesPorLibro[u.libro_id] = []
      actividadesPorLibro[u.libro_id].push(...(u.actividades || []).map(a => a.id))
    }

    if (allEstudianteIds.length > 0) {
      const allActIds = Object.values(actividadesPorLibro).flat()
      if (allActIds.length > 0) {
        const { data: progs } = await supabase
          .from('actividad_progreso')
          .select('usuario_id, actividad_id')
          .in('usuario_id', allEstudianteIds)
          .in('actividad_id', allActIds)

        for (const p of (progs || [])) {
          if (!completadosPorEstudiante[p.usuario_id]) completadosPorEstudiante[p.usuario_id] = new Set()
          completadosPorEstudiante[p.usuario_id].add(p.actividad_id)
        }
      }
    }
  }

  return data.map(c => {
    const libros = (c.clase_libros || []).map(l => ({ libroId: l.libro_id, libroTitulo: l.libro_titulo }))
    const estudianteIds = (c.inscripciones || []).map(i => i.estudiante_id)

    let promedioProgreso = 0
    let estudiantesActivos = 0
    if (estudianteIds.length > 0 && libros.length > 0) {
      const actIdsDelLibro = new Set(libros.flatMap(l => actividadesPorLibro[l.libroId] || []))
      const totalActs = actIdsDelLibro.size
      if (totalActs > 0) {
        let sumPct = 0
        for (const uid of estudianteIds) {
          const comp = completadosPorEstudiante[uid] || new Set()
          const completadas = [...actIdsDelLibro].filter(id => comp.has(id)).length
          if (completadas > 0) estudiantesActivos++
          sumPct += completadas / totalActs
        }
        promedioProgreso = Math.round(sumPct / estudianteIds.length * 100)
      }
    }

    return {
      ...c,
      libros,
      estudiantes: c.inscripciones || [],
      promedioProgreso,
      estudiantesActivos,
    }
  })
}

export async function getClaseDetalle(claseId) {
  const { data } = await supabase
    .from('clases')
    .select(`
      *,
      grados(nombre),
      clase_libros(libro_id, libro_titulo),
      inscripciones(
        estudiante_id,
        profiles(id, nombre, email, rol)
      )
    `)
    .eq('id', claseId)
    .single()
  return data
}

export async function actualizarClase({ claseId, nombre, emoji, libros }) {
  const { error: claseError } = await supabase
    .from('clases')
    .update({ nombre: nombre.trim(), emoji: emoji || '🏫' })
    .eq('id', claseId)
  if (claseError) throw claseError

  const { data: actuales, error: actualesError } = await supabase
    .from('clase_libros')
    .select('libro_id')
    .eq('clase_id', claseId)
  if (actualesError) throw actualesError

  const actualesIds = new Set((actuales || []).map(item => item.libro_id))
  const nuevosIds = new Set(libros.map(libro => libro.libroId))
  const quitar = [...actualesIds].filter(id => !nuevosIds.has(id))
  const agregar = libros.filter(libro => !actualesIds.has(libro.libroId))

  if (quitar.length > 0) {
    const { error } = await supabase
      .from('clase_libros')
      .delete()
      .eq('clase_id', claseId)
      .in('libro_id', quitar)
    if (error) throw error
  }
  if (agregar.length > 0) {
    const { error } = await supabase.from('clase_libros').insert(
      agregar.map(libro => ({
        clase_id: claseId,
        libro_id: libro.libroId,
        libro_titulo: libro.libroTitulo,
      }))
    )
    if (error) throw error
  }
}

export async function crearClase({ nombre, emoji = '🏫', gradoId, libros }) {
  // escuela_id lo deriva la RPC del docente autenticado, no viene del frontend
  const { data, error } = await supabase.rpc('crear_clase', {
    p_nombre: nombre,
    p_grado_id: gradoId,
  })
  if (error) {
    console.error('[crearClase] RPC crear_clase falló:', {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    })
    throw new Error(error.code === '42501' ? 'acceso_denegado' : 'error_crear_clase')
  }
  if (!data?.ok) throw new Error(data?.motivo ?? 'error_crear_clase')

  // La RPC puede devolver clase_id o id según la versión del procedimiento
  const claseId = data.clase_id ?? data.id
  if (!claseId) throw new Error('error_clase_id_invalido')

  const { error: emojiError } = await supabase
    .from('clases')
    .update({ emoji })
    .eq('id', claseId)
  if (emojiError) {
    console.error('[crearClase] actualización de emoji falló:', emojiError)
    throw new Error('error_guardar_emoji')
  }

  if (libros.length > 0) {
    const { error: librosError } = await supabase.from('clase_libros').insert(
      libros.map(l => ({ clase_id: claseId, libro_id: l.libroId, libro_titulo: l.libroTitulo }))
    )
    if (librosError) {
      console.error('[crearClase] clase_libros insert falló:', librosError)
      throw new Error('error_insertar_libros')
    }
  }
  return { id: claseId, codigo: data.codigo, escuela_id: data.escuela_id }
}

export async function getLibrosDisponiblesParaClase(claseId) {
  const { data: clase } = await supabase
    .from('clases')
    .select('grado_id, escuela_id')
    .eq('id', claseId)
    .single()

  if (!clase) return []

  const { data: libros } = await supabase
    .from('escuela_libros')
    .select('libro_id, libros(id, titulo, descripcion, emoji, portada_url, grado_id)')
    .eq('escuela_id', clase.escuela_id)

  return (libros || [])
    .map(r => r.libros)
    .filter(l => l && (l.grado_id === clase.grado_id || l.grado_id === null))
    .map(l => ({ libroId: l.id, libroTitulo: l.titulo, ...l }))
}

export async function buscarClasePorCodigo(codigo) {
  const { data, error } = await supabase.rpc('buscar_clase_para_unirse', {
    p_codigo: codigo,
  })
  if (error) return { clase: null, error: 'error_servidor' }
  if (!data.ok) return { clase: null, error: data.motivo }
  return { clase: data.clase, error: null }
}

export async function unirseAClase(codigo) {
  const { data, error } = await supabase.rpc('unirse_clase', { p_codigo: codigo })
  if (error) throw error
  if (!data?.ok) throw new Error(data?.motivo || 'error_unirse_clase')
  return true
}

export async function getClasesEstudiante(estudianteId) {
  const { data } = await supabase
    .from('inscripciones')
    .select('clase_id, clases(id, nombre, codigo, clase_libros(libro_id, libro_titulo))')
    .eq('estudiante_id', estudianteId)
  return (data || []).map(r => ({
    id: r.clases.id,
    nombre: r.clases.nombre,
    codigo: r.clases.codigo,
    libros: (r.clases.clase_libros || []).map(l => ({ libroId: l.libro_id, libroTitulo: l.libro_titulo })),
  }))
}

export async function eliminarEstudianteDeClase(claseId, estudianteId) {
  const { error } = await supabase
    .from('inscripciones')
    .delete()
    .eq('clase_id', claseId)
    .eq('estudiante_id', estudianteId)
  if (error) throw error
}

export async function eliminarClase(claseId) {
  const { error } = await supabase
    .from('clases')
    .delete()
    .eq('id', claseId)
  if (error) throw error
}
