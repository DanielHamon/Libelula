import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const C = {
  primary: '#2563EB',
  text: '#1F2937',
  muted: '#6B7280',
  border: '#E5E7EB',
  danger: '#B91C1C',
  dangerBg: '#FEE2E2',
  success: '#166534',
  successBg: '#DCFCE7',
}

function destinoSeguro(value, fallback) {
  return value?.startsWith('/') && !value.startsWith('//') ? value : fallback
}

export default function SeguridadMFA() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [estado, setEstado] = useState('cargando')
  const [factorId, setFactorId] = useState(null)
  const [enrollment, setEnrollment] = useState(null)
  const [codigo, setCodigo] = useState('')
  const [error, setError] = useState('')
  const [procesando, setProcesando] = useState(false)
  const [destino, setDestino] = useState('/inicio')

  useEffect(() => {
    async function cargar() {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) {
          navigate('/login?redirect=%2Fseguridad%2Fmfa', { replace: true })
          return
        }

        const [{ data: profile }, nivel, factores] = await Promise.all([
          supabase.from('profiles').select('rol').eq('id', session.user.id).single(),
          supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
          supabase.auth.mfa.listFactors(),
        ])
        if (nivel.error) throw nivel.error
        if (factores.error) throw factores.error

        const fallback = profile?.rol === 'admin'
          ? '/admin'
          : profile?.rol === 'docente'
            ? '/panel-docente'
            : '/inicio'
        setDestino(destinoSeguro(searchParams.get('redirect'), fallback))

        if (nivel.data.currentLevel === 'aal2') {
          setEstado('verificada')
          return
        }

        const totp = factores.data.totp?.[0]
        if (totp) {
          setFactorId(totp.id)
          setEstado('desafio')
        } else {
          setEstado('sinFactor')
        }
      } catch (e) {
        setError(e?.message || 'No se pudo consultar el estado de MFA.')
        setEstado('error')
      }
    }
    cargar()
  }, [navigate, searchParams])

  async function enrolar() {
    setProcesando(true)
    setError('')
    try {
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: `Libelula Admin ${Date.now()}`,
      })
      if (enrollError) throw enrollError
      setEnrollment(data.totp)
      setFactorId(data.id)
      setEstado('enrolando')
    } catch (e) {
      setError(e?.message || 'No se pudo iniciar la configuración MFA.')
    } finally {
      setProcesando(false)
    }
  }

  async function verificar(event) {
    event.preventDefault()
    if (!/^\d{6}$/.test(codigo)) {
      setError('Ingresa el código de 6 dígitos de tu aplicación.')
      return
    }
    setProcesando(true)
    setError('')
    try {
      const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
        factorId,
        code: codigo,
      })
      if (verifyError) throw verifyError

      const { data, error: levelError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      if (levelError) throw levelError
      if (data.currentLevel !== 'aal2') throw new Error('La sesión no alcanzó el nivel de seguridad aal2.')
      setEstado('verificada')
    } catch (e) {
      setError(e?.message || 'El código no es válido o ya expiró.')
    } finally {
      setProcesando(false)
    }
  }

  return (
    <main style={{
      minHeight: '100vh',
      display: 'grid',
      placeItems: 'center',
      padding: 20,
      boxSizing: 'border-box',
      background: '#F8FAFC',
      fontFamily: 'Nunito, sans-serif',
    }}>
      <section style={{
        width: '100%',
        maxWidth: 480,
        padding: '32px 28px',
        boxSizing: 'border-box',
        borderRadius: 20,
        border: `1px solid ${C.border}`,
        background: '#fff',
        boxShadow: '0 18px 50px rgba(15, 23, 42, 0.10)',
      }}>
        <div style={{ fontSize: 44, textAlign: 'center', marginBottom: 10 }}>🛡️</div>
        <h1 style={{ margin: '0 0 8px', color: C.text, fontSize: 25, textAlign: 'center' }}>
          Seguridad de la cuenta
        </h1>
        <p style={{ margin: '0 0 24px', color: C.muted, fontSize: 14, lineHeight: 1.55, textAlign: 'center' }}>
          Protege las operaciones administrativas con un código temporal de tu aplicación autenticadora.
        </p>

        {error && (
          <div role="alert" style={{ padding: 12, marginBottom: 16, borderRadius: 10, background: C.dangerBg, color: C.danger, fontSize: 14, fontWeight: 700 }}>
            {error}
          </div>
        )}

        {estado === 'cargando' && <p style={{ color: C.muted, textAlign: 'center' }}>Consultando seguridad…</p>}

        {estado === 'sinFactor' && (
          <>
            <p style={{ color: C.text, lineHeight: 1.55, fontSize: 14 }}>
              Necesitarás Google Authenticator, Microsoft Authenticator, Authy u otra aplicación compatible con TOTP.
            </p>
            <PrimaryButton disabled={procesando} onClick={enrolar}>
              {procesando ? 'Preparando…' : 'Configurar autenticador'}
            </PrimaryButton>
          </>
        )}

        {estado === 'enrolando' && enrollment && (
          <>
            <ol style={{ paddingLeft: 20, color: C.text, fontSize: 14, lineHeight: 1.6 }}>
              <li>Escanea este código QR con tu aplicación autenticadora.</li>
              <li>Ingresa abajo el código de seis dígitos.</li>
            </ol>
            <div style={{ display: 'grid', placeItems: 'center', margin: '18px 0' }}>
              <img
                src={enrollment.qr_code}
                alt="Código QR para configurar autenticación multifactor"
                style={{ width: 220, height: 220, maxWidth: '100%' }}
              />
            </div>
            <details style={{ marginBottom: 18, color: C.muted, fontSize: 13 }}>
              <summary style={{ cursor: 'pointer', fontWeight: 700 }}>No puedo escanear el QR</summary>
              <p>Copia esta clave manualmente en tu autenticador:</p>
              <code style={{ display: 'block', overflowWrap: 'anywhere', color: C.text }}>{enrollment.secret}</code>
            </details>
            <CodeForm {...{ codigo, setCodigo, verificar, procesando }} />
          </>
        )}

        {estado === 'desafio' && (
          <>
            <p style={{ color: C.text, fontSize: 14, lineHeight: 1.55 }}>
              Abre tu aplicación autenticadora e ingresa el código actual para continuar.
            </p>
            <CodeForm {...{ codigo, setCodigo, verificar, procesando }} />
          </>
        )}

        {estado === 'verificada' && (
          <>
            <div style={{ padding: 14, marginBottom: 18, borderRadius: 10, background: C.successBg, color: C.success, fontWeight: 800, textAlign: 'center' }}>
              Sesión protegida con MFA · nivel aal2
            </div>
            <PrimaryButton onClick={() => navigate(destino, { replace: true })}>
              Continuar
            </PrimaryButton>
          </>
        )}
      </section>
    </main>
  )
}

