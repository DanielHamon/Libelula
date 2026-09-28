import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
const source = readFileSync(new URL('../../../src/services/libros.service.js', import.meta.url), 'utf8')
  .replace(/^import .*\n/gm, '').replaceAll('export async function', 'async function')
function service({ denied = false, path = 'privado.pdf', signingError = false } = {}) {
  const calls = []
  const supabase = {
    rpc: async (name, args) => { calls.push({ name, args }); return denied ? { error: { code: '42501' } } : { data: { libro: { pdf_url: path }, unidades: [] } } },
    storage: { from: bucket => ({ createSignedUrl: async (path, ttl) => {
      calls.push({ bucket, path, ttl }); return signingError ? { error: { message: 'secret' } } : { data: { signedUrl: 'https://fake.invalid/pdf?token=ficticio' } }
    } }) },
  }
  const context = vm.createContext({ supabase, Date, console: { warn() { throw Error('No debe imprimir secretos') } } })
  const functions = vm.runInContext(source+'\n({ renovarPdfLibro, getLibroConUnidades })', context)
  return { ...functions, calls }
}
test('firma por 300 segundos y revalida RPC en cada renovación', async () => {
  const s = service(); const start = Date.now(); const result = await s.renovarPdfLibro('libro-ficticio')
  assert.ok(result.expiresAt >= start + 300000); assert.equal(s.calls[1].ttl, 300)
  await s.renovarPdfLibro('libro-ficticio'); assert.equal(s.calls.filter(c => c.name).length, 2)
})
test('permiso retirado no firma', async () => {
  const s = service({ denied: true }); await assert.rejects(s.renovarPdfLibro('x'))
  assert.equal(s.calls.length, 1)
})
for (const path of [null, '/public.pdf', 'https://fake.invalid/public.pdf']) {
  test(`rechaza ruta no privada ${path}`, async () => {
    const s = service({ path }); await assert.rejects(s.renovarPdfLibro('x')); assert.equal(s.calls.length, 1)
  })
}
test('fallo inicial de Storage conserva disponibilidad para reintentar', async () => {
  const s = service({ signingError: true }); const result = await s.getLibroConUnidades('x')
  assert.equal(result.libro.pdf_disponible, true); assert.equal(result.libro.pdf_url, null)
})
