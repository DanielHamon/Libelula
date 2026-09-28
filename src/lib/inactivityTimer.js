export const TIMEOUT_MS = 30 * 60 * 1000
export const WARNING_MS = 5 * 60 * 1000
export const SYNC_MS = 15 * 1000
export const STORAGE_KEY = 'iabooks_last_activity'

// Los eventos frecuentes solo actualizan memoria; el reloj publica su fecha.
export function createInactivityTimer({
  onChange, onExpire, target = window, documentTarget = document,
  storage = localStorage, now = Date.now,
  schedule = setTimeout, cancel = clearTimeout,
}) {
  let stopped = false
  let timer
  let lastActivity = 0
  let published = 0
  let previousState = ''
  const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart']

  function read() {
    try {
      const value = Number(storage.getItem(STORAGE_KEY))
      return Number.isFinite(value) && value > 0 && value <= now() ? value : 0
    } catch { return 0 }
  }

  function sync() {
    const shared = read()
    lastActivity = Math.max(lastActivity, shared)
    published = Math.max(published, shared)
    if (lastActivity > published) {
      try {
        storage.setItem(STORAGE_KEY, String(lastActivity))
        published = lastActivity
      } catch { /* El reloj local funciona también sin storage. */ }
    }
  }

  function report(remaining) {
    const warning = remaining <= WARNING_MS && remaining > 0
    const seconds = warning ? Math.ceil(remaining / 1000) : WARNING_MS / 1000
    const state = `${warning}:${seconds}`
    if (state !== previousState) {
      previousState = state
      onChange({ mostrarAviso: warning, segundosRestantes: seconds })
    }
  }

  function stop({ flush: shouldFlush = false } = {}) {
    if (stopped) return
    if (shouldFlush) sync()
    stopped = true
    cancel(timer)
    events.forEach(event => target.removeEventListener(event, activity))
    target.removeEventListener('storage', storageChanged)
    target.removeEventListener('pagehide', flush)
    target.removeEventListener('focus', check)
    documentTarget.removeEventListener('visibilitychange', check)
  }

  function tick() {
    if (stopped) return
    sync()
    const remaining = lastActivity + TIMEOUT_MS - now()
    report(remaining)
    if (remaining <= 0) {
      stop()
      onExpire()
      return
    }
    const delay = remaining > WARNING_MS
      ? Math.min(SYNC_MS, remaining - WARNING_MS)
      : Math.min(1000, remaining)
    timer = schedule(tick, delay)
  }

  function check() {
    if (stopped) return
    cancel(timer)
    tick()
  }

  function activity() {
    if (stopped) return
    // Interactuar al despertar no debe revivir una sesión ya vencida.
    if (now() - Math.max(lastActivity, published) >= TIMEOUT_MS) {
      sync()
      if (now() - lastActivity >= TIMEOUT_MS) { check(); return }
    }
    lastActivity = now()
  }

  function extend() {
    activity()
    check()
  }

  function flush() {
    if (!stopped) sync()
  }

  function storageChanged(event) {
    if (event.key === STORAGE_KEY && (!event.storageArea || event.storageArea === storage)) check()
  }

  lastActivity = read() || now()
  published = read()
  events.forEach(event => target.addEventListener(event, activity, { passive: true }))
  target.addEventListener('storage', storageChanged)
  target.addEventListener('pagehide', flush)
  target.addEventListener('focus', check)
  documentTarget.addEventListener('visibilitychange', check)
  tick()
  return { extend, stop }
}