function CodeForm({ codigo, setCodigo, verificar, procesando }) {
  return (
    <form onSubmit={verificar}>
      <label htmlFor="codigo-mfa" style={{ display: 'block', marginBottom: 7, color: C.text, fontSize: 14, fontWeight: 800 }}>
        Código de seguridad
      </label>
      <input
        id="codigo-mfa"
        value={codigo}
        onChange={event => setCodigo(event.target.value.replace(/\D/g, '').slice(0, 6))}
        inputMode="numeric"
        autoComplete="one-time-code"
        placeholder="000000"
        autoFocus
        style={{
          width: '100%',
          boxSizing: 'border-box',
          marginBottom: 14,
          padding: 14,
          border: `1px solid ${C.border}`,
          borderRadius: 10,
          fontSize: 22,
          letterSpacing: 8,
          textAlign: 'center',
        }}
      />
      <PrimaryButton disabled={procesando || codigo.length !== 6}>
        {procesando ? 'Verificando…' : 'Verificar código'}
      </PrimaryButton>
    </form>
  )
}

function PrimaryButton({ children, disabled = false, onClick }) {
  return (
    <button
      type={onClick ? 'button' : 'submit'}
      disabled={disabled}
      onClick={onClick}
      style={{
        width: '100%',
        padding: '13px 18px',
        border: 0,
        borderRadius: 10,
        background: C.primary,
        color: '#fff',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        fontFamily: 'Nunito, sans-serif',
        fontSize: 15,
        fontWeight: 800,
      }}
    >
      {children}
    </button>
  )
}
