import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createInactivityTimer, TIMEOUT_MS, WARNING_MS, SYNC_MS, STORAGE_KEY } from '../../../src/lib/inactivityTimer.js'

function fixture(initial) {
  let time = 1_000_000_000, next = 0, writes = 0, scheduled = 0
  const tasks = new Map(), values = new Map()
  if (initial !== undefined) values.set(STORAGE_KEY, String(initial(time)))
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { writes++; values.set(key, value) },
  }
  function tab() {
    const target = new EventTarget(), documentTarget = new EventTarget(), states = []
    let expired = 0
    const controller = createInactivityTimer({
      target, documentTarget, storage, now: () => time,
      schedule: (fn, delay) => { scheduled++; tasks.set(++next, { fn, at: time + delay }); return next },
      cancel: id => tasks.delete(id),
      onChange: state => states.push(state), onExpire: () => expired++,
    })
    return { ...controller, target, documentTarget, states, get expired() { return expired },
      emit: type => target.dispatchEvent(new Event(type)),
      shared: () => {
        const event = new Event('storage')
        Object.assign(event, { key: STORAGE_KEY, storageArea: storage })
        target.dispatchEvent(event)
      },
    }
  }
  function advance(ms) {
    const end = time + ms
    while (true) {
      const first = [...tasks].sort((a, b) => a[1].at - b[1].at)[0]
      if (!first || first[1].at > end) break
      time = first[1].at; tasks.delete(first[0]); first[1].fn()
    }
    time = end
  }
  return { tab, advance, storage, tasks, jump: ms => { time += ms },
    get time() { return time }, get writes() { return writes }, get scheduled() { return scheduled } }
}

test('avisa a los 25 minutos y vence exactamente a los 30, una sola vez', () => {
  const f = fixture(), t = f.tab()
  f.advance(TIMEOUT_MS - WARNING_MS - 1)
  assert.equal(t.states.at(-1).mostrarAviso, false)
  f.advance(1)
  assert.deepEqual(t.states.at(-1), { mostrarAviso: true, segundosRestantes: 300 })
  f.advance(WARNING_MS - 1); assert.equal(t.expired, 0)
  f.advance(1); assert.equal(t.expired, 1)
  f.advance(TIMEOUT_MS); assert.equal(t.expired, 1)
  assert.equal(f.tasks.size, 0)
})

test('6000 movimientos en un minuto: cuatro publicaciones periódicas y ningún timer por evento', () => {
  const f = fixture(), t = f.tab()
  for (let i = 0; i < 6000; i++) { t.emit('mousemove'); f.advance(10) }
  assert.equal(f.writes, 5) // Inicial + cuatro intervalos.
  assert.equal(f.scheduled, 5)
  assert.equal(t.states.length, 1)
  assert.equal(f.tasks.size, 1)
  t.stop()
})

test('conserva la última fecha exacta y no adelanta el vencimiento al agrupar', () => {
  const f = fixture(), t = f.tab()
  f.advance(1234); t.emit('keydown')
  f.advance(TIMEOUT_MS - 1); assert.equal(t.expired, 0)
  f.advance(1); assert.equal(t.expired, 1)
})

test('recargar conserva el plazo y un registro ya vencido expira al montar', () => {
  const f = fixture(now => now - TIMEOUT_MS + 1000), t = f.tab()
  assert.equal(t.states.at(-1).segundosRestantes, 1)
  f.advance(1000); assert.equal(t.expired, 1)
  const expired = fixture(now => now - TIMEOUT_MS).tab()
  assert.equal(expired.expired, 1)
})

test('continuar oculta el aviso inmediatamente y renueva el plazo', () => {
  const f = fixture(), t = f.tab()
  f.advance(TIMEOUT_MS - 1000); t.extend()
  assert.equal(t.states.at(-1).mostrarAviso, false)
  f.advance(TIMEOUT_MS - 1); assert.equal(t.expired, 0)
  f.advance(1); assert.equal(t.expired, 1)
})

test('despertar recalcula segundos reales; actividad tardía no revive sesión', () => {
  const f = fixture(), t = f.tab()
  f.jump(TIMEOUT_MS - 12345); t.emit('focus')
  assert.equal(t.states.at(-1).segundosRestantes, 13)
  f.jump(12345); t.emit('mousemove')
  assert.equal(t.expired, 1)
  t.extend(); assert.equal(t.expired, 1)
})

test('dos pestañas comparten actividad y extensión; eventos antiguos no retroceden fecha', () => {
  const f = fixture(), a = f.tab(), b = f.tab()
  f.advance(TIMEOUT_MS - WARNING_MS)
  a.extend(); b.shared()
  assert.equal(b.states.at(-1).mostrarAviso, false)
  f.advance(TIMEOUT_MS - WARNING_MS)
  b.emit('keydown'); f.advance(1000); a.shared()
  assert.equal(a.states.at(-1).mostrarAviso, false)
  f.storage.setItem(STORAGE_KEY, String(f.time - TIMEOUT_MS)); a.shared()
  assert.equal(a.expired, 0)
  a.stop(); b.stop()
})

test('otra pestaña activa evita vencimiento aunque no llegue storage al despertar', () => {
  const f = fixture(), a = f.tab(), b = f.tab()
  f.jump(TIMEOUT_MS - 1000); a.extend()
  f.jump(2000); b.emit('mousemove')
  assert.equal(b.expired, 0)
  a.stop(); b.stop()
})

test('desmontaje publica última actividad, retira listeners y cancela reloj', () => {
  const f = fixture(), t = f.tab()
  f.advance(1234); t.emit('scroll'); t.stop({ flush: true })
  assert.equal(Number(f.storage.getItem(STORAGE_KEY)), f.time)
  const writes = f.writes, states = t.states.length
  t.emit('mousemove'); t.emit('focus'); t.shared(); t.emit('pagehide')
  f.advance(TIMEOUT_MS)
  assert.equal(f.writes, writes); assert.equal(t.states.length, states)
  assert.equal(t.expired, 0); assert.equal(f.tasks.size, 0)
})

test('ocultar o salir publica actividad pendiente; storage inaccesible no rompe reloj', () => {
  const f = fixture(), t = f.tab()
  f.advance(1000); t.emit('touchstart')
  t.documentTarget.dispatchEvent(new Event('visibilitychange'))
  assert.equal(Number(f.storage.getItem(STORAGE_KEY)), f.time)
  f.advance(1000); t.emit('scroll'); t.emit('pagehide')
  assert.equal(Number(f.storage.getItem(STORAGE_KEY)), f.time)
  f.storage.getItem = () => { throw Error('blocked') }
  f.storage.setItem = () => { throw Error('blocked') }
  f.advance(SYNC_MS); t.extend(); f.advance(TIMEOUT_MS)
  assert.equal(t.expired, 1)
})

for (const value of [() => 'malformado', () => -1, now => now + TIMEOUT_MS]) {
  test('marca inválida o futura no extiende indefinidamente', () => {
    const f = fixture(value), t = f.tab()
    f.advance(TIMEOUT_MS); assert.equal(t.expired, 1)
  })
}
