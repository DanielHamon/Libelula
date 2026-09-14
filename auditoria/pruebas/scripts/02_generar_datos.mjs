#!/usr/bin/env node
/**
 * Fase 2 — Auditoría dinámica. Paso 2: generación de datos sintéticos.
 *
 * Construye dos escuelas independientes, con sus docentes, clases, libros,
 * unidades y actividades, de modo que puedan probarse los tres ejes de
 * aislamiento: entre estudiantes, entre clases y entre escuelas.
 *
 * El volumen es parametrizable por variables de entorno, para reutilizar el
 * mismo script en las pruebas de carga (AUD-001, AUD-003):
 *
 *   N_ESTUDIANTES   estudiantes adicionales en la clase A   (defecto 0)
 *   N_ACTIVIDADES   actividades por unidad                  (defecto 5)
 *   N_UNIDADES      unidades por libro                      (defecto 2)
 *
 * Todos los datos son sintéticos. No se emplea ningún dato personal real.
 *
 * Restricciones del esquema que este script respeta (verificadas en catálogo):
 *   - profiles.rol admite únicamente 'estudiante' | 'docente' | 'admin'.
 *     El superadministrador NO es un rol de profiles: vive en la tabla
 *     `superadministradores`.
 *   - libros, unidades y actividades carecen de DEFAULT para `id`: se generan
 *     explícitamente en el cliente.
 *   - respuestas exige `unidad_id`, y una FK compuesta obliga a que el par
 *     (actividad_id, unidad_id) sea coherente.
 *   - actividades.tipo está restringido a una lista cerrada de 28 valores.
 *   - grados exige `nivel` ('primaria' | 'secundaria') y `orden`.
 *
 * Uso: node 02_generar_datos.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

const BASE_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54321'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SERVICE_KEY) {
  console.error('Falta SUPABASE_SERVICE_ROLE_KEY (ver salida de `supabase start`).')
  process.exit(1)
}

const N_ESTUDIANTES = Number(process.env.N_ESTUDIANTES || 0)
const N_ACTIVIDADES = Number(process.env.N_ACTIVIDADES || 5)
const N_UNIDADES = Number(process.env.N_UNIDADES || 2)

const db = createClient(BASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const usuarios = JSON.parse(
  readFileSync(new URL('../resultados/usuarios.json', import.meta.url)),
)

/** Aborta con contexto en lugar de propagar un error opaco de PostgREST. */
function check(etapa, { data, error }) {
  if (error) {
    console.error(`ERROR en ${etapa}: ${error.code || ''} ${error.message}`)
    if (error.details) console.error(`  detalle: ${error.details}`)
    process.exit(1)
  }
  return data
}

// --- Escuelas: dos instituciones sin relación entre sí -----------------------
const escuelas = check('escuelas', await db.from('escuelas').insert([
  { nombre: 'Escuela Auditoría A', ciudad: 'Ciudad A', codigo: 'AUD-A', activa: true },
  { nombre: 'Escuela Auditoría B', ciudad: 'Ciudad B', codigo: 'AUD-B', activa: true },
]).select())
const [escA, escB] = escuelas
console.log(`ok  escuelas          A=${escA.id.slice(0, 8)} B=${escB.id.slice(0, 8)}`)

// --- Grado ------------------------------------------------------------------
const grados = check('grados', await db.from('grados')
  .insert([{ nombre: 'Grado Auditoría', nivel: 'primaria', orden: 99 }]).select())
const grado = grados[0]

// --- Perfiles ---------------------------------------------------------------
// El trigger handle_new_user NO está instalado sobre auth.users en el esquema
// auditado (hallazgo de la fase 2), de modo que los perfiles no existen y hay
// que crearlos aquí.
const perfiles = [
  { clave: 'estudiante_a1', escuela: escA.id, rol: 'estudiante' },
  { clave: 'estudiante_a2', escuela: escA.id, rol: 'estudiante' },
  { clave: 'estudiante_b1', escuela: escB.id, rol: 'estudiante' },
  { clave: 'docente_a', escuela: escA.id, rol: 'docente' },
  { clave: 'docente_b', escuela: escB.id, rol: 'docente' },
  { clave: 'admin_a', escuela: escA.id, rol: 'admin' },
  { clave: 'superadmin', escuela: escA.id, rol: 'admin' },
]
for (const p of perfiles) {
  const u = usuarios[p.clave]
  check(`perfil ${p.clave}`, await db.from('profiles').upsert({
    id: u.id, nombre: p.clave, email: u.email, rol: p.rol,
    escuela_id: p.escuela, grado_id: grado.id,
  }).select())
}
console.log(`ok  perfiles          ${perfiles.length}`)

// El superadministrador se declara en su propia tabla, no como rol de profiles.
check('superadministradores', await db.from('superadministradores').upsert({
  usuario_id: usuarios.superadmin.id, activo: true,
}).select())
console.log('ok  superadmin        registrado en tabla dedicada')

// --- Libro, unidades y actividades ------------------------------------------
// Estas tablas no tienen DEFAULT para `id`: se genera explícitamente.
const libroId = randomUUID()
check('libros', await db.from('libros').insert([{
  id: libroId, titulo: 'Libro Auditoría',
  descripcion: 'Contenido sintético de prueba', grado_id: grado.id, activo: true,
}]).select())

