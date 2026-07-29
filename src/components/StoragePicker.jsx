import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { uploadLibroArchivo, deleteLibroArchivo, listStorageFiles } from '../services/admin.service'
import { C, S, btn, btnOutline } from '../lib/adminStyles'

export default function StoragePicker({ folder, accept, title, onSelect, onClose }) {
  const [files, setFiles] = useState([])
  const [previews, setPreviews] = useState({})
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [canUpload, setCanUpload] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const uploadRef = useRef(null)
  const isImage = accept === 'image/*'

  useEffect(() => { loadFiles() }, [])

  async function loadFiles() {
    setLoading(true); setError('')
    try {
      const result = await listStorageFiles(folder)
      const data = result.files
      setFiles(data)
      setCanUpload(result.canUpload)
      if (isImage) {
        const urls = {}
        await Promise.all(data.map(async f => {
          const { data: s } = await supabase.storage.from('libros').createSignedUrl(f.path, 300)
          if (s?.signedUrl) urls[f.name] = s.signedUrl
        }))
        setPreviews(urls)
      }
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  async function handleUpload(e) {
    const file = e.target.files[0]
    if (!file) return
    setUploading(true); setError(''); setSuccess('')
    try {
      await uploadLibroArchivo(folder, file)
      await loadFiles()
      setSuccess(`"${file.name}" se subió correctamente.`)
    } catch (err) { setError(err.message) }
    finally { setUploading(false); e.target.value = '' }
  }

  async function handleDelete() {
    const file = deleteConfirm
    if (!file || deleting) return
    setDeleting(true)
    setError(''); setSuccess('')
    try {
      await deleteLibroArchivo(file.path)
      setDeleteConfirm(null)
      await loadFiles()
      setSuccess(`"${file.name}" se eliminó correctamente.`)
    } catch (err) {
      setError(err.message.includes('StorageApiError')
        ? 'No se puede eliminar el archivo porque está en uso.'
        : err.message)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
      <div style={{ ...S.card, width: 520, maxHeight: '78vh', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>

        <div style={{ padding: '18px 24px 14px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: C.text }}>{title}</h3>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: C.textLight, lineHeight: 1, padding: 4 }}>✕</button>
        </div>

        <div style={{ padding: '10px 24px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          {canUpload ? (
            <>
              <input ref={uploadRef} type="file" accept={accept} style={{ display: 'none' }} onChange={handleUpload} />
              <button type="button" onClick={() => uploadRef.current.click()} disabled={uploading} style={btnOutline(C.success, 'sm')}>
                {uploading ? 'Subiendo…' : '↑ Subir nuevo'}
              </button>
            </>
          ) : (
            <span style={{ fontSize: 12, color: C.textLight }}>
              Solo el superadministrador puede subir archivos.
            </span>
          )}
          {error && <span style={{ fontSize: 12, color: C.danger }}>{error}</span>}
          {success && <span style={{ fontSize: 12, color: C.success, fontWeight: 700 }}>{success}</span>}
        </div>

        <div style={{ overflowY: 'auto', flex: 1, padding: 16 }}>
          {loading ? (
            <p style={{ color: C.textLight, fontSize: 13, margin: 8 }}>Cargando…</p>
          ) : files.length === 0 ? (
            <p style={{ color: C.textLight, fontSize: 13, margin: 8 }}>
              {canUpload ? 'Sin archivos disponibles. Sube uno con el botón de arriba.' : 'No hay archivos publicados disponibles.'}
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {files.map(f => (
                <div key={f.name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.white }}>
                  <div style={{ width: 44, height: 44, borderRadius: 6, background: C.bg, overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {isImage
                      ? (previews[f.name]
                          ? <img src={previews[f.name]} alt={f.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          : <span style={{ fontSize: 20 }}>🖼️</span>)
                      : <span style={{ fontSize: 22 }}>📄</span>
                    }
                  </div>
                  <span style={{ flex: 1, fontSize: 13, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {f.name}
                  </span>
                  {canUpload && (
                    <button
                      type="button"
                      onClick={() => setDeleteConfirm(f)}
                      style={btnOutline(C.danger, 'sm')}
                    >
                      Eliminar
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => { onSelect(f.path); onClose() }}
                    style={btn(C.primary, 'sm')}
                  >
                    Usar
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
      {deleteConfirm && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 210, background: 'rgba(15, 23, 42, 0.58)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }}>
          <div style={{
            ...S.card, width: 390, maxWidth: '100%', padding: 28, textAlign: 'center',
            boxShadow: '0 24px 64px rgba(15, 23, 42, 0.25)',
          }}>
            <div style={{
              width: 54, height: 54, borderRadius: '50%', margin: '0 auto 14px',
              background: C.dangerLight, color: C.danger, display: 'flex',
              alignItems: 'center', justifyContent: 'center', fontSize: 25,
            }}>🗑️</div>
            <h3 style={{ margin: '0 0 8px', color: C.text, fontSize: 18, fontWeight: 800 }}>
              ¿Eliminar este archivo?
            </h3>
            <p style={{ margin: '0 0 8px', color: C.textLight, fontSize: 13, lineHeight: 1.5 }}>
              Esta acción es permanente y no se puede deshacer.
            </p>
            <div style={{
              margin: '0 0 22px', padding: '9px 12px', borderRadius: 9,
              background: C.bg, border: `1px solid ${C.border}`, color: C.text,
              fontSize: 12, fontWeight: 700, overflowWrap: 'anywhere',
            }}>
              {deleteConfirm.name}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="button"
                onClick={() => setDeleteConfirm(null)}
                disabled={deleting}
                style={{ ...btnOutline(C.textLight), flex: 1 }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                style={{ ...btn(C.danger), flex: 1, opacity: deleting ? 0.65 : 1 }}
              >
                {deleting ? 'Eliminando…' : 'Sí, eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
