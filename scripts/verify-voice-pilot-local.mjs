#!/usr/bin/env node

import assert from 'node:assert/strict'
import { createHmac, randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { localCredentials } from './local-replica-credentials.mjs'

const BOOK_ID = 'roja_como_un_tomate'

function jwt(secret, userId) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url')
  const header = encode({ alg: 'HS256', typ: 'JWT' })
  const payload = encode({ aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 600, iat: Math.floor(Date.now() / 1000), role: 'authenticated', sub: userId })
  const signature = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url')
  return `${header}.${payload}.${signature}`
}

function clientFor(credentials, userId) {
  return createClient(credentials.API_URL, credentials.ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${jwt(credentials.JWT_SECRET, userId)}` } },
  })
}

async function main() {
  const credentials = localCredentials()
  const admin = createClient(credentials.API_URL, credentials.SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: books, error: bookError } = await admin.from('narraciones_libro')
    .select('id, estado').eq('libro_id', BOOK_ID).eq('estado', 'published')
  assert.ifError(bookError)
  assert.equal(books.length, 1)
  const { data: pages, error: pageError } = await admin.from('narraciones_pagina')
    .select('pagina_pdf, storage_path').eq('narracion_id', books[0].id).eq('estado', 'ready')
  assert.ifError(pageError)
  assert.equal(pages.length, 1)
  const { data: buckets, error: bucketError } = await admin.storage.listBuckets()
  assert.ifError(bucketError)
  assert.equal(buckets.find(bucket => bucket.id === 'audiobooks')?.public, false)

  const { data: activations, error: activationError } = await admin.from('libro_activaciones')
    .select('usuario_id').eq('libro_id', BOOK_ID).limit(20)
  assert.ifError(activationError)
  assert.ok(activations.length > 0, 'Falta un usuario ficticio con activación local')

  let authorized = null
  for (const activation of activations) {
    const candidate = clientFor(credentials, activation.usuario_id)
    const { data, error } = await candidate.from('narraciones_pagina')
      .select('pagina_pdf').eq('libro_id', BOOK_ID)
    if (!error && data?.length === 1) { authorized = candidate; break }
  }
  assert.ok(authorized, 'No se encontró una activación local que pueda leer el audio')

  const { data: signed, error: signError } = await authorized.storage.from('audiobooks')
    .createSignedUrl(pages[0].storage_path, 60)
  assert.ifError(signError)
  assert.ok(signed?.signedUrl)
  const response = await fetch(signed.signedUrl)
  assert.equal(response.status, 200)
  assert.equal((await response.arrayBuffer()).byteLength, 48044)

  const denied = clientFor(credentials, randomUUID())
  const { data: deniedRows, error: deniedQueryError } = await denied.from('narraciones_pagina')
    .select('pagina_pdf').eq('libro_id', BOOK_ID)
  assert.ifError(deniedQueryError)
  assert.equal(deniedRows.length, 0)
  const { error: deniedSignError } = await denied.storage.from('audiobooks')
    .createSignedUrl(pages[0].storage_path, 60)
  assert.ok(deniedSignError, 'El usuario sin acceso pudo firmar el audio')

  console.log(`Piloto local verificado: ${BOOK_ID}; 1 página, bucket privado, firma y descarga autorizadas, lectura y firma denegadas sin acceso`)
}

main().catch(error => { console.error(`Verificación local falló: ${error.message}`); process.exitCode = 1 })
