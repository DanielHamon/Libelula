import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { pdfjs } from 'react-pdf'
import AdminLayout from '../../components/AdminLayout'
import { C, S, btn, btnOutline, badge } from '../../lib/adminStyles'
import { supabase } from '../../lib/supabase'
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
          <section style={{ ...S.card, padding: 22, marginBottom: 20 }}>
            <h2 style={{ fontSize: 18, marginTop: 0 }}>{libro.titulo}</h2>
            <p style={{ overflowWrap: 'anywhere' }}>PDF: <code>{libro.pdf_url || 'No asociado'}</code> · {totalPdf ?? '—'} páginas</p>
            <p>Reproductor: <strong>{libro.narracion_habilitada ? 'Habilitado' : 'Deshabilitado'}</strong></p>
            <p>Versión publicada: {publicada ? `v${publicada.version}` : 'Ninguna'} · Borrador: {borrador ? `v${borrador.version}` : 'Ninguno'}</p>
            {pendientes.map(item => <p key={item.id} style={{ color: C.textLight }}>
              Solicitud pendiente: {item.payload?.habilitar ? 'habilitar' : 'deshabilitar'} · {new Date(item.solicitado_en).toLocaleString('es-CO')}
            </p>)}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9 }}>
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
              <button type="button" disabled={busy} style={btnOutline(C.textLight, 'sm')}
                onClick={() => ejecutar('limpiar', async () => {
                  const total = await limpiarCargasNarracion(id)
                  return `${total} carga${total === 1 ? '' : 's'} interrumpida${total === 1 ? '' : 's'} limpiada${total === 1 ? '' : 's'}.`
                })}>Limpiar cargas interrumpidas</button>
              <button type="button" disabled={busy || pendientes.length > 0} style={btnOutline(C.primary, 'sm')}
                onClick={() => ejecutar('solicitud', async () => {
                  await solicitarEstadoNarracion(id, !libro.narracion_habilitada)
                  return 'Solicitud enviada al superadministrador. El estado actual no cambió.'
                })}>
                Solicitar {libro.narracion_habilitada ? 'deshabilitación' : 'habilitación'}
              </button>
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
