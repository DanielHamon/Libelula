#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, extname, resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'

const REPORT_VERSION = 1
const SHORT_TEXT_LIMIT = 20
const REPEATED_LINE_RATIO = 0.6

function loadLocalEnv() {
  for (const filename of ['.env.local', '.env']) {
    if (!existsSync(filename)) continue
    for (const rawLine of readFileSync(filename, 'utf8').split(/\r?\n/)) {
      const line = rawLine.trim()
      if (!line || line.startsWith('#')) continue
      const separator = line.indexOf('=')
      if (separator < 1) continue
      const key = line.slice(0, separator).trim()
      let value = line.slice(separator + 1).trim()
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1)
      }
      if (!process.env[key]) process.env[key] = value
    }
  }
}

function parseArgs(argv) {
  const result = { outputDir: '.reports/pdf-pages' }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--file') result.file = argv[++index]
    else if (arg === '--book-id') result.bookId = argv[++index]
    else if (arg === '--all') result.all = true
    else if (arg === '--output') result.outputDir = argv[++index]
    else if (arg === '--include-text') result.includeText = true
    else if (arg === '--help' || arg === '-h') result.help = true
    else throw new Error(`Argumento desconocido: ${arg}`)
  }
  return result
}

function printHelp() {
  console.log(`Extractor y reporte de páginas PDF

Uso:
  npm run report:pdf -- --file ruta/libro.pdf [--book-id id] [--include-text]
  npm run report:pdf -- --book-id roja_como_un_tomate [--include-text]
  npm run report:pdf -- --all [--include-text]

Opciones:
  --file PATH       Analiza un PDF local sin conectarse a Supabase.
  --book-id ID      Identificador del libro. Sin --file, descarga su PDF privado.
  --all             Analiza todos los libros con pdf_url en Supabase.
  --output DIR      Directorio de reportes (por defecto .reports/pdf-pages).
  --include-text    Incluye texto limpio completo en JSON/CSV. Por defecto solo
                    guarda una vista previa para reducir exposición accidental.

Para --book-id/--all se requieren VITE_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY
en .env.local. La service role se usa únicamente desde este script local.`)
}

function safeSlug(value) {
  const slug = String(value || 'libro')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return slug || 'libro'
}

function normalizeForComparison(text) {
  return text
    .normalize('NFKC')
    .toLocaleLowerCase('es')
    .replace(/\s+/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, '')
}

function isPageNumber(text) {
  return /^(?:p[aá]g(?:ina)?\.?\s*)?[-–—]?\s*\d{1,4}\s*[-–—]?$/iu.test(text.trim())
}

function groupItemsIntoLines(items, pageHeight) {
  const textItems = items
    .filter(item => typeof item.str === 'string' && item.str.trim())
    .map(item => ({
      text: item.str.trim(),
      x: Number(item.transform?.[4] || 0),
      y: Number(item.transform?.[5] || 0),
      height: Math.max(1, Math.abs(Number(item.height || item.transform?.[3] || 1))),
    }))
    .sort((a, b) => Math.abs(b.y - a.y) > 2 ? b.y - a.y : a.x - b.x)

  const lines = []
  for (const item of textItems) {
    const tolerance = Math.max(2, item.height * 0.45)
    let line = lines.find(candidate => Math.abs(candidate.y - item.y) <= tolerance)
    if (!line) {
      line = { y: item.y, items: [] }
      lines.push(line)
    }
    line.items.push(item)
  }

  return lines
    .sort((a, b) => b.y - a.y)
    .map(line => {
      const text = line.items.sort((a, b) => a.x - b.x).map(item => item.text).join(' ')
      const relativeY = pageHeight > 0 ? line.y / pageHeight : 0.5
      return { text: text.replace(/\s+/g, ' ').trim(), relativeY }
    })
    .filter(line => line.text)
}

function countImages(operatorList) {
  const imageOps = new Set([
    OPS.paintImageMaskXObject,
    OPS.paintImageMaskXObjectGroup,
    OPS.paintImageXObject,
    OPS.paintInlineImageXObject,
    OPS.paintImageXObjectRepeat,
    OPS.paintImageMaskXObjectRepeat,
    OPS.paintSolidColorImageMask,
  ].filter(Number.isFinite))
  return operatorList.fnArray.reduce((total, operation) => total + (imageOps.has(operation) ? 1 : 0), 0)
}

function findRepeatedMarginLines(rawPages) {
  const occurrences = new Map()
  for (const page of rawPages) {
    const seenOnPage = new Set()
    for (const line of page.lines) {
      if (line.relativeY > 0.12 && line.relativeY < 0.88) continue
      const key = normalizeForComparison(line.text)
      if (key.length < 3 || seenOnPage.has(key) || isPageNumber(line.text)) continue
      seenOnPage.add(key)
      occurrences.set(key, (occurrences.get(key) || 0) + 1)
    }
  }
  const minimum = Math.max(3, Math.ceil(rawPages.length * REPEATED_LINE_RATIO))
  return new Set([...occurrences].filter(([, count]) => count >= minimum).map(([key]) => key))
}

