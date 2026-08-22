import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { prevalidarToken, verificarToken, activarTokenLibro, activarTokenDocente } from '../services/tokens.service'
import { useWindowWidth } from '../hooks/useWindowWidth'

const C = {
  primary: '#2563EB', primaryDark: '#1D4ED8', primaryLight: '#DBEAFE',
  success: '#16A34A', successLight: '#DCFCE7',
  danger: '#EF4444',
  text: '#1F2937', textLight: '#6B7280', border: '#E5E7EB',
}

function InputField({ label, type = 'text', placeholder, value, onChange, icon, autoFocus }) {
  const [focused, setFocused] = useState(false)
  return (
    <div style={{ marginBottom: 16 }}>
      {label && <label style={{ fontSize: 14, fontWeight: 600, color: C.text, marginBottom: 6, display: 'block' }}>{label}</label>}
      <div style={{ position: 'relative' }}>
        <input
          type={type} placeholder={placeholder} value={value} onChange={onChange}
          autoFocus={autoFocus}
          onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          style={{
            width: '100%', padding: '14px 16px', paddingLeft: icon ? 44 : 16,
            borderRadius: 12, border: `1.5px solid ${focused ? C.primary : C.border}`,
            fontSize: 16, fontFamily: 'Nunito', outline: 'none', boxSizing: 'border-box',
            background: '#fff', transition: 'border-color 0.2s', color: C.text,
          }}
        />
        {icon && (
          <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 18, opacity: 0.45 }}>
            {icon}
          </span>
        )}
      </div>
    </div>
  )
}

function Btn({ children, disabled, onClick, type = 'submit', variant = 'primary' }) {
  const bg = variant === 'success' ? C.success : C.primary
  return (
    <button type={type} onClick={onClick} disabled={disabled} style={{
      width: '100%', background: bg, color: '#fff', border: 'none', borderRadius: 12,
      padding: '15px 28px', fontSize: 16, fontWeight: 700,
      cursor: disabled ? 'not-allowed' : 'pointer',
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
      cursor: 'pointer', fontFamily: 'Nunito', marginBottom: 10,
    }}>{children}</button>
  )
}

function LeftPanel({ bg, icon, title, subtitle, extra }) {
  return (
    <div style={{
      flex: 1, background: bg,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      color: '#fff', padding: 48,
    }}>
      <div style={{ fontSize: 88, marginBottom: 18 }}>{icon}</div>
      <h1 style={{ fontSize: 30, fontWeight: 900, marginBottom: 10, textAlign: 'center', lineHeight: 1.2 }}>{title}</h1>
      <p style={{ fontSize: 15, opacity: 0.85, textAlign: 'center', maxWidth: 300, lineHeight: 1.6 }}>{subtitle}</p>
      {extra}
    </div>
  )
}

