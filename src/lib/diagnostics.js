// No registrar mensajes remotos, respuestas, rutas, tokens ni objetos Error.
// Los contextos de llamada son etiquetas estáticas del código de la app.
const SAFE_CODES = new Set(['42501', '23505', '23503', '23514', '22023', 'PGRST116', 'PGRST301', 'PGRST302'])

export function registrarError(context, error, level = 'error') {
  const code = SAFE_CODES.has(error?.code) ? error.code : 'no_clasificado'
  const status = Number.isInteger(error?.status) && error.status >= 400 && error.status <= 599
    ? error.status : undefined
  const details = status === undefined ? { code } : { code, status }
  if (level === 'warn') console.warn(`[Libelula] ${context}`, details)
  else console.error(`[Libelula] ${context}`, details)
}