const unidadesPayload = Array.from({ length: N_UNIDADES }, (_, i) => ({
  id: randomUUID(), libro_id: libroId, titulo: `Unidad ${i + 1}`, orden: i + 1,
}))
const unidades = check('unidades', await db.from('unidades').insert(unidadesPayload).select())

// `tipo` debe pertenecer a la lista cerrada del CHECK del esquema.
const actividadesPayload = unidades.flatMap(u =>
  Array.from({ length: N_ACTIVIDADES }, (_, i) => ({
    id: randomUUID(), unidad_id: u.id, tipo: 'reflexionPersonal', orden: i + 1,
    campos: { pregunta: `Pregunta sintética ${i + 1}` },
  })))
const actividades = check('actividades', await db.from('actividades').insert(actividadesPayload).select())
console.log(`ok  contenido         ${unidades.length} unidades, ${actividades.length} actividades`)

// Índice actividad -> unidad, necesario por la FK compuesta de `respuestas`.
const unidadDeActividad = Object.fromEntries(actividades.map(a => [a.id, a.unidad_id]))

// --- Clases: una por escuela, cada una con su docente ------------------------
const clases = check('clases', await db.from('clases').insert([
  { nombre: 'Clase A', grado_id: grado.id, escuela_id: escA.id, docente_id: usuarios.docente_a.id, codigo: 'CLSAUDA' },
  { nombre: 'Clase B', grado_id: grado.id, escuela_id: escB.id, docente_id: usuarios.docente_b.id, codigo: 'CLSAUDB' },
]).select())
const [claseA, claseB] = clases

check('clase_libros', await db.from('clase_libros').insert([
  { clase_id: claseA.id, libro_id: libroId },
  { clase_id: claseB.id, libro_id: libroId },
]).select())

check('escuela_libros', await db.from('escuela_libros').insert([
  { escuela_id: escA.id, libro_id: libroId },
  { escuela_id: escB.id, libro_id: libroId },
]).select())

// --- Estudiantes adicionales para las pruebas de carga -----------------------
const extra = []
for (let i = 0; i < N_ESTUDIANTES; i++) {
  const email = `carga.${i}@auditoria.local`
  const { data, error } = await db.auth.admin.createUser({
    email, password: 'Auditoria.2026.Local!', email_confirm: true,
  })
  if (error) { console.error(`  aviso: ${email}: ${error.message}`); continue }
  extra.push(data.user.id)
  check(`perfil carga ${i}`, await db.from('profiles').upsert({
    id: data.user.id, nombre: `Carga ${i}`, email, rol: 'estudiante',
    escuela_id: escA.id, grado_id: grado.id,
  }).select())
}
if (extra.length) console.log(`ok  estudiantes carga ${extra.length}`)

// --- Inscripciones ----------------------------------------------------------
const inscripciones = [
  { clase_id: claseA.id, estudiante_id: usuarios.estudiante_a1.id },
  { clase_id: claseA.id, estudiante_id: usuarios.estudiante_a2.id },
  { clase_id: claseB.id, estudiante_id: usuarios.estudiante_b1.id },
  ...extra.map(id => ({ clase_id: claseA.id, estudiante_id: id })),
]
check('inscripciones', await db.from('inscripciones').insert(inscripciones).select())
console.log(`ok  inscripciones     ${inscripciones.length}`)

// --- Respuestas y progreso: una fila por estudiante y actividad --------------
const alumnosA = [usuarios.estudiante_a1.id, usuarios.estudiante_a2.id, ...extra]
const respuestas = []
const progreso = []
for (const uid of alumnosA) {
  for (const act of actividades) {
    respuestas.push({
      usuario_id: uid, actividad_id: act.id,
      unidad_id: unidadDeActividad[act.id], libro_id: libroId,
      respuesta: { texto: 'respuesta sintética' }, es_correcta: false,
    })
    progreso.push({ usuario_id: uid, actividad_id: act.id, completada_en: new Date().toISOString() })
  }
}
// Inserción por lotes: PostgREST no admite cargas arbitrariamente grandes.
const LOTE = 500
for (let i = 0; i < respuestas.length; i += LOTE) {
  check(`respuestas lote ${i}`, await db.from('respuestas').insert(respuestas.slice(i, i + LOTE)).select('id'))
  process.stdout.write(`\r    respuestas: ${Math.min(i + LOTE, respuestas.length)}/${respuestas.length}`)
}
for (let i = 0; i < progreso.length; i += LOTE) {
  check(`progreso lote ${i}`, await db.from('actividad_progreso').insert(progreso.slice(i, i + LOTE)).select('usuario_id'))
}
console.log(`\nok  respuestas        ${respuestas.length}`)

writeFileSync(
  new URL('../resultados/datos.json', import.meta.url),
  JSON.stringify({
    escuela_a: escA.id, escuela_b: escB.id,
    clase_a: claseA.id, clase_b: claseB.id,
    libro: libroId, grado: grado.id,
    unidades: unidades.map(u => u.id),
    actividades: actividades.map(a => a.id),
    estudiantes_carga: extra,
    volumen: {
      estudiantes: alumnosA.length,
      actividades: actividades.length,
      respuestas: respuestas.length,
    },
  }, null, 2),
)
console.log('\n-> resultados/datos.json')