export default function Activar() {
  const navigate = useNavigate()
  const width = useWindowWidth()
  const isMobile = width < 768

  const [usuario, setUsuario] = useState(undefined) // undefined = verificando auth
  const [profileRol, setProfileRol] = useState('estudiante')
  const [codigo, setCodigo] = useState('')
  const [tokenData, setTokenData] = useState(null)
  const [fase, setFase] = useState('codigo') // 'codigo' | 'registro' | 'confirmar' | 'exito'
  const [form, setForm] = useState({ nombre: '', email: '', password: '' })
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      setUsuario(user || null)
      if (user) {
        const { data: profile } = await supabase
          .from('profiles').select('rol').eq('id', user.id).single()
        setProfileRol(profile?.rol || 'estudiante')
      }
    })
  }, [])

  async function handleVerificarCodigo(e) {
    e.preventDefault()
    const codigoLimpio = codigo.trim().toUpperCase()
    if (!codigoLimpio) return
    setError(''); setCargando(true)
    try {
      if (!usuario) {
        const result = await prevalidarToken(codigoLimpio)
        if (!result?.valido) {
          setError(
            result?.motivo === 'demasiados_intentos'
              ? 'Demasiados intentos. Espera una hora antes de probar otro código.'
              : result?.motivo === 'error_servidor'
              ? 'No se pudo verificar el código. Intenta nuevamente.'
              : 'Código no válido. Verifica que lo hayas escrito correctamente.'
          )
          return
        }
        setTokenData({ prevalidado: true })
        setFase('registro')
        return
      }
      const result = await verificarToken(codigoLimpio)
      if (!result.valido) {
        setError(
          result.motivo === 'demasiados_intentos'
            ? 'Demasiados intentos fallidos. Espera 1 hora antes de intentarlo de nuevo.'
            : result.motivo === 'ya_activado'
            ? 'Este código ya fue activado. Si el libro es tuyo, inicia sesión.'
            : result.motivo === 'token_invalido'
            ? 'Código no válido. Verifica que lo hayas escrito correctamente.'
            : result.motivo === 'grado_incorrecto'
            ? 'Este libro no pertenece a tu grado.'
            : result.motivo === 'escuela_incorrecta'
            ? 'Este código pertenece a otra institución.'
            : result.motivo === 'libro_no_disponible_en_escuela'
            ? 'Este libro no está disponible para tu institución.'
            : result.motivo === 'error_servidor'
            ? 'No se pudo verificar el código. Intenta nuevamente.'
            : 'Este código no está disponible. Contacta a tu institución.'
        )
        return
      }
      setTokenData({
        libroTitulo: result.libro_titulo,
        tipo: result.tipo,
      })
      setFase(usuario ? 'confirmar' : 'registro')
    } catch {
      setError('Error al verificar el código. Intenta de nuevo.')
    } finally { setCargando(false) }
  }

  async function handleActivarLogueado(e) {
    e.preventDefault()
    setError(''); setCargando(true)
    try {
      const codigoLimpio = codigo.trim().toUpperCase()
      const result = tokenData?.tipo === 'docente'
        ? await activarTokenDocente(codigoLimpio)
        : await activarTokenLibro(codigoLimpio)

      if (!result.ok) {
        const mensajes = {
          demasiados_intentos: 'Demasiados intentos. Espera una hora antes de probar otro código.',
          email_no_autorizado: 'Tu correo no coincide con el autorizado para este token docente.',
          libro_no_disponible_en_escuela: 'Este libro no está disponible para tu escuela.',
          grado_incorrecto: 'Este libro no pertenece a tu grado.',
          grado_no_coincide: 'Este libro no corresponde a tu grado.',
          ya_tienes_libro: `Ya tienes "${tokenData?.libroTitulo || 'este libro'}" en tu biblioteca.`,
        }
        setError(mensajes[result.motivo] || 'Error al activar. Intenta de nuevo.')
        return
      }
      setFase('exito')
    } catch {
      setError('Error al activar. Intenta de nuevo.')
    } finally { setCargando(false) }
  }

  // Si el usuario está logueado con una cuenta incompleta (registro fallido),
  // la cierra antes de volver al flujo de primera vez.
  async function signOutIfIncomplete() {
    if (!usuario) return
    const { data: profile } = await supabase
      .from('profiles').select('escuela_id').eq('id', usuario.id).single()
    if (!profile?.escuela_id) {
      await supabase.auth.signOut()
      setUsuario(null)
      setProfileRol('estudiante')
    }
  }

  async function handleModificarDatos() {
    await signOutIfIncomplete()
    setFase('registro')
    setError('')
  }

  async function handleCambiarCodigo() {
    await signOutIfIncomplete()
    setFase('codigo')
    setError('')
  }

  async function handleRegistro(e) {
    e.preventDefault()
    setError(''); setCargando(true)
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: { data: { nombre: form.nombre } },
      })
      if (signUpError) {
        if (signUpError.message.includes('already registered') || signUpError.message.includes('already been registered')) {
          setError('Este correo ya tiene una cuenta. Inicia sesión en su lugar.')
        } else if (signUpError.message.toLowerCase().includes('password')) {
          setError('La contraseña debe tener al menos 6 caracteres.')
        } else {
          setError('Ocurrió un error. Intenta de nuevo.')
        }
        return
      }

      await supabase.from('profiles').update({ nombre: form.nombre }).eq('id', data.user.id)

      const codigoLimpio = codigo.trim().toUpperCase()
      const validacion = await verificarToken(codigoLimpio)
      if (!validacion?.valido) {
        const mensajes = {
          demasiados_intentos: 'Demasiados intentos. Espera antes de probar otro código.',
          token_invalido: 'Código no válido. Verifica que lo hayas escrito correctamente.',
          error_servidor: 'No se pudo verificar el código. Intenta nuevamente.',
        }
        setUsuario(data.user)
        setError(mensajes[validacion?.motivo] || 'Este código no está disponible.')
        return
      }

      const tokenValidado = {
        libroTitulo: validacion.libro_titulo,
        tipo: validacion.tipo,
      }
      setTokenData(tokenValidado)
      const result = tokenValidado.tipo === 'docente'
        ? await activarTokenDocente(codigoLimpio)
        : await activarTokenLibro(codigoLimpio)

      if (!result.ok) {
        const mensajes = {
          demasiados_intentos: 'Demasiados intentos. Espera una hora antes de probar otro código.',
          email_no_autorizado: 'Tu correo no coincide con el autorizado para este token docente.',
          libro_no_disponible_en_escuela: 'Este libro no está disponible para tu escuela.',
          grado_incorrecto: 'Este libro no pertenece a tu grado.',
          grado_no_coincide: 'Este libro no corresponde a tu grado.',
          ya_tienes_libro: `Ya tienes "${tokenValidado.libroTitulo || 'este libro'}" en tu biblioteca.`,
        }
        setError(mensajes[result.motivo] || 'Error al activar. Intenta de nuevo.')
        return
      }
      setFase('exito')
    } catch (err) {
      console.error('[Activar]', err)
      setError('Ocurrió un error. Intenta de nuevo.')
    } finally { setCargando(false) }
  }

  if (usuario === undefined) return (
    <div style={{ minHeight: '100vh', background: C.primaryLight, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Nunito' }}>
      <div style={{ width: 44, height: 44, border: `4px solid ${C.primary}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )

  const leftPanel = () => {
    if (fase === 'exito') return (
      <LeftPanel
        bg={`linear-gradient(135deg, ${C.success}, #059669)`}
        icon={tokenData?.tipo === 'docente' ? '🏫' : '🎉'}
        title={tokenData?.tipo === 'docente' ? '¡Cuenta lista!' : '¡Libro activado!'}
        subtitle={tokenData?.tipo === 'docente'
          ? 'Ya puedes gestionar tus clases desde tu panel.'
          : `"${tokenData?.libroTitulo}" ya está en tu biblioteca.`}
      />
    )
    if (fase === 'registro' || fase === 'confirmar') return (
      <LeftPanel
        bg={`linear-gradient(135deg, ${C.success}, #059669)`}
        icon={fase === 'confirmar' ? (tokenData?.tipo === 'docente' ? '🏫' : '✅') : '🔐'}
        title={fase === 'confirmar' ? '¡Código válido!' : 'Crea tu cuenta'}
        subtitle={fase === 'registro'
          ? 'Código válido. Crea tu cuenta para completar la activación.'
          : tokenData?.tipo === 'docente'
          ? 'Tu cuenta docente está lista para activarse.'
          : 'Tu libro está listo para activarse.'}
        extra={tokenData?.libroTitulo && (
          <div style={{
            background: 'rgba(255,255,255,0.2)', borderRadius: 12, padding: '10px 22px',
            fontSize: 16, fontWeight: 700, marginTop: 16, backdropFilter: 'blur(8px)',
          }}>
            {tokenData.libroTitulo}
          </div>
        )}
      />
    )
    return (
      <LeftPanel
        bg={`linear-gradient(135deg, ${C.primary}, ${C.primaryDark})`}
        icon="📚"
        title="Activa tu libro"
        subtitle="Ingresa el código único que aparece impreso en las páginas de tu libro."
      />
    )
  }

  const rightContent = () => {
    if (fase === 'exito') {
      const esDocente = tokenData?.tipo === 'docente'
      return (
        <div style={{ textAlign: 'center' }}>
          {isMobile && <div style={{ fontSize: 64, marginBottom: 12 }}>{esDocente ? '🏫' : '🎉'}</div>}
          <h2 style={{ fontSize: 26, fontWeight: 800, color: C.text, marginBottom: 12 }}>
            {esDocente ? '¡Cuenta lista!' : '¡Libro activado!'}
          </h2>
          <p style={{ color: C.textLight, fontSize: 15, marginBottom: 32, lineHeight: 1.6 }}>
            {esDocente
              ? 'Tu cuenta docente fue activada. Ya puedes gestionar tus clases.'
              : <><strong>{tokenData?.libroTitulo}</strong> ya apareció en tu biblioteca.</>}
          </p>
          <Btn type="button" onClick={() => navigate(esDocente ? '/panel-docente' : '/inicio')}>
            {esDocente ? 'Ir a mi panel' : 'Ir a mi biblioteca'}
          </Btn>
        </div>
      )
    }

    if (fase === 'confirmar') return (
      <>
        <h2 style={{ fontSize: 26, fontWeight: 800, color: C.text, marginBottom: 8 }}>Confirmar activación</h2>
        <p style={{ fontSize: 14, color: C.textLight, marginBottom: 22, lineHeight: 1.5 }}>
          Hola, <strong>{usuario?.user_metadata?.nombre || 'usuario'}</strong>.{' '}
          {tokenData?.tipo === 'docente'
            ? 'Se activará tu cuenta docente con el correo de tu sesión actual.'
            : 'Se activará el siguiente libro en tu cuenta:'}
        </p>
        <div style={{
          background: C.successLight, border: `1.5px solid ${C.success}40`, borderRadius: 14,
          padding: '16px 20px', marginBottom: 28, display: 'flex', alignItems: 'center', gap: 14,
        }}>
          <span style={{ fontSize: 30 }}>{tokenData?.tipo === 'docente' ? '🏫' : '📖'}</span>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.success, marginBottom: 2 }}>
              {tokenData?.tipo === 'docente' ? 'Token docente' : 'Libro encontrado'}
            </div>
            <div style={{ fontSize: 17, fontWeight: 800, color: C.text }}>
              {tokenData?.tipo === 'docente' ? usuario?.email : tokenData?.libroTitulo}
            </div>
          </div>
        </div>
        {error && <p style={{ fontSize: 14, color: C.danger, marginBottom: 12, fontWeight: 600, textAlign: 'center' }}>{error}</p>}
        <form onSubmit={handleActivarLogueado}>
          <Btn variant="success" disabled={cargando}>
            {cargando ? '⏳ Activando...' : tokenData?.tipo === 'docente' ? '✓ Activar cuenta docente' : '✓ Activar libro'}
          </Btn>
        </form>
        {tokenData?.tipo === 'docente' && (
          <OutlineBtn onClick={handleModificarDatos}>✏️ Modificar datos</OutlineBtn>
        )}
        <OutlineBtn onClick={handleCambiarCodigo}>← Cambiar código</OutlineBtn>
      </>
    )

    if (fase === 'registro') return (
      <>
        <div style={{
          background: C.primaryLight, border: `1px solid ${C.primary}30`, borderRadius: 12,
          padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 22,
        }}>
          <span style={{ fontSize: 20 }}>🔑</span>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.primary }}>Código recibido</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Se validará al crear tu cuenta</div>
          </div>
        </div>
        <h2 style={{ fontSize: 26, fontWeight: 800, color: C.text, marginBottom: 6 }}>Crear cuenta</h2>
        <p style={{ fontSize: 14, color: C.textLight, marginBottom: 20 }}>Completa tus datos para activar tu libro.</p>
        <form onSubmit={handleRegistro}>
          <InputField label="Nombre completo" placeholder="Ej: María García"
            value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} icon="👤" autoFocus />
          <InputField label="Correo electrónico" type="email" placeholder="tu@correo.com"
            value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} icon="✉️" />
          <InputField label="Contraseña" type="password" placeholder="Mínimo 6 caracteres"
            value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} icon="🔒" />
          {error && <p style={{ fontSize: 14, color: C.danger, marginBottom: 12, fontWeight: 600, textAlign: 'center' }}>{error}</p>}
          <Btn disabled={cargando}>{cargando ? '⏳ Creando cuenta...' : 'Crear cuenta y activar'}</Btn>
        </form>
        <p style={{ fontSize: 14, color: C.textLight, textAlign: 'center', marginTop: 8, marginBottom: 8 }}>
          ¿Ya tienes cuenta?{' '}
          <span onClick={() => navigate('/login')} style={{ color: C.primary, fontWeight: 700, cursor: 'pointer' }}>
            Inicia sesión
          </span>
        </p>
        <div style={{ textAlign: 'center' }}>
          <button type="button" onClick={handleCambiarCodigo}
            style={{ fontSize: 13, color: C.textLight, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'Nunito' }}>
            ← Cambiar código
          </button>
        </div>
      </>
    )

    // fase === 'codigo'
    return (
      <>
        <h2 style={{ fontSize: 28, fontWeight: 800, color: C.text, marginBottom: 8 }}>
          {usuario ? 'Activar otro libro' : 'Activa tu libro'}
        </h2>
        <p style={{ fontSize: 14, color: C.textLight, marginBottom: 28, lineHeight: 1.5 }}>
          {usuario
            ? 'Ingresa el código único de tu libro para añadirlo a tu biblioteca.'
            : 'Ingresa el código único de tu libro para crear tu cuenta y comenzar.'}
        </p>
        <form onSubmit={handleVerificarCodigo}>
          <InputField
            label="Código del libro"
            placeholder="Ej: TL-8F3A…"
            value={codigo}
            onChange={e => { setCodigo(e.target.value.toUpperCase()); setError('') }}
            icon="🔑"
            autoFocus
          />
          {error && <p style={{ fontSize: 14, color: C.danger, marginBottom: 12, fontWeight: 600, textAlign: 'center' }}>{error}</p>}
          <Btn disabled={cargando || !codigo.trim()}>
            {cargando ? '⏳ Verificando...' : 'Continuar →'}
          </Btn>
        </form>
        {usuario ? (
          <OutlineBtn onClick={() => navigate(profileRol === 'docente' ? '/panel-docente' : '/inicio')}>
            ← Volver a mi panel
          </OutlineBtn>
        ) : (
          <p style={{ fontSize: 14, color: C.textLight, textAlign: 'center', marginTop: 12 }}>
            ¿Ya tienes cuenta?{' '}
            <span onClick={() => navigate('/login')} style={{ color: C.primary, fontWeight: 700, cursor: 'pointer' }}>
              Inicia sesión
            </span>
          </p>
        )}
      </>
    )
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'Nunito' }}>
      {!isMobile && leftPanel()}
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: isMobile ? '32px 20px' : 48,
        minHeight: '100vh',
        background: isMobile ? `linear-gradient(160deg, ${C.primary}08, #fff)` : '#fff',
      }}>
        <div style={{ maxWidth: 420, width: '100%' }}>
          {isMobile && fase === 'codigo' && (
            <div style={{ textAlign: 'center', marginBottom: 28 }}>
              <div style={{ fontSize: 52 }}>📚</div>
              <div style={{ fontSize: 22, fontWeight: 900, color: C.primary }}>Libelula</div>
            </div>
          )}
          {rightContent()}
        </div>
      </div>
    </div>
  )
}
