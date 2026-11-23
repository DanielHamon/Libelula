#!/usr/bin/env node
// Prueba integral en la réplica local. Crea y elimina únicamente sus fixtures.
import assert from 'node:assert/strict'
import { createHmac, randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { localCredentials } from './local-replica-credentials.mjs'

const TONE = '/tmp/iabooks-narracion-test.mp3'
function jwt(secret, id, aal = 'aal1') {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url')
  const header = encode({ alg: 'HS256', typ: 'JWT' })
  const payload = encode({ aud: 'authenticated', role: 'authenticated', sub: id, aal,
    exp: Math.floor(Date.now() / 1000) + 3600, iat: Math.floor(Date.now() / 1000) })
  return `${header}.${payload}.${createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url')}`
}
function userClient(c, id, aal) {
  return createClient(c.API_URL, c.ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${jwt(c.JWT_SECRET, id, aal)}` } },
  })
}
function verifyBrowser(c, bookId, studentId) {
  const cli = process.env.AGENT_BROWSER_BIN
  if (!cli) return
  const session = 'iabooks_voice_student'
  const browser = (...args) => execFileSync(cli, ['--session', session, ...args],
    { encoding: 'utf8', timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'] })
  const now = Math.floor(Date.now() / 1000)
  const token = jwt(c.JWT_SECRET, studentId)
  const auth = { access_token: token, token_type: 'bearer', expires_in: 3600,
    expires_at: now + 3600, refresh_token: 'local-fixture',
    user: { id: studentId, aud: 'authenticated', role: 'authenticated',
      app_metadata: {}, user_metadata: {} } }
  browser('open', 'http://127.0.0.1:5173/login')
  browser('storage', 'local', 'set', 'sb-127-auth-token', JSON.stringify(auth))
  browser('set', 'viewport', '390', '844')
  browser('open', `http://127.0.0.1:5173/libro/${bookId}`)
  browser('wait', '--text', 'Lector de voz', '--timeout', '15000')
  browser('find', 'role', 'button', 'click', '--name', 'Reproducir')
  browser('wait', '--text', 'Leyendo la portada', '--timeout', '5000')
  browser('find', 'role', 'button', 'click', '--name', 'Pausar')
  browser('wait', '--text', 'Pausado en la portada', '--timeout', '5000')
  browser('select', '.voice-reader__speed select', '1.25')
  browser('find', 'role', 'button', 'click', '--name', 'Continuar')
  browser('wait', '--text', 'Leyendo la portada', '--timeout', '5000')
  assert.match(browser('snapshot'), /1,25×/)
  console.log('Navegador móvil local: reproducción, pausa, continuación y velocidad comprobadas')
}
function verifyBrowserDisabled() {
  const cli = process.env.AGENT_BROWSER_BIN
  if (!cli) return
  const args = ['--session', 'iabooks_voice_student']
  execFileSync(cli, [...args, 'wait', '--fn', "!document.body.innerText.includes('Lector de voz')", '--timeout', '10000'],
    { timeout: 15000, stdio: ['ignore', 'pipe', 'pipe'] })
}
function verifyAdminBrowser(c, bookId, adminId) {
  const cli = process.env.AGENT_BROWSER_BIN
  if (!cli) return
  const session = 'iabooks_voice_admin_test'
  const browser = (...args) => execFileSync(cli, ['--session', session, ...args],
    { encoding: 'utf8', timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'] })
  const now = Math.floor(Date.now() / 1000)
  const auth = { access_token: jwt(c.JWT_SECRET, adminId), token_type: 'bearer',
    expires_in: 3600, expires_at: now + 3600, refresh_token: 'local-fixture',
    user: { id: adminId, aud: 'authenticated', role: 'authenticated',
      app_metadata: {}, user_metadata: {} } }
  browser('open', 'http://127.0.0.1:5173/login')
  browser('storage', 'local', 'set', 'sb-127-auth-token', JSON.stringify(auth))
  browser('open', `http://127.0.0.1:5173/admin/libros/${bookId}/narracion`)
  browser('wait', '[data-page-row="2"]', '--timeout', '15000')
  browser('upload', 'input[data-upload-page="2"]', TONE)
  browser('wait', '--fn', "document.querySelector('[data-page-row=\"2\"]')?.innerText.includes('MP3 listo')", '--timeout', '15000')
  browser('eval', 'window.confirm = () => true')
  browser('scrollintoview', '[data-page-row="2"] button[aria-label="Eliminar MP3 de página 2"]')
  browser('click', '[data-page-row="2"] button[aria-label="Eliminar MP3 de página 2"]')
  browser('wait', '--fn', "document.querySelector('[data-page-row=\"2\"]')?.innerText.includes('Pendiente')", '--timeout', '15000')
  browser('scrollintoview', '[data-page-row="2"] button[aria-label="Marcar página 2 sin narración"]')
  browser('click', '[data-page-row="2"] button[aria-label="Marcar página 2 sin narración"]')
  browser('wait', '--fn', "document.querySelector('[data-page-row=\"2\"]')?.innerText.includes('Sin narración')", '--timeout', '15000')
  console.log('Panel local: carga, eliminación y marcado sin narración comprobados en navegador')
}
function requestInBrowser(bookId) {
  const cli = process.env.AGENT_BROWSER_BIN
  if (!cli) return false
  const browser = (...args) => execFileSync(cli, ['--session', 'iabooks_voice_admin_test', ...args],
    { encoding: 'utf8', timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'] })
  browser('open', `http://127.0.0.1:5173/admin/libros/${bookId}/narracion`)
  browser('wait', '--text', 'Solicitar habilitación', '--timeout', '15000')
  browser('find', 'role', 'button', 'click', '--name', 'Solicitar habilitación')
  browser('wait', '--text', 'Solicitud enviada', '--timeout', '10000')
  return true
}
function rejectInBrowser(c, superId, bookTitle) {
  const cli = process.env.AGENT_BROWSER_BIN
  if (!cli) return false
  const session = 'iabooks_voice_super'
  const browser = (...args) => execFileSync(cli, ['--session', session, ...args],
    { encoding: 'utf8', timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'] })
  const now = Math.floor(Date.now()/1000)
  const auth = { access_token: jwt(c.JWT_SECRET,superId,'aal2'), token_type: 'bearer',
    expires_in: 3600, expires_at: now+3600, refresh_token: 'local-fixture',
    user: { id:superId,aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{} } }
  browser('open','http://127.0.0.1:5173/login')
  browser('storage','local','set','sb-127-auth-token',JSON.stringify(auth))
  browser('open','http://127.0.0.1:5173/admin/aprobaciones')
  browser('wait','--text',bookTitle,'--timeout','15000')
  assert.match(browser('snapshot'),/Cambiar narración de libro/)
  browser('find','role','button','click','--name','Rechazar')
  browser('wait','--text','Sin solicitudes','--timeout','10000')
  console.log('Aprobaciones locales: solicitud y rechazo comprobados desde el panel')
  return true
}
function approveInBrowser(bookTitle) {
  const cli = process.env.AGENT_BROWSER_BIN
  if (!cli) return false
  const browser = (...args) => execFileSync(cli, ['--session','iabooks_voice_super',...args],
    { encoding:'utf8',timeout:30000,stdio:['ignore','pipe','pipe'] })
  browser('open','http://127.0.0.1:5173/admin/aprobaciones')
  browser('wait','--text',bookTitle,'--timeout','15000')
  browser('find','role','button','click','--name','Aprobar')
  browser('wait','--text','Sin solicitudes','--timeout','10000')
  console.log('Aprobaciones locales: aprobación del superadmin comprobada desde el panel')
  return true
}
async function rpc(client, name, params, shouldFail = false) {
  const { data, error } = await client.rpc(name, params)
  if (shouldFail) { assert.ok(error, `${name} debía fallar`); return error }
  assert.ifError(error)
  return data
}
async function rows(query) {
  const { data, error } = await query
  assert.ifError(error)
  return data
}
async function main() {
  const c = localCredentials()
  const admin = createClient(c.API_URL, c.SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  if (!existsSync(TONE)) execFileSync('gst-launch-1.0', ['-q','audiotestsrc','wave=sine',
    'num-buffers=100','!','audioconvert','!','lamemp3enc','!','filesink',`location=${TONE}`])
  const tone = readFileSync(TONE)
  assert.ok(tone.length > 2048 && tone.length < 10485760)
  const supers = await rows(admin.from('superadministradores').select('usuario_id').eq('activo', true))
  assert.ok(supers.length > 0)
  const profiles = await rows(admin.from('profiles').select('id,rol,email').eq('rol', 'admin'))
  const operator = profiles.find(p => p.id !== supers[0].usuario_id && p.email?.includes('example'))
  assert.ok(operator, 'Falta un administrador ficticio independiente')
  const actor = userClient(c, operator.id)
  const superAal2 = userClient(c, supers[0].usuario_id, 'aal2')
  const superAal1 = userClient(c, supers[0].usuario_id)
  const outsider = userClient(c, randomUUID())
  const activations = await rows(admin.from('libro_activaciones').select('libro_id,usuario_id').limit(1000))
  const books = await rows(admin.from('libros').select('id,titulo,pdf_url,narracion_habilitada,narracion_revision,activo')
    .eq('activo', true).not('pdf_url', 'is', null))
  const candidates = books.filter(b => b.id !== 'roja_como_un_tomate' && !b.narracion_habilitada
    && activations.some(a => a.libro_id === b.id))
  const selected = []
  for (const book of candidates) {
    const existing = await rows(admin.from('narraciones_libro').select('id').eq('libro_id',book.id))
    if (!existing.length) selected.push(book)
    if (selected.length === 2) break
  }
  assert.equal(selected.length, 2, 'Faltan dos libros ficticios libres para verificar independencia')
  const made = []
  const actions = []
  const paths = []
  try {
    for (const book of selected) {
      const studentId = activations.find(a => a.libro_id === book.id).usuario_id
      const student = userClient(c, studentId)
      const pdfDownload = await admin.storage.from('libros').download(book.pdf_url)
      assert.ifError(pdfDownload.error)
      const pdf = await getDocument({ data: await pdfDownload.data.arrayBuffer() }).promise
      const pageCount = pdf.numPages
      await pdf.destroy()
      assert.ok(pageCount > 1 && pageCount < 2000)
      const version = await rpc(actor,'admin_narracion_crear_borrador',
        { p_libro_id:book.id, p_total_paginas:pageCount })
      made.push({ book, version })
      assert.equal(await rpc(actor,'narracion_version_valida',{ p_id:version }), false)
      await rpc(student,'admin_narracion_crear_borrador',
        { p_libro_id:book.id,p_total_paginas:pageCount },true)
      const abandoned = await rpc(actor,'admin_narracion_reservar_carga',
        { p_narracion_id:version,p_pagina:1 })
      await rpc(actor,'admin_narracion_confirmar_carga',{ p_path:abandoned,p_duracion:2 },true)
      assert.ifError((await admin.from('narracion_cargas').update({
        creada_en:new Date(Date.now()-2*3600*1000).toISOString(),
      }).eq('path',abandoned)).error)
      const abandonedList = await rpc(actor,'admin_narracion_archivos_huerfanos',{ p_libro_id:book.id })
      assert.ok(abandonedList.includes(abandoned))
      await rpc(actor,'admin_narracion_olvidar_carga',{ p_path:abandoned })
      const path = await rpc(actor,'admin_narracion_reservar_carga',
        { p_narracion_id:version,p_pagina:1 })
      const collision = await rpc(superAal1,'admin_narracion_reservar_carga',
        { p_narracion_id:version,p_pagina:1 })
      paths.push(path)
      paths.push(collision)
      const uploaded = await actor.storage.from('audiobooks').upload(path,tone,
        { contentType:'audio/mpeg',upsert:false })
      assert.ifError(uploaded.error)
      assert.ifError((await superAal1.storage.from('audiobooks').upload(collision,tone,
        { contentType:'audio/mpeg',upsert:false })).error)
      await rpc(actor,'admin_narracion_confirmar_carga',{ p_path:path,p_duracion:2.5 })
      const collisionError = await rpc(superAal1,'admin_narracion_confirmar_carga',
        { p_path:collision,p_duracion:2.5 },true)
      assert.match(collisionError.message,/pagina_modificada_por_otro_admin/)
      assert.ifError((await superAal1.storage.from('audiobooks').remove([collision])).error)
      await rpc(superAal1,'admin_narracion_olvidar_carga',{ p_path:collision })
      for (let page=2;page<=pageCount;page++) {
        await rpc(actor,'admin_narracion_cambiar_pagina',
          { p_narracion_id:version,p_pagina:page,p_estado:'skipped' })
      }
      if (made.length === 1) verifyAdminBrowser(c, book.id, operator.id)
      assert.equal(await rpc(actor,'narracion_version_valida',{ p_id:version }),true)
      await rpc(actor,'admin_narracion_publicar',{ p_narracion_id:version })
      const before = await rows(student.from('narraciones_libro').select('id').eq('libro_id',book.id))
      assert.equal(before.length,0,'Un libro deshabilitado expuso narración')
      assert.equal((await rows(student.from('narraciones_pagina').select('pagina_pdf').eq('libro_id',book.id))).length,0)
      assert.ok((await student.from('libros').update({narracion_habilitada:true}).eq('id',book.id)).error)
      assert.ok((await actor.from('libros').update({narracion_habilitada:true}).eq('id',book.id)).error)
      assert.ok((await actor.from('narraciones_libro').update({estado:'published'}).eq('id',version)).error)
      assert.ok((await actor.storage.from('audiobooks').upload(`${book.id}/sin-reserva.mp3`,tone,
        { contentType:'audio/mpeg',upsert:false })).error)
      const blocked = await student.storage.from('audiobooks').createSignedUrl(path,60)
      assert.ok(blocked.error,'Se pudo firmar audio deshabilitado')
      let request
      if (made.length === 1 && requestInBrowser(book.id)) {
        const pending = await rows(admin.from('acciones_admin_pendientes').select('id')
          .eq('tipo','cambiar_narracion_libro').eq('estado','pendiente')
          .eq('payload->>libro_id',book.id))
        assert.equal(pending.length,1)
        request = pending[0]
      } else {
        request = await rpc(actor,'admin_narracion_solicitar_estado',
          { p_libro_id:book.id,p_habilitar:true })
      }
      actions.push(request.id)
      const requestPayload = await rows(admin.from('acciones_admin_pendientes').select('payload').eq('id',request.id))
      assert.equal(requestPayload[0].payload.pdf_total_paginas,pageCount)
      assert.equal(requestPayload[0].payload.audios_listos,1)
      assert.equal(requestPayload[0].payload.paginas_omitidas,pageCount-1)
      await rpc(superAal2,'superadmin_resolver_accion_v3_anterior',
        { p_accion_id:request.id,p_aprobar:true },true)
      await rpc(actor,'admin_narracion_solicitar_estado',
        { p_libro_id:book.id,p_habilitar:true },true)
      await rpc(superAal1,'superadmin_resolver_accion_v3',
        { p_accion_id:request.id,p_aprobar:true },true)
      if (!(made.length === 1 && rejectInBrowser(c,supers[0].usuario_id,book.titulo))) {
        await rpc(superAal2,'superadmin_resolver_accion_v3',
          { p_accion_id:request.id,p_aprobar:false })
      }
      const afterReject = await rows(admin.from('libros').select('narracion_habilitada').eq('id',book.id))
      assert.equal(afterReject[0].narracion_habilitada,false)
      const request2 = await rpc(actor,'admin_narracion_solicitar_estado',
        { p_libro_id:book.id,p_habilitar:true })
      actions.push(request2.id)
      if (!(made.length === 1 && approveInBrowser(book.titulo))) {
        await rpc(superAal2,'superadmin_resolver_accion_v3',
          { p_accion_id:request2.id,p_aprobar:true })
      }
      const visible = await rows(student.from('narraciones_libro').select('id').eq('libro_id',book.id))
      assert.equal(visible.length,1)
      if (made.length === 1) verifyBrowser(c, book.id, studentId)
      const signed = await student.storage.from('audiobooks').createSignedUrl(path,60)
      assert.ifError(signed.error)
      await actor.storage.from('audiobooks').remove([path])
      const protectedFile = await admin.storage.from('audiobooks').download(path)
      assert.ifError(protectedFile.error)
      assert.equal(protectedFile.data.size,tone.length,'Un administrador borró el MP3 publicado')
      const audio = await fetch(signed.data.signedUrl)
      assert.equal(audio.status,200)
      const denied = await outsider.storage.from('audiobooks').createSignedUrl(path,60)
      assert.ok(denied.error)
      if (made.length === 1) {
        const newer = await rpc(actor,'admin_narracion_crear_borrador',
          { p_libro_id:book.id,p_total_paginas:pageCount })
        const newPath = await rpc(actor,'admin_narracion_reservar_carga',
          { p_narracion_id:newer,p_pagina:1 })
        paths.push(newPath)
        assert.ifError((await actor.storage.from('audiobooks').upload(newPath,tone,
          { contentType:'audio/mpeg',upsert:false })).error)
        await rpc(actor,'admin_narracion_confirmar_carga',{ p_path:newPath,p_duracion:2.5 })
        assert.equal(await rpc(actor,'narracion_version_valida',{ p_id:newer }),true)
        const stillOld = await rows(admin.from('narraciones_libro').select('id,estado').eq('libro_id',book.id).eq('estado','published'))
        assert.equal(stillOld[0].id,version)
        await rpc(actor,'admin_narracion_publicar',{ p_narracion_id:newer })
        const nowPublished = await rows(student.from('narraciones_libro').select('id').eq('libro_id',book.id))
        assert.equal(nowPublished[0].id,newer)
        assert.ok((await student.storage.from('audiobooks').createSignedUrl(path,60)).error)
        await rpc(actor,'admin_narracion_cambiar_pagina',
          { p_narracion_id:newer,p_pagina:1,p_estado:'pending' },true)
      }
      const request3 = await rpc(actor,'admin_narracion_solicitar_estado',
        { p_libro_id:book.id,p_habilitar:false })
      actions.push(request3.id)
      await rpc(superAal2,'superadmin_resolver_accion_v3',
        { p_accion_id:request3.id,p_aprobar:true })
      if (made.length === 1) {
        const previouslySigned = await fetch(signed.data.signedUrl)
        console.log(`URL firmada antes de deshabilitar: HTTP ${previouslySigned.status} en réplica local`)
      }
      if (made.length === 1) verifyBrowserDisabled()
      const hidden = await rows(student.from('narraciones_libro').select('id').eq('libro_id',book.id))
      assert.equal(hidden.length,0)
      const noSign = await student.storage.from('audiobooks').createSignedUrl(path,60)
      assert.ok(noSign.error)
    }
    const first = made[0]
    const next = await rpc(actor,'admin_narracion_crear_borrador',
      { p_libro_id:first.book.id,p_total_paginas:
        (await rows(admin.from('narraciones_libro').select('pdf_total_pages').eq('id',first.version)))[0].pdf_total_pages })
    made.push({ book:first.book,version:next })
    const replacement = await rpc(actor,'admin_narracion_reservar_carga',
      { p_narracion_id:next,p_pagina:1 })
    paths.push(replacement)
    assert.ifError((await actor.storage.from('audiobooks').upload(replacement,tone,
      { contentType:'audio/mpeg',upsert:false })).error)
    await rpc(actor,'admin_narracion_confirmar_carga',{ p_path:replacement,p_duracion:2.5 })
    const old = await rows(admin.from('narraciones_pagina').select('storage_path')
      .eq('narracion_id',first.version).eq('pagina_pdf',1))
    assert.notEqual(old[0].storage_path,replacement,'Reemplazo alteró versión publicada')
    await rpc(actor,'admin_narracion_cambiar_pagina',
      { p_narracion_id:next,p_pagina:1,p_estado:'pending' })
    assert.equal(await rpc(actor,'narracion_version_valida',{ p_id:next }),false)
    await rpc(actor,'admin_narracion_descartar_borrador',{ p_narracion_id:next })
    const orphanPaths = await rpc(actor,'admin_narracion_archivos_huerfanos',
      { p_libro_id:first.book.id })
    assert.ok(orphanPaths.includes(replacement))
    assert.ifError((await actor.storage.from('audiobooks').remove([replacement])).error)
    await rpc(actor,'admin_narracion_olvidar_carga',{ p_path:replacement })
    made.pop()
    const stale = await rpc(actor,'admin_narracion_solicitar_estado',
      { p_libro_id:first.book.id,p_habilitar:true })
    actions.push(stale.id)
    const current = await rows(admin.from('libros').select('narracion_revision').eq('id',first.book.id))
    assert.ifError((await admin.from('libros').update({ narracion_revision:current[0].narracion_revision+1 })
      .eq('id',first.book.id)).error)
    const staleError = await rpc(superAal2,'superadmin_resolver_accion_v3',
      { p_accion_id:stale.id,p_aprobar:true },true)
    assert.match(staleError.message,/obsoleta/)
    console.log('Narraciones locales: dos libros, borrador, MP3, publicación, aprobación/rechazo, MFA, permisos, reemplazo, conflicto simultáneo y solicitud obsoleta verificados')
  } finally {
    // Limpia solamente registros y objetos de los dos libros de prueba.
    if (actions.length) assert.ifError((await admin.from('acciones_admin_pendientes').delete().in('id',actions)).error)
    for (const book of selected) {
      const versions = await rows(admin.from('narraciones_libro').select('id').eq('libro_id',book.id))
      if (versions.length) {
        const reservations = await rows(admin.from('narracion_cargas').select('path').in('narracion_id',versions.map(v=>v.id)))
        paths.push(...reservations.map(r=>r.path))
      }
      assert.ifError((await admin.from('narraciones_libro').delete().eq('libro_id',book.id)).error)
      assert.ifError((await admin.from('libros').update({ narracion_habilitada:book.narracion_habilitada,
        narracion_revision:book.narracion_revision }).eq('id',book.id)).error)
    }
    if (paths.length) assert.ifError((await admin.storage.from('audiobooks').remove([...new Set(paths)])).error)
  }
}

main().catch(e => { console.error(`Verificación local falló: ${e.message}`); process.exitCode=1 })
