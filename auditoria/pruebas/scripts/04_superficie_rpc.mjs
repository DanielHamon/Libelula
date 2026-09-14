#!/usr/bin/env node
/**
 * Fase 2 — Auditoría dinámica. Paso 4: superficie de las RPC no invocadas.
 *
 * El informe estático señala que 40 de las 57 funciones definidas no se invocan
 * desde el cliente, y las califica como la superficie menos explorada del
 * sistema (sección 8.2). Este script determina cuáles son efectivamente
 * alcanzables por un usuario anónimo y por uno autenticado sin privilegios.
 *
 * El análisis estático de los GRANT sugiere que sólo `sesion_es_aal2` alcanza a
 * `anon` y 26 a `authenticated`. Aquí se contrasta esa lectura con el
 * comportamiento real de PostgREST.
 *
 * Interpretación de la respuesta:
 *   PGRST202 / 404  -> no expuesta o inexistente para ese rol
 *   42501           -> permiso denegado (el REVOKE surte efecto)
 *   otro error      -> la función SE EJECUTÓ y falló por argumentos: es alcanzable
 *   éxito           -> alcanzable y ejecutable
 *
 * Uso: node 04_superficie_rpc.mjs
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

// Las 40 funciones sin invocación desde el cliente, extraídas del esquema.
const RPC_NO_INVOCADAS = [
  'admin_solicitar_accion_sensible', 'auditar_actividad_admin',
  'bloquear_desactivacion_directa', 'campos_publicos_actividad',
  'campos_publicos_actividad_pre_acrostic', 'campos_publicos_actividad_pre_crossword',
  'campos_publicos_actividad_pre_matching', 'campos_publicos_actividad_pre_syllables',
  'consumir_limite_progreso', 'es_admin', 'evaluar_detalle_separar_silabas',
  'evaluar_respuesta_actividad', 'evaluar_respuesta_actividad_pre_acrostic',
  'evaluar_respuesta_actividad_pre_crossword', 'evaluar_respuesta_actividad_pre_syllables',
  'generar_token_10', 'generar_token_128', 'handle_new_user', 'is_admin',
  'is_docente_of', 'is_docente_of_clase', 'is_inscrito_en_clase',
  'marcar_archivos_accion_rechazada', 'normalizar_crucigrama_texto',
  'normalizar_respuesta_texto', 'normalizar_separacion_silabas',
  'prevalidar_token_anonimo', 'proteger_cambio_rol_aprobado', 'puede_acceder_libro',
  'puede_acceder_objeto_libro', 'registrar_archivo_libro_staging',
  'registrar_progreso_actividad_pre_phase6_final', 'rls_auto_enable',
  'sesion_es_aal2', 'superadmin_resolver_accion',
  'superadmin_resolver_accion_fase3_interna', 'superadmin_resolver_accion_v2',
  'validar_actividad_identificar', 'validar_payload_respuesta',
  'validar_publicacion_archivos_libro',
]

// Funciones de especial interés: generadoras de tokens y verificadoras de rol.
const CRITICAS = new Set([
  'generar_token_10', 'generar_token_128', 'prevalidar_token_anonimo',
  'es_admin', 'is_admin', 'sesion_es_aal2', 'superadmin_resolver_accion',
  'superadmin_resolver_accion_v2', 'consumir_limite_progreso',
])

function clasificar(error) {
  if (!error) return { estado: 'EJECUTADA', alcanzable: true }
  const code = error.code || ''
  if (code === 'PGRST202') return { estado: 'no_expuesta', alcanzable: false }
  if (code === '42501') return { estado: 'permiso_denegado', alcanzable: false }
  return { estado: `alcanzable (${code})`, alcanzable: true }
}

async function sondear(cliente, etiqueta) {
  const filas = []
  for (const fn of RPC_NO_INVOCADAS) {
    const { error } = await cliente.rpc(fn, {})
    const { estado, alcanzable } = clasificar(error)
    filas.push({
      funcion: fn, rol: etiqueta, estado, alcanzable,
      critica: CRITICAS.has(fn),
      detalle: error ? `${error.code || ''} ${error.message}`.trim().slice(0, 160) : '',
    })
  }
  return filas
}

console.log('Sondeando 40 funciones como rol `anon`...')
const anon = createClient(BASE_URL, ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})
const comoAnon = await sondear(anon, 'anon')

console.log('Sondeando 40 funciones como `authenticated` (estudiante)...')
const est = createClient(BASE_URL, ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})
const { error: loginErr } = await est.auth.signInWithPassword({
  email: usuarios.estudiante_a1.email, password: usuarios.estudiante_a1.password,
})
if (loginErr) { console.error(`login: ${loginErr.message}`); process.exit(1) }
const comoEst = await sondear(est, 'estudiante')

const todas = [...comoAnon, ...comoEst]
const alcanzables = todas.filter(f => f.alcanzable)
const criticasAlcanzables = alcanzables.filter(f => f.critica)

console.log(`\n${'='.repeat(72)}`)
console.log(`Alcanzables como anon:          ${comoAnon.filter(f => f.alcanzable).length} / 40`)
console.log(`Alcanzables como estudiante:    ${comoEst.filter(f => f.alcanzable).length} / 40`)

if (criticasAlcanzables.length) {
  console.log('\nFunciones sensibles alcanzables:')
  for (const f of criticasAlcanzables) {
    console.log(`  [${f.rol}] ${f.funcion}  ->  ${f.estado}`)
    if (f.detalle) console.log(`        ${f.detalle}`)
  }
} else {
  console.log('\nNinguna función sensible resultó alcanzable.')
}

writeFileSync(
  new URL('../resultados/superficie_rpc.json', import.meta.url),
  JSON.stringify({
    fecha: new Date().toISOString(),
    total_sondeadas: RPC_NO_INVOCADAS.length,
    alcanzables_anon: comoAnon.filter(f => f.alcanzable).length,
    alcanzables_estudiante: comoEst.filter(f => f.alcanzable).length,
    criticas_alcanzables: criticasAlcanzables.length,
    detalle: todas,
  }, null, 2),
)
console.log('\n-> resultados/superficie_rpc.json')
