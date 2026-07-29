import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getLibrosEscuela } from '../services/libros.service'
import { crearClase } from '../services/clases.service'
import { useWindowWidth } from '../hooks/useWindowWidth'

const C = {
  navy: '#1e3a8a', navyDark: '#1e2f6e',
  primary: '#2563EB', primaryLight: '#DBEAFE',
  text: '#1F2937', textLight: '#6B7280',
  border: '#E5E7EB', bg: '#F1F5F9',
  error: '#DC2626', errorBg: '#FEF2F2',
  success: '#16A34A', successBg: '#F0FDF4',
}

export default function NuevaClase() {
  const navigate = useNavigate()
  const width = useWindowWidth()
  const isMobile = width < 768

  const [nombre, setNombre] = useState('')
  const [emoji, setEmoji] = useState('🏫')
  const [gradoId, setGradoId] = useState('')
  const [grados, setGrados] = useState([])
  const [todosLosLibros, setTodosLosLibros] = useState([])
  const [librosDisponibles, setLibrosDisponibles] = useState([])
  const [librosSeleccionados, setLibrosSeleccionados] = useState([])
  const [cargandoLibros, setCargandoLibros] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { cargarDatos() }, [])

  async function cargarDatos() {
    try {
      const [{ data: gradosData }, libros] = await Promise.all([
        supabase.from('grados').select('id, nombre, nivel').order('orden'),
        getLibrosEscuela(),
      ])
      setGrados(gradosData || [])
      setTodosLosLibros(libros)
    } catch (err) { console.error(err) }
    finally { setCargandoLibros(false) }
  }

  function handleGradoChange(val) {
    const id = parseInt(val)
    setGradoId(val)
    setLibrosSeleccionados([])
    setLibrosDisponibles(todosLosLibros.filter(l => l.grado_id === id || l.grado_id === null))
  }

  function toggleLibro(libro) {
    setLibrosSeleccionados(prev => {
      const existe = prev.some(l => l.libroId === libro.libroId)
      return existe ? prev.filter(l => l.libroId !== libro.libroId) : [...prev, libro]
    })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!nombre.trim()) { setError('El nombre de la clase es obligatorio.'); return }
    if (!gradoId) { setError('Selecciona un grado.'); return }
    if (librosSeleccionados.length === 0) { setError('Selecciona al menos un libro.'); return }

    setGuardando(true)
    try {
      await crearClase({ nombre: nombre.trim(), emoji, gradoId: parseInt(gradoId), libros: librosSeleccionados })
      navigate('/panel-docente')
    } catch (err) {
      console.error(err)
      const mensajes = {
        acceso_denegado: 'Tu sesión no tiene permisos para crear clases. Vuelve a iniciar sesión o contacta al administrador.',
        docente_sin_escuela: 'Tu cuenta no tiene una escuela asignada. Contacta a tu institución.',
        error_insertar_libros: 'La clase se creó pero no se pudieron asignar los libros. Agrégalos desde el panel de la clase.',
        error_guardar_emoji: 'La clase se creó, pero no se pudo guardar el emoji. Verifica la migración de Supabase.',
        error_clase_id_invalido: 'Error interno al crear la clase. Intenta de nuevo.',
      }
      setError(mensajes[err.message] ?? 'Error al crear la clase. Intenta de nuevo.')
    } finally { setGuardando(false) }
  }

  return (
    <div style={{ minHeight: '100vh', fontFamily: 'Nunito', background: C.bg }}>

      {/* Top nav */}
      <nav className="responsive-teacher-nav" style={{
        background: `linear-gradient(135deg, ${C.navy}, ${C.navyDark})`,
        padding: isMobile ? '8px 12px' : '0 24px', height: isMobile ? 'auto' : 60, minHeight: 60, display: 'flex',
        alignItems: 'center', gap: 16,
        position: 'sticky', top: 0, zIndex: 100,
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
      }}>
        <button onClick={() => navigate('/panel-docente')} style={{
          background: 'rgba(255,255,255,0.12)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)',
          borderRadius: 8, padding: '6px 14px', fontSize: 13, fontWeight: 700,
          cursor: 'pointer', fontFamily: 'Nunito',
        }}>
          ← Volver
        </button>
        <div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', lineHeight: 1 }}>Panel Docente</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>Nueva clase</div>
        </div>
      </nav>

      {/* Form */}
      <div style={{ padding: isMobile ? '24px 16px' : '40px', maxWidth: 680, margin: '0 auto' }}>
        <form onSubmit={handleSubmit}>

          {/* Nombre */}
          <div style={{ background: '#fff', borderRadius: 16, padding: isMobile ? 24 : 32, border: `1px solid ${C.border}`, marginBottom: 20 }}>
            <label style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 8, display: 'block' }}>
              Nombre de la clase
            </label>
            <input
              value={nombre}
              onChange={e => setNombre(e.target.value)}
              placeholder="Ej: Lectura 1°A"
              style={{
                width: '100%', padding: '13px 16px', borderRadius: 12, boxSizing: 'border-box',
                border: `1.5px solid ${C.border}`, fontSize: 16, fontFamily: 'Nunito',
                outline: 'none', color: C.text,
              }}
            />

            <label style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 8, display: 'block', marginTop: 20 }}>
              Emoji de la clase
            </label>
            <p style={{ fontSize: 12, color: C.textLight, margin: '0 0 10px' }}>
              Ayudará a identificarla rápidamente en el panel lateral.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {['🏫', '📚', '✏️', '🎨', '🔬', '🌎', '🚀', '⭐', '🦋', '🌈', '🧠', '🎵'].map(option => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setEmoji(option)}
                  aria-label={`Usar emoji ${option}`}
                  aria-pressed={emoji === option}
                  style={{
                    width: 42, height: 42, borderRadius: 10, fontSize: 21,
                    background: emoji === option ? C.primaryLight : '#fff',
                    border: `2px solid ${emoji === option ? C.primary : C.border}`,
                    cursor: 'pointer',
                  }}
                >
                  {option}
                </button>
              ))}
            </div>

            {/* Grado */}
            <label style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 8, display: 'block', marginTop: 20 }}>
              Grado
            </label>
            <select
              value={gradoId}
              onChange={e => handleGradoChange(e.target.value)}
              style={{
                width: '100%', padding: '13px 16px', borderRadius: 12, boxSizing: 'border-box',
                border: `1.5px solid ${C.border}`, fontSize: 16, fontFamily: 'Nunito',
                outline: 'none', color: gradoId ? C.text : C.textLight, background: '#fff',
              }}
            >
              <option value="">Selecciona un grado</option>
              {grados.map(g => <option key={g.id} value={g.id}>{g.nombre}</option>)}
            </select>
            <p style={{ fontSize: 12, color: C.textLight, margin: '8px 0 0' }}>
              El código de acceso se genera automáticamente al crear la clase.
            </p>
          </div>

          {/* Libros */}
          <div style={{ background: '#fff', borderRadius: 16, padding: isMobile ? 24 : 32, border: `1px solid ${C.border}`, marginBottom: 20 }}>
            <label style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 4, display: 'block' }}>
              Libros asignados
            </label>
            <p style={{ fontSize: 13, color: C.textLight, margin: '0 0 16px' }}>
              {gradoId ? 'Libros de tu escuela disponibles para este grado.' : 'Selecciona primero un grado para ver los libros disponibles.'}
            </p>

            {cargandoLibros ? (
              <div style={{ textAlign: 'center', padding: '24px 0', color: C.textLight }}>Cargando libros...</div>
            ) : !gradoId ? (
              <div style={{ textAlign: 'center', padding: '24px 0', color: C.textLight, fontSize: 13 }}>
                Selecciona un grado para ver los libros disponibles.
              </div>
            ) : librosDisponibles.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px 0', color: C.textLight }}>
                No hay libros disponibles para este grado en tu escuela.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {librosDisponibles.map(libro => {
                  const seleccionado = librosSeleccionados.some(l => l.libroId === libro.libroId)
                  return (
                    <div
                      key={libro.libroId}
                      onClick={() => toggleLibro(libro)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px',
                        borderRadius: 12, cursor: 'pointer', transition: 'background 0.15s',
                        border: `2px solid ${seleccionado ? C.primary : C.border}`,
                        background: seleccionado ? C.primaryLight : '#FAFAFA',
                      }}
                    >
                      <div style={{
                        width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                        border: `2px solid ${seleccionado ? C.primary : '#CBD5E1'}`,
                        background: seleccionado ? C.primary : '#fff',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        {seleccionado && <span style={{ color: '#fff', fontSize: 13, fontWeight: 900 }}>✓</span>}
                      </div>
                      <span style={{ fontSize: 14, fontWeight: seleccionado ? 700 : 400, color: seleccionado ? C.primary : C.text }}>
                        📖 {libro.libroTitulo}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {error && (
            <div style={{
              background: C.errorBg, border: '1px solid #FECACA', borderRadius: 12,
              padding: '12px 16px', color: C.error, fontSize: 14, fontWeight: 600, marginBottom: 16,
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={guardando}
            style={{
              width: '100%', background: `linear-gradient(135deg, ${C.primary}, ${C.navy})`,
              color: '#fff', border: 'none', borderRadius: 14, padding: '16px',
              fontSize: 16, fontWeight: 700, cursor: guardando ? 'not-allowed' : 'pointer',
              fontFamily: 'Nunito', opacity: guardando ? 0.65 : 1, transition: 'opacity 0.2s',
            }}
          >
            {guardando ? 'Creando clase...' : 'Crear clase'}
          </button>
        </form>
      </div>
    </div>
  )
}
