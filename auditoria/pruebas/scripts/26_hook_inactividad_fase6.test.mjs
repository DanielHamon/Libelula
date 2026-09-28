// Comprueba el cableado del hook con dobles de React/Auth; no sustituye un navegador autenticado.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const source = readFileSync(new URL('../../../src/hooks/useInactivityTimeout.js', import.meta.url), 'utf8')
  .replace(/^import .*\n/gm, '').replace('export function', 'function')

function mount() {
  let cleanup, callback, state, unsubscribed = 0, closed = 0
  const controllers = []
  const context = vm.createContext({
    useEffect: fn => { cleanup = fn() }, useRef: value => ({ current: value }),
    useState: value => { state = value; return [value, next => { state = next }] },
    supabase: { auth: { onAuthStateChange: cb => {
      callback = cb
      return { data: { subscription: { unsubscribe: () => unsubscribed++ } } }
    } } },
    cerrarSesion: async () => { closed++ },
    createInactivityTimer: options => {
      const c = { options, stops: [], extends: 0, stop(opts) { this.stops.push(opts) }, extend() { this.extends++ } }
      controllers.push(c); return c
    },
    window: { location: { replace: () => { throw Error('unexpected navigation') } } },
  })
  const hook = vm.runInContext(`${source}\nuseInactivityTimeout()`, context)
  return { hook, controllers, cleanup: () => cleanup(),
    auth: (event, id) => callback(event, id ? { user: { id } } : null),
    get state() { return state }, get closed() { return closed }, get unsubscribed() { return unsubscribed } }
}

test('sin sesión no inicia reloj; autenticación inicia uno y refresh no renueva inactividad', () => {
  const h = mount()
  h.auth('INITIAL_SESSION', null); assert.equal(h.controllers.length, 0)
  h.auth('SIGNED_IN', 'a'); assert.equal(h.controllers.length, 1)
  h.auth('TOKEN_REFRESHED', 'a'); h.auth('SIGNED_IN', 'a')
  assert.equal(h.controllers.length, 1)
  h.hook.extenderSesion(); assert.equal(h.controllers[0].extends, 1)
  h.cleanup(); assert.equal(h.unsubscribed, 1)
})

test('logout y cambio de usuario retiran reloj anterior', () => {
  const h = mount()
  h.auth('INITIAL_SESSION', 'a'); h.auth('SIGNED_IN', 'b')
  assert.equal(h.controllers[0].stops.length, 1)
  h.auth('SIGNED_OUT', null)
  assert.equal(h.controllers[1].stops.length, 1)
  assert.equal(h.state.mostrarAviso, false)
  h.cleanup()
})

test('expiración difiere Auth fuera del callback y cierra sesión', async () => {
  const h = mount(); h.auth('INITIAL_SESSION', 'a')
  h.controllers[0].options.onExpire()
  assert.equal(h.closed, 0)
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(h.closed, 1); h.cleanup()
})

test('expiración pendiente no cierra otro usuario ni una instancia desmontada', async () => {
  for (const finish of [h => h.cleanup(), h => h.auth('SIGNED_IN', 'b')]) {
    const h = mount(); h.auth('INITIAL_SESSION', 'a')
    h.controllers[0].options.onExpire(); finish(h)
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(h.closed, 0); h.cleanup()
  }
})

test('cierre manual detiene reloj antes de cerrar Auth', async () => {
  const h = mount(); h.auth('INITIAL_SESSION', 'a')
  await h.hook.cerrarSesionManual()
  assert.equal(h.controllers[0].stops.length, 1)
  assert.equal(h.closed, 1); assert.equal(h.state.mostrarAviso, false)
  h.cleanup()
})
