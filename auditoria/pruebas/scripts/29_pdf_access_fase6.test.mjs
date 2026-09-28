import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createPdfAccess } from '../../../src/lib/pdfAccess.js'

function fixture({ initial = { url: 'old', expiresAt: 300000 }, renew } = {}) {
  let time = 1000, calls = 0
  const states = []
  const controller = createPdfAccess({ initial, now: () => time, onChange: s => states.push(s), renew: async () => {
    calls++; return renew ? renew() : { url: `new-${calls}` }
  } })
  return { ...controller, states, get calls() { return calls }, jump: t => { time += t } }
}
test('PDF válido no firma ni recarga por el paso del tiempo', async () => {
  const f = fixture(); await f.start(); f.jump(7200000)
  assert.equal(f.calls, 0); assert.equal(f.states.at(-1).url, 'old')
})
test('URL caducada o próxima a vencer se renueva antes de montar Document', async () => {
  for (const expiresAt of [0, 30000]) {
    const f = fixture({ initial: { url: 'old', expiresAt } }); await f.start()
    assert.equal(f.states[0].url, null); assert.equal(f.calls, 1)
    assert.equal(f.states.at(-1).url, 'new-1')
  }
})
test('sin firma inicial permite recuperación', async () => {
  const f = fixture({ initial: null }); await f.start(); assert.equal(f.calls, 1)
})
test('errores concurrentes comparten una firma', async () => {
  const f = fixture(); await f.start()
  await Promise.all([f.recover(), f.recover(), f.recover()])
  assert.equal(f.calls, 1)
})
test('URL devuelta idéntica incrementa revisión para reintentar PDF', async () => {
  const f = fixture({ renew: () => ({ url: 'old' }) }); await f.start(); await f.recover()
  assert.equal(f.states.at(-1).revision, 1)
})
test('fallo persistente corta bucle automático; reintento manual funciona', async () => {
  const f = fixture({ renew: () => { throw Error('offline') } }); await f.start()
  await f.recover(); await f.recover()
  assert.equal(f.calls, 1); assert.equal(f.states.at(-1).error, true)
  await f.recover({ manual: true }); assert.equal(f.calls, 2)
})
test('puede recuperar una segunda caducidad en una lectura larga', async () => {
  const f = fixture(); await f.start(); f.jump(300000); await f.recover()
  f.jump(300000); await f.recover(); assert.equal(f.calls, 2)
})
test('desmontaje ignora firma pendiente y futuros reintentos', async () => {
  let resolve
  const f = fixture({ renew: () => new Promise(r => { resolve = r }) })
  await f.start(); const pending = f.recover(); await Promise.resolve()
  f.dispose(); const length = f.states.length
  resolve({ url: 'late' }); await pending; await f.recover()
  assert.equal(f.states.length, length); assert.equal(f.calls, 1)
})
test('respuesta sin URL presenta error recuperable', async () => {
  const f = fixture({ initial: null, renew: () => ({}) }); await f.start()
  assert.equal(f.states.at(-1).error, true)
})
test('desmontaje inmediato evita iniciar una firma encolada (StrictMode)', async () => {
  const f = fixture({ initial: null }); const pending = f.start(); f.dispose()
  await pending; assert.equal(f.calls, 0)
})
