import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getLibrosActivados, getPortadaUrl } from '../services/libros.service'
import { getClasesEstudiante } from '../services/clases.service'
import { activarTokenLibro } from '../services/tokens.service'
import Sidebar from '../components/Sidebar'
import { useWindowWidth } from '../hooks/useWindowWidth'

const C = {
  primary: '#2563EB', primaryLight: '#DBEAFE', primaryDark: '#1D4ED8',
  text: '#1F2937', textLight: '#6B7280', border: '#E5E7EB', bg: '#F8FAFC',
}

const BOOK_COLORS = [
  ['#2563EB','#7C3AED'], ['#16A34A','#059669'], ['#F97316','#EA580C'], ['#8B5CF6','#6D28D9'],
]

export default function Inicio() {
  const navigate = useNavigate()
  const width = useWindowWidth()
  const isMobile = width < 768
  const [usuario, setUsuario] = useState(null)
  const [perfil, setPerfil] = useState(null)
  const [libros, setLibros] = useState([])
  const [clases, setClases] = useState([])
  const [cargando, setCargando] = useState(true)
  const [modalLibro, setModalLibro] = useState(null)
  const [tokenInput, setTokenInput] = useState('')
  const [activando, setActivando] = useState(false)
  const [errorActivacion, setErrorActivacion] = useState(null)

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      setUsuario(user)
      if (user) {
        await Promise.all([cargarLibros(user.id), cargarClases(user.id), cargarPerfil(user.id)])
      }
      setCargando(false)
    }
    init()
  }, [])

  async function cargarPerfil(userId) {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('nombre, escuelas(nombre), grados(nombre)')
        .eq('id', userId)
        .single()
      setPerfil(data)
    } catch (err) { console.error('cargarPerfil:', err) }
  }

  async function cargarLibros(userId) {
    try {
      const librosData = await getLibrosActivados(userId)
      const librosConPortadas = await Promise.all(
        librosData.map(async libro => {
          const portadaUrl = libro.portada_url ? await getPortadaUrl(libro.portada_url) : null
          return { ...libro, portadaSrc: portadaUrl }
        })
      )
      setLibros(librosConPortadas)
    } catch (err) { console.error('cargarLibros:', err) }
  }

  async function cargarClases(userId) {
    try {
      const clasesData = await getClasesEstudiante(userId)
      setClases(clasesData)
    } catch (err) { console.error('cargarClases:', err) }
  }

  async function handleActivar() {
    if (!tokenInput.trim() || activando) return
    setActivando(true)
    setErrorActivacion(null)
    try {
      const result = await activarTokenLibro(tokenInput.trim(), usuario.id)
      if (result.ok) {
        await cargarLibros(usuario.id)
        setModalLibro(null)
        setTokenInput('')
      } else {
        const mensajes = {
          ya_tienes_libro: 'Ya tienes este libro activado.',
          token_invalido: 'Código inválido. Revísalo e intenta de nuevo.',
          token_desactivado: 'Este código ya no está disponible.',
          ya_activado: 'Este código ya fue utilizado.',
          libro_no_disponible_en_escuela: 'Este libro no está disponible en tu escuela.',
          grado_no_coincide: 'Este libro no corresponde a tu grado.',
          error_servidor: 'Error del servidor. Intenta de nuevo.',
        }
        setErrorActivacion(mensajes[result.motivo] ?? 'No se pudo activar el libro.')
      }
    } finally {
      setActivando(false)
    }
  }

  const librosActivadosIds = new Set(libros.map(l => l.id))
  const nombreUsuario = usuario?.user_metadata?.nombre || 'Estudiante'
  const pad = isMobile ? '20px 16px' : '28px 40px'

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'Nunito', background: C.bg }}>
      <Sidebar />
      <div style={{ flex: 1, overflowY: 'auto', paddingTop: isMobile ? 56 : 0 }}>

        {/* Header */}
        <div style={{
          background: `linear-gradient(135deg, ${C.primary}, ${C.primaryDark})`,
          padding: isMobile ? '24px 20px' : '32px 40px', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, opacity: 0.8 }}>¡Hola de nuevo! 👋</div>
            <div style={{ fontSize: isMobile ? 22 : 28, fontWeight: 800, overflowWrap: 'anywhere' }}>{nombreUsuario}</div>
            <div style={{ fontSize: 13, opacity: 0.7, marginTop: 4 }}>
              {libros.length > 0 ? `${libros.length} libro${libros.length > 1 ? 's' : ''} activado${libros.length > 1 ? 's' : ''}` : 'Activa tu primer libro'}
            </div>
            {(perfil?.grados?.nombre || perfil?.escuelas?.nombre) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
                {perfil.grados?.nombre && (
                  <span style={{ fontSize: 12, background: 'rgba(255,255,255,0.18)', borderRadius: 8, padding: '3px 10px', fontWeight: 700 }}>
                    🎒 {perfil.grados.nombre}
                  </span>
                )}
                {perfil.escuelas?.nombre && (
                  <span style={{ fontSize: 12, background: 'rgba(255,255,255,0.18)', borderRadius: 8, padding: '3px 10px', fontWeight: 700 }}>
                    🏫 {perfil.escuelas.nombre}
                  </span>
                )}
              </div>
            )}
          </div>
          <div style={{ fontSize: isMobile ? 40 : 56, opacity: 0.25 }}>📚</div>
        </div>

        <div style={{ padding: pad }}>

          {/* ── Mis clases ── */}
          <div style={{ marginBottom: 40 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
              <h2 style={{ fontSize: isMobile ? 18 : 22, fontWeight: 800, color: C.text, margin: 0 }}>Mis clases</h2>
              <button
                onClick={() => navigate('/unirse-clase')}
                style={{
                  background: 'transparent', color: C.primary, border: `2px solid ${C.primary}`,
                  borderRadius: 12, padding: '8px 16px', fontSize: 13, fontWeight: 700,
                  cursor: 'pointer', fontFamily: 'Nunito', whiteSpace: 'nowrap',
                }}
              >
                + Unirse a una clase
              </button>
            </div>

            {cargando ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '20px 0' }}>
                <Spinner />
              </div>
            ) : clases.length === 0 ? (
              <div style={{
                background: '#fff', borderRadius: 16, padding: '22px 20px',
                border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 16,
              }}>
                <div style={{ fontSize: 30, flexShrink: 0 }}>🏫</div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>No estás en ninguna clase</div>
                  <div style={{ fontSize: 13, color: C.textLight, marginTop: 2 }}>Pide el código a tu docente y únete.</div>
                </div>
              </div>
            ) : (
              <div style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: isMobile ? 10 : 16,
              }}>
                {clases.map(clase => (
                  <div key={clase.id} style={{
                    background: '#fff', borderRadius: 16, padding: '18px 20px',
                    border: `1px solid ${C.border}`, boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                    display: 'flex', flexDirection: 'column', gap: 10,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                      <div style={{
                        width: 42, height: 42, borderRadius: 12, background: C.primaryLight,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0,
                      }}>🏫</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 15, fontWeight: 800, color: C.text, lineHeight: 1.3 }}>{clase.nombre}</div>
                      </div>
                    </div>
                    {(clase.libros?.length > 0) && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                        {clase.libros.map((l) => {
                          const activado = librosActivadosIds.has(l.libroId)
                          return (
                            <div
                              key={l.libroId}
                              onClick={activado ? () => navigate(`/libro/${l.libroId}`) : undefined}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                background: activado ? C.primaryLight : '#F9FAFB',
                                borderRadius: 10, padding: '8px 10px',
                                border: activado ? `1px solid ${C.primary}44` : '1px dashed #D1D5DB',
                                cursor: activado ? 'pointer' : 'default',
                              }}
                            >
                              <span style={{ fontSize: 15, flexShrink: 0 }}>{activado ? '📗' : '🔒'}</span>
                              <span style={{ fontSize: 12, fontWeight: 700, flex: 1, color: activado ? C.primary : '#6B7280' }}>
                                {l.libroTitulo}
                              </span>
                              {activado
                                ? <span style={{ fontSize: 10, color: C.primary, opacity: 0.6, flexShrink: 0 }}>Abrir →</span>
                                : (
                                  <button
                                    onClick={e => {
                                      e.stopPropagation()
                                      setModalLibro({ libroId: l.libroId, libroTitulo: l.libroTitulo })
                                      setTokenInput('')
                                      setErrorActivacion(null)
                                    }}
                                    style={{
                                      background: C.primary, color: '#fff', border: 'none', borderRadius: 7,
                                      padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                                      fontFamily: 'Nunito', flexShrink: 0,
                                    }}
                                  >
                                    Activar
                                  </button>
                                )
                              }
                            </div>
                          )
                        })}
                      </div>
                    )}
                    {clase.codigo && (
                      <div style={{ fontSize: 11, color: C.textLight, fontFamily: 'monospace', letterSpacing: 1 }}>
                        Código: {clase.codigo}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Mis libros ── */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, gap: 12, flexWrap: 'wrap' }}>
            <h2 style={{ fontSize: isMobile ? 18 : 22, fontWeight: 800, color: C.text, margin: 0 }}>Mis libros</h2>
            <button
              onClick={() => navigate('/activar')}
              style={{
                background: 'transparent', color: C.primary, border: `2px solid ${C.primary}`,
                borderRadius: 12, padding: '8px 16px', fontSize: 13, fontWeight: 700,
                cursor: 'pointer', fontFamily: 'Nunito', whiteSpace: 'nowrap',
              }}
            >
              + Activar libro
            </button>
          </div>

          {cargando ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
              <Spinner />
            </div>
          ) : libros.length === 0 ? (
            <div style={{ background: '#fff', borderRadius: 16, padding: isMobile ? 36 : 60, textAlign: 'center', border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 52, marginBottom: 12 }}>📖</div>
              <h3 style={{ fontSize: 17, fontWeight: 700, color: C.text, marginBottom: 8 }}>No tienes libros activados</h3>
              <p style={{ fontSize: 14, color: C.textLight, marginBottom: 24 }}>Ingresa el código de tu libro para comenzar.</p>
              <button onClick={() => navigate('/activar')} style={{
                background: C.primary, color: '#fff', border: 'none', borderRadius: 12,
                padding: '12px 24px', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'Nunito',
              }}>Activar un libro</button>
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(308px, 1fr))',
              gap: isMobile ? 12 : 20,
            }}>
              {libros.map((libro, i) => {
                const [c1, c2] = BOOK_COLORS[i % BOOK_COLORS.length]
                return (
                  <div key={libro.id}
                    onClick={() => navigate(`/libro/${libro.id}`)}
                    onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.12)' }}
                    onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.06)' }}
                    style={{
                      background: '#fff', borderRadius: 16, overflow: 'hidden', cursor: 'pointer',
                      border: `1px solid ${C.border}`, boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                      transition: 'transform 0.2s, box-shadow 0.2s',
                      display: isMobile ? 'flex' : 'block',
                    }}>
                    <div style={{
                      width: isMobile ? 112 : '100%', height: isMobile ? 112 : 182,
                      background: `linear-gradient(135deg, ${c1}, ${c2})`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: isMobile ? 50 : 67, flexShrink: 0,
                    }}>
                      {libro.portadaSrc ? (
                        <img
                          src={libro.portadaSrc}
                          alt={libro.titulo}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          onError={e => { e.currentTarget.style.display = 'none' }}
                        />
                      ) : '📗'}
                    </div>
                    <div style={{ padding: isMobile ? '12px 16px' : 16, flex: 1 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: C.text, marginBottom: 4 }}>{libro.titulo}</div>
                      <div style={{ fontSize: 13, color: C.textLight, lineHeight: 1.4 }}>{libro.descripcion}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
      {modalLibro && (
        <div
          onClick={() => { setModalLibro(null); setTokenInput(''); setErrorActivacion(null) }}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, padding: 20,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#fff', borderRadius: 20, padding: 32, maxWidth: 400, width: '100%',
              boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
            }}
          >
            <div style={{ fontSize: 36, textAlign: 'center', marginBottom: 8 }}>🔑</div>
            <h3 style={{ textAlign: 'center', fontSize: 18, fontWeight: 800, color: C.text, margin: '0 0 4px' }}>
              Activar libro
            </h3>
            <p style={{ textAlign: 'center', fontSize: 13, color: C.textLight, margin: '0 0 20px', fontWeight: 600 }}>
              {modalLibro.libroTitulo}
            </p>
            <input
              value={tokenInput}
              onChange={e => { setTokenInput(e.target.value.toUpperCase()); setErrorActivacion(null) }}
              placeholder="Introduce tu código"
              maxLength={50}
              autoFocus
              onKeyDown={e => e.key === 'Enter' && handleActivar()}
              style={{
                width: '100%', padding: '12px 16px', fontSize: 15, fontFamily: 'Nunito',
                border: `2px solid ${errorActivacion ? '#EF4444' : C.border}`, borderRadius: 12,
                outline: 'none', boxSizing: 'border-box', textAlign: 'center',
                letterSpacing: 2, fontWeight: 700, color: C.text,
                transition: 'border-color 0.15s',
              }}
            />
            {errorActivacion && (
              <div style={{ color: '#EF4444', fontSize: 12, fontWeight: 600, marginTop: 8, textAlign: 'center' }}>
                {errorActivacion}
              </div>
            )}
            <button
              onClick={handleActivar}
              disabled={activando || !tokenInput.trim()}
              style={{
                width: '100%', marginTop: 16, padding: 13, fontSize: 15, fontWeight: 700,
                background: activando || !tokenInput.trim() ? '#93C5FD' : C.primary,
                color: '#fff', border: 'none', borderRadius: 12,
                cursor: activando || !tokenInput.trim() ? 'not-allowed' : 'pointer',
                fontFamily: 'Nunito',
              }}
            >
              {activando ? 'Activando...' : 'Activar libro'}
            </button>
            <button
              onClick={() => { setModalLibro(null); setTokenInput(''); setErrorActivacion(null) }}
              style={{
                width: '100%', marginTop: 8, padding: 11, fontSize: 14, fontWeight: 700,
                background: 'transparent', color: C.textLight, border: `1px solid ${C.border}`,
                borderRadius: 12, cursor: 'pointer', fontFamily: 'Nunito',
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function Spinner() {
  return (
    <>
      <div style={{ width: 36, height: 36, border: '4px solid #2563EB', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </>
  )
}
