#!/usr/bin/env node

// Generación administrativa de hasta cuatro páginas en la réplica local.
// La clave de ElevenLabs nunca se envía al frontend ni se escribe en Git.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { buildReport, readPdfPages } from './extract-pdf-report.mjs'
import { createSpeech, getSubscription, getVoiceSettings } from './elevenlabs-api.mjs'
import { localCredentials } from './local-replica-credentials.mjs'

const BOOK_ID = 'roja_como_un_tomate'
const VERSION = 2
const MODEL = 'eleven_multilingual_v2'
const FORMAT = 'mp3_44100_128'
const SECRET_FILE = '.env.elevenlabs.local'
const REVIEW_DIR = resolve('.reports/voice-pilot')

const hash = value => createHash('sha256').update(value).digest('hex')

function parseArgs(argv) {
  const [mode, ...rest] = argv
  if (!['plan', 'generate', 'publish'].includes(mode)) throw new Error('Uso: node scripts/elevenlabs-pilot.mjs plan|generate|publish [--pages 8,9,10,11]')
  let pages = [8, 9, 10, 11]
  for (let index = 0; index < rest.length; index += 1) {
    if (rest[index] !== '--pages' || !rest[index + 1]) throw new Error('Argumentos no válidos')
    pages = rest[++index].split(',').map(Number)
  }
  if (pages.length < 3 || pages.length > 4 || pages.some(page => !Number.isInteger(page) || page < 1) || new Set(pages).size !== pages.length) {
    throw new Error('El piloto acepta tres o cuatro páginas PDF distintas')
  }
  pages.sort((a, b) => a - b)
  if (pages.some((page, index) => index > 0 && page !== pages[index - 1] + 1)) throw new Error('Las páginas del piloto deben ser consecutivas')
  return { mode, pages }
}

function readElevenLabsConfig() {
  const values = {}
  if (existsSync(SECRET_FILE)) {
    if (statSync(SECRET_FILE).mode & 0o077) throw new Error(`${SECRET_FILE} debe tener permisos 600`)
    for (const raw of readFileSync(SECRET_FILE, 'utf8').split(/\r?\n/)) {
      const line = raw.trim()
      if (!line || line.startsWith('#')) continue
      const separator = line.indexOf('=')
      if (separator < 1) throw new Error(`Formato inválido en ${SECRET_FILE}`)
      values[line.slice(0, separator).trim()] = line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '')
    }
  }
  const apiKey = process.env.ELEVENLABS_API_KEY || values.ELEVENLABS_API_KEY
  const voiceId = process.env.ELEVENLABS_VOICE_ID || values.ELEVENLABS_VOICE_ID
  if (!apiKey || !voiceId) throw new Error(`Faltan ELEVENLABS_API_KEY y/o ELEVENLABS_VOICE_ID en ${SECRET_FILE}`)
  if (!/^[A-Za-z0-9]{10,64}$/.test(voiceId)) throw new Error('ELEVENLABS_VOICE_ID no tiene el formato esperado')
  return { apiKey, voiceId }
}

function audioDuration(buffer) {
  if (buffer.length < 2048) throw new Error('MP3 demasiado pequeño')
  let offset = 0
  if (buffer.toString('ascii', 0, 3) === 'ID3') {
    offset = 10 + ((buffer[6] & 0x7f) << 21) + ((buffer[7] & 0x7f) << 14) + ((buffer[8] & 0x7f) << 7) + (buffer[9] & 0x7f)
  }
  if (offset + 4 >= buffer.length || buffer[offset] !== 0xff || (buffer[offset + 1] & 0xe0) !== 0xe0) {
    throw new Error('La respuesta no contiene un MP3 válido')
  }
  // La salida solicitada es MP3 a 128 kbps. Se usa para metadato piloto.
  return Math.max(0.1, Math.round((buffer.length * 8 / 128_000) * 1000) / 1000)
}

function writePrivate(path, bytes) {
  mkdirSync(resolve(path, '..'), { recursive: true, mode: 0o700 })
  writeFileSync(path, bytes, { mode: 0o600, flag: 'wx' })
}

