#!/usr/bin/env node
/**
 * Fase 2 — Auditoría dinámica. Paso 6: evasión del control de tasa (AUD-002).
 *
 * AUD-002 afirma que el límite por dispositivo de la función `prevalidar-token`
 * es evadible porque se calcula sobre `x-device-id`, un encabezado que el
 * cliente controla. Hoy el hallazgo se sostiene por lectura del código.
 *
 * Este script lo somete a prueba en tres escenarios contra la función servida
 * localmente:
 *
 *   A. device-id FIJO     -> el límite declarado (10/hora) debe activarse
 *   B. device-id ROTATIVO -> si no se activa nunca, la evasión queda demostrada
 *   C. user-agent ROTATIVO-> segundo eje del mismo hash
 *
 * Contraste entre A y B: si A se bloquea y B no, el control es evadible por
 * diseño y AUD-002 pasa de argumentado a demostrado.
 *
 * Nota de alcance: se ejecuta EXCLUSIVAMENTE contra 127.0.0.1. No se dirige
 * tráfico alguno a producción.
 *
 * Uso: node 06_rate_limit_aud002.mjs
 */
import { writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

const BASE = process.env.SUPABASE_URL || 'http://127.0.0.1:54321'
const ANON_KEY = process.env.SUPABASE_ANON_KEY
if (!ANON_KEY) {
  console.error('Falta SUPABASE_ANON_KEY (ver salida de `supabase start`).')
  process.exit(1)
}
if (!BASE.includes('127.0.0.1') && !BASE.includes('localhost')) {
  console.error(`Rechazado: este script sólo opera contra localhost. Recibido: ${BASE}`)
  process.exit(1)
}

const ENDPOINT = `${BASE}/functions/v1/prevalidar-token`
const INTENTOS = Number(process.env.INTENTOS || 25)

/** Token sintético con el formato de fase 12 (Crockford Base32, 10 caracteres). */
function tokenFalso() {
  const alfabeto = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
  return Array.from({ length: 10 }, () => alfabeto[Math.floor(Math.random() * 32)]).join('')
}

async function intentar({ deviceId, userAgent }) {
  const headers = {
    'Content-Type': 'application/json',
    apikey: ANON_KEY,
    Authorization: `Bearer ${ANON_KEY}`,
  }
  if (deviceId) headers['x-device-id'] = deviceId
  if (userAgent) headers['user-agent'] = userAgent
  try {
    const r = await fetch(ENDPOINT, {
      method: 'POST', headers, body: JSON.stringify({ token: tokenFalso() }),
    })
    const cuerpo = await r.json().catch(() => ({}))
    return { status: r.status, motivo: cuerpo?.motivo ?? null }
  } catch (e) {
    return { status: 0, motivo: `red: ${e.message}` }
  }
}

/** Ejecuta un escenario en serie y detecta en qué intento aparece el bloqueo. */
async function escenario(nombre, generador) {
  const registros = []
  let primerBloqueo = null
  for (let i = 1; i <= INTENTOS; i++) {
    const r = await intentar(generador(i))
    registros.push({ intento: i, ...r })
    const bloqueado = r.motivo === 'demasiados_intentos' || r.status === 429
    if (bloqueado && primerBloqueo === null) primerBloqueo = i
  }
  const bloqueados = registros.filter(r => r.motivo === 'demasiados_intentos' || r.status === 429).length
  console.log(`\n--- ${nombre} ---`)
  console.log(`  intentos:         ${INTENTOS}`)
  console.log(`  bloqueados:       ${bloqueados}`)
  console.log(`  primer bloqueo:   ${primerBloqueo ?? 'NINGUNO'}`)
  return { nombre, intentos: INTENTOS, bloqueados, primer_bloqueo: primerBloqueo, registros }
}

console.log(`Objetivo: ${ENDPOINT}`)
console.log(`Intentos por escenario: ${INTENTOS}`)

// A — Control: un único dispositivo. El límite declarado debe activarse.
const fijo = randomUUID()
const uaFijo = 'AuditoriaLibelula/1.0'
const escA = await escenario('A. device-id FIJO (control)',
  () => ({ deviceId: fijo, userAgent: uaFijo }))

// B — Rotación de device-id: el vector descrito en AUD-002.
const escB = await escenario('B. device-id ROTATIVO (evasión propuesta)',
  () => ({ deviceId: randomUUID(), userAgent: uaFijo }))

// C — Rotación de user-agent: segundo componente del mismo hash.
const escC = await escenario('C. user-agent ROTATIVO',
  i => ({ deviceId: fijo, userAgent: `AuditoriaLibelula/1.0 build-${i}-${randomUUID().slice(0, 8)}` }))

const evasionDemostrada = escA.primer_bloqueo !== null && escB.primer_bloqueo === null

console.log(`\n${'='.repeat(72)}`)
console.log(`Control (A) se bloquea:          ${escA.primer_bloqueo !== null ? `sí, en el intento ${escA.primer_bloqueo}` : 'no'}`)
console.log(`Rotación (B) se bloquea:         ${escB.primer_bloqueo !== null ? `sí, en el intento ${escB.primer_bloqueo}` : 'NO'}`)
console.log(`\nEVASIÓN DEL LÍMITE POR DISPOSITIVO: ${evasionDemostrada ? 'CONFIRMADA' : 'no demostrada en esta ejecución'}`)
if (!evasionDemostrada && escA.primer_bloqueo === null) {
  console.log('  Aviso: el control tampoco se bloqueó. Verificar que el límite esté')
  console.log('  activo en el entorno local antes de concluir nada sobre AUD-002.')
}

writeFileSync(
  new URL('../resultados/aud002_rate_limit.json', import.meta.url),
  JSON.stringify({
    fecha: new Date().toISOString(),
    endpoint: ENDPOINT,
    evasion_demostrada: evasionDemostrada,
    escenarios: [escA, escB, escC],
  }, null, 2),
)
console.log('\n-> resultados/aud002_rate_limit.json')
