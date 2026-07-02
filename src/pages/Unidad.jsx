import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getProgreso, marcarCompleta, guardarRespuesta } from '../services/progreso.service'
import Sidebar from '../components/Sidebar'
import { ActivityCard, C } from '../components/ActivityCard'
import { useWindowWidth } from '../hooks/useWindowWidth'

export default function Unidad() {
  const { libroId, unidadId } = useParams()
  const navigate = useNavigate()
  const width = useWindowWidth()
  const isMobile = width < 768

  const [unidad, setUnidad] = useState(null)
  const [actividades, setActividades] = useState([])
  const [progreso, setProgreso] = useState({})
  const [cargando, setCargando] = useState(true)

  useEffect(() => { cargarDatos() }, [unidadId])

  async function cargarDatos() {
    setCargando(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()

      const [{ data: unidadData }, prog] = await Promise.all([
        supabase.from('unidades')
          .select('*, actividades(*)')
          .eq('id', unidadId)
          .single(),
        user ? getProgreso(user.id) : Promise.resolve({}),
      ])

      if (unidadData) {
        setUnidad(unidadData)
        const acts = (unidadData.actividades || [])
          .map(a => ({ ...a, ...a.campos }))
          .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
        setActividades(acts)
      }
      setProgreso(prog)
    } catch (err) { console.error(err) }
    finally { setCargando(false) }
  }

  async function guardarProgreso(actividadId, respuesta, esCorrecta) {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      await marcarCompleta(user.id, libroId, actividadId)
      setProgreso(prev => ({ ...prev, [actividadId]: true }))
      if (respuesta !== undefined) {
        try {
          await guardarRespuesta(user.id, actividadId, libroId, unidadId, respuesta, esCorrecta ?? null)
        } catch (e) {
          console.warn('[Libelula] guardarRespuesta falló — código:', e?.code, '| mensaje:', e?.message, '| detalles:', e?.details)
        }
      }
    } catch (e) {
      console.error('guardarProgreso:', e)
    }
  }

  const completadas = actividades.filter(a => progreso[a.id]).length
  const porcentaje = actividades.length > 0 ? Math.round((completadas / actividades.length) * 100) : 0

  if (cargando) return (
    <div style={{ display: 'flex', height: '100dvh', overflow: 'hidden', fontFamily: 'Nunito', background: C.bg }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', paddingTop: isMobile ? 56 : 0 }}>
        <Spinner />
      </div>
    </div>
  )

  return (
    <div style={{ display: 'flex', height: '100dvh', overflow: 'hidden', fontFamily: 'Nunito', background: C.bg }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', paddingTop: isMobile ? 56 : 0, boxSizing: 'border-box' }}>
        <div style={{ background: C.white, borderBottom: `1px solid ${C.border}`, padding: isMobile ? '10px 16px' : '12px 24px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <button onClick={() => navigate(`/libro/${libroId}`)} style={{ background: 'none', border: 'none', fontSize: 13, color: C.pink, fontWeight: 700, cursor: 'pointer', fontFamily: 'Nunito', display: 'flex', alignItems: 'center', gap: 4, padding: 0, whiteSpace: 'nowrap' }}>← Volver</button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: isMobile ? 13 : 15, fontWeight: 800, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{unidad?.titulo}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
              <div style={{ flex: 1, maxWidth: 180, background: C.pinkLight, borderRadius: 50, height: 6, overflow: 'hidden' }}>
                <div style={{ background: 'linear-gradient(90deg, #e91e8c, #7b1fa2)', height: '100%', borderRadius: 50, width: porcentaje + '%', transition: 'width 0.5s' }} />
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, color: C.textMuted, whiteSpace: 'nowrap' }}>{completadas}/{actividades.length}</span>
            </div>
          </div>
        </div>
        <div style={{ flex: 1, overflowX: 'hidden', overflowY: 'scroll', scrollSnapType: 'y mandatory', overscrollBehavior: 'contain' }}>
          {actividades.map((act, idx) => (
            <ActivityCard key={act.id} act={act} numero={idx + 1} isMobile={isMobile} completada={!!progreso[act.id]} onComplete={(respuesta, esCorrecta) => guardarProgreso(act.id, respuesta, esCorrecta)} snapMode={true} />
          ))}
          <div style={{ height: 1 }} />
        </div>
      </div>
    </div>
  )
}

function Spinner() {
  return (
    <>
      <div style={{ width: 36, height: 36, border: '4px solid #e91e8c', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{'@keyframes spin { to { transform: rotate(360deg) } }'}</style>
    </>
  )
}
