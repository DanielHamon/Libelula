#!/usr/bin/env node

// Carga un tono de prueba en una página de Roja como un tomate.
// Se niega a conectarse a cualquier destino que no sea la réplica local.
import { createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { localCredentials } from './local-replica-credentials.mjs'

const BOOK_ID = 'roja_como_un_tomate'
const VERSION = 1

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function toneWav() {
  const rate = 16000
  const seconds = 1.5
  const samples = Math.round(rate * seconds)
  const buffer = Buffer.alloc(44 + samples * 2)
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(buffer.length - 8, 4)
  buffer.write('WAVEfmt ', 8)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(1, 22)
  buffer.writeUInt32LE(rate, 24)
  buffer.writeUInt32LE(rate * 2, 28)
  buffer.writeUInt16LE(2, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(samples * 2, 40)
  for (let i = 0; i < samples; i += 1) {
    const fade = Math.min(1, i / 800, (samples - i) / 800)
    buffer.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 440 * i / rate) * 6000 * fade), 44 + i * 2)
  }
  return { buffer, seconds }
}

async function main() {
  const credentials = localCredentials()
  const client = createClient(credentials.API_URL, credentials.SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: existing, error: existingError } = await client.from('narraciones_libro')
    .select('id, estado').eq('libro_id', BOOK_ID).eq('version', VERSION).maybeSingle()
  if (existingError) throw existingError
  if (existing) {
    console.log(`Piloto ya existe: ${BOOK_ID}, versión ${VERSION}, estado ${existing.estado}`)
    return
  }

  const { data: book, error: bookError } = await client.from('libros')
    .select('id, pdf_url').eq('id', BOOK_ID).single()
  if (bookError || !book?.pdf_url) throw new Error('PDF piloto no disponible')
  const { data: pdfBlob, error: pdfError } = await client.storage.from('libros').download(book.pdf_url)
  if (pdfError || !pdfBlob) throw new Error('No se pudo leer el PDF piloto')
  const pdf = await getDocument({ data: new Uint8Array(await pdfBlob.arrayBuffer()), useSystemFonts: true }).promise
  let selected = null
  for (let pageNumber = 1; pageNumber <= Math.min(pdf.numPages, 8); pageNumber += 1) {
    const page = await pdf.getPage(pageNumber)
    const content = await page.getTextContent()
    const text = content.items.map(item => item.str || '').join(' ').replace(/\s+/g, ' ').trim()
    if (text.length >= 100) { selected = { pageNumber, text }; break }
  }
  await pdf.destroy()
  if (!selected) throw new Error('No se encontró una página con texto en las primeras ocho páginas')

  const textHash = sha256(selected.text)
  const configHash = sha256('fixture:440hz:1.5s:mono:16000hz:v1')
  const path = `${BOOK_ID}/v001/pagina_${String(selected.pageNumber).padStart(3, '0')}-${textHash.slice(0, 8)}.wav`
  const { buffer, seconds } = toneWav()
  const { error: uploadError } = await client.storage.from('audiobooks')
    .upload(path, buffer, { contentType: 'audio/wav', upsert: false })
  if (uploadError) throw uploadError

  const { data: narration, error: narrationError } = await client.from('narraciones_libro')
    .insert({ libro_id: BOOK_ID, version: VERSION, proveedor: 'fixture_local', modelo: 'tono_440hz', voz_id: 'sin_voz', config_hash: configHash })
    .select('id').single()
  if (narrationError) throw narrationError
  const { error: pageError } = await client.from('narraciones_pagina').insert({
    narracion_id: narration.id,
    libro_id: BOOK_ID,
    pagina_pdf: selected.pageNumber,
    texto_hash: textHash,
    storage_path: path,
    estado: 'ready',
    duracion_segundos: seconds,
    tamano_bytes: buffer.length,
    mime_type: 'audio/wav',
  })
  if (pageError) throw pageError
  const { error: publishError } = await client.from('narraciones_libro')
    .update({ estado: 'published', publicada_en: new Date().toISOString() }).eq('id', narration.id)
  if (publishError) throw publishError
  console.log(`Piloto local publicado: ${BOOK_ID}, página PDF ${selected.pageNumber}/${pdf.numPages}, 1 audio WAV técnico (${buffer.length} bytes)`)
}

main().catch(error => { console.error(`Piloto local falló: ${error.message}`); process.exitCode = 1 })
