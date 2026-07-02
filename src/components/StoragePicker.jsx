import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { uploadLibroArchivo, listStorageFiles } from '../services/admin.service'
import { C, S, btn, btnOutline } from '../lib/adminStyles'

export default function StoragePicker({ folder, accept, title, onSelect, onClose }) {
  const [files, setFiles] = useState([])
  const [previews, setPreviews] = useState({})
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const uploadRef = useRef(null)
  const isImage = accept === 'image/*'

  useEffect(() => { loadFiles() }, [])

  async function loadFiles() {
    setLoading(true); setError('')
    try {
      const data = await listStorageFiles(folder)
      setFiles(data)
      if (isImage) {
        const urls = {}
        await Promise.all(data.map(async f => {
          const { data: s } = await supabase.storage.from('libros').createSignedUrl(`${folder}/${f.name}`, 300)
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
    setUploading(true); setError('')
    try {
      await uploadLibroArchivo(`${folder}/${file.name}`, file)
      await loadFiles()
    } catch (err) { setError(err.message) }
    finally { setUploading(false); e.target.value = '' }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
      <div style={{ ...S.card, width: 520, maxHeight: '78vh', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>

        <div style={{ padding: '18px 24px 14px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: C.text }}>{title}</h3>
          <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: C.textLight, lineHeight: 1, padding: 4 }}>✕</button>
        </div>

        <div style={{ padding: '10px 24px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <input ref={uploadRef} type="file" accept={accept} style={{ display: 'none' }} onChange={handleUpload} />
          <button type="button" onClick={() => uploadRef.current.click()} disabled={uploading} style={btnOutline(C.success, 'sm')}>
            {uploading ? 'Subiendo…' : '↑ Subir nuevo'}
          </button>
          {error && <span style={{ fontSize: 12, color: C.danger }}>{error}</span>}
        </div>

        <div style={{ overflowY: 'auto', flex: 1, padding: 16 }}>
          {loading ? (
            <p style={{ color: C.textLight, fontSize: 13, margin: 8 }}>Cargando…</p>
          ) : files.length === 0 ? (
            <p style={{ color: C.textLight, fontSize: 13, margin: 8 }}>Sin archivos. Sube uno con el botón de arriba.</p>
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
                  <span style={{ flex: 1, fontSize: 13, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                  <button
                    type="button"
                    onClick={() => { onSelect(`${folder}/${f.name}`); onClose() }}
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
    </div>
  )
}
