import { isIP } from 'node:net'

const defaultOrigins = ['https://libelula-alpha.vercel.app', 'https://libelula-daniel-hamon-s-projects.vercel.app']
const allowedHeaders = 'authorization, apikey, content-type, x-client-info, x-device-id'
const maxBodyBytes = 4096 // Código + token Turnstile (hasta 2048 caracteres) + JSON.

async function digest(value: string, secret: string) {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value))), byte => byte.toString(16).padStart(2, '0')).join('')
}

// Confirm the deployed gateway overwrites client-supplied X-Forwarded-For.
// No fallback to user-controlled alternative headers or a shared unknown IP.
export function networkAddress(request: Request) {
  const value = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  if (!value || value.includes('%') || !isIP(value)) return null
  if (isIP(value) === 4) return value
  const normalized = new URL(`http://[${value}]/`).hostname.slice(1, -1)
  // IPv4 and its IPv4-mapped IPv6 representation share the same quota.
  const mapped = /^::ffff:([0-9a-f]+):([0-9a-f]+)$/.exec(normalized)
  if (!mapped) return normalized
  const high = parseInt(mapped[1], 16), low = parseInt(mapped[2], 16)
  return [high >> 8, high & 255, low >> 8, low & 255].join('.')
}

export function createHandler(env: (name: string) => string | undefined, requestFetch: typeof fetch = fetch) {
  return async (request: Request) => {
    const origins = (env('PREVALIDACION_TOKEN_ALLOWED_ORIGINS')?.split(',') ?? defaultOrigins).map(s => s.trim()).filter(Boolean)
    const origin = request.headers.get('origin')
    const accepted = origin !== null && origins.includes(origin) && origin !== 'null' && origin !== '*'
    const headers: Record<string, string> = { Vary: 'Origin', 'Cache-Control': 'no-store' }
    if (accepted) {
      headers['Access-Control-Allow-Origin'] = origin!
      headers['Access-Control-Allow-Headers'] = allowedHeaders
      headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
    }
    const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json' } })
    if (origin !== null && !accepted) return json({ valido: false, motivo: 'origen_no_permitido' }, 403)
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
    if (request.method !== 'POST') return json({ valido: false, motivo: 'solicitud_invalida' }, 405)
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return json({ valido: false, motivo: 'solicitud_invalida' }, 415)
    if (Number(request.headers.get('content-length')) > maxBodyBytes) return json({ valido: false, motivo: 'solicitud_invalida' }, 413)
    const url = env('SUPABASE_URL'), key = env('SUPABASE_SERVICE_ROLE_KEY'), secret = env('PREVALIDACION_TOKEN_HASH_SECRET')
    const captchaSecret = env('TURNSTILE_SECRET_KEY')
    if (!url || !key || !secret || !captchaSecret) return json({ valido: false, motivo: 'error_servidor' }, 500)
    const ip = networkAddress(request)
    if (!ip) return json({ valido: false, motivo: 'error_servidor' }, 503)
    let token: string
    let captchaToken: string
    try {
      const reader = request.body?.getReader()
      if (!reader) return json({ valido: false, motivo: 'token_invalido' })
      const chunks: Uint8Array[] = []
      let size = 0
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        size += value.byteLength
        if (size > maxBodyBytes) { await reader.cancel(); return json({ valido: false, motivo: 'solicitud_invalida' }, 413) }
        chunks.push(value)
      }
      const bytes = new Uint8Array(size)
      let offset = 0
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
      const body = JSON.parse(new TextDecoder().decode(bytes))
      token = typeof body?.token === 'string' ? body.token.trim().toUpperCase() : ''
      captchaToken = typeof body?.captchaToken === 'string' ? body.captchaToken : ''
    } catch { return json({ valido: false, motivo: 'token_invalido' }) }
    if (token.length < 6 || token.length > 128) return json({ valido: false, motivo: 'token_invalido' })
    if (!captchaToken || captchaToken.length > 2048) return json({ valido: false, motivo: 'captcha_invalido' })
    try {
      // Siteverify valida uso único y caducidad. Nunca consultar tokens si falla.
      const verification = await requestFetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret: captchaSecret, response: captchaToken, remoteip: ip }),
        signal: AbortSignal.timeout(10000),
      })
      if (!verification.ok) return json({ valido: false, motivo: 'error_servidor' }, 503)
      const captcha = await verification.json()
      if (Array.isArray(captcha?.['error-codes']) && captcha['error-codes'].some((code: string) =>
        ['missing-input-secret', 'invalid-input-secret', 'internal-error', 'bad-request'].includes(code))) {
        return json({ valido: false, motivo: 'error_servidor' }, 503)
      }
      const hostnames = origins.flatMap(value => {
        try { return [new URL(value).hostname] } catch { return [] }
      })
      if (captcha?.success !== true || captcha.action !== 'prevalidar_token'
          || !hostnames.includes(captcha.hostname)
          || (accepted && captcha.hostname !== new URL(origin!).hostname)) {
        return json({ valido: false, motivo: 'captcha_invalido' })
      }
      const red = await digest(`red\n${ip}`, secret)
      // Legacy SQL argument retained for compatibility; no client-selected bucket.
      const response = await requestFetch(`${url}/rest/v1/rpc/prevalidar_token_anonimo`, {
        method: 'POST',
        headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_token: token, p_red_hash: red, p_dispositivo_hash: red }),
        signal: AbortSignal.timeout(10000),
      })
      if (!response.ok) return json({ valido: false, motivo: 'error_servidor' }, 500)
      const result = await response.json()
      if (typeof result?.valido !== 'boolean') return json({ valido: false, motivo: 'error_servidor' }, 500)
      // Keep HTTP 200 business outcomes for the deployed frontend.
      return json(result.valido ? { valido: true } : { valido: false, motivo: result.motivo === 'demasiados_intentos' ? result.motivo : 'token_invalido' })
    } catch { return json({ valido: false, motivo: 'error_servidor' }, 500) }
  }
}
