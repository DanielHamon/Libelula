import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { pdfjs } from 'react-pdf'
import AdminLayout from '../../components/AdminLayout'
import { C, S, btn, btnOutline, badge } from '../../lib/adminStyles'
import { supabase } from '../../lib/supabase'
import './AdminNarraciones.css'
import {
  listarLibrosNarracion, obtenerEstadoNarracion, obtenerPaginasNarracion,
  crearBorradorNarracion, descartarBorradorNarracion,
  validarVersionNarracion, publicarVersionNarracion,
  solicitarEstadoNarracion, cargarMp3Narracion, cambiarPaginaNarracion,
  escucharMp3Narracion, limpiarCargasNarracion,
} from '../../services/narracionesAdmin.service'

pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()
const PAGE_SIZE = 24

async function contarPaginas(pdfPath) {
  if (!pdfPath) return null
  const { data, error } = await supabase.storage.from('libros').createSignedUrl(pdfPath, 120)
  if (error) throw error
  const task = pdfjs.getDocument(data.signedUrl)
  const pdf = await task.promise
  try { return pdf.numPages }
  finally { await pdf.destroy() }
}

export default function AdminNarraciones() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [libros, setLibros] = useState([])
  const [libro, setLibro] = useState(null)
  const [versiones, setVersiones] = useState([])
  const [pendientes, setPendientes] = useState([])
  const [paginas, setPaginas] = useState([])
  const [totalPdf, setTotalPdf] = useState(null)
  const [paginaLista, setPaginaLista] = useState(0)
  const [audioUrl, setAudioUrl] = useState('')
  const [ocupado, setOcupado] = useState('')
  const [error, setError] = useState('')
  const [mensaje, setMensaje] = useState('')

  const borrador = versiones.find(v => v.estado === 'draft')
  const publicada = versiones.find(v => v.estado === 'published')
  const visible = borrador || publicada
  const audiosListos = paginas.filter(p => p.estado === 'ready').length
  const paginasOmitidas = paginas.filter(p => p.estado === 'skipped').length
  const totalVersion = visible?.pdf_total_pages || totalPdf || 0
  const paginasPreparadas = audiosListos + paginasOmitidas
  const porPagina = useMemo(() => new Map(paginas.map(p => [p.pagina_pdf, p])), [paginas])
  const paginasVisibles = Array.from({ length: Math.min(PAGE_SIZE, Math.max(0, (totalPdf || 0) - paginaLista * PAGE_SIZE)) }, (_, i) => paginaLista * PAGE_SIZE + i + 1)

  const cargar = useCallback(async () => {
    if (!id) return
    try {
      const catalogo = await listarLibrosNarracion()
      const actual = catalogo.find(item => item.id === id)
      if (!actual) throw new Error('Libro no encontrado.')
      const [estado, numero] = await Promise.all([
        obtenerEstadoNarracion(id), contarPaginas(actual.pdf_url),
      ])
      const seleccionada = estado.versiones.find(v => v.estado === 'draft')
        || estado.versiones.find(v => v.estado === 'published')
      const filas = seleccionada ? await obtenerPaginasNarracion(seleccionada.id) : []
      setLibros(catalogo)
      setLibro(actual)
      setVersiones(estado.versiones)
      setPendientes(estado.pendientes)
      setTotalPdf(numero)
      setPaginas(filas)
      setError('')
    } catch (e) { setError(e.message) }
  }, [id])

  useEffect(() => { void cargar() }, [cargar])
  useEffect(() => { setPaginaLista(0); setAudioUrl('') }, [id])

  async function ejecutar(label, action) {
    setOcupado(label); setError(''); setMensaje('')
    try {
      const text = await action()
      await cargar()
      setMensaje(text || 'Cambio guardado.')
    } catch (e) { setError(e.message) }
    finally { setOcupado('') }
  }

  async function cargarArchivo(pagina, file) {
    if (!file || !borrador) return
    await ejecutar(`carga-${pagina}`, async () => {
      await cargarMp3Narracion(borrador.id, pagina, file)
      return `MP3 de la página ${pagina} cargado.`
    })
  }

  async function cambiarPagina(pagina, estado) {
    if (!borrador) return
    if (estado === 'pending' && !window.confirm(`¿Eliminar el MP3 de la página ${pagina} del borrador?`)) return
    await ejecutar(`pagina-${pagina}`, async () => {
      await cambiarPaginaNarracion(borrador.id, pagina, estado)
      return estado === 'skipped' ? `Página ${pagina} marcada sin narración.` : `MP3 de la página ${pagina} retirado del borrador.`
    })
  }

  async function escuchar(path) {
    setError('')
    try { setAudioUrl(await escucharMp3Narracion(path)) }
    catch (e) { setError(e.message) }
  }

  const busy = Boolean(ocupado)
  return (
    <AdminLayout>
      <div className="admin-page" style={{ padding: '32px 40px', maxWidth: 1100 }}>
        <p style={{ fontSize: 13 }}><Link to={`/admin/libros/${id}`}>← Volver al libro</Link></p>
        <h1 style={{ color: C.text, fontSize: 22 }}>Narraciones de libros</h1>
        <label style={S.label}>Libro del catálogo</label>
        <select aria-label="Libro del catálogo" style={{ ...S.input, maxWidth: 460, marginBottom: 20 }} value={id || ''}
          onChange={e => navigate(`/admin/libros/${e.target.value}/narracion`)}>
          {libros.map(item => <option key={item.id} value={item.id}>{item.titulo}</option>)}
        </select>
        {error && <p role="alert" style={{ color: C.danger, background: C.dangerLight, padding: 12, borderRadius: 8 }}>{error}</p>}
        {mensaje && <p role="status" style={{ color: C.success, background: C.successLight, padding: 12, borderRadius: 8 }}>{mensaje}</p>}
        {libro && <>
          <section className="admin-narration-summary" aria-label={`Narración de ${libro.titulo}`}>
            <div className="admin-narration-summary__header">
              <div className="admin-narration-summary__identity">
                <span className="admin-narration-summary__eyebrow">LIBRO SELECCIONADO</span>
                <h2>{libro.titulo}</h2>
                <p className="admin-narration-summary__pdf">
                  <span aria-hidden="true">📄</span>
                  <span>PDF: <code>{libro.pdf_url || 'No asociado'}</code></span>
                </p>
              </div>
              <div className={`admin-narration-summary__state ${libro.narracion_habilitada ? 'is-enabled' : 'is-disabled'}`}>
                <span className="admin-narration-summary__state-dot" aria-hidden="true" />
                <span>Reproductor {libro.narracion_habilitada ? 'habilitado' : 'deshabilitado'}</span>
              </div>
            </div>

            <div className="admin-narration-summary__stats" aria-label="Estado de la narración">
              <div className="admin-narration-summary__stat">
                <span>Páginas del PDF</span>
                <strong>{totalPdf ?? '—'}</strong>
              </div>
              <div className="admin-narration-summary__stat">
                <span>Versión publicada</span>
                <strong>{publicada ? `v${publicada.version}` : 'Ninguna'}</strong>
              </div>
              <div className="admin-narration-summary__stat">
                <span>Borrador</span>
                <strong>{borrador ? `v${borrador.version}` : 'Ninguno'}</strong>
              </div>
            </div>

            {visible && totalVersion > 0 && <div className="admin-narration-summary__progress">
              <div className="admin-narration-summary__progress-label">
                <span>Cobertura de la {borrador ? 'versión en borrador' : 'versión publicada'}</span>
                <strong>{paginasPreparadas} de {totalVersion} páginas</strong>
              </div>
              <div className="admin-narration-summary__progress-track" role="progressbar"
                aria-label="Páginas preparadas" aria-valuenow={paginasPreparadas} aria-valuemin={0} aria-valuemax={totalVersion}>
                <span style={{ width: `${Math.min(100, Math.round(paginasPreparadas / totalVersion * 100))}%` }} />
              </div>
              <p>{audiosListos} con MP3 · {paginasOmitidas} sin narración</p>
            </div>}

            {pendientes.map(item => <div key={item.id} className="admin-narration-summary__pending" role="status">
              <span aria-hidden="true">⏳</span>
              <span>Solicitud de {item.payload?.habilitar ? 'habilitación' : 'deshabilitación'} pendiente desde el {new Date(item.solicitado_en).toLocaleString('es-CO')}. El estado actual se mantiene hasta la decisión del superadmin.</span>
            </div>)}

            <div className="admin-narration-summary__actions">
              <div className="admin-narration-summary__action-group">
                <div className="admin-narration-summary__action-copy">
                  <h3>Versión de audio</h3>
                  <p>Prepara y publica los MP3 sin cambiar el estado del reproductor.</p>
                </div>
                <div className="admin-narration-summary__buttons">
                  {!borrador && <button type="button" disabled={busy || !totalPdf} style={btn(C.primary, 'sm')}
                    onClick={() => ejecutar('borrador', async () => { await crearBorradorNarracion(id, totalPdf); return 'Borrador creado.' })}>
                    Crear borrador
                  </button>}
                  {borrador && <button type="button" disabled={busy} style={btn(C.primary, 'sm')}
                    onClick={() => ejecutar('validar', async () => await validarVersionNarracion(borrador.id)
                      ? 'Versión válida para publicar.' : 'La versión está incompleta: cada página debe tener MP3 o estar marcada sin narración.')}>Validar borrador</button>}
                  {borrador && <button type="button" disabled={busy} style={btnOutline(C.primary, 'sm')}
                    onClick={() => ejecutar('publicar', async () => { await publicarVersionNarracion(borrador.id); return 'Versión publicada. El estado del reproductor no cambió.' })}>Publicar versión</button>}
                  {borrador && <button type="button" disabled={busy} style={btnOutline(C.danger, 'sm')}
                    onClick={() => {
                      if (!window.confirm('¿Descartar el borrador? La versión publicada permanecerá intacta.')) return
                      void ejecutar('descartar', async () => { await descartarBorradorNarracion(borrador.id); return 'Borrador descartado.' })
                    }}>Descartar borrador</button>}
                </div>
              </div>
              <div className="admin-narration-summary__action-group">
                <div className="admin-narration-summary__action-copy">
                  <h3>Visibilidad para estudiantes</h3>
                  <p>El superadmin debe aprobar cualquier cambio de habilitación.</p>
                </div>
                <div className="admin-narration-summary__buttons">
                  <button type="button" disabled={busy || pendientes.length > 0} style={btnOutline(C.primary, 'sm')}
                    onClick={() => ejecutar('solicitud', async () => {
                      await solicitarEstadoNarracion(id, !libro.narracion_habilitada)
                      return 'Solicitud enviada al superadministrador. El estado actual no cambió.'
                    })}>
                    Solicitar {libro.narracion_habilitada ? 'deshabilitación' : 'habilitación'}
                  </button>
                </div>
              </div>
              <div className="admin-narration-summary__maintenance">
                <button type="button" disabled={busy} style={btnOutline(C.textLight, 'sm')}
                  onClick={() => ejecutar('limpiar', async () => {
                    const total = await limpiarCargasNarracion(id)
                    return `${total} carga${total === 1 ? '' : 's'} interrumpida${total === 1 ? '' : 's'} limpiada${total === 1 ? '' : 's'}.`
                  })}>Limpiar cargas interrumpidas</button>
              </div>
            </div>
          </section>

          {visible && <section style={{ ...S.card, padding: 22 }}>
            <h2 style={{ fontSize: 18, marginTop: 0 }}>Páginas PDF · versión {visible.version}{borrador ? ' (borrador)' : ' (publicada)'}</h2>
            <p style={{ color: C.textLight, fontSize: 13 }}>Una página pendiente bloquea la publicación. Marca «Sin narración» solo cuando esa página no requiere audio.</p>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <button type="button" disabled={paginaLista === 0} style={btnOutline(C.primary, 'sm')} onClick={() => setPaginaLista(n => n - 1)}>Anterior</button>
              <span style={{ alignSelf: 'center' }}>{paginaLista + 1} / {Math.ceil((totalPdf || 0) / PAGE_SIZE)}</span>
              <button type="button" disabled={(paginaLista + 1) * PAGE_SIZE >= (totalPdf || 0)} style={btnOutline(C.primary, 'sm')} onClick={() => setPaginaLista(n => n + 1)}>Siguiente</button>
            </div>
            <div style={{ display: 'grid', gap: 9 }}>
              {paginasVisibles.map(numero => {
                const p = porPagina.get(numero)
                const audio = p?.estado === 'ready' && p.storage_path
                return <div key={numero} data-page-row={numero} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', padding: 12, border: `1px solid ${C.border}`, borderRadius: 8 }}>
                  <strong style={{ minWidth: 80 }}>Página {numero}</strong>
                  <span style={badge(audio ? C.success : C.textLight, audio ? C.successLight : '#F3F4F6')}>
                    {audio ? 'MP3 listo' : p?.estado === 'skipped' ? 'Sin narración' : 'Pendiente'}
                  </span>
                  {audio && <span style={{ fontSize: 12, overflowWrap: 'anywhere', flex: 1 }} title={p.storage_path}>
                    {p.storage_path.split('/').pop()} · {Number(p.duracion_segundos).toFixed(1)} s
                  </span>}
                  {audio && <button type="button" style={btnOutline(C.primary, 'sm')} onClick={() => escuchar(p.storage_path)}>Escuchar</button>}
                  {borrador && <>
                    <label style={btnOutline(C.primary, 'sm')}>{audio ? 'Reemplazar MP3' : 'Cargar MP3'}
                      <input type="file" data-upload-page={numero} accept=".mp3,audio/mpeg" disabled={busy} style={{ display: 'none' }}
                        onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; void cargarArchivo(numero, file) }} />
                    </label>
                    <button type="button" aria-label={`Marcar página ${numero} sin narración`} disabled={busy} style={btnOutline(C.textLight, 'sm')} onClick={() => cambiarPagina(numero, 'skipped')}>Sin narración</button>
                    {audio && <button type="button" aria-label={`Eliminar MP3 de página ${numero}`} disabled={busy} style={btnOutline(C.danger, 'sm')} onClick={() => cambiarPagina(numero, 'pending')}>Eliminar MP3</button>}
                  </>}
                </div>
              })}
            </div>
            {audioUrl && <div style={{ marginTop: 16 }}><audio controls autoPlay src={audioUrl} onEnded={() => setAudioUrl('')} /></div>}
          </section>}
        </>}
      </div>
    </AdminLayout>
  )
}