async function localBookReport(client) {
  const { data: book, error: bookError } = await client.from('libros').select('id,titulo,pdf_url').eq('id', BOOK_ID).single()
  if (bookError || !book?.pdf_url) throw new Error('PDF piloto no disponible en la réplica local')
  const { data: pdfBlob, error: pdfError } = await client.storage.from('libros').download(book.pdf_url)
  if (pdfError || !pdfBlob) throw new Error('No se pudo descargar el PDF piloto')
  const bytes = await pdfBlob.arrayBuffer()
  return buildReport({
    bookId: BOOK_ID,
    title: book.titulo,
    source: 'supabase-local',
    rawPages: await readPdfPages(bytes),
    includeText: true,
  })
}

function selectedPages(report, pages, strict = true) {
  return pages.map(number => {
    const page = report.paginas[number - 1]
    if (!page || page.pagina !== number) throw new Error(`Página PDF ${number} no disponible`)
    if (strict && (page.estado !== 'lista' || !page.texto)) throw new Error(`Página PDF ${number} requiere revisión antes de TTS (${page.estado})`)
    if (page.caracteres > 10_000) throw new Error(`Página PDF ${number} excede el límite de Multilingual v2`)
    return page
  })
}

function saveReview(pages) {
  mkdirSync(REVIEW_DIR, { recursive: true, mode: 0o700 })
  const path = resolve(REVIEW_DIR, 'texto-para-narrar.json')
  const content = JSON.stringify(pages.map(page => ({ pagina_pdf: page.pagina, texto_hash: page.texto_hash, texto: page.texto })), null, 2)
  writeFileSync(path, `${content}\n`, { mode: 0o600 })
  return path
}

