import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getLibroConUnidades } from '../services/libros.service'
import { getProgreso, marcarCompleta, guardarRespuesta } from '../services/progreso.service'
import Sidebar from '../components/Sidebar'
import LectorLibro from '../components/LectorLibro'
import { ActivityCard } from '../components/ActivityCard'
import { useWindowWidth } from '../hooks/useWindowWidth'

const TABS = [
  { id: 'leer',        icon: '📖', label: 'Leer libro' },
  { id: 'actividades', icon: '🎬', label: null },
  { id: 'video',       icon: '🎥', label: 'Video libro animado' },
  { id: 'canciones',   icon: '🎵', label: 'Canciones' },
]

export default function Libro() {
  const { libroId } = useParams()
  const navigate = useNavigate()
  const width = useWindowWidth()
  const isMobile = width < 768
  const [libro, setLibro] = useState(null)
  const [unidades, setUnidades] = useState([])
  const [progreso, setProgreso] = useState({})
  const [cargando, setCargando] = useState(true)
  const [tab, setTab] = useState('leer')
  const [seccionActiva, setSeccionActiva] = useState(0)
  const scrollRef = useRef(null)

  const accent = libro?.color_acento || '#e91e8c'
  const accentLight = accent + '22'
  const accentBg = accent + '09'

  useEffect(() => { cargarDatos() }, [libroId])

  async function cargarDatos() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const [{ libro: libroData, unidades: unidadesData }, prog] = await Promise.all([
        getLibroConUnidades(libroId),
        user ? getProgreso(user.id) : Promise.resolve({}),
      ])
      if (!libroData) return
      setLibro(libroData)
      setUnidades(unidadesData)
      setProgreso(prog)
    } catch (err) { console.error(err) }
    finally { setCargando(false) }
  }

  async function guardarProgreso(actividadId, unidadId, respuesta, esCorrecta) {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      await marcarCompleta(user.id, libroId, actividadId)
      setProgreso(prev => ({ ...prev, [actividadId]: true }))
      if (respuesta !== undefined && unidadId) {
        try {
          await guardarRespuesta(user.id, actividadId, libroId, unidadId, respuesta, esCorrecta ?? null)
        } catch (e) {
          console.warn('[Libelula] guardarRespuesta falló:', e?.code, e?.message)
        }
      }
    } catch (e) {
      console.error('guardarProgreso:', e)
    }
  }

  const todasActividades = unidades.flatMap(u => u.actividades)
  const completadas = todasActividades.filter(a => progreso[a.id]).length
  const porcentaje = todasActividades.length > 0 ? Math.round((completadas / todasActividades.length) * 100) : 0

  if (cargando) return (
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'Nunito', background: accentBg }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', paddingTop: isMobile ? 56 : 0 }}>
        <Spinner accent={accent} />
      </div>
    </div>
  )

  const pdfUrl = libro?.pdf_url || null
  const hotspots = libro?.hotspots || []
  const unidadActiva = unidades[seccionActiva] ?? unidades[0]
  const actividadesSeccion = unidadActiva?.actividades || []
  const canciones = libro?.canciones || []

  const videosAnimados = (() => {
    if (libro?.videos_animados?.length > 0) return libro.videos_animados
    if (libro?.videosAnimados?.length > 0) return libro.videosAnimados
    const letra = (libro?.titulo || '').charAt(0).toUpperCase()
    return [{ url: `/videos/animados/${letra}1.mp4`, titulo: libro?.titulo || 'Libro animado' }]
  })()

  const tabList = TABS.map(t => ({
    ...t,
    label: t.id === 'actividades' ? `Actividades (${todasActividades.length})` : t.label,
  }))

  return (
    <div style={{ display: 'flex', height: '100dvh', fontFamily: 'Nunito', background: accentBg }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', paddingTop: isMobile ? 56 : 0, boxSizing: 'border-box' }}>

        {/* ── Header ── */}
        <div style={{
          background: `linear-gradient(135deg, ${accent} 0%, ${accent}cc 100%)`,
          color: 'white', padding: isMobile ? '12px 16px 10px' : '1.3rem 2rem',
          textAlign: 'center', position: 'relative', flexShrink: 0,
        }}>
          <button
            onClick={() => navigate('/inicio')}
            style={{ position: 'absolute', top: isMobile ? 10 : 14, left: isMobile ? 12 : 24, background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', borderRadius: 8, padding: '4px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Nunito' }}
          >
            ← Inicio
          </button>
          <h1 style={{ fontFamily: "'Fredoka One', cursive", fontSize: isMobile ? 'clamp(1.2rem, 4.5vw, 1.5rem)' : 'clamp(1.5rem, 3vw, 2.2rem)', marginBottom: '0.2rem', letterSpacing: 1, marginTop: isMobile ? 14 : 0 }}>
            {libro?.emoji ? `${libro.emoji} ${libro?.titulo}` : libro?.titulo}
          </h1>
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10, marginTop: 6 }}>
            <p style={{ fontSize: isMobile ? '0.75rem' : '0.85rem', opacity: 0.85, fontWeight: 600, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: isMobile ? 160 : 300 }}>
              {libro?.descripcion || 'Actividades interactivas'}
            </p>
            <span style={{ opacity: 0.5, fontSize: 10 }}>·</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              <div style={{ background: 'rgba(255,255,255,0.25)', borderRadius: 6, height: 5, width: isMobile ? 60 : 100, overflow: 'hidden' }}>
                <div style={{ background: 'rgba(255,255,255,0.9)', height: '100%', borderRadius: 6, width: `${porcentaje}%`, transition: 'width 0.5s' }} />
              </div>
              <span style={{ fontSize: 11, opacity: 0.8, whiteSpace: 'nowrap' }}>{porcentaje}%</span>
            </div>
          </div>
        </div>

        {/* ── Tab bar ── */}
        <div style={{ display: 'flex', background: '#fff', borderBottom: `3px solid ${accentLight}`, overflowX: 'auto', flexShrink: 0, scrollbarWidth: 'none' }}>
          {tabList.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding: isMobile ? '11px 12px' : '13px 18px',
              border: 'none', background: 'none', cursor: 'pointer',
              fontFamily: 'Nunito', fontSize: isMobile ? 12 : 14, fontWeight: 700,
              color: tab === t.id ? accent : '#6B7280',
              borderBottom: tab === t.id ? `3px solid ${accent}` : '3px solid transparent',
              display: 'flex', alignItems: 'center', gap: 5, marginBottom: -1,
              transition: 'color 0.15s', whiteSpace: 'nowrap', flexShrink: 0,
            }}>{t.icon} {t.label}</button>
          ))}
        </div>

        {/* ── Leer ── */}
        {tab === 'leer' && (
          <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto' }}>
            {pdfUrl
              ? <LectorLibro pdfUrl={pdfUrl} libroId={libroId} hotspots={hotspots} scrollContainerRef={scrollRef} />
              : <TabEmpty icon="📚" msg="El PDF de este libro aún no está disponible." accent={accent} accentBg={accentBg} />
            }
          </div>
        )}

        {/* ── Actividades ── */}
        {tab === 'actividades' && (
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', background: accentBg }}>
            {unidades.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: isMobile ? '12px 12px 0' : '16px 24px 0', background: 'white', borderBottom: `3px solid ${accentLight}`, justifyContent: 'center', flexShrink: 0 }}>
                {unidades.map((u, idx) => (
                  <button key={u.id} onClick={() => setSeccionActiva(idx)} style={{
                    padding: '8px 16px', border: 'none', borderRadius: 50, cursor: 'pointer',
                    fontFamily: 'Nunito', fontWeight: 700, fontSize: isMobile ? 12 : '0.88rem',
                    background: seccionActiva === idx ? accent : accentLight,
                    color: seccionActiva === idx ? 'white' : accent,
                    transform: seccionActiva === idx ? 'translateY(-3px)' : 'none',
                    boxShadow: seccionActiva === idx ? `0 4px 12px ${accent}4d` : 'none',
                    transition: 'all 0.2s', marginBottom: 12,
                  }}>
                    {u.emoji ? `${u.emoji} ` : ''}{(u.etiqueta || u.titulo || `Sección ${idx + 1}`).replace(/Páginas?/gi, 'Págs.')}
                  </button>
                ))}
              </div>
            )}
            {unidadActiva && (
              <div style={{ textAlign: 'center', padding: isMobile ? '16px 20px 4px' : '20px 24px 4px' }}>
                <h2 style={{ fontFamily: "'Fredoka One', cursive", fontSize: isMobile ? '1.3rem' : '1.5rem', color: accent, margin: '0 0 4px' }}>
                  {unidadActiva.emoji ? `${unidadActiva.emoji} ` : ''}
                  {unidadActiva.titulo || `Sección ${seccionActiva + 1}`}
                  {unidadActiva.subtitulo ? `: ${unidadActiva.subtitulo}` : ''}
                </h2>
                {unidadActiva.texto && <p style={{ color: '#6d4c7a', fontSize: '0.9rem', fontWeight: 600, margin: 0 }}>{unidadActiva.texto}</p>}
              </div>
            )}
            <div style={{ maxWidth: 1100, margin: '0 auto', width: '100%', padding: isMobile ? '12px 12px 48px' : '20px 28px 56px' }}>
              {actividadesSeccion.length === 0
                ? <TabEmpty icon="🎬" msg="No hay actividades en esta sección." accent={accent} accentBg={accentBg} />
                : actividadesSeccion.map((act, idx) => (
                  <ActivityCard key={act.id} act={act} numero={idx + 1} isMobile={isMobile} completada={!!progreso[act.id]} onComplete={(respuesta, esCorrecta) => guardarProgreso(act.id, unidadActiva.id, respuesta, esCorrecta)} snapMode={false} />
                ))
              }
            </div>
          </div>
        )}

        {/* ── Video libro animado ── */}
        {tab === 'video' && (
          <VideoAnimadoTab videos={videosAnimados} isMobile={isMobile} accent={accent} accentLight={accentLight} accentBg={accentBg} />
        )}

        {/* ── Canciones ── */}
        {tab === 'canciones' && (
          <CancionesTab canciones={canciones} isMobile={isMobile} accent={accent} accentLight={accentLight} accentBg={accentBg} />
        )}

      </div>
    </div>
  )
}

