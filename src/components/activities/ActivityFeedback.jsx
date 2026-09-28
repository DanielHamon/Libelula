import { C } from './activityStyles'

export function FeedbackBox({ ok, msg }) { return <div style={{ background: ok ? C.greenLight : C.redLight, border: `1px solid ${ok ? C.green : C.red}`, borderRadius: 12, padding: '10px 14px', fontSize: 14, fontWeight: 600, color: ok ? '#1a6b1a' : '#a00' }}>{msg}</div> }

export function AttemptsLeft({ restantes, max, locked }) {
  if (locked || max <= 1) return null
  const danger = restantes <= 1
  return <span style={{ fontSize: 12, fontWeight: 700, color: danger ? C.red : '#D97706', background: danger ? C.redLight : '#FEF3C7', borderRadius: 20, padding: '3px 10px', whiteSpace: 'nowrap' }}>🔄 {restantes} intento{restantes !== 1 ? 's' : ''} restante{restantes !== 1 ? 's' : ''}</span>
}

export function MissingField({ campo }) { return <div style={{ color: C.red, fontSize: 13, background: C.redLight, padding: '8px 12px', borderRadius: 8 }}>Campo faltante: <code>{campo}</code></div> }
