export function etiquetaPaginaLibro(paginaPdf, totalPdf) {
  if (totalPdf > 1 && paginaPdf === 1) return 'Portada'
  return String(paginaPdf - (totalPdf > 1 ? 1 : 0))
}

export function nombrePaginaLibro(paginaPdf, totalPdf) {
  const etiqueta = etiquetaPaginaLibro(paginaPdf, totalPdf)
  return `${etiqueta === 'Portada' ? 'Portada' : `Página ${etiqueta}`} · PDF ${paginaPdf}`
}