// ── Video libro animado ───────────────────────────────────────────────────────
function VideoAnimadoTab({ videos, isMobile, accent, accentLight, accentBg }) {
  const [idx, setIdx] = useState(0)

  if (!videos?.length) return (
    <TabEmpty icon="🎥" msg="No hay videos disponibles aún." accent={accent} accentBg={accentBg} />
  )

  const v = videos[idx]
  const hasPlaylist = videos.length > 1

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: accentBg }}>
      <div style={{
        maxWidth: 1100, margin: '0 auto', width: '100%',
        padding: isMobile ? '16px 12px 48px' : '24px 28px 56px',
        display: 'flex', flexDirection: isMobile || !hasPlaylist ? 'column' : 'row',
        gap: 24, alignItems: 'flex-start',
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <video
            key={v.url} controls autoPlay={false}
            style={{ width: '100%', borderRadius: 16, background: '#000', boxShadow: '0 6px 32px rgba(0,0,0,0.18)', display: 'block' }}
          >
            <source src={v.url} />
            Tu navegador no soporta el reproductor de video.
          </video>
          <h3 style={{ fontFamily: "'Fredoka One', cursive", fontSize: isMobile ? 20 : 24, color: accent, margin: '16px 0 4px' }}>
            {v.titulo}
          </h3>
          {v.descripcion && <p style={{ color: '#6d4c7a', fontSize: 14, margin: 0, lineHeight: 1.5 }}>{v.descripcion}</p>}
        </div>
        {hasPlaylist && (
          <div style={{ width: isMobile ? '100%' : 280, flexShrink: 0 }}>
            <p style={{ fontSize: 11, fontWeight: 800, color: '#6d4c7a', textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 10px' }}>
              Más videos
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {videos.map((v2, i) => (
                <button key={i} onClick={() => setIdx(i)} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
                  borderRadius: 14, border: `2px solid ${i === idx ? accent : accentLight}`,
                  background: i === idx ? accentLight : '#fff',
                  cursor: 'pointer', textAlign: 'left', fontFamily: 'Nunito',
                  boxShadow: i === idx ? `0 3px 12px ${accent}26` : `0 2px 6px ${accent}0f`,
                  transition: 'all 0.15s',
                }}>
                  <span style={{ width: 36, height: 36, borderRadius: '50%', background: i === idx ? accent : accentLight, color: i === idx ? '#fff' : accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>
                    {i === idx ? '▶' : '🎥'}
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: i === idx ? accent : '#2d1b33', lineHeight: 1.3 }}>
                    {v2.titulo}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Canciones ─────────────────────────────────────────────────────────────────
function CancionesTab({ canciones, isMobile, accent, accentLight, accentBg }) {
  const [idx, setIdx] = useState(null)
  const [playing, setPlaying] = useState(false)
  const audioRef = useRef(null)

  useEffect(() => {
    if (idx === null || !audioRef.current) return
    audioRef.current.load()
    audioRef.current.play().then(() => setPlaying(true)).catch(() => setPlaying(false))
  }, [idx])

  function togglePlay(i) {
    if (idx === i) {
      if (playing) { audioRef.current.pause(); setPlaying(false) }
      else { audioRef.current.play(); setPlaying(true) }
    } else {
      setIdx(i)
    }
  }

  function onEnded() {
    setPlaying(false)
    if (idx !== null && idx < canciones.length - 1) setIdx(idx + 1)
  }

  if (!canciones?.length) return (
    <TabEmpty icon="🎵" msg="No hay canciones disponibles aún." accent={accent} accentBg={accentBg} />
  )

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: accentBg }}>
      <audio
        ref={audioRef}
        src={idx !== null ? canciones[idx].url : ''}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={onEnded}
        style={{ display: 'none' }}
      />
      <div style={{ maxWidth: 1100, margin: '0 auto', width: '100%', padding: isMobile ? '16px 12px 56px' : '24px 28px 64px' }}>
        {idx !== null && (
          <div style={{
            background: `linear-gradient(135deg, ${accent}, ${accent}cc)`,
            borderRadius: 18, padding: isMobile ? '16px 18px' : '20px 28px',
            color: '#fff', marginBottom: 20,
            display: 'flex', alignItems: 'center', gap: 16,
            boxShadow: `0 6px 28px ${accent}40`,
          }}>
            <div style={{ fontSize: isMobile ? 36 : 48, flexShrink: 0 }}>🎵</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 11, fontWeight: 700, opacity: 0.8, textTransform: 'uppercase', letterSpacing: 1 }}>Escuchando ahora</p>
              <h3 style={{ margin: '4px 0 2px', fontFamily: "'Fredoka One', cursive", fontSize: isMobile ? 18 : 22, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {canciones[idx].titulo}
              </h3>
              {canciones[idx].artista && <p style={{ margin: 0, fontSize: 13, opacity: 0.85 }}>{canciones[idx].artista}</p>}
            </div>
            <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
              {idx > 0 && <button onClick={() => setIdx(idx - 1)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '50%', width: 40, height: 40, fontSize: 16, cursor: 'pointer', color: '#fff' }}>⏮</button>}
              <button onClick={() => togglePlay(idx)} style={{ background: 'rgba(255,255,255,0.25)', border: 'none', borderRadius: '50%', width: 48, height: 48, fontSize: 22, cursor: 'pointer', color: '#fff' }}>
                {playing ? '⏸' : '▶'}
              </button>
              {idx < canciones.length - 1 && <button onClick={() => setIdx(idx + 1)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '50%', width: 40, height: 40, fontSize: 16, cursor: 'pointer', color: '#fff' }}>⏭</button>}
            </div>
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {canciones.map((c, i) => (
            <button key={i} onClick={() => togglePlay(i)} style={{
              display: 'flex', alignItems: 'center', gap: 16,
              padding: isMobile ? '14px 16px' : '16px 22px',
              borderRadius: 16, border: `2px solid ${i === idx ? accent : accentLight}`,
              background: i === idx ? accentLight : '#fff',
              cursor: 'pointer', textAlign: 'left', fontFamily: 'Nunito',
              boxShadow: i === idx ? `0 4px 16px ${accent}2e` : `0 2px 8px ${accent}12`,
              transition: 'all 0.15s',
            }}>
              <div style={{
                width: isMobile ? 40 : 48, height: isMobile ? 40 : 48, borderRadius: '50%', flexShrink: 0,
                background: i === idx ? accent : accentLight, color: i === idx ? '#fff' : accent,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: isMobile ? 18 : 22,
              }}>
                {i === idx && playing ? '⏸' : '▶'}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: isMobile ? 15 : 17, fontWeight: 700, color: i === idx ? accent : '#2d1b33', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.titulo}</div>
                {c.artista && <div style={{ fontSize: 13, color: '#6d4c7a', marginTop: 2 }}>{c.artista}</div>}
              </div>
              {i === idx && <div style={{ width: 8, height: 8, borderRadius: '50%', background: accent, flexShrink: 0, opacity: playing ? 1 : 0.3 }} />}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function TabEmpty({ icon, msg, accent, accentBg }) {
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 14, color: accent, background: accentBg, padding: 48 }}>
      <div style={{ fontSize: 56 }}>{icon}</div>
      <p style={{ fontSize: 16, fontWeight: 600, margin: 0, textAlign: 'center' }}>{msg}</p>
    </div>
  )
}

function Spinner({ accent }) {
  return (
    <>
      <div style={{ width: 36, height: 36, border: `4px solid ${accent}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </>
  )
}
