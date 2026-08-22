const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-device-id',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}

async function hmac(value: string, secret: string) {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  return bytesToHex(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value))))
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ valido: false, motivo: 'solicitud_invalida' }, 405)
  const contentLength = Number(request.headers.get('content-length') || 0)
  if (contentLength > 2048) return json({ valido: false, motivo: 'solicitud_invalida' }, 413)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const hashSecret = Deno.env.get('PREVALIDACION_TOKEN_HASH_SECRET')
  if (!supabaseUrl || !serviceRoleKey || !hashSecret) {
    console.error('[prevalidar-token] Faltan secretos requeridos')
    return json({ valido: false, motivo: 'error_servidor' }, 500)
  }

  let token = ''
  try {
    const body = await request.json()
    token = typeof body?.token === 'string' ? body.token.trim().toUpperCase() : ''
  } catch {
    return json({ valido: false, motivo: 'token_invalido' })
  }

  // Rechaza localmente entradas absurdas, pero deja que PostgreSQL determine
  // la disponibilidad real y responda siempre sin metadatos del token.
  if (token.length < 6 || token.length > 128) {
    return json({ valido: false, motivo: 'token_invalido' })
  }

  const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  const ip = request.headers.get('x-real-ip')
    || request.headers.get('cf-connecting-ip')
    || forwardedFor
    || 'ip-desconocida'
  const device = request.headers.get('x-device-id')?.slice(0, 128) || 'sin-dispositivo'
  const userAgent = request.headers.get('user-agent')?.slice(0, 256) || 'sin-agente'
  const [networkHash, deviceHash] = await Promise.all([
    hmac(`red\n${ip}`, hashSecret),
    hmac(`dispositivo\n${device}\n${userAgent}`, hashSecret),
  ])

  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/prevalidar_token_anonimo`, {
      method: 'POST',
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        p_token: token,
        p_red_hash: networkHash,
        p_dispositivo_hash: deviceHash,
      }),
    })
    if (!response.ok) {
      console.error('[prevalidar-token] RPC falló:', response.status)
      return json({ valido: false, motivo: 'error_servidor' }, 500)
    }
    const result = await response.json()
    return json(result)
  } catch (error) {
    console.error('[prevalidar-token] Error de red:', error)
    return json({ valido: false, motivo: 'error_servidor' }, 500)
  }
})
