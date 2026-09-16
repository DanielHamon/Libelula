import { useEffect, useRef, useState } from 'react'

let loading
function loadTurnstile() {
  if (window.turnstile) return Promise.resolve(window.turnstile)
  if (loading) return loading
  loading = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    const fail = () => {
      clearTimeout(timeout)
      script.remove()
      reject(new Error('No se pudo cargar la verificación'))
    }
    const timeout = setTimeout(fail, 15000)
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    script.async = true
    script.onload = () => {
      clearTimeout(timeout)
      if (window.turnstile) resolve(window.turnstile)
      else fail()
    }
    script.onerror = fail
    document.head.appendChild(script)
  }).catch(error => { loading = undefined; throw error })
  return loading
}

export default function TokenCaptcha({ onToken }) {
  const container = useRef(null)
  const [attempt, setAttempt] = useState(0)
  const [status, setStatus] = useState('loading')
  const sitekey = import.meta.env.VITE_TURNSTILE_SITE_KEY

  useEffect(() => {
    if (!sitekey) return
    let cancelled = false
    let widget
    let api
    const invalidate = next => {
      if (cancelled) return
      onToken('')
      setStatus(next)
    }
    loadTurnstile().then(turnstile => {
      if (cancelled) return
      api = turnstile
      widget = api.render(container.current, {
        sitekey, action: 'prevalidar_token', language: 'es', theme: 'light', size: 'flexible',
        appearance: 'interaction-only',
        'response-field': false,
        retry: 'never',
        'refresh-expired': 'manual',
        'refresh-timeout': 'manual',
        callback: token => {
          if (cancelled) return
          onToken(token)
          setStatus('verified')
        },
        'expired-callback': () => invalidate('expired'),
        'timeout-callback': () => invalidate('expired'),
        'error-callback': () => { invalidate('error'); return true },
      })
    }).catch(() => invalidate('error'))
    return () => {
      cancelled = true
      if (widget !== undefined) api.remove(widget)
    }
  }, [sitekey, attempt, onToken])

  const retry = () => {
    onToken('')
    setStatus('loading')
    setAttempt(value => value + 1)
  }
  return (
    <div style={{ marginBottom: 16 }}>
      <div ref={container} />
      <p role="status" aria-live="polite" style={{ fontSize: 13, color: '#6B7280', margin: '8px 0' }}>
        {!sitekey ? 'La verificación de seguridad no está disponible. Intenta más tarde.'
          : status === 'verified' ? '✓ Verificación de seguridad completada.'
          : status === 'expired' ? 'La verificación venció. Vuelve a realizarla para continuar.'
          : status === 'error' ? 'No se pudo completar la verificación de seguridad. Revisa tu conexión y reintenta.'
          : 'Comprobando la seguridad de la conexión…'}
      </p>
      {sitekey && ['error', 'expired'].includes(status) && (
        <button type="button" onClick={retry} style={{ color: '#2563EB', background: 'none', border: 0, padding: '8px 0', cursor: 'pointer', font: 'inherit' }}>
          Reintentar verificación
        </button>
      )}
    </div>
  )
}
