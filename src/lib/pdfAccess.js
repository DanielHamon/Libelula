// Solo conserva la URL en memoria. No renueva un PDF ya descargado ni crea
// temporizadores que reinicien el lector mientras el usuario está leyendo.
export function createPdfAccess({ initial, renew, onChange, now = Date.now }) {
  let disposed = false
  let pending = null
  let lastAttempt = -Infinity
  let state = { url: initial?.url || null, revision: 0, loading: false, error: false }
  const emit = patch => {
    if (disposed) return
    state = { ...state, ...patch }
    onChange(state)
  }

  function recover({ manual = false } = {}) {
    if (disposed) return Promise.resolve()
    if (pending) return pending
    if (!manual && now() - lastAttempt < 60_000) {
      emit({ loading: false, error: true })
      return Promise.resolve()
    }
    lastAttempt = now()
    emit({ loading: true, error: false })
    pending = Promise.resolve().then(() => disposed ? null : renew()).then(result => {
      if (disposed) return
      if (!result?.url) throw new Error('PDF no disponible')
      emit({ url: result.url, revision: state.revision + 1, loading: false, error: false })
    }).catch(() => {
      emit({ loading: false, error: true })
    }).finally(() => { pending = null })
    return pending
  }

  function start() {
    if (!state.url || !initial?.expiresAt || initial.expiresAt <= now() + 30_000) {
      emit({ url: null })
      return recover()
    }
    emit({})
    return Promise.resolve()
  }

  return { start, recover, dispose: () => { disposed = true } }
}
