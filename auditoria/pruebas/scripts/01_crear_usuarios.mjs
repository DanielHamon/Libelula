#!/usr/bin/env node
/**
 * Fase 2 — Auditoría dinámica. Paso 1: creación de usuarios de prueba.
 *
 * Crea un usuario real por cada rol del sistema mediante la API de administración
 * de GoTrue, de modo que `auth.uid()` devuelva un sujeto auténtico y las políticas
 * RLS se evalúen en las mismas condiciones que en ejecución.
 *
 * Todos los datos son sintéticos. No se emplea ningún dato personal real.
 *
 * Uso: node 01_crear_usuarios.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { writeFileSync } from 'node:fs'

const BASE_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54321'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SERVICE_KEY) {
  console.error('Falta SUPABASE_SERVICE_ROLE_KEY (ver salida de `supabase start`).')
  process.exit(1)
}

const admin = createClient(BASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// Dos escuelas distintas para poder probar aislamiento entre instituciones.
const USUARIOS = [
  { clave: 'estudiante_a1', email: 'est.a1@auditoria.local', rol: 'estudiante' },
  { clave: 'estudiante_a2', email: 'est.a2@auditoria.local', rol: 'estudiante' },
  { clave: 'estudiante_b1', email: 'est.b1@auditoria.local', rol: 'estudiante' },
  { clave: 'docente_a', email: 'doc.a@auditoria.local', rol: 'docente' },
  { clave: 'docente_b', email: 'doc.b@auditoria.local', rol: 'docente' },
  { clave: 'admin_a', email: 'adm.a@auditoria.local', rol: 'administrador' },
  { clave: 'superadmin', email: 'super@auditoria.local', rol: 'superadministrador' },
]

const PASSWORD = 'Auditoria.2026.Local!'

const creados = {}

for (const u of USUARIOS) {
  const { data, error } = await admin.auth.admin.createUser({
    email: u.email,
    password: PASSWORD,
    email_confirm: true,
  })
  if (error) {
    console.error(`ERROR creando ${u.clave}: ${error.message}`)
    continue
  }
  creados[u.clave] = { id: data.user.id, email: u.email, rol: u.rol, password: PASSWORD }
  console.log(`ok  ${u.clave.padEnd(16)} ${data.user.id}  ${u.rol}`)
}

writeFileSync(
  new URL('../resultados/usuarios.json', import.meta.url),
  JSON.stringify(creados, null, 2),
)
console.log(`\n${Object.keys(creados).length} usuarios creados -> resultados/usuarios.json`)
