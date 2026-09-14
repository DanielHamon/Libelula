#!/usr/bin/env node
/**
 * Fase 2 — Auditoría dinámica. Paso 5: demostración del truncamiento (AUD-001).
 *
 * AUD-001 es el hallazgo crítico del informe y hoy se sostiene sobre una
 * proyección analítica: se afirma que `getProgresoClaseCompleta` sufre
 * truncamiento silencioso al superar el límite por defecto de PostgREST, sin
 * que ello produzca error alguno.
 *
 * Este script reproduce literalmente la consulta del servicio auditado
 * (src/services/docente.service.js:45) contra datos reales y compara:
 *
 *   filas_esperadas  = estudiantes x actividades  (recuento por el servicio)
 *   filas_recibidas  = lo que efectivamente devuelve la consulta del cliente
 *
 * Si filas_recibidas < filas_esperadas y no hubo error, el truncamiento
 * silencioso queda demostrado empíricamente y AUD-001 deja de ser proyección.
 *
 * Mide además la latencia, insumo para AUD-003.
 *
 * Uso: node 05_truncamiento_aud001.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'node:fs'

const BASE_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54321'
const ANON_KEY = process.env.SUPABASE_ANON_KEY
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!ANON_KEY || !SERVICE_KEY) {
  console.error('Faltan SUPABASE_ANON_KEY y/o SUPABASE_SERVICE_ROLE_KEY.')
  process.exit(1)
}

const usuarios = JSON.parse(
  readFileSync(new URL('../resultados/usuarios.json', import.meta.url)),
)
const datos = JSON.parse(
  readFileSync(new URL('../resultados/datos.json', import.meta.url)),
)

// Recuento de referencia con service_role: no lo filtra RLS ni el límite del cliente.
const admin = createClient(BASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// Sesión de docente real: reproduce las condiciones del panel auditado.
const docente = createClient(BASE_URL, ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})
const { error: loginErr } = await docente.auth.signInWithPassword({
  email: usuarios.docente_a.email, password: usuarios.docente_a.password,
})
if (loginErr) { console.error(`login docente: ${loginErr.message}`); process.exit(1) }

// --- Réplica exacta de getProgresoClaseCompleta ------------------------------
const { data: inscripciones, error: ie } = await docente
  .from('inscripciones').select('estudiante_id').eq('clase_id', datos.clase_a)
if (ie) { console.error(`inscripciones: ${ie.message}`); process.exit(1) }

const estudianteIds = (inscripciones || []).map(i => i.estudiante_id)
const allActIds = datos.actividades

console.log(`Estudiantes en la clase: ${estudianteIds.length}`)
console.log(`Actividades en el libro: ${allActIds.length}`)
console.log(`Producto (filas que la vista necesita): ${estudianteIds.length * allActIds.length}`)

// Verdad de referencia, sin el límite implícito del cliente.
const { count: realCount, error: ce } = await admin
  .from('respuestas')
  .select('id', { count: 'exact', head: true })
  .in('usuario_id', estudianteIds)
  .in('actividad_id', allActIds)
if (ce) { console.error(`recuento: ${ce.message}`); process.exit(1) }

// La consulta tal y como la emite el servicio auditado: sin range ni limit.
const t0 = performance.now()
const { data: respuestas, error: re } = await docente
  .from('respuestas')
  .select('usuario_id, actividad_id, respuesta, es_correcta')
  .in('usuario_id', estudianteIds)
  .in('actividad_id', allActIds)
const latencia = Math.round(performance.now() - t0)

const recibidas = respuestas?.length ?? 0
const truncado = !re && recibidas < realCount

// Longitud de la URL: el tercer factor descrito en AUD-001.
const urlAprox = `${URL}/rest/v1/respuestas?select=usuario_id,actividad_id,respuesta,es_correcta`
  + `&usuario_id=in.(${estudianteIds.join(',')})`
  + `&actividad_id=in.(${allActIds.join(',')})`

console.log(`\n${'='.repeat(72)}`)
console.log(`Filas existentes (service_role):  ${realCount}`)
console.log(`Filas devueltas al docente:       ${recibidas}`)
console.log(`Error devuelto:                   ${re ? `${re.code} ${re.message}` : 'ninguno'}`)
console.log(`Latencia de la consulta:          ${latencia} ms`)
console.log(`Longitud de la URL:               ${urlAprox.length} caracteres`)
console.log(`\nTRUNCAMIENTO SILENCIOSO: ${truncado ? 'CONFIRMADO' : 'no observado a este volumen'}`)
if (truncado) {
  console.log(`  Se perdieron ${realCount - recibidas} filas sin error alguno.`)
  console.log('  El docente vería un panel de progreso incompleto y sin aviso.')
}

writeFileSync(
  new URL('../resultados/aud001_truncamiento.json', import.meta.url),
  JSON.stringify({
    fecha: new Date().toISOString(),
    estudiantes: estudianteIds.length,
    actividades: allActIds.length,
    producto: estudianteIds.length * allActIds.length,
    filas_existentes: realCount,
    filas_recibidas: recibidas,
    filas_perdidas: realCount - recibidas,
    error: re ? `${re.code} ${re.message}` : null,
    latencia_ms: latencia,
    longitud_url: urlAprox.length,
    truncamiento_confirmado: truncado,
  }, null, 2),
)
console.log('\n-> resultados/aud001_truncamiento.json')
