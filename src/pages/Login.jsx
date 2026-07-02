import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useWindowWidth } from '../hooks/useWindowWidth'

const C = {
  primary: '#2563EB', primaryDark: '#1D4ED8',
  text: '#1F2937', textLight: '#6B7280', border: '#E5E7EB',
}

function InputField({ label, type = 'text', placeholder, value, onChange, icon }) {
  const [focused, setFocused] = useState(false)
  return (
    <div style={{ marginBottom: 16 }}>
      {label && <label style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 6, display: 'block' }}>{label}</label>}
      <div style={{ position: 'relative' }}>
        <input
          type={type} placeholder={placeholder} value={value} onChange={onChange}
          onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          style={{
            width: '100%', padding: '14px 16px', paddingLeft: icon ? 44 : 16,
            borderRadius: 12, border: `1.5px solid ${focused ? C.primary : C.border}`,
            fontSize: 16, fontFamily: 'Nunito', outline: 'none', boxSizing: 'border-box',
            background: '#fff', transition: 'border-color 0.2s', color: C.text,
          }}
        />
        {icon && <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 18, opacity: 0.45 }}>{icon}</span>}
      </div>
    </div>
  )
}

export default function Login() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const width = useWindowWidth()
  const isMobile = width < 768
  const [form, setForm] = useState({ email: '', password: '' })
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')
  const [modoReset, setModoReset] = useState(false)
  const [resetEnviado, setResetEnviado] = useState(false)

  async function handleLogin(e) {
    e.preventDefault(); setError(''); setCargando(true)
    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: form.email,
        password: form.password,
      })
      if (authError) {
        setError('Correo o contraseña incorrectos.')
        return
      }
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('rol')
        .eq('id', data.user.id)
        .single()
      const rol = profile?.rol || 'estudiante'
      const defaultPath = rol === 'admin' ? '/admin' : rol === 'docente' ? '/panel-docente' : '/inicio'
      const redirect = searchParams.get('redirect')
      const destino = redirect && redirect.startsWith('/') && !redirect.startsWith('//') ? redirect : defaultPath
      navigate(destino, { replace: true })
    } catch {
      setError('Error al iniciar sesión. Intenta de nuevo.')
    } finally { setCargando(false) }
  }

  async function handleReset(e) {
    e.preventDefault(); setError(''); setCargando(true)
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(form.email)
      if (resetError) { setError('No se encontró una cuenta con ese correo.'); return }
      setResetEnviado(true)
    } catch { setError('No se encontró una cuenta con ese correo.') }
    finally { setCargando(false) }
  }

  const leftPanel = (icon, title, subtitle, extras) => !isMobile && (
    <div style={{
      flex: 1, background: `linear-gradient(135deg, ${C.primary}, #F97316)`,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      color: '#fff', padding: 48,
    }}>
      <div style={{ fontSize: 80, marginBottom: 16 }}>{icon}</div>
      <h2 style={{ fontSize: 32, fontWeight: 900, marginBottom: 8, textAlign: 'center' }}>{title}</h2>
      <p style={{ fontSize: 16, opacity: 0.85, textAlign: 'center', maxWidth: 320, lineHeight: 1.6 }}>{subtitle}</p>
      {extras}
    </div>
  )

  const formWrap = (children) => (
    <div style={{
      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: isMobile ? '32px 20px' : 48,
      minHeight: '100vh',
      background: isMobile ? `linear-gradient(160deg, ${C.primary}08, #fff)` : '#fff',
    }}>
      <div style={{ maxWidth: 420, width: '100%' }}>
        {isMobile && (
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <div style={{ fontSize: 52 }}>📖</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: C.primary }}>Libelula</div>
          </div>
        )}
        {children}
      </div>
    </div>
  )

  if (modoReset) return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'Nunito' }}>
      {leftPanel('🔑', 'Recupera tu acceso', 'Te enviaremos un enlace para restablecer tu contraseña.')}
      {formWrap(resetEnviado ? (
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 64, marginBottom: 12 }}>✉️</div>
          <h2 style={{ fontSize: 24, fontWeight: 800, color: C.text, marginBottom: 8 }}>Correo enviado</h2>
          <p style={{ color: C.textLight, fontSize: 14, marginBottom: 24 }}>Revisa tu bandeja de entrada y sigue las instrucciones.</p>
          <button onClick={() => { setModoReset(false); setResetEnviado(false) }}
            style={{ fontSize: 14, color: C.primary, fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'Nunito' }}>
            ← Volver al login
          </button>
        </div>
      ) : (
        <>
          <h2 style={{ fontSize: 26, fontWeight: 800, color: C.text, marginBottom: 8 }}>Recuperar contraseña</h2>
          <p style={{ fontSize: 14, color: C.textLight, marginBottom: 24 }}>Ingresa tu correo y te enviaremos un enlace.</p>
          <form onSubmit={handleReset}>
            <InputField label="Correo electrónico" type="email" placeholder="tu@correo.com" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} icon="✉️" />
            {error && <p style={{ fontSize: 14, color: '#EF4444', marginBottom: 12, fontWeight: 600 }}>{error}</p>}
            <Btn disabled={cargando}>{cargando ? 'Enviando...' : 'Enviar enlace'}</Btn>
            <OutlineBtn onClick={() => setModoReset(false)}>Volver al login</OutlineBtn>
          </form>
        </>
      ))}
    </div>
  )

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'Nunito' }}>
      {leftPanel('📖', 'Libelula', 'Complementa tus libros físicos con contenido digital interactivo.',
        <div style={{ display: 'flex', gap: 28, marginTop: 36 }}>
          {[['🎬','Videos'],['🎧','Audios'],['🖼️','Ilustraciones']].map(([icon, lbl]) => (
            <div key={lbl} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 30, marginBottom: 6 }}>{icon}</div>
              <div style={{ fontSize: 12, fontWeight: 600, opacity: 0.8 }}>{lbl}</div>
            </div>
          ))}
        </div>
      )}
      {formWrap(
        <>
          <h2 style={{ fontSize: 28, fontWeight: 800, color: C.text, marginBottom: 8 }}>Iniciar sesión</h2>
          <p style={{ fontSize: 14, color: C.textLight, marginBottom: 28 }}>Ingresa tus datos para acceder a tu contenido</p>
          <form onSubmit={handleLogin}>
            <InputField label="Correo electrónico" type="email" placeholder="tu@correo.com" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} icon="✉️" />
            <InputField label="Contraseña" type="password" placeholder="Tu contraseña" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} icon="🔒" />
            <div style={{ textAlign: 'right', marginTop: -8, marginBottom: 20 }}>
              <button type="button" onClick={() => setModoReset(true)}
                style={{ fontSize: 13, color: C.primary, fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'Nunito' }}>
                ¿Olvidaste tu contraseña?
              </button>
            </div>
            {error && <p style={{ fontSize: 14, color: '#EF4444', marginBottom: 12, fontWeight: 600, textAlign: 'center' }}>{error}</p>}
            <Btn disabled={cargando}>{cargando ? '⏳ Ingresando...' : 'Iniciar sesión'}</Btn>
          </form>
          <p style={{ fontSize: 14, color: C.textLight, textAlign: 'center', marginTop: 20 }}>
            ¿Primera vez?{' '}
            <span onClick={() => navigate('/activar')} style={{ color: C.primary, fontWeight: 700, cursor: 'pointer' }}>Activa tu código</span>
          </p>
        </>
      )}
    </div>
  )
}

function Btn({ children, disabled, onClick }) {
  return (
    <button type={onClick ? 'button' : 'submit'} onClick={onClick} disabled={disabled} style={{
      width: '100%', background: C.primary, color: '#fff', border: 'none', borderRadius: 12,
      padding: '15px 28px', fontSize: 16, fontWeight: 700, cursor: 'pointer',
      fontFamily: 'Nunito', opacity: disabled ? 0.6 : 1, minHeight: 50, marginBottom: 10,
    }}>{children}</button>
  )
}

function OutlineBtn({ children, onClick }) {
  return (
    <button type="button" onClick={onClick} style={{
      width: '100%', background: 'transparent', color: C.textLight,
      border: `2px solid ${C.border}`, borderRadius: 12,
      padding: '13px 28px', fontSize: 15, fontWeight: 700,
      cursor: 'pointer', fontFamily: 'Nunito',
    }}>{children}</button>
  )
}
