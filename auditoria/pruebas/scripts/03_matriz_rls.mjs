#!/usr/bin/env node
/**
 * Fase 2 — Auditoría dinámica. Paso 3: matriz de acceso cruzado RLS.
 *
 * Objetivo: determinar empíricamente si las políticas RLS aíslan correctamente
 * los datos entre estudiantes, entre clases y entre escuelas. Cada prueba
 * declara el resultado ESPERADO; una divergencia es un hallazgo.
 *
 * Esto es lo que convierte la afirmación "se evaluó la definición de las
 * políticas" en "se verificó su comportamiento en ejecución".
 *
 * Uso: node 03_matriz_rls.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'node:fs'

const BASE_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54321'
const ANON_KEY = process.env.SUPABASE_ANON_KEY
if (!ANON_KEY) {
  console.error('Falta SUPABASE_ANON_KEY (ver salida de `supabase start`).')
  process.exit(1)
}

const usuarios = JSON.parse(
  readFileSync(new URL('../resultados/usuarios.json', import.meta.url)),
)
const datos = JSON.parse(
  readFileSync(new URL('../resultados/datos.json', import.meta.url)),
)

/** Abre una sesión autenticada real para un usuario de prueba. */
async function sesion(clave) {
  const u = usuarios[clave]
  const c = createClient(BASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { error } = await c.auth.signInWithPassword({ email: u.email, password: u.password })
  if (error) throw new Error(`login ${clave}: ${error.message}`)
  return c
}

/** Cliente sin autenticar: rol `anon`. */
function anonimo() {
  return createClient(BASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

const resultados = []

/**
 * Ejecuta una prueba y contrasta con lo esperado.
 * @param esperado 'vacio'  -> RLS debe filtrar todas las filas
 *                 'datos'  -> el acceso legítimo debe devolver filas
 *                 'error'  -> debe rechazarse con error
 */
async function probar(id, descripcion, esperado, fn) {
  let obtenido, detalle = '', filas = null
  try {
    const { data, error } = await fn()
    if (error) {
      obtenido = 'error'
      detalle = `${error.code || ''} ${error.message}`.trim()
    } else {
      filas = Array.isArray(data) ? data.length : data == null ? 0 : 1
      obtenido = filas > 0 ? 'datos' : 'vacio'
    }
  } catch (e) {
    obtenido = 'error'
    detalle = e.message
  }
  const ok = obtenido === esperado
  resultados.push({ id, descripcion, esperado, obtenido, filas, ok, detalle })
  const marca = ok ? 'PASA' : '*** FALLA ***'
  console.log(`${marca}  ${id.padEnd(10)} ${descripcion}`)
  if (!ok) console.log(`          esperado=${esperado} obtenido=${obtenido} filas=${filas} ${detalle}`)
}

// ---------------------------------------------------------------------------
// A. Aislamiento entre estudiantes (misma clase)
// ---------------------------------------------------------------------------
const estA1 = await sesion('estudiante_a1')

await probar('RLS-A01', 'Estudiante lee sus propias respuestas', 'datos', () =>
  estA1.from('respuestas').select('id').eq('usuario_id', usuarios.estudiante_a1.id))

await probar('RLS-A02', 'Estudiante NO lee respuestas de otro estudiante', 'vacio', () =>
  estA1.from('respuestas').select('id').eq('usuario_id', usuarios.estudiante_a2.id))

await probar('RLS-A03', 'Estudiante NO enumera respuestas sin filtro', 'vacio', () =>
  estA1.from('respuestas').select('id').neq('usuario_id', usuarios.estudiante_a1.id))

await probar('RLS-A04', 'Estudiante NO lee progreso de otro', 'vacio', () =>
  estA1.from('actividad_progreso').select('usuario_id').eq('usuario_id', usuarios.estudiante_a2.id))

await probar('RLS-A05', 'Estudiante NO lee perfiles de otra escuela', 'vacio', () =>
  estA1.from('profiles').select('id').eq('id', usuarios.estudiante_b1.id))

// ---------------------------------------------------------------------------
// B. Aislamiento entre docentes y entre escuelas
// ---------------------------------------------------------------------------
const docA = await sesion('docente_a')
const docB = await sesion('docente_b')

await probar('RLS-B01', 'Docente lee respuestas de SU clase', 'datos', () =>
  docA.from('respuestas').select('id').eq('usuario_id', usuarios.estudiante_a1.id))

await probar('RLS-B02', 'Docente B NO lee respuestas de clase de docente A', 'vacio', () =>
  docB.from('respuestas').select('id').eq('usuario_id', usuarios.estudiante_a1.id))

await probar('RLS-B03', 'Docente B NO lee inscripciones de clase ajena', 'vacio', () =>
  docB.from('inscripciones').select('estudiante_id').eq('clase_id', datos.clase_a))

await probar('RLS-B04', 'Docente B NO modifica clase ajena', 'vacio', () =>
  docB.from('clases').update({ nombre: 'intrusion' }).eq('id', datos.clase_a).select())

await probar('RLS-B05', 'Docente NO enumera todos los perfiles', 'vacio', () =>
  docB.from('profiles').select('id').eq('id', usuarios.estudiante_a1.id))


await probar('RLS-A06', 'Estudiante NO enumera TODOS los perfiles', 'vacio', () =>
  estA1.from('profiles').select('id, email, rol'))

await probar('RLS-A07', 'Estudiante NO lee email de perfil de otra escuela', 'vacio', () =>
  estA1.from('profiles').select('email').eq('id', usuarios.estudiante_b1.id))

await probar('RLS-B06', 'Docente B NO enumera perfiles de escuela A', 'vacio', () =>
  docB.from('profiles').select('id, email').eq('escuela_id', datos.escuela_a))

// ---------------------------------------------------------------------------
// C. Superficie anónima  (AUD-006: GRANT ALL a `anon` sobre tablas sensibles)
// ---------------------------------------------------------------------------
const anon = anonimo()

await probar('RLS-C01', 'Anónimo NO lee profiles', 'vacio', () =>
  anon.from('profiles').select('id'))

await probar('RLS-C02', 'Anónimo NO lee respuestas', 'vacio', () =>
  anon.from('respuestas').select('id'))

await probar('RLS-C03', 'Anónimo NO lee actividad_progreso', 'vacio', () =>
  anon.from('actividad_progreso').select('usuario_id'))

await probar('RLS-C04', 'Anónimo NO lee progreso', 'vacio', () =>
  anon.from('progreso').select('usuario_id'))

await probar('RLS-C05', 'Anónimo NO inserta en profiles (GRANT ALL incluye INSERT)', 'error', () =>
  anon.from('profiles').insert({ id: crypto.randomUUID(), nombre: 'x', email: 'x@x.co' }).select())

await probar('RLS-C06', 'Anónimo NO actualiza respuestas', 'vacio', () =>
  anon.from('respuestas').update({ es_correcta: true }).neq('id', '00000000-0000-0000-0000-000000000000').select())

await probar('RLS-C07', 'Anónimo NO borra progreso', 'vacio', () =>
  anon.from('progreso').delete().neq('usuario_id', crypto.randomUUID()).select())

// ---------------------------------------------------------------------------
// D. Escalada de privilegios vía escritura directa
// ---------------------------------------------------------------------------
await probar('RLS-D01', 'Estudiante NO se asciende a administrador', 'vacio', () =>
  estA1.from('profiles').update({ rol: 'admin' }).eq('id', usuarios.estudiante_a1.id).select())

await probar('RLS-D02', 'Estudiante NO se inscribe en clase ajena', 'error', () =>
  estA1.from('inscripciones').insert({ clase_id: datos.clase_b, estudiante_id: usuarios.estudiante_a1.id }).select())

await probar('RLS-D03', 'Estudiante NO falsea es_correcta en su respuesta', 'vacio', () =>
  estA1.from('respuestas').update({ es_correcta: true }).eq('usuario_id', usuarios.estudiante_a1.id).select())

await probar('RLS-D04', 'Estudiante NO inserta token para sí mismo', 'error', () =>
  estA1.from('tokens').insert({ token: 'FALSO12345', libro_id: datos.libro }).select())

// ---------------------------------------------------------------------------
const fallos = resultados.filter(r => !r.ok)
writeFileSync(
  new URL('../resultados/matriz_rls.json', import.meta.url),
  JSON.stringify({ fecha: new Date().toISOString(), total: resultados.length, fallos: fallos.length, resultados }, null, 2),
)

console.log(`\n${'='.repeat(70)}`)
console.log(`Total: ${resultados.length}   Pasan: ${resultados.length - fallos.length}   Fallan: ${fallos.length}`)
if (fallos.length) {
  console.log('\nDivergencias respecto del comportamiento esperado:')
  for (const f of fallos) console.log(`  ${f.id}  ${f.descripcion}\n      esperado=${f.esperado} obtenido=${f.obtenido} ${f.detalle}`)
}
console.log('\n-> resultados/matriz_rls.json')
