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
    .select('id, version, estado, proveedor').eq('libro_id', BOOK_ID).order('version')
  assert.ifError(bookError)
  assert.ok(books.some(book => book.version === 1 && book.estado === 'archived'
    && book.proveedor === 'fixture_local'), 'Falta la versión técnica archivada')
  assert.ok(books.some(book => book.version === 2 && book.proveedor === 'elevenlabs'),
    'Falta la versión original de ElevenLabs')
  const published = books.filter(book => book.estado === 'published')
  assert.equal(published.length, 1, 'Debe existir una sola versión publicada')
  const current = published[0]
  const { data: pages, error: pageError } = await admin.from('narraciones_pagina')
    .select('pagina_pdf, storage_path, tamano_bytes, mime_type')
    .eq('narracion_id', current.id).eq('estado', 'ready').order('pagina_pdf')
  assert.ifError(pageError)
  assert.ok(pages.length > 0, 'La versión publicada no tiene páginas con MP3')
  assert.ok(pages.every(page => page.mime_type === 'audio/mpeg' && page.tamano_bytes > 2048))
  const { data: buckets, error: bucketError } = await admin.storage.listBuckets()
  assert.ifError(bucketError)
  assert.equal(buckets.find(bucket => bucket.id === 'audiobooks')?.public, false)

  const { data: activations, error: activationError } = await admin.from('libro_activaciones')
    .select('usuario_id').eq('libro_id', BOOK_ID).limit(20)
  assert.ifError(activationError)
  assert.ok(activations.length > 0, 'Falta un usuario ficticio con activación local')

  const { data: libro, error: libroError } = await admin.from('libros')
    .select('narracion_habilitada').eq('id', BOOK_ID).single()
  assert.ifError(libroError)
  const { data: versionValida, error: versionError } = await admin.rpc('narracion_version_valida', { p_id: current.id })
  assert.ifError(versionError)
  assert.equal(versionValida, true, 'La versión publicada no supera la validación de integridad')

  let authorized = null
  for (const activation of activations) {
    const candidate = clientFor(credentials, activation.usuario_id)
    const { data, error } = await candidate.rpc('puede_acceder_libro', { p_libro_id: BOOK_ID })
    if (!error && data) { authorized = candidate; break }
  }
  assert.ok(authorized, 'No se encontró una activación local con acceso al libro')

  for (const page of pages) {
    const { data: file, error: fileError } = await admin.storage.from('audiobooks').download(page.storage_path)
    assert.ifError(fileError)
    assert.equal(file.size, Number(page.tamano_bytes))
  }
  const { data: visibleRows, error: visibleError } = await authorized.from('narraciones_pagina')
    .select('pagina_pdf').eq('libro_id', BOOK_ID)
  assert.ifError(visibleError)
  if (libro.narracion_habilitada && versionValida) {
    assert.deepEqual(visibleRows.map(page => page.pagina_pdf), pages.map(page => page.pagina_pdf))
  } else {
    assert.equal(visibleRows.length, 0)
    const { error: blockedSign } = await authorized.storage.from('audiobooks')
      .createSignedUrl(pages[0].storage_path, 60)
    assert.ok(blockedSign, 'Un libro deshabilitado o incompleto permitió firmar audio')
  }

  const denied = clientFor(credentials, randomUUID())
  const { data: deniedRows, error: deniedQueryError } = await denied.from('narraciones_pagina')
    .select('pagina_pdf').eq('libro_id', BOOK_ID)
  assert.ifError(deniedQueryError)
  assert.equal(deniedRows.length, 0)
  const { error: deniedSignError } = await denied.storage.from('audiobooks')
    .createSignedUrl(pages[0].storage_path, 60)
  assert.ok(deniedSignError, 'El usuario sin acceso pudo firmar el audio')

  console.log(`Piloto local verificado: ${BOOK_ID}; versión ${current.version}, ${pages.length} MP3 privados; acceso estudiantil ${libro.narracion_habilitada && versionValida ? 'habilitado' : 'denegado por estado o integridad'}`)
}

main().catch(error => { console.error(`Verificación local falló: ${error.message}`); process.exitCode = 1 })
