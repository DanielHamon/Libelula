import { C, S } from '../lib/adminStyles'
import { normalizeBookPalette } from '../lib/bookPalette'

const FIELDS = [
  { key: 'color_acento', label: 'Acento', help: 'Botones, pestañas y títulos' },
  { key: 'color_encabezado_inicio', label: 'Encabezado inicial', help: 'Inicio del degradado' },
  { key: 'color_encabezado_fin', label: 'Encabezado final', help: 'Final del degradado' },
  { key: 'color_fondo_actividades', label: 'Fondo de actividades', help: 'Fondo general del panel' },
]

export default function BookPaletteFields({ value, onChange }) {
  const palette = normalizeBookPalette(value)

  return (
    <fieldset style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: 14, margin: '0 0 16px' }}>
      <legend style={{ padding: '0 6px', fontSize: 13, fontWeight: 800, color: C.text }}>Paleta del panel de actividades</legend>
      <p style={{ margin: '0 0 12px', color: C.textLight, fontSize: 12 }}>
        Personaliza el encabezado, los controles y el background del libro.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(185px, 1fr))', gap: 10 }}>
        {FIELDS.map(field => (
          <label key={field.key} style={{ display: 'block' }}>
            <span style={{ ...S.label, marginBottom: 4 }}>{field.label}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="color"
                value={palette[field.key]}
                onChange={e => onChange({ ...value, [field.key]: e.target.value })}
                style={{ width: 42, height: 34, borderRadius: 7, border: `1px solid ${C.border}`, cursor: 'pointer', padding: 2, flexShrink: 0 }}
              />
              <code style={{ fontSize: 12, color: C.textLight }}>{palette[field.key]}</code>
            </span>
            <span style={{ display: 'block', marginTop: 3, color: C.textLight, fontSize: 10 }}>{field.help}</span>
          </label>
        ))}
      </div>
      <div style={{ marginTop: 14, borderRadius: 10, overflow: 'hidden', border: `1px solid ${C.border}`, background: palette.color_fondo_actividades }}>
        <div style={{ height: 42, background: `linear-gradient(135deg, ${palette.color_encabezado_inicio}, ${palette.color_encabezado_fin})` }} />
        <div style={{ padding: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ background: palette.color_acento, color: '#fff', padding: '5px 12px', borderRadius: 50, fontSize: 11, fontWeight: 700 }}>Sección activa</span>
          <span style={{ color: palette.color_acento, fontSize: 12, fontWeight: 800 }}>Vista previa</span>
        </div>
      </div>
    </fieldset>
  )
}
