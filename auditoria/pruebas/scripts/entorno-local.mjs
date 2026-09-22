import { mkdirSync } from 'node:fs'

// Las pruebas incluyen escrituras e intentos de acceso: solo entorno descartable.
export function validarUrlLocal(value) {
  const url = new URL(value)
  if (!['http:', 'https:'].includes(url.protocol)
      || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
      || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('Las pruebas de auditoría solo admiten una URL raíz de loopback.')
  }
  return url.origin
}

export function entornoLocal() {
  const base = validarUrlLocal(process.env.SUPABASE_URL || 'http://127.0.0.1:54321')
  mkdirSync(new URL('../resultados/', import.meta.url), { recursive: true, mode: 0o700 })
  return base
}
