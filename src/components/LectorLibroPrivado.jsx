import { useCallback, useEffect, useRef, useState } from 'react'
import { renovarPdfLibro } from '../services/libros.service'
import { createPdfAccess } from '../lib/pdfAccess'
import LectorLibro from './LectorLibro'

export default function LectorLibroPrivado({ libroId, pdfUrl, expiresAt, hotspots }) {
  const [access, setAccess] = useState({ url: null, revision: 0, loading: true, error: false })
  const controller = useRef(null)
  useEffect(() => {
    const current = createPdfAccess({
      initial: { url: pdfUrl, expiresAt },
      renew: () => renovarPdfLibro(libroId),
      onChange: setAccess,
    })
    controller.current = current
    current.start()
    return () => { current.dispose(); controller.current = null }
  }, [libroId, pdfUrl, expiresAt])

  const recover = useCallback(() => { controller.current?.recover() }, [])
  return (
    <>
      {access.loading && <p role="status" style={{ textAlign: 'center' }}>Preparando el libro…</p>}
      {access.error && (
        <div role="alert" style={{ padding: 16, textAlign: 'center' }}>
          <p>No se pudo cargar el libro. Comprueba tu conexión e inténtalo de nuevo.</p>
          <button onClick={() => controller.current?.recover({ manual: true })}>Reintentar lectura</button>
        </div>
      )}
      {access.url && (
        <LectorLibro libroId={libroId} pdfUrl={access.url} pdfRevision={access.revision}
          onPdfError={recover} hotspots={hotspots} />
      )}
    </>
  )
}