function cleanPageLines(lines, repeatedMarginLines) {
  const removed = []
  const kept = []

  for (const line of lines) {
    const comparison = normalizeForComparison(line.text)
    const margin = line.relativeY <= 0.12 || line.relativeY >= 0.88
    if (isPageNumber(line.text)) {
      removed.push({ text: line.text, reason: 'numero_pagina' })
    } else if (margin && repeatedMarginLines.has(comparison)) {
      removed.push({ text: line.text, reason: 'encabezado_o_pie_repetido' })
    } else {
      kept.push(line.text)
    }
  }

  const text = kept
    .join('\n')
    .replace(/([\p{L}])-[ \t]*\n[ \t]*(?=\p{Ll})/gu, '$1')
    .replace(/\n+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/\s+/g, ' ')
    .normalize('NFKC')
    .trim()

  return { text, removed }
}

function classifyPage(text, imageCount) {
  const useful = text.replace(/[^\p{L}\p{N}]+/gu, '')
  const letterCount = (text.match(/\p{L}/gu) || []).length
  if (!useful) return imageCount > 0 ? 'posible_imagen' : 'sin_texto'
  if (useful.length <= SHORT_TEXT_LIMIT || letterCount < 3) return 'requiere_revision'
  return 'lista'
}

async function readPdfPages(bytes) {
  const loadingTask = getDocument({ data: new Uint8Array(bytes), useSystemFonts: true })
  const pdf = await loadingTask.promise
  const pages = []

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber)
    const [content, operators] = await Promise.all([page.getTextContent(), page.getOperatorList()])
    const viewport = page.getViewport({ scale: 1 })
    pages.push({
      pageNumber,
      lines: groupItemsIntoLines(content.items, viewport.height),
      imageCount: countImages(operators),
    })
    page.cleanup()
  }
  await pdf.destroy()
  return pages
}

function buildReport({ bookId, title, source, rawPages, includeText }) {
  const repeatedMarginLines = findRepeatedMarginLines(rawPages)
  const pages = rawPages.map(page => {
    const { text, removed } = cleanPageLines(page.lines, repeatedMarginLines)
    const status = classifyPage(text, page.imageCount)
    return {
      pagina: page.pageNumber,
      estado: status,
      saltar_tts: status === 'sin_texto',
      requiere_ocr: status === 'posible_imagen',
      caracteres: text.length,
      palabras: text ? text.split(/\s+/).length : 0,
      imagenes_detectadas: page.imageCount,
      texto_hash: text ? createHash('sha256').update(text).digest('hex') : null,
      texto: includeText ? text : undefined,
      vista_previa: text.slice(0, 180),
      elementos_eliminados: removed,
    }
  })

  const counts = Object.fromEntries(['lista', 'sin_texto', 'posible_imagen', 'requiere_revision'].map(status => [
    status,
    pages.filter(page => page.estado === status).length,
  ]))

  return {
    version_reporte: REPORT_VERSION,
    generado_en: new Date().toISOString(),
    libro_id: bookId,
    titulo: title,
    origen: source,
    total_paginas: pages.length,
    total_caracteres_limpios: pages.reduce((sum, page) => sum + page.caracteres, 0),
    resumen: counts,
    lineas_repetidas_detectadas: [...repeatedMarginLines],
    paginas: pages,
  }
}

function csvEscape(value) {
  const string = value == null ? '' : String(value)
  return `"${string.replaceAll('"', '""')}"`
}

function reportMarkdown(report) {
  const reviewPages = report.paginas
    .filter(page => page.estado !== 'lista')
    .map(page => `| ${page.pagina} | ${page.estado} | ${page.caracteres} | ${page.imagenes_detectadas} | ${page.vista_previa.replaceAll('|', '\\|')} |`)
    .join('\n')

  return `# Reporte PDF: ${report.titulo || report.libro_id}\n\n` +
    `- Libro: \`${report.libro_id}\`\n` +
    `- Páginas: ${report.total_paginas}\n` +
    `- Caracteres limpios: ${report.total_caracteres_limpios.toLocaleString('es-CO')}\n` +
    `- Listas para TTS: ${report.resumen.lista}\n` +
    `- Sin texto: ${report.resumen.sin_texto}\n` +
    `- Posibles imágenes/OCR: ${report.resumen.posible_imagen}\n` +
    `- Requieren revisión: ${report.resumen.requiere_revision}\n\n` +
    `## Páginas que requieren atención\n\n` +
    (reviewPages
      ? `| Página | Estado | Caracteres | Imágenes | Vista previa |\n|---:|---|---:|---:|---|\n${reviewPages}\n`
      : 'Ninguna.\n')
}

