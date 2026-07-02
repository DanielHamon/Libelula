import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { cerrarSesion } from '../lib/session'
import { getClasesDocente, eliminarClase } from '../services/clases.service'
import { useWindowWidth } from '../hooks/useWindowWidth'

const C = {
  navy: '#1e3a8a', navyDark: '#1e2f6e',
  primary: '#2563EB', primaryLight: '#DBEAFE',
  text: '#1F2937', textLight: '#6B7280',
  border: '#E5E7EB', bg: '#F1F5F9',
  success: '#16A34A', successLight: '#DCFCE7',
}

export default function PanelDocente() {
  const navigate = useNavigate()
  const width = useWindowWidth()
  const isMobile = width < 768
  const [usuario, setUsuario] = useState(null)
  const [escuela, setEscuela] = useState(null)
  const [clases, setClases] = useState([])
  const [cargando, setCargando] = useState(true)
  const [confirmEliminar, setConfirmEliminar] = useState(null)
  const [eliminando, setEliminando] = useState(false)

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      setUsuario(user)
      if (!user) return
      const { data: profile } = await supabase
        .from('profiles')
        .select('nombre, escuelas(nombre)')
        .eq('id', user.id)
        .single()
      setEscuela(profile?.escuelas?.nombre || null)
      await cargarClases(user.id)
    }
    init()
  }, [])

  async function cargarClases(userId) {
    try {
      const data = await getClasesDocente(userId)
      setClases(data)
    } catch (err) { console.error(err) }
    finally { setCargando(false) }
  }

  async function handleCerrarSesion() {
    await cerrarSesion()
    navigate('/login')
  }

  async function handleEliminar() {
    if (!confirmEliminar || eliminando) return
    setEliminando(true)
    try {
      await eliminarClase(confirmEliminar.id)
      setClases(prev => prev.filter(c => c.id !== confirmEliminar.id))
      setConfirmEliminar(null)
    } catch (err) {
      console.error('eliminarClase:', err)
    } finally {
      setEliminando(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', fontFamily: 'Nunito', background: C.bg }}>

      {/* Top nav */}
      <nav style={{
        background: `linear-gradient(135deg, ${C.navy}, ${C.navyDark})`,
        padding: '0 24px', height: 60, display: 'flex',
        alignItems: 'center', justifyContent: 'space-between',
        position: 'sticky', top: 0, zIndex: 100,
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 22 }}>📚</span>
          <div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', lineHeight: 1 }}>Libelula</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>Panel Docente</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.75)', display: isMobile ? 'none' : 'inline' }}>
            {usuario?.user_metadata?.nombre || ''}
          </span>
          <button onClick={handleCerrarSesion} style={{
            background: 'rgba(255,255,255,0.12)', color: '#fff', border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: 8, padding: '6px 14px', fontSize: 13, fontWeight: 700,
            cursor: 'pointer', fontFamily: 'Nunito',
          }}>
            Salir
          </button>
        </div>
      </nav>

      {/* Contenido */}
      <div style={{ padding: isMobile ? '24px 16px' : '36px 40px', maxWidth: 1200, margin: '0 auto' }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontSize: isMobile ? 20 : 26, fontWeight: 800, color: C.text, margin: 0 }}>Mis clases</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
              <p style={{ fontSize: 14, color: C.textLight, margin: 0 }}>
                {cargando ? '...' : `${clases.length} clase${clases.length !== 1 ? 's' : ''} creada${clases.length !== 1 ? 's' : ''}`}
              </p>
              {escuela && (
                <span style={{ fontSize: 13, fontWeight: 700, color: C.primary, background: C.primaryLight, borderRadius: 8, padding: '2px 10px' }}>
                  🏫 {escuela}
                </span>
              )}
            </div>
          </div>
          <button onClick={() => navigate('/panel-docente/clase/nueva')} style={{
            background: `linear-gradient(135deg, ${C.primary}, ${C.navy})`,
            color: '#fff', border: 'none', borderRadius: 12,
            padding: '10px 20px', fontSize: 14, fontWeight: 700,
            cursor: 'pointer', fontFamily: 'Nunito',
          }}>
            + Nueva clase
          </button>
        </div>

        {cargando ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '80px 0' }}>
            <Spinner />
          </div>
        ) : clases.length === 0 ? (
          <div style={{
            background: '#fff', borderRadius: 20, padding: isMobile ? '48px 24px' : '72px 60px',
            textAlign: 'center', border: `1px solid ${C.border}`,
          }}>
            <div style={{ fontSize: 56, marginBottom: 16 }}>🏫</div>
            <h3 style={{ fontSize: 18, fontWeight: 800, color: C.text, marginBottom: 8 }}>No tienes clases todavía</h3>
            <p style={{ fontSize: 14, color: C.textLight, marginBottom: 28 }}>
              Crea tu primera clase y comparte el código con tus estudiantes.
            </p>
            <button onClick={() => navigate('/panel-docente/clase/nueva')} style={{
              background: C.primary, color: '#fff', border: 'none', borderRadius: 12,
              padding: '12px 28px', fontSize: 15, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'Nunito',
            }}>
              Crear primera clase
            </button>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(340px, 1fr))',
            gap: isMobile ? 12 : 20,
          }}>
            {clases.map(clase => (
              <ClaseCard
                key={clase.id}
                clase={clase}
                onClick={() => navigate(`/panel-docente/clase/${clase.id}`)}
                onEliminar={() => setConfirmEliminar(clase)}
              />
            ))}
          </div>
        )}
      </div>

      {confirmEliminar && (
        <div
          onClick={() => !eliminando && setConfirmEliminar(null)}
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
            <div style={{ fontSize: 36, textAlign: 'center', marginBottom: 8 }}>🗑️</div>
            <h3 style={{ textAlign: 'center', fontSize: 18, fontWeight: 800, color: C.text, margin: '0 0 8px' }}>
              Eliminar clase
            </h3>
            <p style={{ textAlign: 'center', fontSize: 14, color: C.textLight, margin: '0 0 4px' }}>
              ¿Eliminar <strong style={{ color: C.text }}>{confirmEliminar.nombre}</strong>?
            </p>
            <p style={{ textAlign: 'center', fontSize: 12, color: '#EF4444', margin: '0 0 24px', fontWeight: 600 }}>
              Se eliminarán todas las inscripciones. Esta acción no se puede deshacer.
            </p>
            <button
              onClick={handleEliminar}
              disabled={eliminando}
              style={{
                width: '100%', padding: 13, fontSize: 15, fontWeight: 700,
                background: eliminando ? '#FCA5A5' : '#EF4444',
                color: '#fff', border: 'none', borderRadius: 12, marginBottom: 8,
                cursor: eliminando ? 'not-allowed' : 'pointer', fontFamily: 'Nunito',
              }}
            >
              {eliminando ? 'Eliminando...' : 'Sí, eliminar clase'}
            </button>
            <button
              onClick={() => setConfirmEliminar(null)}
              disabled={eliminando}
              style={{
                width: '100%', padding: 11, fontSize: 14, fontWeight: 700,
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

function barColor(pct) {
  if (pct >= 80) return '#16A34A'
  if (pct >= 50) return '#2563EB'
  if (pct >= 20) return '#F97316'
  return '#EF4444'
}

function ClaseCard({ clase, onClick, onEliminar }) {
  const [menuAbierto, setMenuAbierto] = useState(false)
  const libros = clase.libros || []
  const numEstudiantes = clase.estudiantes?.length || 0
  const pct = clase.promedioProgreso || 0
  const activos = clase.estudiantesActivos || 0
  const color = barColor(pct)

  return (
    <div
      onClick={onClick}
      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.10)' }}
      onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.06)' }}
      style={{
        background: '#fff', borderRadius: 18, border: `1px solid ${C.border}`,
        boxShadow: '0 1px 4px rgba(0,0,0,0.06)', cursor: 'pointer',
        transition: 'transform 0.18s, box-shadow 0.18s',
      }}
    >
      <div style={{ height: 5, background: `linear-gradient(90deg, ${C.primary}, ${C.navy})`, borderRadius: '18px 18px 0 0' }} />
      <div style={{ padding: '20px 22px' }}>

        {/* Nombre + menú ⋯ */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: C.text, lineHeight: 1.3 }}>{clase.nombre}</div>
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <button
              onClick={e => { e.stopPropagation(); setMenuAbierto(o => !o) }}
              style={{
                background: menuAbierto ? C.primaryLight : 'none',
                border: 'none', borderRadius: 8, padding: '2px 10px',
                fontSize: 20, color: C.textLight, cursor: 'pointer',
                lineHeight: 1.2, fontWeight: 900, letterSpacing: 1,
              }}
            >⋯</button>
            {menuAbierto && (
              <>
                <div
                  style={{ position: 'fixed', inset: 0, zIndex: 40 }}
                  onClick={e => { e.stopPropagation(); setMenuAbierto(false) }}
                />
                <div style={{
                  position: 'absolute', top: '110%', right: 0, zIndex: 50,
                  background: '#fff', borderRadius: 10, minWidth: 170,
                  boxShadow: '0 4px 20px rgba(0,0,0,0.13)',
                  border: `1px solid ${C.border}`, overflow: 'hidden',
                }}>
                  <button
                    onClick={e => { e.stopPropagation(); setMenuAbierto(false); onEliminar() }}
                    onMouseEnter={e => e.currentTarget.style.background = '#FEF2F2'}
                    onMouseLeave={e => e.currentTarget.style.background = 'none'}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      width: '100%', padding: '10px 16px',
                      background: 'none', border: 'none', textAlign: 'left',
                      fontSize: 13, fontWeight: 700, color: '#EF4444',
                      cursor: 'pointer', fontFamily: 'Nunito',
                    }}
                  >
                    🗑️ Eliminar clase
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Libros */}
        <div style={{ marginBottom: 14 }}>
          <span style={{
            background: libros.length > 0 ? '#F0FDF4' : C.border,
            color: libros.length > 0 ? C.success : C.textLight,
            borderRadius: 8, padding: '3px 10px', fontSize: 12, fontWeight: 700,
          }}>
            📖 {libros.length > 0 ? `${libros.length} libro${libros.length !== 1 ? 's' : ''} para esta clase` : 'Sin libro asignado'}
          </span>
        </div>

        {/* Progreso promedio */}
        {libros.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: C.textLight }}>Progreso promedio</span>
              <span style={{ fontSize: 13, fontWeight: 800, color }}>{pct}%</span>
            </div>
            <div style={{ background: C.border, borderRadius: 4, height: 5, width: '100%', overflow: 'hidden' }}>
              <div style={{
                background: color, height: '100%', borderRadius: 4,
                width: `${Math.min(100, pct)}%`, transition: 'width 0.5s ease',
              }} />
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          paddingTop: 12, borderTop: `1px solid ${C.border}`,
        }}>
          <div style={{ fontSize: 13, color: C.textLight }}>
            <span style={{ fontWeight: 700, color: C.text, fontSize: 16 }}>{numEstudiantes}</span>
            {' '}alumno{numEstudiantes !== 1 ? 's' : ''}
            {numEstudiantes > 0 && (
              <span style={{ marginLeft: 8, color: C.success, fontWeight: 700 }}>
                · {activos} activo{activos !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <span style={{ fontSize: 13, color: C.primary, fontWeight: 700 }}>Ver detalle →</span>
        </div>
      </div>
    </div>
  )
}

function Spinner() {
  return (
    <>
      <div style={{ width: 36, height: 36, border: '4px solid #1e3a8a', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </>
  )
}