async function getAdmin() {
  const credentials = localCredentials()
  return createClient(credentials.API_URL, credentials.SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

async function generate(client, pages) {
  const { apiKey, voiceId } = readElevenLabsConfig()
  const settings = await getVoiceSettings(apiKey, voiceId)
  const configHash = hash(JSON.stringify({ provider: 'elevenlabs', voiceId, model: MODEL, format: FORMAT, settings }))
  const pathFor = page => `${BOOK_ID}/v${String(VERSION).padStart(3, '0')}/pagina_${String(page.pagina).padStart(3, '0')}-${page.texto_hash.slice(0, 8)}-${configHash.slice(0, 8)}.mp3`
  const { data: existing, error: existingError } = await client.from('narraciones_libro')
    .select('id,estado,config_hash').eq('libro_id', BOOK_ID).eq('version', VERSION).maybeSingle()
  if (existingError) throw existingError
  if (existing && existing.config_hash !== configHash) throw new Error('La versión 2 ya existe con otra voz o configuración')
  if (existing?.estado === 'published') throw new Error('La versión 2 ya está publicada')
  if (existing?.estado === 'archived') throw new Error('La versión 2 está archivada')
  const { data: savedPages, error: savedError } = existing
    ? await client.from('narraciones_pagina').select('pagina_pdf,texto_hash,storage_path,estado').eq('narracion_id', existing.id)
    : { data: [], error: null }
  if (savedError) throw savedError
  const byPage = new Map(savedPages.map(page => [page.pagina_pdf, page]))
  const charactersToGenerate = pages.reduce((total, page) => {
    const saved = byPage.get(page.pagina)
    const cachePath = resolve(REVIEW_DIR, 'audio-cache', pathFor(page))
    return total + (saved?.estado === 'ready' || existsSync(cachePath) ? 0 : page.caracteres)
  }, 0)
  const subscription = await getSubscription(apiKey)
  if (subscription.tier !== 'free') throw new Error('Este piloto solo genera con una cuenta Free de ElevenLabs')
  const remaining = Number(subscription.character_limit) - Number(subscription.character_count)
  if (!Number.isFinite(remaining) || remaining < charactersToGenerate) {
    throw new Error(`Saldo insuficiente: se requieren ${charactersToGenerate} caracteres; disponible ${remaining}`)
  }
  console.log(`ElevenLabs Free: ${remaining} caracteres disponibles; ${charactersToGenerate} por generar en ${pages.length} páginas`)

  let narrationId = existing?.id
  if (!narrationId) {
    const { data, error } = await client.from('narraciones_libro').insert({
      libro_id: BOOK_ID, version: VERSION, proveedor: 'elevenlabs', modelo: MODEL,
      voz_id: voiceId, idioma: 'es', config_hash: configHash,
    }).select('id').single()
    if (error) throw error
    narrationId = data.id
  }

  for (const page of pages) {
    const path = pathFor(page)
    const saved = byPage.get(page.pagina)
    if (saved) {
      if (saved.estado === 'ready' && saved.texto_hash === page.texto_hash && saved.storage_path === path) {
        console.log(`Página ${page.pagina}: lista; se omite`)
        continue
      }
      throw new Error(`Página ${page.pagina} ya tiene un registro incompatible; crear una versión nueva`)
    }

    const cachePath = resolve(REVIEW_DIR, 'audio-cache', path)
    let audio
    if (existsSync(cachePath)) {
      audio = readFileSync(cachePath)
      console.log(`Página ${page.pagina}: reutilizando audio local`)
    } else {
      audio = await createSpeech({ text: page.texto, voiceId, settings, apiKey, model: MODEL, format: FORMAT })
      audioDuration(audio)
      writePrivate(cachePath, audio)
      console.log(`Página ${page.pagina}: MP3 generado y guardado localmente`)
    }
    const duration = audioDuration(audio)
    const { data: uploaded, error: downloadError } = await client.storage.from('audiobooks').download(path)
    if (!downloadError && uploaded) {
      const remote = Buffer.from(await uploaded.arrayBuffer())
      if (hash(remote) !== hash(audio)) throw new Error(`Página ${page.pagina}: objeto Storage distinto en la ruta prevista`)
    } else {
      const { error: uploadError } = await client.storage.from('audiobooks')
        .upload(path, audio, { contentType: 'audio/mpeg', cacheControl: '31536000', upsert: false })
      if (uploadError) throw uploadError
    }
    const { error: pageError } = await client.from('narraciones_pagina').insert({
      narracion_id: narrationId, libro_id: BOOK_ID, pagina_pdf: page.pagina,
      texto_hash: page.texto_hash, storage_path: path, estado: 'ready',
      duracion_segundos: duration, tamano_bytes: audio.length, mime_type: 'audio/mpeg',
    })
    if (pageError) throw pageError
    console.log(`Página ${page.pagina}: lista en Storage privado`)
  }
  console.log(`Versión ${VERSION} en borrador. Escucha los MP3 en ${resolve(REVIEW_DIR, 'audio-cache')} antes de publicar.`)
}

async function main() {
  const { mode, pages: pageNumbers } = parseArgs(process.argv.slice(2))
  const client = await getAdmin()
  if (mode === 'publish') {
    const { data, error } = await client.rpc('publicar_narracion_piloto', { p_libro_id: BOOK_ID, p_version: VERSION, p_paginas: pageNumbers })
    if (error) throw error
    console.log(`Versión ${VERSION} publicada en Supabase local: ${data} páginas`)
    return
  }
  const report = await localBookReport(client)
  const pages = selectedPages(report, pageNumbers, mode === 'generate')
  const reviewPath = saveReview(pages)
  console.log(`PDF local: ${report.total_paginas} páginas; seleccionadas ${pageNumbers.join(', ')}; caracteres ${pages.reduce((sum, page) => sum + page.caracteres, 0)}`)
  for (const page of pages) console.log(`Página ${page.pagina}: ${page.caracteres} caracteres, ${page.palabras} palabras, estado ${page.estado}`)
  if (mode === 'plan') {
    console.log('Inventario cercano:')
    for (const page of report.paginas.slice(2, 13)) console.log(`  PDF ${page.pagina}: ${page.estado}, ${page.caracteres} caracteres`)
  }
  console.log(`Texto para revisar: ${reviewPath}`)
  if (mode === 'generate') await generate(client, pages)
}

main().catch(error => { console.error(`Piloto ElevenLabs: ${error.message}`); process.exitCode = 1 })
