import { useInactivityTimeout } from '../hooks/useInactivityTimeout'

export default function InactivityNotice() {
  const { mostrarAviso, segundosRestantes, extenderSesion, cerrarSesionManual } = useInactivityTimeout()

  const mins = Math.floor(segundosRestantes / 60)
  const secs = String(segundosRestantes % 60).padStart(2, '0')

  return (
    <>
      {mostrarAviso && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'rgba(0,0,0,0.55)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 20, fontFamily: 'Nunito',
        }}>
          <div style={{
            background: '#fff', borderRadius: 20, padding: '36px 32px',
            maxWidth: 380, width: '100%',
            boxShadow: '0 24px 64px rgba(0,0,0,0.25)',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>⏳</div>
            <h3 style={{ fontSize: 20, fontWeight: 800, color: '#1F2937', margin: '0 0 8px' }}>
              Sesión por expirar
            </h3>
            <p style={{ fontSize: 14, color: '#6B7280', margin: '0 0 20px', lineHeight: 1.5 }}>
              Tu sesión cerrará automáticamente por inactividad.
            </p>
            <div style={{
              fontSize: 40, fontWeight: 900, color: segundosRestantes <= 60 ? '#EF4444' : '#F59E0B',
              marginBottom: 24, letterSpacing: 2, fontVariantNumeric: 'tabular-nums',
            }}>
              {mins}:{secs}
            </div>
            <button
              onClick={extenderSesion}
              style={{
                width: '100%', padding: '13px 0', fontSize: 15, fontWeight: 700,
                background: '#2563EB', color: '#fff', border: 'none',
                borderRadius: 12, cursor: 'pointer', fontFamily: 'Nunito', marginBottom: 10,
              }}
            >
              Continuar sesión
            </button>
            <button
              onClick={cerrarSesionManual}
              style={{
                width: '100%', padding: '11px 0', fontSize: 14, fontWeight: 700,
                background: 'transparent', color: '#6B7280',
                border: '1px solid #E5E7EB', borderRadius: 12,
                cursor: 'pointer', fontFamily: 'Nunito',
              }}
            >
              Cerrar sesión ahora
            </button>
          </div>
        </div>
      )}
    </>
  )
}