function writeReport(report, outputDir, includeText) {
  const directory = resolve(outputDir)
  mkdirSync(directory, { recursive: true })
  const slug = safeSlug(report.libro_id)
  const jsonPath = resolve(directory, `${slug}.json`)
  const csvPath = resolve(directory, `${slug}.csv`)
  const mdPath = resolve(directory, `${slug}.md`)

  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`)
  const columns = ['pagina', 'estado', 'saltar_tts', 'requiere_ocr', 'caracteres', 'palabras', 'imagenes_detectadas', 'texto_hash', 'vista_previa']
  if (includeText) columns.push('texto')
  const csv = [columns.join(','), ...report.paginas.map(page => columns.map(column => csvEscape(page[column])).join(','))].join('\n')
  writeFileSync(csvPath, `${csv}\n`)
  writeFileSync(mdPath, reportMarkdown(report))
  return { jsonPath, csvPath, mdPath }
}

function getSupabaseAdmin() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    throw new Error('Faltan VITE_SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY en .env.local')
  }
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
}

async function getRemoteBooks(client, args) {
  let query = client.from('libros').select('id,titulo,pdf_url').not('pdf_url', 'is', null).order('id')
  if (args.bookId && !args.all) query = query.eq('id', args.bookId)
  const { data, error } = await query
  if (error) throw error
  if (!data?.length) throw new Error(args.bookId ? `No se encontró PDF para el libro ${args.bookId}` : 'No hay libros con PDF')
  return data
}

async function downloadBookPdf(client, book) {
  if (book.pdf_url.startsWith('/')) {
    const localPath = resolve('public', book.pdf_url.replace(/^\/+/, ''))
    if (!existsSync(localPath)) throw new Error(`No existe el PDF local ${localPath}`)
    return { bytes: readFileSync(localPath), source: localPath }
  }
  const { data, error } = await client.storage.from('libros').download(book.pdf_url)
  if (error) throw error
  return { bytes: await data.arrayBuffer(), source: `supabase://libros/${book.pdf_url}` }
}

async function processPdf({ bytes, bookId, title, source }, args) {
  console.log(`[${bookId}] Extrayendo ${source}...`)
  const rawPages = await readPdfPages(bytes)
  const report = buildReport({ bookId, title, source, rawPages, includeText: args.includeText })
  const paths = writeReport(report, args.outputDir, args.includeText)
  console.log(`[${bookId}] ${report.total_paginas} páginas: ${report.resumen.lista} listas, ${report.resumen.sin_texto} sin texto, ${report.resumen.posible_imagen} posibles OCR, ${report.resumen.requiere_revision} para revisar.`)
  console.log(`[${bookId}] Reporte: ${paths.mdPath}`)
  return report
}

async function main() {
  loadLocalEnv()
  const args = parseArgs(process.argv.slice(2))
  if (args.help) return printHelp()
  if (!args.file && !args.bookId && !args.all) {
    printHelp()
    throw new Error('Debes indicar --file, --book-id o --all')
  }
  if (args.file && args.all) throw new Error('--file y --all no se pueden combinar')

  const reports = []
  if (args.file) {
    const filePath = resolve(args.file)
    if (!existsSync(filePath)) throw new Error(`No existe ${filePath}`)
    if (extname(filePath).toLowerCase() !== '.pdf') throw new Error('El archivo debe tener extensión .pdf')
    reports.push(await processPdf({
      bytes: readFileSync(filePath),
      bookId: args.bookId || basename(filePath, extname(filePath)),
      title: basename(filePath),
      source: filePath,
    }, args))
  } else {
    const client = getSupabaseAdmin()
    const books = await getRemoteBooks(client, args)
    for (const book of books) {
      try {
        const pdf = await downloadBookPdf(client, book)
        reports.push(await processPdf({ ...pdf, bookId: book.id, title: book.titulo }, args))
      } catch (error) {
        console.error(`[${book.id}] Error: ${error.message}`)
        if (!args.all) throw error
      }
    }
  }

  const summary = {
    generado_en: new Date().toISOString(),
    libros_procesados: reports.length,
    total_paginas: reports.reduce((sum, report) => sum + report.total_paginas, 0),
    total_caracteres_limpios: reports.reduce((sum, report) => sum + report.total_caracteres_limpios, 0),
    estados: Object.fromEntries(['lista', 'sin_texto', 'posible_imagen', 'requiere_revision'].map(status => [
      status,
      reports.reduce((sum, report) => sum + report.resumen[status], 0),
    ])),
  }
  mkdirSync(resolve(args.outputDir), { recursive: true })
  writeFileSync(resolve(args.outputDir, '_resumen.json'), `${JSON.stringify(summary, null, 2)}\n`)
  console.log(`Resumen general: ${resolve(args.outputDir, '_resumen.json')}`)
}

main().catch(error => {
  console.error(`Error: ${error.message}`)
  process.exitCode = 1
})
