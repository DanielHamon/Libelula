import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { entornoLocal } from './entorno-local.mjs'

const url = entornoLocal()
const opts = { auth: { persistSession: false, autoRefreshToken: false } }
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, opts)
const user = createClient(url, process.env.SUPABASE_ANON_KEY, opts)
const check = ({ data, error }) => { assert.ifError(error); return data }
let id
try {
  const email = `fase5-${randomBytes(8).toString('hex')}@auditoria.local`
  const data = check(await user.auth.signUp({ email, password: randomBytes(24).toString('base64url'),
    options: { data: { nombre: 'Prueba de registro', rol: 'admin', es_superadmin: true, escuela: 'Escuela inyectada' } } }))
  id = data.user.id
  const rows = check(await admin.from('profiles').select('id,nombre,email,rol,escuela,escuela_id').eq('id', id))
  assert.equal(rows.length, 1, 'Registro debe crear exactamente un perfil')
  assert.equal(rows[0].nombre, 'Prueba de registro')
  assert.equal(rows[0].email, email)
  assert.equal(rows[0].rol, 'estudiante', 'Metadatos no deben elevar rol')
  assert.equal(check(await admin.from('superadministradores').select('usuario_id').eq('usuario_id', id)).length, 0)
  assert.equal(rows[0].escuela, null)
  assert.equal(rows[0].escuela_id, null)
  assert.ok(data.session, 'El entorno local debe permitir sesión de prueba')
  assert.equal(check(await user.from('profiles').select('id').eq('id', id)).length, 1)
  console.log('PASS: signup real local crea un perfil; conserva nombre/email; ignora rol/admin/escuela del cliente; lectura propia permitida.')
} finally {
  if (id) check(await admin.auth.admin.deleteUser(id))
}
