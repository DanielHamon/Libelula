export const DEFAULT_BOOK_PALETTE = {
  color_acento: '#e91e8c',
  color_encabezado_inicio: '#e91e8c',
  color_encabezado_fin: '#c2185b',
  color_fondo_actividades: '#fff9fb',
}

export function normalizeBookPalette(source = {}) {
  const accent = source.color_acento || DEFAULT_BOOK_PALETTE.color_acento
  return {
    color_acento: accent,
    color_encabezado_inicio: source.color_encabezado_inicio || accent,
    color_encabezado_fin: source.color_encabezado_fin || accent,
    color_fondo_actividades: source.color_fondo_actividades || DEFAULT_BOOK_PALETTE.color_fondo_actividades,
  }
}
