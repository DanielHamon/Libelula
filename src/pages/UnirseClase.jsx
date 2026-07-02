import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { buscarClasePorCodigo, unirseAClase } from '../services/clases.service'
import Sidebar from '../components/Sidebar'
import { useWindowWidth } from '../hooks/useWindowWidth'

const C = {
  primary: '#2563EB', primaryLight: '#DBEAFE', primaryDark: '#1D4ED8',
  text: '#1F2937', textLight: '#6B7280', border: '#E5E7EB', bg: '#F8FAFC',
  error: '#DC2626', errorBg: '#FEF2F2', errorBorder: '#FECACA',
  success: '#16A34A', successBg: '#F0FDF4', successBorder: '#86EFAC',
}

export default function UnirseClase() {
  const navigate = useNavigate()
  const width = useWindowWidth()
  const isMobile = width < 768
  const [codigo, setCodigo] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [clase, setClase] = useState(null)
  const [error, setError] = useState('')
  const [uniendose, setUniendose] = useState(false)
  const [exito, setExito] = useState(false)

  async function buscarClase() {
    const codigoFinal = codigo.trim().toUpperCase()
    if (!codigoFinal) return
    setBuscando(true); setError(''); setClase(null)
    try {
      const { clase: claseEncontrada, error: claseError } = await buscarClasePorCodigo(codigoFinal)
      if (claseError === 'no_encontrada') { setError('No se encontró ninguna clase con ese código.'); return }
      if (claseError === 'ya_inscrito') { setError('Ya eres miembro de esta clase.'); return }
      if (claseError === 'escuela_incorrecta') { setError('Esta clase pertenece a otra escuela. Solo puedes unirte a clases de tu escuela.'); return }
      if (claseError === 'grado_incorrecto') { setError('Esta clase es de un grado diferente al tuyo. Verifica el código con tu docente.'); return }
      if (!claseEncontrada) { setError('Esta clase está inactiva o no disponible.'); return }
      setClase(claseEncontrada)
    } catch (err) {
      console.error(err)
      setError('Ocurrió un error al buscar la clase. Intenta de nuevo.')
    } finally {
      setBuscando(false)
    }
  }

  async function unirse() {
    if (!clase) return
    setUniendose(true)
    try {
      const ok = await unirseAClase(clase.codigo)
      if (!ok) { setError('Error al unirse a la clase. Intenta de nuevo.'); return }
      setExito(true)
      setTimeout(() => navigate('/inicio'), 2200)
    } catch (err) {
      console.error(err)
      setError('Error al unirse a la clase. Intenta de nuevo.')
    } finally {
      setUniendose(false)
    }
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'Nunito', background: C.bg }}>
      <Sidebar />
      <div style={{ flex: 1, overflowY: 'auto', paddingTop: isMobile ? 56 : 0 }}>

        {/* Header */}
        <div style={{
          background: `linear-gradient(135deg, ${C.primary}, ${C.primaryDark})`,
          padding: isMobile ? '24px 20px' : '32px 40px', color: '#fff',
        }}>
          <button
            onClick={() => navigate('/inicio')}
            style={{
              background: 'rgba(255,255,255,0.15)', color: '#fff', border: 'none',
              borderRadius: 8, padding: '6px 14px', fontSize: 13, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'Nunito', marginBottom: 16, display: 'block',
            }}
          >
            ← Volver
          </button>
          <div style={{ fontSize: isMobile ? 22 : 28, fontWeight: 800 }}>Unirse a una clase</div>
          <div style={{ fontSize: 14, opacity: 0.8, marginTop: 4 }}>Ingresa el código que te dio tu docente</div>
        </div>

        {/* Contenido */}
        <div style={{ padding: isMobile ? '24px 16px' : '40px', maxWidth: 560, margin: '0 auto' }}>

          {exito ? (
            <div style={{
              background: C.successBg, border: `2px solid ${C.successBorder}`,
              borderRadius: 20, padding: '40px 32px', textAlign: 'center',
            }}>
              <div style={{ fontSize: 56, marginBottom: 16 }}>✅</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: C.success, marginBottom: 8 }}>
                ¡Te uniste a la clase!
              </div>
              <div style={{ fontSize: 14, color: C.textLight }}>Redirigiendo al inicio...</div>
            </div>
          ) : (
            <>
              {/* Campo de código */}
              <div style={{
                background: '#fff', borderRadius: 16, padding: isMobile ? 24 : 32,
                border: `1px solid ${C.border}`, boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                marginBottom: 24,
              }}>
                <label style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 8, display: 'block' }}>
                  Código de clase
                </label>
                <input
                  value={codigo}
                  onChange={e => { setCodigo(e.target.value.toUpperCase()); setError(''); setClase(null) }}
                  onKeyDown={e => e.key === 'Enter' && buscarClase()}
                  placeholder="Ej: MAT-4A-X7K2"
                  style={{
                    width: '100%', padding: '14px 16px', borderRadius: 12, boxSizing: 'border-box',
                    border: `1.5px solid ${error ? C.error : C.border}`, outline: 'none',
                    fontSize: 20, fontFamily: 'Nunito', fontWeight: 700, color: C.text,
                    letterSpacing: 2, textTransform: 'uppercase', transition: 'border-color 0.2s',
                  }}
                />
                {error && (
                  <div style={{
                    marginTop: 10, padding: '10px 14px', borderRadius: 10,
                    background: C.errorBg, border: `1px solid ${C.errorBorder}`,
                    color: C.error, fontSize: 13, fontWeight: 600,
                  }}>
                    {error}
                  </div>
                )}
                <button
                  onClick={buscarClase}
                  disabled={buscando || !codigo.trim()}
                  style={{
                    width: '100%', marginTop: 16, background: C.primary, color: '#fff',
                    border: 'none', borderRadius: 12, padding: '14px', fontSize: 15,
                    fontWeight: 700, cursor: buscando || !codigo.trim() ? 'not-allowed' : 'pointer',
                    fontFamily: 'Nunito', opacity: buscando || !codigo.trim() ? 0.55 : 1,
                    transition: 'opacity 0.2s',
                  }}
                >
                  {buscando ? 'Buscando...' : 'Buscar clase'}
                </button>
              </div>

              {/* Resultado */}
              {clase && (
                <div style={{
                  background: '#fff', borderRadius: 16, overflow: 'hidden',
                  border: `2px solid ${C.primaryLight}`, boxShadow: '0 4px 20px rgba(37,99,235,0.10)',
                }}>
                  <div style={{
                    background: C.primaryLight, padding: '14px 24px',
                    borderBottom: `1px solid ${C.border}`,
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}>
                    <span style={{ fontSize: 16 }}>🏫</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: C.primary, textTransform: 'uppercase', letterSpacing: 1 }}>
                      Clase encontrada
                    </span>
                  </div>
                  <div style={{ padding: '24px' }}>
                    <div style={{ fontSize: 21, fontWeight: 800, color: C.text, marginBottom: 16 }}>
                      {clase.nombre}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
                      {(clase.libros?.length > 0) && (
                        <div style={{ fontSize: 14, color: '#6B7280' }}>
                          <span style={{ fontWeight: 700, color: '#1F2937' }}>
                            Libro{clase.libros.length > 1 ? 's' : ''} asignado{clase.libros.length > 1 ? 's' : ''}:{' '}
                          </span>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                            {clase.libros.map((l, i) => (
                              <span key={i} style={{
                                background: '#DBEAFE', color: '#2563EB',
                                borderRadius: 8, padding: '3px 10px', fontSize: 13, fontWeight: 700,
                              }}>
                                📖 {l.libroTitulo}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    <button
                      onClick={unirse}
                      disabled={uniendose}
                      style={{
                        width: '100%',
                        background: `linear-gradient(135deg, ${C.primary}, ${C.primaryDark})`,
                        color: '#fff', border: 'none', borderRadius: 12, padding: '15px',
                        fontSize: 16, fontWeight: 700, cursor: uniendose ? 'not-allowed' : 'pointer',
                        fontFamily: 'Nunito', opacity: uniendose ? 0.65 : 1, transition: 'opacity 0.2s',
                      }}
                    >
                      {uniendose ? 'Uniéndose...' : 'Unirme a esta clase'}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
