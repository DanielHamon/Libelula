import { useEffect, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import AdminLayout from '../../components/AdminLayout'
import {
  getUnidades, createUnidad, updateUnidad, deleteUnidad, reorderUnidades,
  getActividades, createActividad, updateAndPositionActivity, reorderActividades, deleteActividad,
  updateLibro, getGrados,
} from '../../services/admin.service'
import StoragePicker from '../../components/StoragePicker'
import { supabase } from '../../lib/supabase'
import { C, S, btn, btnOutline, badge } from '../../lib/adminStyles'
import { ActivityCard, TIPO_CONFIG } from '../../components/ActivityCard'
import BookPaletteFields from '../../components/BookPaletteFields'
import { normalizeBookPalette } from '../../lib/bookPalette'
import { useWindowWidth } from '../../hooks/useWindowWidth'

// ─── Campos por tipo de actividad ─────────────────────────────────────────────
const TIPOS = [
  'termometroEmocional',
  'clasificacionCategorias',
  'separarSilabas',
  'acrostico',
  'crucigrama',
  'respiracionGuiada',
  'miniJuegoConteo',
  'exploracionInteractiva',
  'selectorEmocionColor',
  'mezclaPinturaGuiada',
  'tarjetasVolteables',
  'reflexionPersonal',
  'lineaTiempoEmocional',
  'sopaLetras', 'seleccionMultiple', 'identificar', 'verdaderoFalso', 'completarPalabras',
  'ordenarEventos', 'ordenarPalabras', 'emparejar', 'completarMapa',
  'escribirCarta', 'dibujoLibre',
  'video', 'audio', 'imagen', 'colorear',
]

function camposInicialesPorTipo(tipo) {
  switch (tipo) {
    case 'sopaLetras':        return { palabras: [], numPalabras: 8, espacio: 12 }
    case 'termometroEmocional': return {
      instruccion: '',
      label: '¿Cómo se siente el personaje?',
      emoji: '🌡️',
      min: 0,
      max: 100,
      minLabel: 'Muy poco',
      maxLabel: 'Mucho',
      estados: [
        { id: '1', desde: 0, emoji: '😌', texto: 'Casi nada' },
        { id: '2', desde: 25, emoji: '😐', texto: 'Un poco' },
        { id: '3', desde: 50, emoji: '😰', texto: 'Bastante' },
        { id: '4', desde: 75, emoji: '😨', texto: 'Mucho' },
      ],
    }
    case 'clasificacionCategorias': return {
      titulo: '',
      instruccion: '',
      categorias: [
        { id: 'cat-1', label: 'Categoría 1', descripcion: '' },
        { id: 'cat-2', label: 'Categoría 2', descripcion: '' },
      ],
      items: [
        { id: 'item-1', texto: '', categoriaId: 'cat-1' },
        { id: 'item-2', texto: '', categoriaId: 'cat-2' },
      ],
      maxIntentos: 2,
    }
    case 'separarSilabas': return {
      titulo: 'Separa en sílabas',
      instruccion: 'Separa estas palabras del cuento y escribe cuántas sílabas tienen:',
      pista: 'Di la palabra en voz alta y da una palmada por cada parte. Escribe los pedazos separados con guiones (-).',
      palabras: [
        { id: 'palabra-1', palabra: '', silabas: '', cantidad: 1 },
        { id: 'palabra-2', palabra: '', silabas: '', cantidad: 1 },
        { id: 'palabra-3', palabra: '', silabas: '', cantidad: 1 },
        { id: 'palabra-4', palabra: '', silabas: '', cantidad: 1 },
      ],
      maxIntentos: 2,
    }
    case 'acrostico': return {
      titulo: 'Acróstico',
      palabra: 'MIEDO',
      instruccion: 'Escribe una palabra o frase que empiece con cada letra.',
      pista: 'Un acróstico usa cada letra para empezar algo nuevo. No hay respuesta equivocada si es creativo.',
      banco: [],
      lineas: ['M', 'I', 'E', 'D', 'O'].map((letra, i) => ({
        id: `linea-${i + 1}`,
        letra,
        placeholder: `escribe algo con ${letra}...`,
        pista: '',
        respuesta: '',
      })),
      maxIntentos: 2,
    }
    case 'crucigrama': return {
      titulo: 'Crucigrama del cuento',
      instruccion: 'Completa el crucigrama con palabras del cuento:',
      pista: 'Lee las pistas, escribe una letra por casilla y revisa si las palabras van horizontal o vertical.',
      filas: 9,
      columnas: 11,
      palabras: [
        { id: 'palabra-1', palabra: 'DIBUJO', fila: 0, columna: 0, direccion: 'v', pista: 'Figura hecha con colores.' },
        { id: 'palabra-2', palabra: 'RECREO', fila: 1, columna: 3, direccion: 'h', pista: 'Momento de descanso en el colegio.' },
      ],
      pistas: {
        horizontal: ['2. Momento de descanso en el colegio.'],
        vertical: ['1. Figura hecha con colores.'],
      },
    }
    case 'respiracionGuiada': return {
      titulo: 'Respira con calma',
      instruccion: 'Sigue el círculo: inhala cuando crece y exhala cuando se hace pequeño.',
      mensajeFinal: '¡Muy bien! Terminaste la respiración.',
      textoInicio: 'Presiona para comenzar',
      textoInhala: 'Inhala',
      textoExhala: 'Exhala',
      ciclos: 3,
      duracionInhala: 3,
      duracionExhala: 3,
    }
    case 'miniJuegoConteo': return {
      titulo: '¡Cuenta los elementos!',
      instruccion: 'Toca cada elemento para contarlo.',
      emoji: '🎈',
      cantidad: 10,
      tiempoLimite: 0,
      textoContador: 'Contados',
      mensajeFinal: '¡Muy bien! Contaste todos los elementos.',
      mensajeTiempo: 'Se acabó el tiempo. Puedes intentarlo otra vez.',
    }
    case 'exploracionInteractiva': return {
      titulo: 'Explora y transforma',
      instruccion: 'Haz clic en cada opción para ver cómo cambia la escena.',
      escenaInicial: '❓',
      textoInicial: 'Elige una opción para explorar.',
      mensajeFinal: '¡Exploraste todas las opciones!',
      preguntaAbierta: '¿Qué otra transformación imaginas?',
      placeholder: 'Mi idea es...',
      opciones: [
        { id: 'opcion-1', icono: '🌳', label: 'Árbol', texto: 'La sombra se convierte en un árbol conocido.', color: '#00897b' },
        { id: 'opcion-2', icono: '🐕', label: 'Perro', texto: 'La forma parece un perro amistoso.', color: '#1e88e5' },
      ],
    }
    case 'selectorEmocionColor': return {
      titulo: 'Elige una emoción y su color',
      instruccion: 'Haz clic en la tarjeta que mejor represente la emoción.',
      retroalimentacion: '¡Muy bien! Reconociste la emoción.',
      retroalimentacionError: 'Observa las pistas e inténtalo otra vez.',
      maxIntentos: 2,
      opciones: [
        { id: 'calma', emoji: '😌', nombre: 'Calma', descripcion: 'Cuando me siento en paz.', color: '#1e88e5', etiquetaColor: 'Azul', esCorrecta: true },
        { id: 'alegria', emoji: '😄', nombre: 'Alegría', descripcion: 'Cuando algo me hace feliz.', color: '#4caf50', etiquetaColor: 'Verde', esCorrecta: false },
        { id: 'inquietud', emoji: '😬', nombre: 'Inquietud', descripcion: 'Cuando algo me preocupa.', color: '#d97706', etiquetaColor: 'Amarillo', esCorrecta: false },
      ],
    }
    case 'mezclaPinturaGuiada': return {
      titulo: '¡Mezcla los colores!',
      instruccion: 'Haz clic en dos colores para mezclarlos y descubrir qué color aparece.',
      numMezclas: 1,
      mensajeFinal: '¡Muy bien! Descubriste una nueva mezcla.',
      pregunta: '¿Por qué crees que los colores pueden cambiar cuando se mezclan?',
      placeholder: 'Escribe tu respuesta...',
      colores: [
        { id: 'rojo', nombre: 'Rojo', hex: '#ef4444' },
        { id: 'amarillo', nombre: 'Amarillo', hex: '#eab308' },
        { id: 'azul', nombre: 'Azul', hex: '#3b82f6' },
      ],
      mezclas: [],
    }
    case 'tarjetasVolteables': return {
      titulo: 'Voltea y descubre',
      instruccion: 'Haz clic en cada tarjeta para descubrir lo que contiene.',
      textoFrente: 'Haz clic para descubrir',
      mensajeFinal: '¡Descubriste todas las tarjetas!',
      tarjetas: [
        { id: 'tarjeta-1', emoji: '😄', frente: 'Alegría', reverso: 'Sentirse feliz por algo que ocurre.', color: '#4caf50' },
        { id: 'tarjeta-2', emoji: '😢', frente: 'Tristeza', reverso: 'Cuando algo importante se pierde o cambia.', color: '#1e88e5' },
      ],
    }
    case 'seleccionMultiple': return { titulo: '', pregunta: '', pista: '', estilo: 'lista', opciones: [{ texto: '', esCorrecta: false }, { texto: '', esCorrecta: false }, { texto: '', esCorrecta: false }, { texto: '', esCorrecta: false }], retroalimentacion: '', retroalimentacionError: '', maxIntentos: 2 }
    case 'identificar':       return { titulo: '', instruccion: '', opciones: [{ icono: '😊', texto: '', esCorrecta: true }, { icono: '😢', texto: '', esCorrecta: false }], maxIntentos: 2 }
    case 'reflexionPersonal': return {
      titulo: '', instruccion: '', preguntaAbierta: '', placeholder: 'Escribe aquí tu reflexión…',
      textoBoton: 'Guardar reflexión',
      opciones: [
        { id: 'opcion-1', icono: '🌑', texto: 'Primera opción' },
        { id: 'opcion-2', icono: '✨', texto: 'Segunda opción' },
      ],
    }
    case 'lineaTiempoEmocional': return {
      titulo: '', instruccion: '', pista: '', retroalimentacion: '', retroalimentacionError: '', maxIntentos: 2,
      momentos: [
        {
          id: 'momento-1', emoji: '🌑', momento: '',
          opciones: [
            { id: 'emocion-1', emoji: '😨', texto: '', color: '#ef4444', esCorrecta: true },
            { id: 'emocion-2', emoji: '😊', texto: '', color: '#22c55e', esCorrecta: false },
          ],
        },
      ],
    }
    case 'verdaderoFalso':    return { titulo: '', afirmaciones: [{ texto: '', esVerdadero: true }] }
    case 'completarPalabras': return { titulo: '', texto: 'El [perro] salta sobre la [valla]', respuestas: ['perro', 'valla'], maxIntentos: 2 }
    case 'ordenarEventos':    return { titulo: '', instruccion: '', eventos: [{ id: '1', orden: 1, texto: '' }, { id: '2', orden: 2, texto: '' }], maxIntentos: 2 }
    case 'ordenarPalabras':   return { titulo: '', instruccion: '', pista: '', fraseCorrecta: '', palabras: [], textoArea: 'Tu oración:', maxIntentos: 2 }
    case 'emparejar':         return { titulo: '', instruccion: '', encabezadoIzquierda: 'Elemento', encabezadoDerecha: '¿Qué hace?', pares: [{ izquierda: '', derecha: '' }], maxIntentos: 2 }
    case 'completarMapa':     return { titulo: '', instruccion: '', nodos: [{ id: '1', label: '', icono: '', placeholder: '' }] }
    case 'escribirCarta':     return { titulo: '', destinatario: '', promptTexto: '', placeholder: '' }
    case 'dibujoLibre':       return { titulo: '', instruccion: '' }
    case 'video':             return { url: '', videoTitulo: '' }
    case 'audio':             return { url: '', titulo: '' }
    case 'imagen':            return { imagenUrl: '', descripcion: '' }
    case 'colorear':          return { imagenUrl: '' }
    default:                  return {}
  }
}

const PREVIEW_IMAGE = `data:image/svg+xml,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" width="900" height="460" viewBox="0 0 900 460">
    <defs><linearGradient id="g" x1="0" x2="1"><stop stop-color="#dbeafe"/><stop offset="1" stop-color="#ede9fe"/></linearGradient></defs>
    <rect width="900" height="460" rx="28" fill="url(#g)"/>
    <circle cx="450" cy="180" r="78" fill="#fff" opacity=".85"/>
    <text x="450" y="205" text-anchor="middle" font-size="72">🖼️</text>
    <text x="450" y="315" text-anchor="middle" font-family="sans-serif" font-size="28" font-weight="700" fill="#475569">Imagen de ejemplo</text>
  </svg>
`)}`

const PREVIEW_DEFAULTS = {
  sopaLetras: { titulo: 'Encuentra las palabras', palabras: ['LUNA', 'SOMBRA', 'MIEDO'], numPalabras: 3, espacio: 10 },
  seleccionMultiple: {
    titulo: 'Pregunta de ejemplo',
    pregunta: '¿Cuál de estas opciones corresponde a la historia?',
    opciones: [{ texto: 'Primera opción', esCorrecta: true }, { texto: 'Segunda opción', esCorrecta: false }, { texto: 'Tercera opción', esCorrecta: false }],
  },
  identificar: {
    titulo: 'Identifica las respuestas',
    instruccion: 'Selecciona todos los elementos que correspondan.',
    opciones: [{ icono: '😊', texto: 'Opción uno', esCorrecta: true }, { icono: '🌟', texto: 'Opción dos', esCorrecta: false }, { icono: '💡', texto: 'Opción tres', esCorrecta: true }],
  },
  reflexionPersonal: {
    titulo: 'Yo también siento…',
    instruccion: 'Selecciona todo lo que se relacione contigo.',
    preguntaAbierta: '¿Qué sientes en tu cuerpo? Escríbelo:',
    placeholder: 'Cuando me siento así…',
    opciones: [
      { id: '1', icono: '🌑', texto: 'La oscuridad' },
      { id: '2', icono: '⚡', texto: 'Los truenos' },
      { id: '3', icono: '🕷️', texto: 'Los insectos' },
    ],
  },
  lineaTiempoEmocional: {
    titulo: 'El viaje emocional',
    instruccion: 'Para cada momento del cuento, selecciona la emoción del personaje:',
    pista: 'Piensa en lo que ocurre y observa cómo reacciona el personaje.',
    momentos: [
      { id: '1', emoji: '🌑', momento: 'Cuando ve una sombra grande', opciones: [{ emoji: '😨', texto: 'Mucho miedo', color: '#ef4444', esCorrecta: true }, { emoji: '😊', texto: 'Muy feliz', color: '#22c55e', esCorrecta: false }] },
      { id: '2', emoji: '👨', momento: 'Cuando alguien se sienta a su lado', opciones: [{ emoji: '😌', texto: 'Alivio', color: '#3b82f6', esCorrecta: true }, { emoji: '😡', texto: 'Enojo', color: '#ef4444', esCorrecta: false }] },
    ],
  },
  verdaderoFalso: { titulo: 'Verdadero o falso', afirmaciones: [{ texto: 'Esta es una afirmación de ejemplo.', esVerdadero: true }, { texto: 'Esta es otra afirmación.', esVerdadero: false }] },
  ordenarEventos: { titulo: 'Ordena los eventos', instruccion: 'Organiza los hechos en el orden correcto.', eventos: [{ id: '1', orden: 1, texto: 'Primero ocurre este evento' }, { id: '2', orden: 2, texto: 'Después ocurre este evento' }] },
  ordenarPalabras: { titulo: 'Ordena las palabras', instruccion: 'Haz clic en las palabras en el orden correcto para formar una oración.', pista: 'Comienza identificando quién realiza la acción.', fraseCorrecta: 'Luna abraza su peluche con fuerza', palabras: ['Luna', 'abraza', 'su', 'peluche', 'con', 'fuerza'], textoArea: 'Tu oración:' },
  emparejar: { titulo: 'Une cada objeto con lo que hace', instruccion: 'Une cada elemento del cuento con lo que hace o provoca:', encabezadoIzquierda: 'Elemento', encabezadoDerecha: '¿Qué hace?', pares: [{ izquierda: '🌑 Oscuridad', derecha: 'Da consuelo y compañía' }, { izquierda: '🧸 Peluche', derecha: 'Asusta al personaje en la pared' }, { izquierda: '🛏️ Cobija', derecha: 'Aparece cuando se apaga la luz' }] },
  completarMapa: { titulo: 'Completa el mapa', instruccion: 'Escribe una idea en cada espacio.', nodos: [{ id: '1', label: 'Idea principal', icono: '💡', placeholder: 'Escribe aquí…' }, { id: '2', label: 'Detalle', icono: '✏️', placeholder: 'Escribe aquí…' }] },
  escribirCarta: { titulo: 'Escribe una carta', destinatario: 'un personaje del cuento', promptTexto: 'Cuéntale qué aprendiste de su historia.', placeholder: 'Escribe aquí lo que quieres contarle…' },
  dibujoLibre: { titulo: 'Dibuja tu idea', instruccion: 'Representa con un dibujo tu momento favorito.' },
  completarPalabras: { titulo: 'Completa la historia', texto: 'La [sombra] aparece al caer la [noche].', respuestas: ['sombra', 'noche'] },
  clasificacionCategorias: {
    titulo: 'Clasifica los elementos',
    instruccion: 'Ubica cada elemento en la categoría correcta.',
    categorias: [{ id: 'cat-1', label: 'Categoría A' }, { id: 'cat-2', label: 'Categoría B' }],
    items: [{ id: 'item-1', texto: 'Elemento uno', categoriaId: 'cat-1' }, { id: 'item-2', texto: 'Elemento dos', categoriaId: 'cat-2' }],
  },
  separarSilabas: { titulo: 'Separa en sílabas', instruccion: 'Divide cada palabra.', palabras: [{ id: '1', palabra: 'LUNA', silabas: 'LU-NA', cantidad: 2 }, { id: '2', palabra: 'SOMBRA', silabas: 'SOM-BRA', cantidad: 2 }] },
  acrostico: { titulo: 'Acróstico', palabra: 'LUNA', instruccion: 'Escribe una idea con cada letra.', lineas: ['L', 'U', 'N', 'A'].map((letra, i) => ({ id: `${i}`, letra, placeholder: `Una idea con ${letra}` })) },
  crucigrama: { titulo: 'Crucigrama', instruccion: 'Completa la palabra usando la pista.', filas: 6, columnas: 6, palabras: [{ id: '1', palabra: 'LUNA', fila: 1, columna: 1, direccion: 'h', pista: 'Ilumina la noche.' }] },
  exploracionInteractiva: { titulo: 'Explora las opciones', instruccion: 'Selecciona una opción para transformar la escena.', escenaInicial: '❓', textoInicial: 'Elige para descubrir.', opciones: [{ id: '1', icono: '🌳', label: 'Árbol', texto: 'La escena se transforma.' }, { id: '2', icono: '🌙', label: 'Luna', texto: 'Aparece una luz en el cielo.' }] },
  selectorEmocionColor: { titulo: 'Elige una emoción', instruccion: 'Selecciona la emoción que corresponda.', opciones: [{ id: '1', emoji: '😊', nombre: 'Alegría', descripcion: 'Me siento feliz', color: '#22c55e', esCorrecta: true }, { id: '2', emoji: '😟', nombre: 'Miedo', descripcion: 'Siento preocupación', color: '#6366f1', esCorrecta: false }] },
  tarjetasVolteables: { titulo: 'Voltea y descubre', instruccion: 'Toca cada tarjeta.', tarjetas: [{ id: '1', emoji: '😊', frente: 'Emoción', reverso: 'Una explicación de ejemplo', color: '#6366f1' }, { id: '2', emoji: '🌟', frente: 'Aprendizaje', reverso: 'Un aprendizaje de ejemplo', color: '#2563eb' }] },
  mezclaPinturaGuiada: { titulo: 'Mezcla los colores', instruccion: 'Elige dos colores para combinarlos.', colores: [{ id: 'rojo', nombre: 'Rojo', hex: '#ef4444' }, { id: 'azul', nombre: 'Azul', hex: '#3b82f6' }], mezclas: [{ color1Id: 'rojo', color2Id: 'azul', nombre: 'Morado', hex: '#8b5cf6' }] },
  video: { titulo: 'Video de ejemplo', videoTitulo: 'Así se verá el video de la actividad', url: 'about:blank' },
  audio: { titulo: 'Audio de ejemplo', url: 'data:audio/wav;base64,UklGRgQAAABXQVZFZm10IA==' },
  imagen: { titulo: 'Observa la imagen', imagenUrl: PREVIEW_IMAGE, descripcion: 'Aquí aparecerá la descripción de la imagen.' },
  colorear: { titulo: 'Colorea el dibujo', imagenUrl: PREVIEW_IMAGE },
}

function withPreviewDefaults(value, fallback) {
  if (value === '' || value === null || value === undefined) return fallback
  if (Array.isArray(value)) {
    if (value.length === 0) return fallback
    if (!Array.isArray(fallback)) return value
    return value.map((item, index) => withPreviewDefaults(item, fallback[index] ?? fallback[fallback.length - 1]))
  }
  if (typeof value === 'object' && typeof fallback === 'object' && fallback && !Array.isArray(fallback)) {
    const keys = new Set([...Object.keys(fallback), ...Object.keys(value)])
    return Object.fromEntries([...keys].map(key => [key, withPreviewDefaults(value[key], fallback[key])]))
  }
  return value
}

function JsonField({ label, value, onChange, placeholder }) {
  const [raw, setRaw] = useState(JSON.stringify(value, null, 2))
  const [err, setErr] = useState('')
  function handle(e) {
    setRaw(e.target.value)
    try { onChange(JSON.parse(e.target.value)); setErr('') }
    catch { setErr('JSON inválido') }
  }
  return (
    <>
      <label style={S.label}>{label} <span style={{ color: C.textLight, fontWeight: 400 }}>(JSON)</span></label>
      <textarea style={{ ...S.input, minHeight: 100, resize: 'vertical', fontFamily: 'monospace', fontSize: 12 }} value={raw} onChange={handle} placeholder={placeholder} />
      {err && <p style={{ color: C.danger, fontSize: 12, margin: '2px 0 8px' }}>{err}</p>}
    </>
  )
}

function cleanCrucigramaWord(text) {
  return String(text || '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-ZÑ]/g, '')
}

function validarCrucigrama(campos) {
  const errores = []
  const filas = Number(campos.filas)
  const columnas = Number(campos.columnas)
  const palabras = campos.palabras || []

  if (!Number.isInteger(filas) || filas <= 0) errores.push('La matriz debe tener un número válido de filas.')
  if (!Number.isInteger(columnas) || columnas <= 0) errores.push('La matriz debe tener un número válido de columnas.')
  if (palabras.length === 0) errores.push('Agrega al menos una palabra.')
  if (errores.length > 0) return errores

  const ocupadas = {}
  palabras.forEach((item, idx) => {
    const label = item.palabra || item.id || `palabra ${idx + 1}`
    const palabra = cleanCrucigramaWord(item.palabra || item.w || item.texto)
    const fila = Number(item.fila ?? item.r ?? item.row)
    const columna = Number(item.columna ?? item.c ?? item.col)
    const direccion = String(item.direccion || item.d || item.dir || 'h').toLowerCase().startsWith('v') ? 'v' : 'h'

    if (!palabra) {
      errores.push(`"${label}" debe tener texto.`)
      return
    }
    if (!Number.isInteger(fila) || fila < 0 || fila >= filas) errores.push(`"${label}" tiene eje Y/fila fuera de la matriz.`)
    if (!Number.isInteger(columna) || columna < 0 || columna >= columnas) errores.push(`"${label}" tiene eje X/columna fuera de la matriz.`)
    if (Number.isInteger(fila) && Number.isInteger(columna)) {
      const ultimaFila = fila + (direccion === 'v' ? palabra.length - 1 : 0)
      const ultimaColumna = columna + (direccion === 'h' ? palabra.length - 1 : 0)
      if (ultimaFila >= filas) errores.push(`"${label}" sobrepasa el número de filas para dirección vertical.`)
      if (ultimaColumna >= columnas) errores.push(`"${label}" sobrepasa el número de columnas para dirección horizontal.`)
      for (let i = 0; i < palabra.length; i++) {
        const r = fila + (direccion === 'v' ? i : 0)
        const c = columna + (direccion === 'h' ? i : 0)
        const key = `${r},${c}`
        if (ocupadas[key] && ocupadas[key] !== palabra[i]) {
          errores.push(`"${label}" cruza con otra palabra en (${c}, ${r}) con una letra distinta.`)
        }
        ocupadas[key] = palabra[i]
      }
    }
  })

  return [...new Set(errores)]
}

function validarActividadCampos(tipo, campos) {
  if (tipo === 'crucigrama') {
    const errores = validarCrucigrama(campos)
    if (errores.length > 0) throw new Error(errores.join(' '))
  }
  if (tipo === 'exploracionInteractiva') {
    const opciones = (campos.opciones || []).filter(op => String(op.label || op.titulo || '').trim())
    if (opciones.length < 2) throw new Error('Agrega al menos dos opciones de exploración con nombre.')
    const ids = opciones.map((op, i) => String(op.id || `opcion-${i + 1}`).trim())
    if (new Set(ids).size !== ids.length) throw new Error('Cada opción de exploración debe tener un ID diferente.')
  }
  if (tipo === 'selectorEmocionColor') {
    const opciones = (campos.opciones || []).filter(op => String(op.nombre || op.label || '').trim())
    if (opciones.length < 2) throw new Error('Agrega al menos dos emociones con nombre.')
    const ids = opciones.map((op, i) => String(op.id || `emocion-${i + 1}`).trim())
    if (new Set(ids).size !== ids.length) throw new Error('Cada emoción debe tener un ID diferente.')
    if (!opciones.some(op => op.esCorrecta)) {
      throw new Error('Marca una emoción como respuesta correcta.')
    }
  }
  if (tipo === 'mezclaPinturaGuiada') {
    const colores = (campos.colores || []).filter(color => String(color.nombre || color.label || '').trim())
    if (colores.length < 2) throw new Error('Agrega al menos dos colores a la paleta.')
    if (colores.length > 5) throw new Error('La paleta admite un máximo de cinco colores.')
    const ids = colores.map((color, i) => String(color.id || `color-${i + 1}`).trim())
    if (new Set(ids).size !== ids.length) throw new Error('Cada color debe tener un ID diferente.')
    const validIds = new Set(ids)
    const mezclas = campos.mezclas || []
    const totalEsperado = (colores.length * (colores.length - 1)) / 2
    if (mezclas.length !== totalEsperado) throw new Error('Configura el resultado de todas las combinaciones de colores.')
    for (const mezcla of mezclas) {
      if (!validIds.has(String(mezcla.color1Id)) || !validIds.has(String(mezcla.color2Id))) {
        throw new Error('Todas las mezclas deben usar IDs existentes en la paleta.')
      }
      if (!String(mezcla.nombre || '').trim()) throw new Error('Escribe el nombre resultante de cada combinación.')
    }
  }
  if (tipo === 'tarjetasVolteables') {
    const tarjetas = (campos.tarjetas || []).filter(card => String(card.frente || '').trim() || String(card.reverso || '').trim())
    if (tarjetas.length < 2) throw new Error('Agrega al menos dos tarjetas.')
    if (tarjetas.some(card => !String(card.frente || '').trim() || !String(card.reverso || '').trim())) {
      throw new Error('Todas las tarjetas deben tener texto en el frente y el reverso.')
    }
  }
  if (tipo === 'reflexionPersonal') {
    const opciones = (campos.opciones || []).filter(op => String(op.texto || '').trim())
    if (opciones.length === 0) throw new Error('Agrega al menos una opción para la reflexión.')
    if (!String(campos.preguntaAbierta || '').trim()) throw new Error('Escribe la pregunta abierta de la reflexión.')
  }
  if (tipo === 'ordenarPalabras') {
    const palabras = String(campos.fraseCorrecta || '').trim().split(/\s+/).filter(Boolean)
    if (palabras.length < 2) throw new Error('La frase correcta debe contener al menos dos palabras.')
  }
  if (tipo === 'lineaTiempoEmocional') {
    const momentos = campos.momentos || []
    if (momentos.length === 0) throw new Error('Agrega al menos un momento emocional.')
    for (const [index, momento] of momentos.entries()) {
      if (!String(momento.momento || '').trim()) throw new Error(`Escribe la descripción del momento ${index + 1}.`)
      const opciones = (momento.opciones || []).filter(opcion => String(opcion.texto || '').trim())
      if (opciones.length < 2) throw new Error(`El momento ${index + 1} necesita al menos dos emociones.`)
      if (opciones.filter(opcion => opcion.esCorrecta).length !== 1) throw new Error(`Marca exactamente una emoción correcta en el momento ${index + 1}.`)
    }
  }
}

function FormCampos({ tipo, campos, onChange }) {
  function f(k) { return e => onChange({ ...campos, [k]: e.target.value }) }

  if (tipo === 'sopaLetras') {
    const palabrasStr = Array.isArray(campos.palabras) ? campos.palabras.join(', ') : (campos.palabras || '')
    return (
      <>
        <label style={S.label}>Palabras <span style={{ color: C.textLight, fontWeight: 400 }}>(separadas por coma)</span></label>
        <input
          style={{ ...S.input, marginBottom: 12 }} value={palabrasStr}
          onChange={e => onChange({ ...campos, palabras: e.target.value.split(',').map(p => p.trim().toUpperCase()).filter(Boolean) })}
          placeholder="GATO, PERRO, PATO"
        />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={S.label}>Num. palabras</label>
            <input style={S.input} type="number" value={campos.numPalabras || 8} onChange={e => onChange({ ...campos, numPalabras: Number(e.target.value) })} />
          </div>
          <div>
            <label style={S.label}>Espacio (grid)</label>
            <input style={S.input} type="number" value={campos.espacio || 12} onChange={e => onChange({ ...campos, espacio: Number(e.target.value) })} />
          </div>
        </div>
      </>
    )
  }

  if (tipo === 'termometroEmocional') {
    const estados = campos.estados || [
      { id: '1', desde: campos.min ?? 0, emoji: '😌', texto: 'Casi nada' },
      { id: '2', desde: Math.round(((campos.max ?? 100) - (campos.min ?? 0)) * 0.33 + (campos.min ?? 0)), emoji: '😐', texto: 'Un poco' },
      { id: '3', desde: Math.round(((campos.max ?? 100) - (campos.min ?? 0)) * 0.66 + (campos.min ?? 0)), emoji: '😨', texto: 'Mucho' },
    ]
    function setEstados(next) { onChange({ ...campos, estados: next.map((estado, i) => ({ ...estado, id: String(i + 1) })) }) }
    function setEstado(i, key, val) { setEstados(estados.map((estado, j) => j === i ? { ...estado, [key]: val } : estado)) }
    const safeMin = Number(campos.min ?? 0)
    const safeMax = Number(campos.max ?? 100)
    const rango = Math.max(1, safeMax - safeMin)
    const estadosOrdenados = [...estados].sort((a, b) => Number(a.desde ?? safeMin) - Number(b.desde ?? safeMin))
    const escalaLegacy = campos.escalas?.[0] || {}
    return (
      <>
        <label style={S.label}>Instrucción</label>
        <textarea
          style={{ ...S.input, marginBottom: 12, minHeight: 72, resize: 'vertical' }}
          value={campos.instruccion || ''}
          onChange={f('instruccion')}
          placeholder="Mide cómo se siente el personaje en este momento."
        />
        <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <label style={S.label}>Emoji</label>
            <input style={{ ...S.input, textAlign: 'center', fontSize: 18 }} value={campos.emoji || escalaLegacy.emoji || ''} onChange={f('emoji')} placeholder="🌡️" maxLength={2} />
          </div>
          <div>
            <label style={S.label}>Texto del termómetro</label>
            <input style={S.input} value={campos.label || escalaLegacy.label || ''} onChange={f('label')} placeholder="¿Qué tan grande es el miedo?" />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <label style={S.label}>Valor mínimo</label>
            <input style={S.input} type="number" value={campos.min ?? 0} onChange={e => onChange({ ...campos, min: Number(e.target.value) })} />
          </div>
          <div>
            <label style={S.label}>Valor máximo</label>
            <input style={S.input} type="number" value={campos.max ?? 5} onChange={e => onChange({ ...campos, max: Number(e.target.value) })} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          <div>
            <label style={S.label}>Etiqueta mínima</label>
            <input style={S.input} value={campos.minLabel || ''} onChange={f('minLabel')} placeholder="Muy poco" />
          </div>
          <div>
            <label style={S.label}>Etiqueta máxima</label>
            <input style={S.input} value={campos.maxLabel || ''} onChange={f('maxLabel')} placeholder="Mucho" />
          </div>
        </div>
        <label style={S.label}>Estados visibles según el valor</label>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          {estadosOrdenados.map((estado, i) => {
            const desde = Number(estado.desde ?? safeMin)
            const percent = Math.max(0, Math.min(100, ((desde - safeMin) / rango) * 100))
            return (
              <span key={estado.id || i} style={{ border: `1px solid ${C.border}`, borderRadius: 20, padding: '4px 10px', background: '#fff', fontSize: 12, fontWeight: 700, color: C.textMuted }}>
                {estado.emoji || '🙂'} {estado.texto || 'Estado'} · {Math.round(percent)}%
              </span>
            )
          })}
        </div>
        {estados.map((estado, i) => (
          <div key={estado.id || i} style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: 12, marginBottom: 10, background: C.bg }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              <span style={{ flexShrink: 0, width: 24, height: 24, borderRadius: '50%', background: '#fff3e0', color: '#e65100', fontWeight: 800, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</span>
              <input
                style={{ ...S.input, width: 52, flexShrink: 0, textAlign: 'center', fontSize: 18 }}
                value={estado.emoji || ''}
                onChange={e => setEstado(i, 'emoji', e.target.value)}
                placeholder="🙂"
                maxLength={2}
              />
              <input
                style={{ ...S.input, flex: 1 }}
                value={estado.texto || ''}
                onChange={e => setEstado(i, 'texto', e.target.value)}
                placeholder="Casi nada, un poco, bastante..."
              />
              <input
                style={{ ...S.input, width: 90, flexShrink: 0 }}
                type="number"
                value={estado.desde ?? safeMin}
                onChange={e => setEstado(i, 'desde', Number(e.target.value))}
                title="Valor desde el que se muestra este estado"
              />
              <button
                type="button"
                onClick={() => setEstados(estados.filter((_, j) => j !== i))}
                style={{ background: 'none', border: 'none', color: C.danger, cursor: 'pointer', fontSize: 18, flexShrink: 0, lineHeight: 1 }}
              >✕</button>
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setEstados([...estados, { id: '', desde: safeMin, emoji: '🙂', texto: '' }])}
          style={{ marginTop: 4, background: 'none', border: `1.5px dashed ${C.primary}`, color: C.primary, borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontWeight: 700, fontSize: 13, fontFamily: 'inherit' }}
        >
          + Agregar estado
        </button>
      </>
    )
  }

  if (tipo === 'clasificacionCategorias') {
    const categorias = campos.categorias || []
    const items = campos.items || []
    function setCategorias(next) {
      const ids = new Set(next.map(c => c.id))
      const fallbackId = next[0]?.id || ''
      onChange({
        ...campos,
        categorias: next,
        items: items.map(item => ids.has(item.categoriaId) ? item : { ...item, categoriaId: fallbackId }),
      })
    }
    function setCategoria(i, key, val) {
      const prevId = categorias[i]?.id
      const next = categorias.map((cat, j) => j === i ? { ...cat, [key]: val } : cat)
      const nextItems = key === 'id'
        ? items.map(item => item.categoriaId === prevId ? { ...item, categoriaId: val } : item)
        : items
      onChange({ ...campos, categorias: next, items: nextItems })
    }
    function setItems(next) { onChange({ ...campos, items: next }) }
    function setItem(i, key, val) { setItems(items.map((item, j) => j === i ? { ...item, [key]: val } : item)) }
    return (
      <>
        <label style={S.label}>Título <span style={{ color: C.textLight, fontWeight: 400 }}>(aparece como encabezado)</span></label>
        <input
          style={{ ...S.input, marginBottom: 12 }}
          value={campos.titulo || ''}
          onChange={f('titulo')}
          placeholder="¿Cómo se siente el personaje?"
        />

        <label style={S.label}>Instrucción</label>
        <textarea
          style={{ ...S.input, marginBottom: 14, minHeight: 70, resize: 'vertical' }}
          value={campos.instruccion || ''}
          onChange={f('instruccion')}
          placeholder="Arrastra cada elemento a la categoría correcta."
        />

        <label style={S.label}>Categorías</label>
        {categorias.map((cat, i) => (
          <div key={cat.id || i} style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: 10, marginBottom: 10, background: C.bg }}>
            <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: 8, marginBottom: 8 }}>
              <input
                style={S.input}
                value={cat.id || ''}
                onChange={e => setCategoria(i, 'id', e.target.value.trim() || `cat-${i + 1}`)}
                placeholder="cat-1"
              />
              <input
                style={S.input}
                value={cat.label || ''}
                onChange={e => setCategoria(i, 'label', e.target.value)}
                placeholder={`Categoría ${i + 1}`}
              />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                style={{ ...S.input, flex: 1 }}
                value={cat.descripcion || ''}
                onChange={e => setCategoria(i, 'descripcion', e.target.value)}
                placeholder="Descripción opcional"
              />
              <button
                type="button"
                onClick={() => setCategorias(categorias.filter((_, j) => j !== i))}
                style={{ background: 'none', border: 'none', color: C.danger, cursor: 'pointer', fontSize: 18, flexShrink: 0 }}
              >✕</button>
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setCategorias([...categorias, { id: `cat-${categorias.length + 1}`, label: `Categoría ${categorias.length + 1}`, descripcion: '' }])}
          style={{ margin: '0 0 16px', background: 'none', border: `1.5px dashed ${C.primary}`, color: C.primary, borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontWeight: 700, fontSize: 13, fontFamily: 'inherit' }}
        >
          + Agregar categoría
        </button>

        <label style={S.label}>Elementos <span style={{ color: C.textLight, fontWeight: 400 }}>(elige la categoría correcta)</span></label>
        {items.map((item, i) => (
          <div key={item.id || i} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 150px 28px', gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <input
              style={S.input}
              value={item.id || ''}
              onChange={e => setItem(i, 'id', e.target.value.trim() || `item-${i + 1}`)}
              placeholder="item-1"
            />
            <input
              style={S.input}
              value={item.texto || ''}
              onChange={e => setItem(i, 'texto', e.target.value)}
              placeholder={`Elemento ${i + 1}`}
            />
            <select
              style={S.input}
              value={item.categoriaId || categorias[0]?.id || ''}
              onChange={e => setItem(i, 'categoriaId', e.target.value)}
            >
              {categorias.map(cat => <option key={cat.id} value={cat.id}>{cat.label || cat.id}</option>)}
            </select>
            <button
              type="button"
              onClick={() => setItems(items.filter((_, j) => j !== i))}
              style={{ background: 'none', border: 'none', color: C.danger, cursor: 'pointer', fontSize: 18 }}
            >✕</button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setItems([...items, { id: `item-${items.length + 1}`, texto: '', categoriaId: categorias[0]?.id || '' }])}
          style={{ marginTop: 4, background: 'none', border: `1.5px dashed ${C.primary}`, color: C.primary, borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontWeight: 700, fontSize: 13, fontFamily: 'inherit' }}
        >
          + Agregar elemento
        </button>

        <label style={{ ...S.label, marginTop: 14 }}>Máx. intentos <span style={{ color: C.textLight, fontWeight: 400 }}>(la actividad se completa aunque falle)</span></label>
        <input style={S.input} type="number" min={1} max={10} value={campos.maxIntentos ?? 2} onChange={e => onChange({ ...campos, maxIntentos: Number(e.target.value) })} />
      </>
    )
  }

  if (tipo === 'separarSilabas') {
    const palabras = campos.palabras || []
    function setPalabras(next) { onChange({ ...campos, palabras: next }) }
    function setPalabra(i, key, val) {
      setPalabras(palabras.map((item, j) => j === i ? { ...item, [key]: val } : item))
    }
    return (
      <>
        <label style={S.label}>Título <span style={{ color: C.textLight, fontWeight: 400 }}>(aparece como encabezado)</span></label>
        <input
          style={{ ...S.input, marginBottom: 12 }}
          value={campos.titulo || ''}
          onChange={f('titulo')}
          placeholder="Separa en sílabas"
        />

        <label style={S.label}>Instrucción</label>
        <textarea
          style={{ ...S.input, marginBottom: 12, minHeight: 64, resize: 'vertical' }}
          value={campos.instruccion || ''}
          onChange={f('instruccion')}
          placeholder="Separa estas palabras del cuento y escribe cuántas sílabas tienen:"
        />

        <label style={S.label}>Pista</label>
        <textarea
          style={{ ...S.input, marginBottom: 14, minHeight: 64, resize: 'vertical' }}
          value={campos.pista || ''}
          onChange={f('pista')}
          placeholder="Di la palabra en voz alta y da una palmada por cada parte."
        />

        <label style={S.label}>Palabras</label>
        {palabras.map((item, i) => (
          <div key={item.id || i} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 1fr 90px 28px', gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <input
              style={S.input}
              value={item.id || ''}
              onChange={e => setPalabra(i, 'id', e.target.value.trim() || `palabra-${i + 1}`)}
              placeholder="id"
            />
            <input
              style={S.input}
              value={item.palabra || ''}
              onChange={e => setPalabra(i, 'palabra', e.target.value.toUpperCase())}
              placeholder="PALABRA"
            />
            <input
              style={S.input}
              value={item.silabas || ''}
              onChange={e => setPalabra(i, 'silabas', e.target.value.toLowerCase())}
              placeholder="pa-la-bra"
            />
            <input
              style={S.input}
              type="number"
              min={1}
              value={item.cantidad ?? ''}
              onChange={e => setPalabra(i, 'cantidad', Number(e.target.value))}
              placeholder="#"
            />
            <button
              type="button"
              onClick={() => setPalabras(palabras.filter((_, j) => j !== i))}
              style={{ background: 'none', border: 'none', color: C.danger, cursor: 'pointer', fontSize: 18 }}
            >✕</button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setPalabras([...palabras, { id: `palabra-${palabras.length + 1}`, palabra: '', silabas: '', cantidad: 1 }])}
          style={{ marginTop: 4, background: 'none', border: `1.5px dashed ${C.primary}`, color: C.primary, borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontWeight: 700, fontSize: 13, fontFamily: 'inherit' }}
        >
          + Agregar palabra
        </button>

        <label style={{ ...S.label, marginTop: 14 }}>Máx. intentos <span style={{ color: C.textLight, fontWeight: 400 }}>(la actividad se completa aunque falle)</span></label>
        <input style={S.input} type="number" min={1} max={10} value={campos.maxIntentos ?? 2} onChange={e => onChange({ ...campos, maxIntentos: Number(e.target.value) })} />
      </>
    )
  }

  if (tipo === 'acrostico') {
    const bancoStr = Array.isArray(campos.banco) ? campos.banco.join(', ') : (campos.banco || '')
    const lineas = campos.lineas || []
    function setLineas(next) { onChange({ ...campos, lineas: next }) }
    function setLinea(i, key, val) {
      setLineas(lineas.map((item, j) => j === i ? { ...item, [key]: val } : item))
    }
    function generarDesdePalabra() {
      const letras = String(campos.palabra || '').split('').filter(Boolean)
      onChange({
        ...campos,
        lineas: letras.map((letra, i) => ({
          id: `linea-${i + 1}`,
          letra: letra.toUpperCase(),
          placeholder: `escribe algo con ${letra.toUpperCase()}...`,
          pista: '',
          respuesta: '',
        })),
      })
    }
    return (
      <>
        <label style={S.label}>Título <span style={{ color: C.textLight, fontWeight: 400 }}>(aparece como encabezado)</span></label>
        <input
          style={{ ...S.input, marginBottom: 12 }}
          value={campos.titulo || ''}
          onChange={f('titulo')}
          placeholder="Acróstico de MIEDO"
        />

        <label style={S.label}>Palabra guía</label>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input
            style={{ ...S.input, flex: 1 }}
            value={campos.palabra || ''}
            onChange={e => onChange({ ...campos, palabra: e.target.value.toUpperCase() })}
            placeholder="MIEDO"
          />
          <button type="button" onClick={generarDesdePalabra} style={btnOutline(C.primary, 'sm')}>Generar líneas</button>
        </div>

        <label style={S.label}>Instrucción</label>
        <textarea
          style={{ ...S.input, marginBottom: 12, minHeight: 64, resize: 'vertical' }}
          value={campos.instruccion || ''}
          onChange={f('instruccion')}
          placeholder="Escribe una palabra o frase que empiece con cada letra."
        />

        <label style={S.label}>Pista</label>
        <textarea
          style={{ ...S.input, marginBottom: 12, minHeight: 64, resize: 'vertical' }}
          value={campos.pista || ''}
          onChange={f('pista')}
          placeholder="Un acróstico usa cada letra para empezar algo nuevo."
        />

        <label style={S.label}>Banco de palabras <span style={{ color: C.textLight, fontWeight: 400 }}>(opcional, separado por coma)</span></label>
        <input
          style={{ ...S.input, marginBottom: 14 }}
          value={bancoStr}
          onChange={e => onChange({ ...campos, banco: e.target.value.split(',').map(p => p.trim()).filter(Boolean) })}
          placeholder="ayudo, lugar, siente"
        />

        <label style={S.label}>Líneas <span style={{ color: C.textLight, fontWeight: 400 }}>(respuesta opcional: si la llenas, se valida)</span></label>
        {lineas.map((item, i) => (
          <div key={item.id || i} style={{ display: 'grid', gridTemplateColumns: '80px 70px 1fr 1fr 1fr 28px', gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <input
              style={S.input}
              value={item.id || ''}
              onChange={e => setLinea(i, 'id', e.target.value.trim() || `linea-${i + 1}`)}
              placeholder="id"
            />
            <input
              style={S.input}
              value={item.letra || ''}
              onChange={e => setLinea(i, 'letra', e.target.value.toUpperCase().slice(0, 1))}
              placeholder="M"
            />
            <input
              style={S.input}
              value={item.placeholder || ''}
              onChange={e => setLinea(i, 'placeholder', e.target.value)}
              placeholder="escribe algo..."
            />
            <input
              style={S.input}
              value={item.pista || ''}
              onChange={e => setLinea(i, 'pista', e.target.value)}
              placeholder="pista opcional"
            />
            <input
              style={S.input}
              value={item.respuesta || ''}
              onChange={e => setLinea(i, 'respuesta', e.target.value)}
              placeholder="respuesta opcional"
            />
            <button
              type="button"
              onClick={() => setLineas(lineas.filter((_, j) => j !== i))}
              style={{ background: 'none', border: 'none', color: C.danger, cursor: 'pointer', fontSize: 18 }}
            >✕</button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setLineas([...lineas, { id: `linea-${lineas.length + 1}`, letra: '', placeholder: '', pista: '', respuesta: '' }])}
          style={{ marginTop: 4, background: 'none', border: `1.5px dashed ${C.primary}`, color: C.primary, borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontWeight: 700, fontSize: 13, fontFamily: 'inherit' }}
        >
          + Agregar línea
        </button>

        <label style={{ ...S.label, marginTop: 14 }}>Máx. intentos <span style={{ color: C.textLight, fontWeight: 400 }}>(solo aplica si hay respuestas correctas)</span></label>
        <input style={S.input} type="number" min={1} max={10} value={campos.maxIntentos ?? 2} onChange={e => onChange({ ...campos, maxIntentos: Number(e.target.value) })} />
      </>
    )
  }

  if (tipo === 'crucigrama') {
    const palabras = campos.palabras || []
    const pistas = campos.pistas || { horizontal: [], vertical: [] }
    const pistasHorizontal = Array.isArray(pistas.horizontal) ? pistas.horizontal.join('\n') : Array.isArray(pistas.h) ? pistas.h.join('\n') : ''
    const pistasVertical = Array.isArray(pistas.vertical) ? pistas.vertical.join('\n') : Array.isArray(pistas.v) ? pistas.v.join('\n') : ''
    const validationErrors = validarCrucigrama(campos)
    function setPalabras(next) { onChange({ ...campos, palabras: next }) }
    function setPalabra(i, key, val) {
      setPalabras(palabras.map((item, j) => j === i ? { ...item, [key]: val } : item))
    }
    function setPistas(key, raw) {
      onChange({
        ...campos,
        pistas: {
          ...pistas,
          [key]: raw.split('\n').map(line => line.trim()).filter(Boolean),
        },
      })
    }
    return (
      <>
        <label style={S.label}>Título <span style={{ color: C.textLight, fontWeight: 400 }}>(aparece como encabezado)</span></label>
        <input
          style={{ ...S.input, marginBottom: 12 }}
          value={campos.titulo || ''}
          onChange={f('titulo')}
          placeholder="Crucigrama del cuento"
        />

        <label style={S.label}>Instrucción</label>
        <textarea
          style={{ ...S.input, marginBottom: 12, minHeight: 64, resize: 'vertical' }}
          value={campos.instruccion || ''}
          onChange={f('instruccion')}
          placeholder="Completa el crucigrama con palabras del cuento:"
        />

        <label style={S.label}>Pista general</label>
        <textarea
          style={{ ...S.input, marginBottom: 14, minHeight: 64, resize: 'vertical' }}
          value={campos.pista || ''}
          onChange={f('pista')}
          placeholder="Escribe una letra por casilla. Horizontal va hacia la derecha; vertical va hacia abajo."
        />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
          <div>
            <label style={S.label}>Filas</label>
            <input style={S.input} type="number" min={1} max={20} value={campos.filas ?? 9} onChange={e => onChange({ ...campos, filas: Number(e.target.value) })} />
          </div>
          <div>
            <label style={S.label}>Columnas</label>
            <input style={S.input} type="number" min={1} max={20} value={campos.columnas ?? 11} onChange={e => onChange({ ...campos, columnas: Number(e.target.value) })} />
          </div>
        </div>

        <label style={S.label}>Palabras <span style={{ color: C.textLight, fontWeight: 400 }}>(fila/columna empiezan en 0)</span></label>
        {palabras.map((item, i) => (
          <div key={item.id || i} style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: 10, marginBottom: 10, background: C.bg }}>
            <div style={{ display: 'grid', gridTemplateColumns: '110px minmax(180px, 1fr) 32px', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              <input
                style={S.input}
                value={item.id || ''}
                onChange={e => setPalabra(i, 'id', e.target.value.trim() || `palabra-${i + 1}`)}
                placeholder="id"
              />
              <input
                style={{ ...S.input, minWidth: 0, fontFamily: 'monospace', fontSize: 14, letterSpacing: 1 }}
                value={item.palabra || ''}
                onChange={e => setPalabra(i, 'palabra', e.target.value.toUpperCase())}
                placeholder="PALABRA"
              />
              <button
                type="button"
                onClick={() => setPalabras(palabras.filter((_, j) => j !== i))}
                style={{ background: 'none', border: 'none', color: C.danger, cursor: 'pointer', fontSize: 18 }}
              >✕</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.2fr', gap: 8, marginBottom: 8 }}>
              <div>
                <label style={{ ...S.label, marginBottom: 4 }}>Eje Y / fila</label>
                <input
                  style={S.input}
                  type="number"
                  min={0}
                  value={item.fila ?? 0}
                  onChange={e => setPalabra(i, 'fila', Number(e.target.value))}
                  placeholder="fila"
                />
              </div>
              <div>
                <label style={{ ...S.label, marginBottom: 4 }}>Eje X / columna</label>
                <input
                  style={S.input}
                  type="number"
                  min={0}
                  value={item.columna ?? 0}
                  onChange={e => setPalabra(i, 'columna', Number(e.target.value))}
                  placeholder="columna"
                />
              </div>
              <div>
                <label style={{ ...S.label, marginBottom: 4 }}>Dirección</label>
                <select
                  style={S.input}
                  value={item.direccion || 'h'}
                  onChange={e => setPalabra(i, 'direccion', e.target.value)}
                >
                  <option value="h">Horizontal</option>
                  <option value="v">Vertical</option>
                </select>
              </div>
            </div>
            <input
              style={S.input}
              value={item.pista || ''}
              onChange={e => setPalabra(i, 'pista', e.target.value)}
              placeholder="Pista de esta palabra"
            />
          </div>
        ))}
        <button
          type="button"
          onClick={() => setPalabras([...palabras, { id: `palabra-${palabras.length + 1}`, palabra: '', fila: 0, columna: 0, direccion: 'h', pista: '' }])}
          style={{ margin: '4px 0 14px', background: 'none', border: `1.5px dashed ${C.primary}`, color: C.primary, borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontWeight: 700, fontSize: 13, fontFamily: 'inherit' }}
        >
          + Agregar palabra
        </button>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={S.label}>Pistas horizontales <span style={{ color: C.textLight, fontWeight: 400 }}>(una por línea)</span></label>
            <textarea style={{ ...S.input, minHeight: 90, resize: 'vertical' }} value={pistasHorizontal} onChange={e => setPistas('horizontal', e.target.value)} />
          </div>
          <div>
            <label style={S.label}>Pistas verticales <span style={{ color: C.textLight, fontWeight: 400 }}>(una por línea)</span></label>
            <textarea style={{ ...S.input, minHeight: 90, resize: 'vertical' }} value={pistasVertical} onChange={e => setPistas('vertical', e.target.value)} />
          </div>
        </div>

        {validationErrors.length > 0 && (
          <div style={{ marginTop: 14, background: C.dangerLight, color: C.danger, borderRadius: 8, padding: '10px 14px', fontSize: 13, fontWeight: 700, lineHeight: 1.45 }}>
            {validationErrors.map(err => <div key={err}>• {err}</div>)}
          </div>
        )}
      </>
    )
  }

  if (tipo === 'respiracionGuiada') {
    return (
      <>
        <label style={S.label}>Título <span style={{ color: C.textLight, fontWeight: 400 }}>(aparece como encabezado)</span></label>
        <input
          style={{ ...S.input, marginBottom: 12 }}
          value={campos.titulo || ''}
          onChange={f('titulo')}
          placeholder="Respira con calma"
        />

        <label style={S.label}>Instrucción</label>
        <textarea
          style={{ ...S.input, marginBottom: 12, minHeight: 72, resize: 'vertical' }}
          value={campos.instruccion || ''}
          onChange={f('instruccion')}
          placeholder="Sigue el círculo: inhala cuando crece y exhala cuando se hace pequeño."
        />

        <label style={S.label}>Mensaje al finalizar</label>
        <input
          style={{ ...S.input, marginBottom: 12 }}
          value={campos.mensajeFinal || ''}
          onChange={f('mensajeFinal')}
          placeholder="¡Muy bien! Terminaste la respiración."
        />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <label style={S.label}>Ciclos</label>
            <input style={S.input} type="number" min={1} max={10} value={campos.ciclos ?? 3} onChange={e => onChange({ ...campos, ciclos: Number(e.target.value) })} />
          </div>
          <div>
            <label style={S.label}>Inhala <span style={{ color: C.textLight, fontWeight: 400 }}>(seg.)</span></label>
            <input style={S.input} type="number" min={1} max={10} value={campos.duracionInhala ?? 3} onChange={e => onChange({ ...campos, duracionInhala: Number(e.target.value) })} />
          </div>
          <div>
            <label style={S.label}>Exhala <span style={{ color: C.textLight, fontWeight: 400 }}>(seg.)</span></label>
            <input style={S.input} type="number" min={1} max={10} value={campos.duracionExhala ?? 3} onChange={e => onChange({ ...campos, duracionExhala: Number(e.target.value) })} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <div>
            <label style={S.label}>Texto inicial</label>
            <input style={S.input} value={campos.textoInicio || ''} onChange={f('textoInicio')} placeholder="Presiona para comenzar" />
          </div>
          <div>
            <label style={S.label}>Texto al inhalar</label>
            <input style={S.input} value={campos.textoInhala || ''} onChange={f('textoInhala')} placeholder="Inhala" />
          </div>
          <div>
            <label style={S.label}>Texto al exhalar</label>
            <input style={S.input} value={campos.textoExhala || ''} onChange={f('textoExhala')} placeholder="Exhala" />
          </div>
        </div>
      </>
    )
  }

  if (tipo === 'miniJuegoConteo') {
    return (
      <>
        <label style={S.label}>Título <span style={{ color: C.textLight, fontWeight: 400 }}>(aparece como encabezado)</span></label>
        <input style={{ ...S.input, marginBottom: 12 }} value={campos.titulo || ''} onChange={f('titulo')} placeholder="¡Cuenta los elementos!" />

        <label style={S.label}>Instrucción</label>
        <textarea
          style={{ ...S.input, marginBottom: 12, minHeight: 72, resize: 'vertical' }}
          value={campos.instruccion || ''}
          onChange={f('instruccion')}
          placeholder="Toca cada elemento para contarlo."
        />

        <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <label style={S.label}>Emoji</label>
            <input style={{ ...S.input, textAlign: 'center', fontSize: 20 }} value={campos.emoji || ''} onChange={f('emoji')} placeholder="🎈" maxLength={4} />
          </div>
          <div>
            <label style={S.label}>Cantidad</label>
            <input style={S.input} type="number" min={1} max={30} value={campos.cantidad ?? 10} onChange={e => onChange({ ...campos, cantidad: Number(e.target.value) })} />
          </div>
          <div>
            <label style={S.label}>Tiempo límite <span style={{ color: C.textLight, fontWeight: 400 }}>(0 = sin límite)</span></label>
            <input style={S.input} type="number" min={0} max={120} value={campos.tiempoLimite ?? 0} onChange={e => onChange({ ...campos, tiempoLimite: Number(e.target.value) })} />
          </div>
        </div>

        <label style={S.label}>Texto del contador</label>
        <input style={{ ...S.input, marginBottom: 12 }} value={campos.textoContador || ''} onChange={f('textoContador')} placeholder="Contados" />

        <label style={S.label}>Mensaje al completar</label>
        <input style={{ ...S.input, marginBottom: 12 }} value={campos.mensajeFinal || ''} onChange={f('mensajeFinal')} placeholder="¡Muy bien! Contaste todos los elementos." />

        <label style={S.label}>Mensaje si se acaba el tiempo</label>
        <input style={S.input} value={campos.mensajeTiempo || ''} onChange={f('mensajeTiempo')} placeholder="Se acabó el tiempo. Puedes intentarlo otra vez." />
      </>
    )
  }

  if (tipo === 'exploracionInteractiva') {
    const opciones = campos.opciones || []
    function setOpciones(next) { onChange({ ...campos, opciones: next }) }
    function setOpcion(i, key, val) {
      setOpciones(opciones.map((op, j) => j === i ? { ...op, [key]: val } : op))
    }
    return (
      <>
        <label style={S.label}>Título <span style={{ color: C.textLight, fontWeight: 400 }}>(aparece como encabezado)</span></label>
        <input style={{ ...S.input, marginBottom: 12 }} value={campos.titulo || ''} onChange={f('titulo')} placeholder="Explora y transforma" />

        <label style={S.label}>Instrucción</label>
        <textarea style={{ ...S.input, marginBottom: 12, minHeight: 72, resize: 'vertical' }} value={campos.instruccion || ''} onChange={f('instruccion')} placeholder="Haz clic en cada opción para ver cómo cambia la escena." />

        <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <label style={S.label}>Escena inicial</label>
            <input style={{ ...S.input, textAlign: 'center', fontSize: 20 }} value={campos.escenaInicial || ''} onChange={f('escenaInicial')} placeholder="❓" maxLength={4} />
          </div>
          <div>
            <label style={S.label}>Texto inicial</label>
            <input style={S.input} value={campos.textoInicial || ''} onChange={f('textoInicial')} placeholder="Elige una opción para explorar." />
          </div>
        </div>

        <label style={S.label}>Mensaje al finalizar</label>
        <input style={{ ...S.input, marginBottom: 12 }} value={campos.mensajeFinal || ''} onChange={f('mensajeFinal')} placeholder="¡Exploraste todas las opciones!" />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
          <div>
            <label style={S.label}>Pregunta abierta <span style={{ color: C.textLight, fontWeight: 400 }}>(opcional)</span></label>
            <input style={S.input} value={campos.preguntaAbierta || ''} onChange={f('preguntaAbierta')} placeholder="¿Qué otra transformación imaginas?" />
          </div>
          <div>
            <label style={S.label}>Placeholder</label>
            <input style={S.input} value={campos.placeholder || ''} onChange={f('placeholder')} placeholder="Mi idea es..." />
          </div>
        </div>

        <label style={S.label}>Opciones de exploración</label>
        {opciones.map((op, i) => (
          <div key={op.id || i} style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: 10, marginBottom: 10, background: C.bg }}>
            <div style={{ display: 'grid', gridTemplateColumns: '95px 70px 1fr 95px 28px', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              <input style={S.input} value={op.id || ''} onChange={e => setOpcion(i, 'id', e.target.value.trim() || `opcion-${i + 1}`)} placeholder="id" />
              <input style={{ ...S.input, textAlign: 'center', fontSize: 18 }} value={op.icono || ''} onChange={e => setOpcion(i, 'icono', e.target.value)} placeholder="✨" maxLength={4} />
              <input style={S.input} value={op.label || ''} onChange={e => setOpcion(i, 'label', e.target.value)} placeholder={`Opción ${i + 1}`} />
              <input style={S.input} type="color" value={op.color || '#00897b'} onChange={e => setOpcion(i, 'color', e.target.value)} />
              <button type="button" onClick={() => setOpciones(opciones.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', color: C.danger, cursor: 'pointer', fontSize: 18 }}>✕</button>
            </div>
            <textarea style={{ ...S.input, minHeight: 62, resize: 'vertical' }} value={op.texto || ''} onChange={e => setOpcion(i, 'texto', e.target.value)} placeholder="Texto que se muestra al seleccionar esta opción" />
          </div>
        ))}
        <button type="button" onClick={() => setOpciones([...opciones, { id: `opcion-${opciones.length + 1}`, icono: '✨', label: '', texto: '', color: '#00897b' }])} style={{ marginTop: 4, background: 'none', border: `1.5px dashed ${C.primary}`, color: C.primary, borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontWeight: 700, fontSize: 13, fontFamily: 'inherit' }}>
          + Agregar opción
        </button>
      </>
    )
  }

  if (tipo === 'selectorEmocionColor') {
    const opciones = campos.opciones || []
    function setOpciones(next) { onChange({ ...campos, opciones: next }) }
    function setOpcion(i, key, val) { setOpciones(opciones.map((op, j) => j === i ? { ...op, [key]: val } : op)) }
    return (
      <>
        <label style={S.label}>Título</label>
        <input style={{ ...S.input, marginBottom: 12 }} value={campos.titulo || ''} onChange={f('titulo')} placeholder="Elige una emoción y su color" />
        <label style={S.label}>Instrucción</label>
        <textarea style={{ ...S.input, marginBottom: 12, minHeight: 68, resize: 'vertical' }} value={campos.instruccion || ''} onChange={f('instruccion')} placeholder="Haz clic en la tarjeta que mejor represente la emoción." />
        <label style={S.label}>Emociones y colores</label>
        {opciones.map((op, i) => (
          <div key={op.id || i} style={{ border: `1px solid ${C.border}`, borderRadius: 10, padding: 10, marginBottom: 10, background: C.bg }}>
            <div style={{ display: 'grid', gridTemplateColumns: '90px 62px 1fr 100px 58px 28px', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              <input style={S.input} value={op.id || ''} onChange={e => setOpcion(i, 'id', e.target.value)} placeholder="id" />
              <input style={{ ...S.input, textAlign: 'center', fontSize: 18 }} value={op.emoji || ''} onChange={e => setOpcion(i, 'emoji', e.target.value)} placeholder="🙂" maxLength={4} />
              <input style={S.input} value={op.nombre || ''} onChange={e => setOpcion(i, 'nombre', e.target.value)} placeholder="Emoción" />
              <input style={S.input} value={op.etiquetaColor || ''} onChange={e => setOpcion(i, 'etiquetaColor', e.target.value)} placeholder="Color" />
              <input style={S.input} type="color" value={op.color || '#7b1fa2'} onChange={e => setOpcion(i, 'color', e.target.value)} />
              <button type="button" onClick={() => setOpciones(opciones.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', color: C.danger, cursor: 'pointer', fontSize: 18 }}>✕</button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input style={{ ...S.input, flex: 1 }} value={op.descripcion || ''} onChange={e => setOpcion(i, 'descripcion', e.target.value)} placeholder="Descripción breve de la emoción" />
              <label style={{ fontSize: 12, fontWeight: 800, color: C.text, whiteSpace: 'nowrap' }}><input type="radio" name="emocion-correcta" checked={!!op.esCorrecta} onChange={() => setOpciones(opciones.map((item, j) => ({ ...item, esCorrecta: j === i })))} /> Correcta</label>
            </div>
          </div>
        ))}
        <button type="button" onClick={() => setOpciones([...opciones, { id: `emocion-${opciones.length + 1}`, emoji: '🙂', nombre: '', descripcion: '', color: '#7b1fa2', etiquetaColor: '', esCorrecta: false }])} style={{ marginTop: 4, background: 'none', border: `1.5px dashed ${C.primary}`, color: C.primary, borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontWeight: 700, fontSize: 13, fontFamily: 'inherit' }}>+ Agregar emoción</button>
        <label style={{ ...S.label, marginTop: 14 }}>Retroalimentación correcta</label>
        <input style={{ ...S.input, marginBottom: 12 }} value={campos.retroalimentacion || ''} onChange={f('retroalimentacion')} />
        <label style={S.label}>Retroalimentación de error</label>
        <input style={{ ...S.input, marginBottom: 12 }} value={campos.retroalimentacionError || ''} onChange={f('retroalimentacionError')} />
        <label style={S.label}>Máx. intentos</label>
        <input style={S.input} type="number" min={1} max={10} value={campos.maxIntentos ?? 2} onChange={e => onChange({ ...campos, maxIntentos: Number(e.target.value) })} />
      </>
    )
  }

  if (tipo === 'mezclaPinturaGuiada') {
    const colores = campos.colores || []
    function combinarPares(nextColors, currentMixes) {
      const pairs = []
      for (let i = 0; i < nextColors.length; i++) {
        for (let j = i + 1; j < nextColors.length; j++) {
          const a = String(nextColors[i].id), b = String(nextColors[j].id)
          const saved = (currentMixes || []).find(mix => (
            (String(mix.color1Id) === a && String(mix.color2Id) === b) ||
            (String(mix.color1Id) === b && String(mix.color2Id) === a)
          ))
          pairs.push(saved ? { ...saved, color1Id: a, color2Id: b } : { color1Id: a, color2Id: b, nombre: '', hex: '#94a3b8', mensaje: '' })
        }
      }
      return pairs
    }
    function setColores(next) {
      const normalized = next.map((color, i) => ({ ...color, id: color.id || `color-${i + 1}` }))
      onChange({
        ...campos,
        colores: normalized,
        mezclas: combinarPares(normalized, campos.mezclas || []),
      })
    }
    function setColor(i, key, value) {
      setColores(colores.map((color, j) => j === i ? { ...color, [key]: value } : color))
    }
    const mezclas = combinarPares(colores, campos.mezclas || [])
    function setMezcla(i, key, value) {
      onChange({ ...campos, mezclas: mezclas.map((mix, j) => j === i ? { ...mix, [key]: value } : mix) })
    }
    function nextColorId() {
      const used = new Set(colores.map(color => String(color.id)))
      let n = 1
      while (used.has(`color-${n}`)) n++
      return `color-${n}`
    }
    const colorById = new Map(colores.map(color => [String(color.id), color]))
    return (
      <>
        <label style={S.label}>Título</label>
        <input style={{ ...S.input, marginBottom: 12 }} value={campos.titulo || ''} onChange={f('titulo')} placeholder="¡Mezcla los colores!" />
        <label style={S.label}>Instrucción</label>
        <textarea style={{ ...S.input, marginBottom: 12, minHeight: 68, resize: 'vertical' }} value={campos.instruccion || ''} onChange={f('instruccion')} />
        <label style={S.label}>Mensaje al completar</label>
        <input style={{ ...S.input, marginBottom: 14 }} value={campos.mensajeFinal || ''} onChange={f('mensajeFinal')} />
        <label style={S.label}>Pregunta para el estudiante <span style={{ color: C.textLight, fontWeight: 400 }}>(opcional)</span></label>
        <textarea style={{ ...S.input, minHeight: 64, resize: 'vertical', marginBottom: 12 }} value={campos.pregunta || ''} onChange={f('pregunta')} placeholder="¿Por qué crees que los colores cambian cuando se mezclan?" />
        <label style={S.label}>Texto de ayuda de la respuesta</label>
        <input style={{ ...S.input, marginBottom: 14 }} value={campos.placeholder || ''} onChange={f('placeholder')} placeholder="Escribe tu respuesta..." />
        <label style={S.label}>Colores para combinar <span style={{ color: C.textLight, fontWeight: 400 }}>(2 a 5 colores)</span></label>
        {colores.map((color, i) => (
          <div key={color.id || i} style={{ display: 'grid', gridTemplateColumns: '1fr 70px 32px', gap: 8, alignItems: 'center', padding: 9, marginBottom: 8, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10 }}>
            <input style={S.input} value={color.nombre || ''} onChange={e => setColor(i, 'nombre', e.target.value)} placeholder={`Nombre del color ${i + 1}`} />
            <input style={{ ...S.input, height: 40, padding: 3 }} type="color" value={color.hex || '#94a3b8'} onChange={e => setColor(i, 'hex', e.target.value)} aria-label={`Color ${i + 1}`} />
            <button type="button" onClick={() => setColores(colores.filter((_, j) => j !== i))} disabled={colores.length <= 2} title={colores.length <= 2 ? 'Debe haber al menos dos colores' : 'Eliminar color'} style={{ background: 'none', border: 'none', color: colores.length <= 2 ? C.textLight : C.danger, cursor: colores.length <= 2 ? 'default' : 'pointer', fontSize: 18 }}>✕</button>
          </div>
        ))}
        <button type="button" disabled={colores.length >= 5} onClick={() => setColores([...colores, { id: nextColorId(), nombre: '', hex: '#94a3b8' }])} style={{ marginTop: 4, background: 'none', border: `1.5px dashed ${colores.length >= 5 ? C.border : C.primary}`, color: colores.length >= 5 ? C.textLight : C.primary, borderRadius: 8, padding: '6px 14px', cursor: colores.length >= 5 ? 'default' : 'pointer', fontWeight: 700, fontSize: 13, fontFamily: 'inherit' }}>
          {colores.length >= 5 ? 'Máximo 5 colores' : '+ Agregar color'}
        </button>
        <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${C.border}` }}>
          <label style={S.label}>Resultados de las combinaciones <span style={{ color: C.textLight, fontWeight: 400 }}>(todas son obligatorias)</span></label>
          <p style={{ margin: '0 0 10px', color: C.textLight, fontSize: 12 }}>Indica qué color se obtiene al combinar cada pareja.</p>
          {mezclas.map((mix, i) => {
            const color1 = colorById.get(String(mix.color1Id))
            const color2 = colorById.get(String(mix.color2Id))
            return (
              <div key={`${mix.color1Id}-${mix.color2Id}`} style={{ display: 'grid', gridTemplateColumns: 'minmax(160px, .8fr) minmax(150px, 1fr) 72px', gap: 10, alignItems: 'center', padding: 10, marginBottom: 8, borderRadius: 10, border: `1px solid ${C.border}`, background: '#fff' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 800, color: C.text }}>
                  <span style={{ width: 22, height: 22, borderRadius: '50%', background: color1?.hex, border: `1px solid ${C.border}` }} />
                  <span>{color1?.nombre || 'Color 1'}</span>
                  <span>+</span>
                  <span style={{ width: 22, height: 22, borderRadius: '50%', background: color2?.hex, border: `1px solid ${C.border}` }} />
                  <span>{color2?.nombre || 'Color 2'}</span>
                </div>
                <input style={S.input} value={mix.nombre || ''} onChange={e => setMezcla(i, 'nombre', e.target.value)} placeholder="Nombre del resultado" />
                <input style={{ ...S.input, height: 40, padding: 3 }} type="color" value={mix.hex || '#94a3b8'} onChange={e => setMezcla(i, 'hex', e.target.value)} aria-label={`Resultado de ${color1?.nombre} y ${color2?.nombre}`} />
              </div>
            )
          })}
        </div>
      </>
    )
  }

  if (tipo === 'tarjetasVolteables') {
    const tarjetas = campos.tarjetas || []
    function setTarjetas(next) { onChange({ ...campos, tarjetas: next.map((card, i) => ({ ...card, id: card.id || `tarjeta-${i + 1}` })) }) }
    function setTarjeta(i, key, value) { setTarjetas(tarjetas.map((card, j) => j === i ? { ...card, [key]: value } : card)) }
    return (
      <>
        <label style={S.label}>Título</label>
        <input style={{ ...S.input, marginBottom: 12 }} value={campos.titulo || ''} onChange={f('titulo')} placeholder="Voltea y descubre" />
        <label style={S.label}>Instrucción</label>
        <textarea style={{ ...S.input, minHeight: 64, resize: 'vertical', marginBottom: 12 }} value={campos.instruccion || ''} onChange={f('instruccion')} />
        <label style={S.label}>Mensaje al completar</label>
        <input style={{ ...S.input, marginBottom: 14 }} value={campos.mensajeFinal || ''} onChange={f('mensajeFinal')} />
        <label style={S.label}>Tarjetas</label>
        {tarjetas.map((card, i) => (
          <div key={card.id || i} style={{ padding: 10, marginBottom: 10, border: `1px solid ${C.border}`, borderRadius: 10, background: C.bg }}>
            <div style={{ display: 'grid', gridTemplateColumns: '62px 1fr 70px 30px', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              <input style={{ ...S.input, textAlign: 'center', fontSize: 18 }} value={card.emoji || ''} onChange={e => setTarjeta(i, 'emoji', e.target.value)} placeholder="❓" maxLength={4} />
              <input style={S.input} value={card.frente || ''} onChange={e => setTarjeta(i, 'frente', e.target.value)} placeholder="Texto del frente" />
              <input style={{ ...S.input, height: 40, padding: 3 }} type="color" value={card.color || '#7b1fa2'} onChange={e => setTarjeta(i, 'color', e.target.value)} />
              <button type="button" onClick={() => setTarjetas(tarjetas.filter((_, j) => j !== i))} disabled={tarjetas.length <= 2} style={{ background: 'none', border: 'none', color: tarjetas.length <= 2 ? C.textLight : C.danger, cursor: tarjetas.length <= 2 ? 'default' : 'pointer', fontSize: 18 }}>✕</button>
            </div>
            <textarea style={{ ...S.input, minHeight: 58, resize: 'vertical' }} value={card.reverso || ''} onChange={e => setTarjeta(i, 'reverso', e.target.value)} placeholder="Contenido que aparece al voltear" />
          </div>
        ))}
        <button type="button" onClick={() => setTarjetas([...tarjetas, { id: `tarjeta-${Date.now()}`, emoji: '❓', frente: '', reverso: '', color: '#7b1fa2' }])} style={{ marginTop: 4, background: 'none', border: `1.5px dashed ${C.primary}`, color: C.primary, borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontWeight: 700, fontSize: 13, fontFamily: 'inherit' }}>+ Agregar tarjeta</button>
      </>
    )
  }

  if (tipo === 'seleccionMultiple') {
    const opciones = campos.opciones || [{ texto: '', esCorrecta: false }, { texto: '', esCorrecta: false }, { texto: '', esCorrecta: false }, { texto: '', esCorrecta: false }]
    const L = ['A', 'B', 'C', 'D']
    return (
      <>
        <label style={S.label}>Título <span style={{ color: C.textLight, fontWeight: 400 }}>(aparece como encabezado)</span></label>
        <input style={{ ...S.input, marginBottom: 12 }} value={campos.titulo || ''} onChange={f('titulo')} placeholder="¿Quién es la protagonista?" />
        <label style={S.label}>Pregunta <span style={{ color: C.textLight, fontWeight: 400 }}>(debajo del título)</span></label>
        <input style={{ ...S.input, marginBottom: 12 }} value={campos.pregunta || ''} onChange={f('pregunta')} placeholder="¿Cómo se llama la niña de la historia?" />
        <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: 10, marginBottom: 14 }}>
          <div>
            <label style={S.label}>Presentación</label>
            <select style={S.input} value={campos.estilo || 'lista'} onChange={f('estilo')}>
              <option value="lista">Lista de opciones</option>
              <option value="chips">Palabras tipo chip</option>
            </select>
          </div>
          <div>
            <label style={S.label}>Pista <span style={{ color: C.textLight, fontWeight: 400 }}>(opcional)</span></label>
            <input style={S.input} value={campos.pista || ''} onChange={f('pista')} placeholder="Busca estas palabras en el cuento." />
          </div>
        </div>
        <label style={S.label}>Opciones <span style={{ color: C.textLight, fontWeight: 400 }}>(marca todas las correctas)</span></label>
        {opciones.map((op, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <input
              type="checkbox"
              checked={!!op.esCorrecta}
              onChange={e => {
                const next = opciones.map((o, j) => ({ ...o, esCorrecta: j === i ? e.target.checked : o.esCorrecta }))
                onChange({ ...campos, opciones: next })
              }}
              style={{ flexShrink: 0 }}
            />
            <span style={{ flexShrink: 0, width: 24, height: 24, borderRadius: '50%', background: '#fce4f3', color: '#e91e8c', fontWeight: 800, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{L[i] || i + 1}</span>
            <input
              style={{ ...S.input, flex: 1 }}
              value={op.texto || ''}
              onChange={e => {
                const next = opciones.map((o, j) => j === i ? { ...o, texto: e.target.value } : o)
                onChange({ ...campos, opciones: next })
              }}
              placeholder={`Opción ${L[i] || i + 1}`}
            />
            <button type="button" onClick={() => onChange({ ...campos, opciones: opciones.filter((_, index) => index !== i) })} style={{ border: 'none', background: 'none', color: C.danger, cursor: 'pointer', fontSize: 18 }}>✕</button>
          </div>
        ))}
        <button type="button" onClick={() => onChange({ ...campos, opciones: [...opciones, { texto: '', esCorrecta: false }] })} style={{ ...btnOutline(C.primary, 'sm'), marginBottom: 12 }}>+ Agregar opción</button>
        <label style={{ ...S.label, marginTop: 8 }}>Retroalimentación correcta <span style={{ color: C.textLight, fontWeight: 400 }}>(opcional)</span></label>
        <input style={{ ...S.input, marginBottom: 12 }} value={campos.retroalimentacion || ''} onChange={f('retroalimentacion')} placeholder="¡Muy bien! La protagonista se llama…" />
        <label style={S.label}>Retroalimentación error <span style={{ color: C.textLight, fontWeight: 400 }}>(opcional)</span></label>
        <input style={{ ...S.input, marginBottom: 12 }} value={campos.retroalimentacionError || ''} onChange={f('retroalimentacionError')} placeholder="¡Inténtalo de nuevo! Busca el nombre en las primeras páginas." />
        <label style={S.label}>Máx. intentos <span style={{ color: C.textLight, fontWeight: 400 }}>(la actividad se completa aunque falle)</span></label>
        <input style={S.input} type="number" min={1} max={10} value={campos.maxIntentos ?? 2} onChange={e => onChange({ ...campos, maxIntentos: Number(e.target.value) })} />
      </>
    )
  }

  if (tipo === 'lineaTiempoEmocional') {
    const momentos = campos.momentos || []
    function setMomentos(next) { onChange({ ...campos, momentos: next }) }
    function setMomento(i, key, value) { setMomentos(momentos.map((momento, j) => j === i ? { ...momento, [key]: value } : momento)) }
    function setOpciones(momentIndex, next) { setMomento(momentIndex, 'opciones', next) }
    function setOpcion(momentIndex, optionIndex, key, value) {
      const opciones = momentos[momentIndex].opciones || []
      const next = opciones.map((opcion, index) => {
        if (key === 'esCorrecta') return { ...opcion, esCorrecta: index === optionIndex }
        return index === optionIndex ? { ...opcion, [key]: value } : opcion
      })
      setOpciones(momentIndex, next)
    }
    return (
      <>
        <label style={S.label}>Título <span style={{ color: C.textLight, fontWeight: 400 }}>(aparece junto al número)</span></label>
        <input style={{ ...S.input, marginBottom: 12 }} value={campos.titulo || ''} onChange={f('titulo')} placeholder="El viaje emocional del personaje" />
        <label style={S.label}>Instrucción</label>
        <textarea style={{ ...S.input, marginBottom: 12, minHeight: 64, resize: 'vertical' }} value={campos.instruccion || ''} onChange={f('instruccion')} placeholder="Para cada momento, selecciona la emoción correcta." />
        <label style={S.label}>Pista <span style={{ color: C.textLight, fontWeight: 400 }}>(opcional)</span></label>
        <input style={{ ...S.input, marginBottom: 14 }} value={campos.pista || ''} onChange={f('pista')} />
        <label style={S.label}>Momentos emocionales</label>
        {momentos.map((momento, momentIndex) => (
          <div key={momento.id || momentIndex} style={{ padding: 12, marginBottom: 12, border: `1px solid ${C.border}`, borderRadius: 10, background: C.bg }}>
            <div style={{ display: 'grid', gridTemplateColumns: '58px 1fr 30px', gap: 8, marginBottom: 10 }}>
              <input style={{ ...S.input, textAlign: 'center', fontSize: 18 }} value={momento.emoji || ''} onChange={e => setMomento(momentIndex, 'emoji', e.target.value)} placeholder="🌟" maxLength={4} />
              <input style={S.input} value={momento.momento || ''} onChange={e => setMomento(momentIndex, 'momento', e.target.value)} placeholder={`Momento ${momentIndex + 1}`} />
              <button type="button" onClick={() => setMomentos(momentos.filter((_, index) => index !== momentIndex))} style={{ border: 'none', background: 'none', color: C.danger, cursor: 'pointer', fontSize: 18 }}>✕</button>
            </div>
            {(momento.opciones || []).map((opcion, optionIndex) => (
              <div key={opcion.id || optionIndex} style={{ display: 'grid', gridTemplateColumns: '24px 48px 1fr 50px 26px', gap: 6, alignItems: 'center', marginBottom: 7 }}>
                <input type="radio" name={`correcta-${momentIndex}`} checked={!!opcion.esCorrecta} onChange={() => setOpcion(momentIndex, optionIndex, 'esCorrecta', true)} title="Respuesta correcta" />
                <input style={{ ...S.input, padding: 7, textAlign: 'center' }} value={opcion.emoji || ''} onChange={e => setOpcion(momentIndex, optionIndex, 'emoji', e.target.value)} placeholder="🙂" maxLength={4} />
                <input style={{ ...S.input, padding: 7 }} value={opcion.texto || ''} onChange={e => setOpcion(momentIndex, optionIndex, 'texto', e.target.value)} placeholder={`Emoción ${optionIndex + 1}`} />
                <input type="color" style={{ ...S.input, padding: 3, height: 36 }} value={opcion.color || '#6366f1'} onChange={e => setOpcion(momentIndex, optionIndex, 'color', e.target.value)} />
                <button type="button" onClick={() => setOpciones(momentIndex, momento.opciones.filter((_, index) => index !== optionIndex))} style={{ border: 'none', background: 'none', color: C.danger, cursor: 'pointer' }}>✕</button>
              </div>
            ))}
            <button type="button" onClick={() => setOpciones(momentIndex, [...(momento.opciones || []), { id: `emocion-${Date.now()}`, emoji: '🙂', texto: '', color: '#6366f1', esCorrecta: false }])} style={{ ...btnOutline(C.primary, 'sm'), marginTop: 3 }}>+ Emoción</button>
          </div>
        ))}
        <button type="button" onClick={() => setMomentos([...momentos, { id: `momento-${Date.now()}`, emoji: '🌟', momento: '', opciones: [{ id: 'a', emoji: '😊', texto: '', color: '#22c55e', esCorrecta: true }, { id: 'b', emoji: '😟', texto: '', color: '#6366f1', esCorrecta: false }] }])} style={{ ...btnOutline(C.primary, 'sm'), marginBottom: 14 }}>+ Agregar momento</button>
        <label style={S.label}>Retroalimentación correcta</label>
        <input style={{ ...S.input, marginBottom: 10 }} value={campos.retroalimentacion || ''} onChange={f('retroalimentacion')} />
        <label style={S.label}>Retroalimentación de error</label>
        <input style={{ ...S.input, marginBottom: 10 }} value={campos.retroalimentacionError || ''} onChange={f('retroalimentacionError')} />
        <label style={S.label}>Máx. intentos</label>
        <input style={S.input} type="number" min={1} max={10} value={campos.maxIntentos ?? 2} onChange={e => onChange({ ...campos, maxIntentos: Number(e.target.value) })} />
      </>
    )
  }

  if (tipo === 'reflexionPersonal') {
    const opciones = campos.opciones || []
    function setOpciones(next) { onChange({ ...campos, opciones: next }) }
    function setOp(i, key, value) { setOpciones(opciones.map((op, j) => j === i ? { ...op, [key]: value } : op)) }
    return (
      <>
        <label style={S.label}>Título <span style={{ color: C.textLight, fontWeight: 400 }}>(aparece junto al número)</span></label>
        <input style={{ ...S.input, marginBottom: 12 }} value={campos.titulo || ''} onChange={f('titulo')} placeholder="Yo también siento miedo…" />
        <label style={S.label}>Instrucción</label>
        <textarea style={{ ...S.input, marginBottom: 14, minHeight: 70, resize: 'vertical' }} value={campos.instruccion || ''} onChange={f('instruccion')} placeholder="Selecciona todo lo que a ti te puede dar miedo." />
        <label style={S.label}>Opciones de selección libre</label>
        {opciones.map((op, i) => (
          <div key={op.id || i} style={{ display: 'grid', gridTemplateColumns: '58px 1fr 30px', gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <input style={{ ...S.input, textAlign: 'center', fontSize: 18 }} value={op.icono || ''} onChange={e => setOp(i, 'icono', e.target.value)} placeholder="✨" maxLength={4} />
            <input style={S.input} value={op.texto || ''} onChange={e => setOp(i, 'texto', e.target.value)} placeholder={`Opción ${i + 1}`} />
            <button type="button" onClick={() => setOpciones(opciones.filter((_, j) => j !== i))} style={{ border: 'none', background: 'none', color: C.danger, cursor: 'pointer', fontSize: 18 }}>✕</button>
          </div>
        ))}
        <button type="button" onClick={() => setOpciones([...opciones, { id: `opcion-${Date.now()}`, icono: '✨', texto: '' }])} style={{ margin: '4px 0 16px', background: 'none', border: `1.5px dashed ${C.primary}`, color: C.primary, borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontWeight: 700, fontSize: 13, fontFamily: 'inherit' }}>+ Agregar opción</button>
        <label style={S.label}>Pregunta abierta</label>
        <input style={{ ...S.input, marginBottom: 12 }} value={campos.preguntaAbierta || ''} onChange={f('preguntaAbierta')} placeholder="¿Qué sientes en tu cuerpo? Escríbelo:" />
        <label style={S.label}>Texto de ayuda</label>
        <input style={{ ...S.input, marginBottom: 12 }} value={campos.placeholder || ''} onChange={f('placeholder')} placeholder="Cuando tengo miedo siento que…" />
        <label style={S.label}>Texto del botón</label>
        <input style={S.input} value={campos.textoBoton || ''} onChange={f('textoBoton')} placeholder="Guardar reflexión" />
      </>
    )
  }

  if (tipo === 'identificar') {
    const opciones = campos.opciones || []
    function setOpciones(next) { onChange({ ...campos, opciones: next }) }
    function setOp(i, key, val) { setOpciones(opciones.map((o, j) => j === i ? { ...o, [key]: val } : o)) }
    return (
      <>
        <label style={S.label}>Título <span style={{ color: C.textLight, fontWeight: 400 }}>(aparece junto al número)</span></label>
        <input
          style={{ ...S.input, marginBottom: 12 }}
          value={campos.titulo || ''}
          onChange={f('titulo')}
          placeholder="¿Qué siente el cuerpo cuando tiene miedo?"
        />
        <label style={S.label}>Instrucción / pregunta</label>
        <textarea
          style={{ ...S.input, marginBottom: 16, minHeight: 64, resize: 'vertical' }}
          value={campos.instruccion || ''}
          onChange={f('instruccion')}
          placeholder="Selecciona las señales que SÍ siente el personaje según el cuento."
        />
        <label style={S.label}>Opciones <span style={{ color: C.textLight, fontWeight: 400 }}>(✓ = correcta)</span></label>
        {opciones.map((op, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <input
              type="checkbox"
              checked={!!op.esCorrecta}
              onChange={e => setOp(i, 'esCorrecta', e.target.checked)}
              style={{ flexShrink: 0, width: 16, height: 16 }}
            />
            <input
              style={{ ...S.input, width: 52, flexShrink: 0, textAlign: 'center', fontSize: 18 }}
              value={op.icono || ''}
              onChange={e => setOp(i, 'icono', e.target.value)}
              placeholder="🔥"
              maxLength={2}
            />
            <input
              style={{ ...S.input, flex: 1 }}
              value={op.texto || ''}
              onChange={e => setOp(i, 'texto', e.target.value)}
              placeholder={`Opción ${i + 1}`}
            />
            <button
              type="button"
              onClick={() => setOpciones(opciones.filter((_, j) => j !== i))}
              style={{ background: 'none', border: 'none', color: C.danger, cursor: 'pointer', fontSize: 18, flexShrink: 0 }}
            >✕</button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setOpciones([...opciones, { icono: '😊', texto: '', esCorrecta: false }])}
          style={{ marginTop: 4, background: 'none', border: `1.5px dashed ${C.primary}`, color: C.primary, borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontWeight: 700, fontSize: 13, fontFamily: 'inherit' }}
        >
          + Agregar opción
        </button>
        <label style={{ ...S.label, marginTop: 14 }}>Máx. intentos <span style={{ color: C.textLight, fontWeight: 400 }}>(la actividad se completa aunque falle)</span></label>
        <input style={S.input} type="number" min={1} max={10} value={campos.maxIntentos ?? 2} onChange={e => onChange({ ...campos, maxIntentos: Number(e.target.value) })} />
      </>
    )
  }

  if (tipo === 'verdaderoFalso') {
    const afirmaciones = campos.afirmaciones || []
    function setAfirmaciones(next) { onChange({ ...campos, afirmaciones: next }) }
    function setAf(i, key, val) { setAfirmaciones(afirmaciones.map((a, j) => j === i ? { ...a, [key]: val } : a)) }
    return (
      <>
        <label style={S.label}>Título <span style={{ color: C.textLight, fontWeight: 400 }}>(aparece junto al número)</span></label>
        <input
          style={{ ...S.input, marginBottom: 14 }}
          value={campos.titulo || ''}
          onChange={f('titulo')}
          placeholder="Verdadero o falso"
        />
        <label style={S.label}>Afirmaciones <span style={{ color: C.textLight, fontWeight: 400 }}>(indica si cada una es verdadera o falsa)</span></label>
        {afirmaciones.map((af, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
            <span style={{ flexShrink: 0, width: 24, height: 24, borderRadius: '50%', background: '#fce4f3', color: '#e91e8c', fontWeight: 800, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</span>
            <input
              style={{ ...S.input, flex: 1 }}
              value={af.texto || ''}
              onChange={e => setAf(i, 'texto', e.target.value)}
              placeholder={`Afirmación ${i + 1}`}
            />
            <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
              <button
                type="button"
                onClick={() => setAf(i, 'esVerdadero', true)}
                style={{ padding: '5px 10px', borderRadius: 8, border: `2px solid ${af.esVerdadero ? '#16A34A' : '#E5E7EB'}`, background: af.esVerdadero ? '#DCFCE7' : '#fff', color: af.esVerdadero ? '#16A34A' : '#9CA3AF', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}
              >V</button>
              <button
                type="button"
                onClick={() => setAf(i, 'esVerdadero', false)}
                style={{ padding: '5px 10px', borderRadius: 8, border: `2px solid ${!af.esVerdadero ? '#EF4444' : '#E5E7EB'}`, background: !af.esVerdadero ? '#FEE2E2' : '#fff', color: !af.esVerdadero ? '#EF4444' : '#9CA3AF', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}
              >F</button>
            </div>
            <button
              type="button"
              onClick={() => setAfirmaciones(afirmaciones.filter((_, j) => j !== i))}
              style={{ background: 'none', border: 'none', color: C.danger, cursor: 'pointer', fontSize: 18, flexShrink: 0, lineHeight: 1 }}
            >✕</button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setAfirmaciones([...afirmaciones, { texto: '', esVerdadero: true }])}
          style={{ marginTop: 4, background: 'none', border: `1.5px dashed ${C.primary}`, color: C.primary, borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontWeight: 700, fontSize: 13, fontFamily: 'inherit' }}
        >
          + Agregar afirmación
        </button>
      </>
    )
  }

  if (tipo === 'completarPalabras') {
    const texto = campos.texto || ''
    const detectarRespuestas = value => [...String(value).matchAll(/\[([^\]\n]+)\]|\{\{([^}\n]+)\}\}/g)]
      .map(match => (match[1] ?? match[2] ?? '').trim())
      .filter(Boolean)
    const autoRespuestas = detectarRespuestas(texto)
    function handleTexto(e) {
      const t = e.target.value
      const r = detectarRespuestas(t)
      onChange({ ...campos, texto: t, respuestas: r })
    }
    return (
      <>
        <label style={S.label}>Título <span style={{ color: C.textLight, fontWeight: 400 }}>(aparece junto al número)</span></label>
        <input style={{ ...S.input, marginBottom: 12 }} value={campos.titulo || ''} onChange={f('titulo')} placeholder="Completa la historia" />
        <label style={S.label}>
          Texto <span style={{ color: C.textLight, fontWeight: 400 }}>— pon cada respuesta entre [ ], ej: <code style={{ fontFamily: 'monospace' }}>El [perro] corre</code></span>
        </label>
        <textarea style={{ ...S.input, marginBottom: 8, minHeight: 110, resize: 'vertical', whiteSpace: 'pre-wrap' }} value={texto} onChange={handleTexto} placeholder={'Luna se acuesta en su [cama].\nSu papá apaga la [luz].\nLuna abraza su [peluche].'} />
        {autoRespuestas.length > 0 ? (
          <div style={{ marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: C.textLight, fontWeight: 600 }}>Respuestas detectadas:</span>
            {autoRespuestas.map((r, i) => (
              <span key={i} style={{ background: '#e3f2fd', color: '#1e88e5', borderRadius: 6, padding: '2px 10px', fontSize: 12, fontWeight: 700 }}>{i + 1}. {r}</span>
            ))}
          </div>
        ) : (
          <p style={{ fontSize: 12, color: C.textLight, margin: '0 0 12px' }}>Escribe al menos una respuesta entre [corchetes]. Cada salto de línea se conservará en la actividad.</p>
        )}
        <label style={S.label}>Máx. intentos <span style={{ color: C.textLight, fontWeight: 400 }}>(la actividad se completa aunque falle)</span></label>
        <input style={S.input} type="number" min={1} max={10} value={campos.maxIntentos ?? 2} onChange={e => onChange({ ...campos, maxIntentos: Number(e.target.value) })} />
      </>
    )
  }

  if (tipo === 'ordenarPalabras') {
    function handleFrase(e) {
      const fraseCorrecta = e.target.value
      onChange({ ...campos, fraseCorrecta, palabras: fraseCorrecta.trim().split(/\s+/).filter(Boolean) })
    }
    return (
      <>
        <label style={S.label}>Título <span style={{ color: C.textLight, fontWeight: 400 }}>(aparece junto al número)</span></label>
        <input style={{ ...S.input, marginBottom: 12 }} value={campos.titulo || ''} onChange={f('titulo')} placeholder="Ordena las palabras" />
        <label style={S.label}>Instrucción</label>
        <textarea style={{ ...S.input, marginBottom: 12, minHeight: 64, resize: 'vertical' }} value={campos.instruccion || ''} onChange={f('instruccion')} placeholder="Haz clic en las palabras en el orden correcto para formar una oración." />
        <label style={S.label}>Pista <span style={{ color: C.textLight, fontWeight: 400 }}>(opcional)</span></label>
        <input style={{ ...S.input, marginBottom: 12 }} value={campos.pista || ''} onChange={f('pista')} placeholder="Comienza identificando quién realiza la acción." />
        <label style={S.label}>Frase correcta</label>
        <textarea style={{ ...S.input, marginBottom: 8, minHeight: 70, resize: 'vertical' }} value={campos.fraseCorrecta || ''} onChange={handleFrase} placeholder="Luna abraza su peluche con fuerza" />
        <p style={{ margin: '0 0 12px', fontSize: 11, color: C.textLight }}>Las palabras se separan automáticamente por espacios y se mezclarán para el estudiante.</p>
        <label style={S.label}>Etiqueta del área de respuesta</label>
        <input style={{ ...S.input, marginBottom: 12 }} value={campos.textoArea || ''} onChange={f('textoArea')} placeholder="Tu oración:" />
        <label style={S.label}>Máx. intentos</label>
        <input style={S.input} type="number" min={1} max={10} value={campos.maxIntentos ?? 2} onChange={e => onChange({ ...campos, maxIntentos: Number(e.target.value) })} />
      </>
    )
  }

  if (tipo === 'ordenarEventos') {
    const eventos = campos.eventos || []
    function setEventos(next) { onChange({ ...campos, eventos: next.map((e, i) => ({ ...e, id: String(i + 1), orden: i + 1 })) }) }
    return (
      <>
        <label style={S.label}>Título <span style={{ color: C.textLight, fontWeight: 400 }}>(aparece junto al número)</span></label>
        <input style={{ ...S.input, marginBottom: 12 }} value={campos.titulo || ''} onChange={f('titulo')} placeholder="Ordena los eventos" />
        <label style={S.label}>Instrucción</label>
        <input style={{ ...S.input, marginBottom: 16 }} value={campos.instruccion || ''} onChange={f('instruccion')} placeholder="Ordena los eventos de la historia" />
        <label style={S.label}>Eventos <span style={{ color: C.textLight, fontWeight: 400 }}>(en el orden correcto)</span></label>
        {eventos.map((ev, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <span style={{ flexShrink: 0, width: 24, height: 24, borderRadius: '50%', background: '#e3f2fd', color: '#1e88e5', fontWeight: 800, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</span>
            <input
              style={{ ...S.input, flex: 1 }}
              value={ev.texto || ''}
              onChange={e => setEventos(eventos.map((ev2, j) => j === i ? { ...ev2, texto: e.target.value } : ev2))}
              placeholder={`Evento ${i + 1}`}
            />
            <button
              type="button"
              onClick={() => setEventos(eventos.filter((_, j) => j !== i))}
              style={{ background: 'none', border: 'none', color: C.danger, cursor: 'pointer', fontSize: 18, flexShrink: 0, lineHeight: 1 }}
            >✕</button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setEventos([...eventos, { id: '', texto: '' }])}
          style={{ marginTop: 4, background: 'none', border: `1.5px dashed ${C.primary}`, color: C.primary, borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontWeight: 700, fontSize: 13, fontFamily: 'inherit' }}
        >
          + Agregar evento
        </button>
        <label style={{ ...S.label, marginTop: 16 }}>Máx. intentos <span style={{ color: C.textLight, fontWeight: 400 }}>(la actividad se completa aunque falle)</span></label>
        <input style={S.input} type="number" min={1} max={10} value={campos.maxIntentos ?? 2} onChange={e => onChange({ ...campos, maxIntentos: Number(e.target.value) })} />
      </>
    )
  }

  if (tipo === 'emparejar') {
    const pares = campos.pares || []
    function setPares(next) { onChange({ ...campos, pares: next }) }
    return (
      <>
        <label style={S.label}>Título <span style={{ color: C.textLight, fontWeight: 400 }}>(aparece junto al número)</span></label>
        <input style={{ ...S.input, marginBottom: 12 }} value={campos.titulo || ''} onChange={f('titulo')} placeholder="Une cada objeto con lo que hace" />
        <label style={S.label}>Subtítulo / instrucción</label>
        <textarea style={{ ...S.input, marginBottom: 12, minHeight: 64, resize: 'vertical' }} value={campos.instruccion || ''} onChange={f('instruccion')} placeholder="Une cada elemento del cuento con lo que hace o provoca:" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
          <div>
            <label style={S.label}>Encabezado izquierdo</label>
            <input style={S.input} value={campos.encabezadoIzquierda || ''} onChange={f('encabezadoIzquierda')} placeholder="Elemento" />
          </div>
          <div>
            <label style={S.label}>Encabezado derecho</label>
            <input style={S.input} value={campos.encabezadoDerecha || ''} onChange={f('encabezadoDerecha')} placeholder="¿Qué hace?" />
          </div>
        </div>
        <label style={S.label}>Pares <span style={{ color: C.textLight, fontWeight: 400 }}>(izquierda ↔ derecha)</span></label>
        {pares.map((par, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <span style={{ flexShrink: 0, width: 24, height: 24, borderRadius: '50%', background: '#fce4f3', color: '#e91e8c', fontWeight: 800, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</span>
            <input
              style={{ ...S.input, flex: 1 }}
              value={par.izquierda || ''}
              onChange={e => setPares(pares.map((p, j) => j === i ? { ...p, izquierda: e.target.value } : p))}
              placeholder="Izquierda"
            />
            <span style={{ color: C.textLight, fontWeight: 700, flexShrink: 0 }}>↔</span>
            <input
              style={{ ...S.input, flex: 1 }}
              value={par.derecha || ''}
              onChange={e => setPares(pares.map((p, j) => j === i ? { ...p, derecha: e.target.value } : p))}
              placeholder="Derecha"
            />
            <button
              type="button"
              onClick={() => setPares(pares.filter((_, j) => j !== i))}
              style={{ background: 'none', border: 'none', color: C.danger, cursor: 'pointer', fontSize: 18, flexShrink: 0, lineHeight: 1 }}
            >✕</button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setPares([...pares, { izquierda: '', derecha: '' }])}
          style={{ marginTop: 4, background: 'none', border: `1.5px dashed ${C.primary}`, color: C.primary, borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontWeight: 700, fontSize: 13, fontFamily: 'inherit' }}
        >
          + Agregar par
        </button>
        <label style={{ ...S.label, marginTop: 16 }}>Máx. intentos <span style={{ color: C.textLight, fontWeight: 400 }}>(la actividad se completa aunque falle)</span></label>
        <input style={S.input} type="number" min={1} max={10} value={campos.maxIntentos ?? 2} onChange={e => onChange({ ...campos, maxIntentos: Number(e.target.value) })} />
      </>
    )
  }

  if (tipo === 'completarMapa') {
    const nodos = campos.nodos || []
    function setNodos(next) { onChange({ ...campos, nodos: next.map((n, i) => ({ ...n, id: String(i + 1) })) }) }
    function setNodo(i, key, val) { setNodos(nodos.map((n, j) => j === i ? { ...n, [key]: val } : n)) }
    return (
      <>
        <label style={S.label}>Título <span style={{ color: C.textLight, fontWeight: 400 }}>(aparece junto al número)</span></label>
        <input style={{ ...S.input, marginBottom: 12 }} value={campos.titulo || ''} onChange={f('titulo')} placeholder="Completa el mapa" />
        <label style={S.label}>Instrucción</label>
        <input style={{ ...S.input, marginBottom: 16 }} value={campos.instruccion || ''} onChange={f('instruccion')} placeholder="Completa el mapa conceptual" />
        <label style={S.label}>Nodos <span style={{ color: C.textLight, fontWeight: 400 }}>(cada nodo es un campo que el estudiante debe completar)</span></label>
        {nodos.map((nodo, i) => (
          <div key={i} style={{ padding: 10, marginBottom: 9, border: `1px solid ${C.border}`, borderRadius: 10, background: C.bg }}>
            <div style={{ display: 'grid', gridTemplateColumns: '24px 52px 1fr 28px', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              <span style={{ width: 24, height: 24, borderRadius: '50%', background: '#e8f5e9', color: '#4caf50', fontWeight: 800, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</span>
              <input style={{ ...S.input, textAlign: 'center', fontSize: 18, padding: 7 }} value={nodo.icono || ''} onChange={e => setNodo(i, 'icono', e.target.value)} placeholder="🗺️" maxLength={4} />
              <input style={S.input} value={nodo.label || ''} onChange={e => setNodo(i, 'label', e.target.value)} placeholder="Ej: Personaje principal" />
              <button type="button" onClick={() => setNodos(nodos.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', color: C.danger, cursor: 'pointer', fontSize: 18 }}>✕</button>
            </div>
            <input style={S.input} value={nodo.placeholder || ''} onChange={e => setNodo(i, 'placeholder', e.target.value)} placeholder="Texto guía dentro del recuadro, ej: Escribe aquí quién es…" />
          </div>
        ))}
        <button
          type="button"
          onClick={() => setNodos([...nodos, { id: '', label: '', icono: '', placeholder: '' }])}
          style={{ marginTop: 4, background: 'none', border: `1.5px dashed ${C.primary}`, color: C.primary, borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontWeight: 700, fontSize: 13, fontFamily: 'inherit' }}
        >
          + Agregar nodo
        </button>
      </>
    )
  }

  if (tipo === 'escribirCarta') return (
    <>
      <label style={S.label}>Título <span style={{ color: C.textLight, fontWeight: 400 }}>(aparece junto al número)</span></label>
      <input style={{ ...S.input, marginBottom: 12 }} value={campos.titulo || ''} onChange={f('titulo')} placeholder="Escribe una carta" />
      <label style={S.label}>Destinatario</label>
      <input style={{ ...S.input, marginBottom: 12 }} value={campos.destinatario || ''} onChange={f('destinatario')} placeholder="Mi abuela" />
      <label style={S.label}>Instrucción / prompt</label>
      <textarea style={{ ...S.input, minHeight: 80, resize: 'vertical', marginBottom: 12 }} value={campos.promptTexto || ''} onChange={f('promptTexto')} placeholder="Escribe una carta contando lo que aprendiste…" />
      <label style={S.label}>Texto guía dentro del recuadro</label>
      <input style={S.input} value={campos.placeholder || ''} onChange={f('placeholder')} placeholder="Escribe aquí lo que quieres contarle…" />
    </>
  )

  if (tipo === 'dibujoLibre') return (
    <>
      <label style={S.label}>Título <span style={{ color: C.textLight, fontWeight: 400 }}>(aparece junto al número)</span></label>
      <input style={{ ...S.input, marginBottom: 12 }} value={campos.titulo || ''} onChange={f('titulo')} placeholder="Dibuja tu idea" />
      <label style={S.label}>Instrucción</label>
      <input style={S.input} value={campos.instruccion || ''} onChange={f('instruccion')} placeholder="Dibuja el personaje de la historia" />
    </>
  )

  if (tipo === 'video') return (
    <>
      <label style={S.label}>URL del video</label>
      <input style={{ ...S.input, marginBottom: 12 }} value={campos.url || ''} onChange={f('url')} placeholder="https://youtube.com/..." />
      <label style={S.label}>Título</label>
      <input style={S.input} value={campos.videoTitulo || ''} onChange={f('videoTitulo')} placeholder="Nombre del video" />
    </>
  )

  if (tipo === 'audio') return (
    <>
      <label style={S.label}>URL del audio</label>
      <input style={{ ...S.input, marginBottom: 12 }} value={campos.url || ''} onChange={f('url')} placeholder="/audio/cancion.mp3" />
      <label style={S.label}>Título</label>
      <input style={S.input} value={campos.titulo || ''} onChange={f('titulo')} placeholder="Nombre del audio" />
    </>
  )

  if (tipo === 'imagen') return (
    <>
      <label style={S.label}>URL de la imagen</label>
      <input style={{ ...S.input, marginBottom: 12 }} value={campos.imagenUrl || ''} onChange={f('imagenUrl')} placeholder="/img/foto.jpg" />
      <label style={S.label}>Descripción <span style={{ color: C.textLight, fontWeight: 400 }}>(opcional)</span></label>
      <input style={S.input} value={campos.descripcion || ''} onChange={f('descripcion')} placeholder="Descripción de la imagen" />
    </>
  )

  if (tipo === 'colorear') return (
    <>
      <label style={S.label}>URL de la imagen para colorear</label>
      <input style={S.input} value={campos.imagenUrl || ''} onChange={f('imagenUrl')} placeholder="/img/dibujo.png" />
    </>
  )

  return null
}

// ─── Modal nueva actividad ─────────────────────────────────────────────────────
function ModalActividad({ orden, onClose, onSave, primaryColor = C.primary }) {
  const [tipo, setTipo] = useState('sopaLetras')
  const [campos, setCampos] = useState(camposInicialesPorTipo('sopaLetras'))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const isCompact = useWindowWidth() < 980

  function onTipoChange(e) {
    const t = e.target.value
    setTipo(t)
    setCampos(camposInicialesPorTipo(t))
  }

  async function submit(e) {
    e.preventDefault()
    setLoading(true); setError('')
    try { validarActividadCampos(tipo, campos); await onSave({ tipo, orden, campos }); onClose() }
    catch (err) { setError(err.message); setLoading(false) }
  }

  const previewActivity = {
    id: `admin-preview-${tipo}`,
    tipo,
    ...withPreviewDefaults(campos, PREVIEW_DEFAULTS[tipo] || {}),
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.58)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: isCompact ? 8 : 20 }}>
      <form
        onSubmit={submit}
        style={{
          ...S.card,
          width: 'min(1420px, 100%)',
          height: isCompact ? 'calc(100dvh - 16px)' : 'min(900px, calc(100dvh - 40px))',
          margin: 'auto',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ padding: isCompact ? '16px 18px' : '18px 24px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexShrink: 0 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: C.text }}>Nueva actividad</h3>
            <p style={{ margin: '3px 0 0', fontSize: 12, color: C.textLight }}>Completa los datos y revisa el resultado antes de crearla.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" style={{ border: 'none', background: C.bg, color: C.textLight, width: 34, height: 34, borderRadius: '50%', cursor: 'pointer', fontSize: 18 }}>✕</button>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: isCompact ? '1fr' : 'minmax(360px, 0.82fr) minmax(520px, 1.35fr)',
          minHeight: 0,
          flex: 1,
          overflowY: isCompact ? 'auto' : 'hidden',
        }}>
          <section style={{ padding: isCompact ? 18 : 24, overflowY: isCompact ? 'visible' : 'auto', minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
              <span style={{ width: 26, height: 26, borderRadius: '50%', background: C.primary, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12 }}>1</span>
              <h4 style={{ margin: 0, fontSize: 15, color: C.text }}>Configuración</h4>
            </div>
            <label style={S.label}>Tipo</label>
            <select style={{ ...S.input, marginBottom: 20 }} value={tipo} onChange={onTipoChange}>
              {TIPOS.map(t => <option key={t} value={t}>{TIPO_CONFIG[t]?.label ?? t}</option>)}
            </select>

            <FormCampos tipo={tipo} campos={campos} onChange={setCampos} />

            {error && <div style={{ background: C.dangerLight, color: C.danger, borderRadius: 8, padding: '10px 14px', marginTop: 16, fontSize: 13, fontWeight: 600 }}>{error}</div>}
          </section>

          <section style={{ padding: isCompact ? 18 : 24, background: '#F1F5F9', borderLeft: isCompact ? 'none' : `1px solid ${C.border}`, borderTop: isCompact ? `1px solid ${C.border}` : 'none', overflowY: isCompact ? 'visible' : 'auto', minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 26, height: 26, borderRadius: '50%', background: primaryColor, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12 }}>2</span>
                <h4 style={{ margin: 0, fontSize: 15, color: C.text }}>Vista previa</h4>
              </div>
              <span style={{ ...badge(C.success, C.successLight), fontSize: 10 }}>● En tiempo real</span>
            </div>
            <div style={{ pointerEvents: 'none', userSelect: 'none' }}>
              <ActivityCard
                key={tipo}
                act={previewActivity}
                numero={orden}
                isMobile={isCompact}
                completada={false}
                onComplete={() => {}}
                snapMode={false}
                primaryColor={primaryColor}
              />
            </div>
          </section>
        </div>

        <div style={{ padding: isCompact ? '14px 18px' : '16px 24px', borderTop: `1px solid ${C.border}`, background: '#fff', flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', alignItems: 'center' }}>
            <button type="button" onClick={onClose} style={{ ...btnOutline(C.textLight), width: isCompact ? 120 : 140, justifyContent: 'center' }}>Cancelar</button>
            <button type="submit" disabled={loading} style={{ ...btn(C.primary), width: isCompact ? 150 : 180, justifyContent: 'center' }}>{loading ? 'Guardando…' : 'Crear actividad'}</button>
          </div>
        </div>
      </form>
    </div>
  )
}

// ─── Modal editar actividad ───────────────────────────────────────────────────
function ModalEditarActividad({ actividad, unidades, primaryColor = C.primary, onClose, onSave }) {
  const [campos, setCampos] = useState(actividad.campos || camposInicialesPorTipo(actividad.tipo))
  const [unidadId, setUnidadId] = useState(actividad.unidad_id)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const isCompact = useWindowWidth() < 980

  async function submit(e) {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      if (!unidadId || !unidades.some(unidad => unidad.id === unidadId)) throw new Error('Selecciona una unidad válida.')
      validarActividadCampos(actividad.tipo, campos)
      await onSave({ campos, unidadId })
      onClose()
    }
    catch (err) { setError(err.message); setLoading(false) }
  }

  const previewActivity = {
    id: `admin-edit-preview-${actividad.tipo}`,
    tipo: actividad.tipo,
    ...withPreviewDefaults(campos, PREVIEW_DEFAULTS[actividad.tipo] || {}),
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.58)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: isCompact ? 8 : 20 }}>
      <form onSubmit={submit} style={{ ...S.card, width: 'min(1420px, 100%)', height: isCompact ? 'calc(100dvh - 16px)' : 'min(900px, calc(100dvh - 40px))', margin: 'auto', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: isCompact ? '16px 18px' : '18px 24px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexShrink: 0 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: C.text }}>Editar actividad</h3>
            <p style={{ margin: '3px 0 0', fontSize: 12, color: C.textLight }}>Tipo: <strong style={{ color: C.primary }}>{actividad.tipo}</strong> · Actividad #{actividad.orden}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" style={{ border: 'none', background: C.bg, color: C.textLight, width: 34, height: 34, borderRadius: '50%', cursor: 'pointer', fontSize: 18 }}>✕</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isCompact ? '1fr' : 'minmax(360px, 0.82fr) minmax(520px, 1.35fr)', minHeight: 0, flex: 1, overflowY: isCompact ? 'auto' : 'hidden' }}>
          <section style={{ padding: isCompact ? 18 : 24, overflowY: isCompact ? 'visible' : 'auto', minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
              <span style={{ width: 26, height: 26, borderRadius: '50%', background: C.primary, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12 }}>1</span>
              <h4 style={{ margin: 0, fontSize: 15, color: C.text }}>Configuración</h4>
            </div>
            <div style={{ marginBottom: 18, padding: 12, background: C.primaryLight, border: `1px solid ${C.primary}35`, borderRadius: 10 }}>
              <div>
                <label style={{ ...S.label, fontSize: 12 }}>Unidad a la que pertenece</label>
                <select style={{ ...S.input, padding: '7px 10px', fontSize: 13 }} value={unidadId} onChange={e => setUnidadId(e.target.value)}>
                  {unidades.map(unidad => <option key={unidad.id} value={unidad.id}>Unidad {unidad.orden}: {unidad.titulo}</option>)}
                </select>
              </div>
            </div>
            <FormCampos tipo={actividad.tipo} campos={campos} onChange={setCampos} />
            {error && <div style={{ background: C.dangerLight, color: C.danger, borderRadius: 8, padding: '10px 14px', marginTop: 16, fontSize: 13, fontWeight: 600 }}>{error}</div>}
          </section>

          <section style={{ padding: isCompact ? 18 : 24, background: '#F1F5F9', borderLeft: isCompact ? 'none' : `1px solid ${C.border}`, borderTop: isCompact ? `1px solid ${C.border}` : 'none', overflowY: isCompact ? 'visible' : 'auto', minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 26, height: 26, borderRadius: '50%', background: primaryColor, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12 }}>2</span>
                <h4 style={{ margin: 0, fontSize: 15, color: C.text }}>Vista previa</h4>
              </div>
              <span style={{ ...badge(C.success, C.successLight), fontSize: 10 }}>● En tiempo real</span>
            </div>
            <div style={{ pointerEvents: 'none', userSelect: 'none' }}>
              <ActivityCard key={actividad.tipo} act={previewActivity} numero={actividad.orden} isMobile={isCompact} completada={false} onComplete={() => {}} snapMode={false} primaryColor={primaryColor} />
            </div>
          </section>
        </div>

        <div style={{ padding: isCompact ? '14px 18px' : '16px 24px', borderTop: `1px solid ${C.border}`, background: '#fff', flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={{ ...btnOutline(C.textLight), width: isCompact ? 120 : 140, justifyContent: 'center' }}>Cancelar</button>
            <button type="submit" disabled={loading} style={{ ...btn(C.primary), width: isCompact ? 150 : 180, justifyContent: 'center' }}>{loading ? 'Guardando…' : 'Guardar cambios'}</button>
          </div>
        </div>
      </form>
    </div>
  )
}

// ─── Formulario de campos de unidad (reutilizado en crear y editar) ───────────
function CamposUnidad({ form, onChange }) {
  const f = k => e => onChange({ ...form, [k]: e.target.value })
  return (
    <>
      <label style={S.label}>Título <span style={{ color: C.danger }}>*</span></label>
      <input style={{ ...S.input, marginBottom: 12 }} value={form.titulo || ''} onChange={f('titulo')} placeholder="Ej: Páginas 1 – 7" />
      <label style={S.label}>Subtítulo</label>
      <input style={{ ...S.input, marginBottom: 12 }} value={form.subtitulo || ''} onChange={f('subtitulo')} placeholder="Ej: Conocemos a Sofía" />
      <label style={S.label}>Texto descriptivo</label>
      <textarea
        style={{ ...S.input, minHeight: 72, resize: 'vertical' }}
        value={form.texto || ''}
        onChange={f('texto')}
        placeholder="Ej: Actividades sobre la presentación de la historia y la protagonista"
      />
    </>
  )
}

// ─── Fila de unidad expandible ─────────────────────────────────────────────────
function UnidadRow({ unidad, unidades, activitiesVersion, index, total, onMover, onNuevaActividad, onUpdate, onDelete, onActivityMoved }) {
  const [open, setOpen] = useState(false)
  const [editando, setEditando] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [form, setForm] = useState({ titulo: unidad.titulo, subtitulo: unidad.subtitulo || '', texto: unidad.texto || '' })
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [actividades, setActividades] = useState(null)
  const [editandoAct, setEditandoAct] = useState(null)
  const [confirmActDelete, setConfirmActDelete] = useState(null)
  const [actLoading, setActLoading] = useState(false)
  const [draggingActId, setDraggingActId] = useState(null)
  const [dragOverActId, setDragOverActId] = useState(null)
  const draggingActIdRef = useRef(null)

  useEffect(() => {
    if (actividades !== null) reloadActs()
  }, [activitiesVersion])

  async function toggleOpen() {
    if (editando) return
    if (!open && actividades === null) {
      const data = await getActividades(unidad.id)
      setActividades(data)
    }
    setOpen(o => !o)
  }

  async function reloadActs() {
    const data = await getActividades(unidad.id)
    setActividades(data)
  }

  async function handleUpdateActividad(actId, { campos, unidadId, posicion }) {
    await updateAndPositionActivity(actId, campos, unidadId, posicion)
    onActivityMoved()
    await reloadActs()
  }

  function clearActivityDrag() {
    draggingActIdRef.current = null
    setDraggingActId(null)
    setDragOverActId(null)
  }

  async function handleDropActividad(targetId, transferredId) {
    const sourceId = transferredId || draggingActIdRef.current || draggingActId
    if (!sourceId || sourceId === targetId || actLoading) {
      clearActivityDrag()
      return
    }
    const previous = actividades
    const from = previous.findIndex(act => act.id === sourceId)
    const to = previous.findIndex(act => act.id === targetId)
    if (from < 0 || to < 0) {
      clearActivityDrag()
      setError('No se pudo identificar la actividad arrastrada. Inténtalo nuevamente.')
      return
    }
    const reordered = [...previous]
    const [moved] = reordered.splice(from, 1)
    reordered.splice(to, 0, moved)
    const numbered = reordered.map((act, index) => ({ ...act, orden: index + 1 }))
    setActividades(numbered)
    clearActivityDrag()
    setError('')
    setActLoading(true)
    try {
      await reorderActividades(numbered)
      onActivityMoved()
    } catch (err) {
      setActividades(previous)
      setError(`No se pudo guardar el nuevo orden: ${err.message}`)
    } finally {
      setActLoading(false)
    }
  }

  async function handleDeleteActividad(actId) {
    setActLoading(true)
    try {
      await deleteActividad(actId)
      setActividades(prev => prev.filter(a => a.id !== actId))
      setConfirmActDelete(null)
    } catch (err) { setError(err.message) }
    finally { setActLoading(false) }
  }

  async function handleGuardar(e) {
    e.preventDefault()
    if (!form.titulo.trim()) { setError('El título es obligatorio'); return }
    setGuardando(true); setError('')
    try {
      await updateUnidad(unidad.id, form)
      onUpdate(unidad.id, form)
      setEditando(false)
    } catch (err) { setError(err.message) }
    finally { setGuardando(false) }
  }

  async function handleDelete() {
    setGuardando(true)
    try {
      await deleteUnidad(unidad.id)
      onDelete(unidad.id)
    } catch (err) { setError(err.message); setGuardando(false) }
  }

  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, marginBottom: 8, overflow: 'hidden' }}>
      {/* Header de la unidad */}
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: C.white, cursor: editando ? 'default' : 'pointer', userSelect: 'none' }}
        onClick={!editando ? toggleOpen : undefined}
      >
        <span style={{ fontSize: 13, fontWeight: 700, color: C.textLight, width: 24, textAlign: 'center', flexShrink: 0 }}>{unidad.orden}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{unidad.titulo}</div>
          {unidad.subtitulo && <div style={{ fontSize: 12, color: C.textLight, marginTop: 1 }}>{unidad.subtitulo}</div>}
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
          <button onClick={() => onMover(index, -1)} disabled={index === 0} style={btnOutline(C.textLight, 'sm')}>↑</button>
          <button onClick={() => onMover(index, 1)} disabled={index === total - 1} style={btnOutline(C.textLight, 'sm')}>↓</button>
          <button onClick={() => { setEditando(e => !e); setOpen(false); setError('') }} style={btnOutline(C.primary, 'sm')}>
            {editando ? 'Cancelar' : 'Editar'}
          </button>
          <button onClick={() => setConfirmDelete(true)} style={btnOutline(C.danger, 'sm')}>Borrar</button>
        </div>
        {!editando && <span style={{ fontSize: 18, color: C.textLight, flexShrink: 0 }}>{open ? '▲' : '▼'}</span>}
      </div>

      {/* Formulario de edición */}
      {editando && (
        <div style={{ background: '#FFFBF0', borderTop: `1px solid ${C.border}`, padding: '16px 20px' }}>
          <form onSubmit={handleGuardar}>
            <CamposUnidad form={form} onChange={setForm} />
            {error && <div style={{ background: C.dangerLight, color: C.danger, borderRadius: 8, padding: '8px 12px', marginTop: 12, fontSize: 13, fontWeight: 600 }}>{error}</div>}
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button type="button" onClick={() => { setEditando(false); setError('') }} style={{ ...btnOutline(C.textLight), flex: 1 }}>Cancelar</button>
              <button type="submit" disabled={guardando} style={{ ...btn(C.primary), flex: 1 }}>{guardando ? 'Guardando…' : 'Guardar cambios'}</button>
            </div>
          </form>
        </div>
      )}

      {/* Confirmación de borrado */}
      {confirmDelete && (
        <div style={{ background: C.dangerLight, borderTop: `1px solid ${C.border}`, padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: C.danger }}>¿Borrar "{unidad.titulo}" y todas sus actividades?</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setConfirmDelete(false)} style={btnOutline(C.textLight, 'sm')}>Cancelar</button>
            <button onClick={handleDelete} disabled={guardando} style={btn(C.danger, 'sm')}>{guardando ? 'Borrando…' : 'Sí, borrar'}</button>
          </div>
        </div>
      )}

      {/* Actividades */}
      {open && !editando && (
        <div style={{ background: C.bg, borderTop: `1px solid ${C.border}`, padding: '12px 16px' }}>
          {actividades === null ? (
            <p style={{ fontSize: 13, color: C.textLight }}>Cargando…</p>
          ) : actividades.length === 0 ? (
            <p style={{ fontSize: 13, color: C.textLight, marginBottom: 10 }}>Sin actividades aún.</p>
          ) : (
            <>
              <div style={{ fontSize: 11, color: C.textLight, marginBottom: 8 }}>
                ↕ Arrastra desde el ícono ⠿ y suelta la actividad sobre otra para cambiar su posición.
                {actLoading && <span style={{ marginLeft: 8, color: C.primary, fontWeight: 600 }}>Guardando orden…</span>}
              </div>
              {error && (
                <div style={{ background: C.dangerLight, color: C.danger, borderRadius: 8, padding: '9px 12px', marginBottom: 10, fontSize: 12 }}>
                  {error}
                </div>
              )}
              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 12 }}>
                <thead>
                  <tr>{['#', 'Tipo', 'Campos', ''].map(h => <th key={h} style={{ ...S.th, background: C.bg }}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {actividades.map(act => (
                    <tr
                      key={act.id}
                      onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverActId(act.id) }}
                      onDragLeave={() => setDragOverActId(current => current === act.id ? null : current)}
                      onDrop={e => {
                        e.preventDefault()
                        handleDropActividad(act.id, e.dataTransfer.getData('text/plain'))
                      }}
                      style={{
                        opacity: draggingActId === act.id ? 0.45 : 1,
                        background: dragOverActId === act.id && draggingActId !== act.id ? C.primaryLight : 'transparent',
                        outline: dragOverActId === act.id && draggingActId !== act.id ? `2px dashed ${C.primary}` : 'none',
                      }}
                    >
                      <td style={{ ...S.td, width: 44, color: C.textLight, fontSize: 13 }}>
                        <span
                          title="Arrastrar para cambiar la posición"
                          draggable={!actLoading}
                          onDragStart={e => {
                            draggingActIdRef.current = act.id
                            setDraggingActId(act.id)
                            e.dataTransfer.effectAllowed = 'move'
                            e.dataTransfer.setData('text/plain', act.id)
                          }}
                          onDragEnd={clearActivityDrag}
                          style={{ display: 'inline-block', marginRight: 7, color: C.primary, cursor: actLoading ? 'wait' : 'grab', userSelect: 'none' }}
                        >
                          ⠿
                        </span>
                        {act.orden}
                      </td>
                      <td style={S.td}><span style={badge(C.primary)}>{act.tipo}</span></td>
                      <td style={{ ...S.td, fontFamily: 'monospace', fontSize: 11, color: C.textLight, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {JSON.stringify(act.campos)}
                      </td>
                      <td style={{ ...S.td, whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                          <button onClick={() => setEditandoAct(act)} style={btnOutline(C.primary, 'sm')}>Editar</button>
                          <button onClick={() => setConfirmActDelete(act.id)} style={btnOutline(C.danger, 'sm')}>Borrar</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {confirmActDelete && (
                <div style={{ background: C.dangerLight, borderRadius: 8, padding: '12px 14px', marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: C.danger }}>¿Borrar esta actividad?</span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => setConfirmActDelete(null)} style={btnOutline(C.textLight, 'sm')}>Cancelar</button>
                    <button onClick={() => handleDeleteActividad(confirmActDelete)} disabled={actLoading} style={btn(C.danger, 'sm')}>
                      {actLoading ? 'Borrando…' : 'Sí, borrar'}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
          <button onClick={() => onNuevaActividad(unidad.id, (actividades?.length ?? 0) + 1, reloadActs)} style={btn(C.success, 'sm')}>
            + Nueva actividad
          </button>
        </div>
      )}

      {editandoAct && (
        <ModalEditarActividad
          actividad={editandoAct}
          unidades={unidades}
          primaryColor={form.color_acento || C.primary}
          onClose={() => setEditandoAct(null)}
          onSave={data => handleUpdateActividad(editandoAct.id, data)}
        />
      )}
    </div>
  )
}

// ─── Página principal ──────────────────────────────────────────────────────────
export default function AdminLibroDetalle() {
  const { id } = useParams()
  const [libro, setLibro] = useState(null)
  const [unidades, setUnidades] = useState([])
  const [grados, setGrados] = useState([])
  const [form, setForm] = useState({})
  const [picker, setPicker] = useState(null) // 'portada' | 'pdf'
  const [editando, setEditando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [nuevaUnidad, setNuevaUnidad] = useState({ titulo: '', subtitulo: '', texto: '' })
  const [nuevaUnidadOpen, setNuevaUnidadOpen] = useState(false)
  const [modalAct, setModalAct] = useState(null) // { unidadId, orden, reload }
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [exito, setExito] = useState('')
  const [activitiesVersion, setActivitiesVersion] = useState(0)

  useEffect(() => { load() }, [id])

  async function load() {
    setLoading(true); setError('')
    try {
      const [{ data: libroData }, uData, gData] = await Promise.all([
        supabase.from('libros').select('*, grados(nombre)').eq('id', id).single(),
        getUnidades(id),
        getGrados(),
      ])
      if (!libroData) throw new Error('Libro no encontrado')
      setLibro(libroData)
      setForm({
        titulo: libroData.titulo,
        descripcion: libroData.descripcion || '',
        emoji: libroData.emoji || '📖',
        grado_id: libroData.grado_id,
        ...normalizeBookPalette(libroData),
        portada_url: libroData.portada_url || '',
        pdf_url: libroData.pdf_url || '',
      })
      setUnidades(uData)
      setGrados(gData)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  async function handleGuardarMeta(e) {
    e.preventDefault()
    setGuardando(true); setError(''); setExito('')
    try {
      const updates = { ...form, grado_id: Number(form.grado_id) }
      await updateLibro(id, updates)
      setLibro(prev => ({ ...prev, ...updates }))
      setEditando(false)
      setExito('Cambios guardados.')
      setTimeout(() => setExito(''), 2500)
    } catch (err) { setError(err.message) }
    finally { setGuardando(false) }
  }

  async function handleNuevaUnidad(e) {
    e.preventDefault()
    if (!nuevaUnidad.titulo.trim()) { setError('El título de la unidad es obligatorio'); return }
    try {
      const data = await createUnidad(id, nuevaUnidad, unidades.length + 1)
      setUnidades(prev => [...prev, data])
      setNuevaUnidad({ titulo: '', subtitulo: '', texto: '' })
      setNuevaUnidadOpen(false)
    } catch (err) { setError(err.message) }
  }

  function handleUnidadUpdate(unidadId, campos) {
    setUnidades(prev => prev.map(u => u.id === unidadId ? { ...u, ...campos } : u))
  }

  function handleUnidadDelete(unidadId) {
    setUnidades(prev => prev.filter(u => u.id !== unidadId).map((u, i) => ({ ...u, orden: i + 1 })))
  }

  async function handleMover(index, dir) {
    const arr = [...unidades]
    const target = index + dir
    if (target < 0 || target >= arr.length) return
    ;[arr[index], arr[target]] = [arr[target], arr[index]]
    const updates = arr.map((u, i) => ({ id: u.id, orden: i + 1 }))
    try {
      await reorderUnidades(updates)
      setUnidades(arr.map((u, i) => ({ ...u, orden: i + 1 })))
    } catch (err) { setError(err.message) }
  }

  if (loading) return <AdminLayout><div style={{ padding: 40, color: C.textLight }}>Cargando…</div></AdminLayout>
  if (!libro) return <AdminLayout><div style={{ padding: 40, color: C.danger }}>{error || 'Libro no encontrado.'}</div></AdminLayout>

  return (
    <AdminLayout>
      <div style={{ padding: '32px 40px', maxWidth: 860 }}>
        {/* Breadcrumb */}
        <div style={{ fontSize: 13, color: C.textLight, marginBottom: 20 }}>
          <Link to="/admin/libros" style={{ color: C.primary, textDecoration: 'none', fontWeight: 600 }}>Libros</Link>
          <span style={{ margin: '0 8px' }}>›</span>
          <span>{libro.titulo}</span>
        </div>

        {error && <div style={{ background: C.dangerLight, color: C.danger, borderRadius: 10, padding: '12px 16px', marginBottom: 20, fontSize: 14, fontWeight: 600 }}>{error}</div>}
        {exito && <div style={{ background: C.successLight, color: C.success, borderRadius: 10, padding: '12px 16px', marginBottom: 20, fontSize: 14, fontWeight: 600 }}>{exito}</div>}

        {/* Metadatos */}
        <div style={{ ...S.card, padding: 24, marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: editando ? 20 : 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 32 }}>{libro.emoji || '📖'}</span>
              <div>
                <h1 style={{ fontSize: 20, fontWeight: 800, color: C.text, margin: 0 }}>{libro.titulo}</h1>
                <p style={{ fontSize: 13, color: C.textLight, margin: '3px 0 0' }}>{libro.grados?.nombre || '—'} · ID: <code style={{ fontSize: 12 }}>{libro.id}</code></p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <a href={`/libro/${libro.id}`} target="_blank" rel="noreferrer" style={{ ...btnOutline(C.textLight, 'sm'), textDecoration: 'none' }}>
                Vista previa ↗
              </a>
              {!editando && (
                <button onClick={() => setEditando(true)} style={btnOutline(C.primary, 'sm')}>Editar metadatos</button>
              )}
            </div>
          </div>

          {editando && (
            <form onSubmit={handleGuardarMeta}>
              <div style={{ display: 'grid', gridTemplateColumns: '64px 1fr', gap: 12, marginBottom: 14 }}>
                <div>
                  <label style={S.label}>Emoji</label>
                  <input style={{ ...S.input, textAlign: 'center', fontSize: 22 }} value={form.emoji} onChange={e => setForm(p => ({ ...p, emoji: e.target.value }))} maxLength={2} />
                </div>
                <div>
                  <label style={S.label}>Título</label>
                  <input style={S.input} value={form.titulo} onChange={e => setForm(p => ({ ...p, titulo: e.target.value }))} />
                </div>
              </div>
              <label style={S.label}>Grado</label>
              <select style={{ ...S.input, marginBottom: 14 }} value={form.grado_id} onChange={e => setForm(p => ({ ...p, grado_id: e.target.value }))}>
                <option value="">—</option>
                {grados.map(g => <option key={g.id} value={g.id}>{g.nombre}</option>)}
              </select>
              <label style={S.label}>Descripción</label>
              <textarea style={{ ...S.input, marginBottom: 14, minHeight: 64, resize: 'vertical' }} value={form.descripcion} onChange={e => setForm(p => ({ ...p, descripcion: e.target.value }))} />
              <BookPaletteFields value={form} onChange={setForm} />
              <label style={S.label}>Portada</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <button type="button" onClick={() => setPicker('portada')} style={btnOutline(C.primary, 'sm')}>
                  {form.portada_url ? 'Reemplazar' : 'Seleccionar imagen'}
                </button>
                <span style={{ fontSize: 12, color: C.textLight, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 260 }}>
                  {form.portada_url ? form.portada_url.split('/').pop() : 'Sin archivo'}
                </span>
              </div>
              <label style={S.label}>PDF</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                <button type="button" onClick={() => setPicker('pdf')} style={btnOutline(C.primary, 'sm')}>
                  {form.pdf_url ? 'Reemplazar' : 'Seleccionar PDF'}
                </button>
                <span style={{ fontSize: 12, color: C.textLight, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 260 }}>
                  {form.pdf_url ? form.pdf_url.split('/').pop() : 'Sin archivo'}
                </span>
              </div>

              {picker === 'portada' && (
                <StoragePicker
                  folder="portada"
                  accept="image/*"
                  title="Seleccionar portada"
                  onSelect={path => setForm(p => ({ ...p, portada_url: path }))}
                  onClose={() => setPicker(null)}
                />
              )}
              {picker === 'pdf' && (
                <StoragePicker
                  folder="pdfs"
                  accept="application/pdf"
                  title="Seleccionar PDF"
                  onSelect={path => setForm(p => ({ ...p, pdf_url: path }))}
                  onClose={() => setPicker(null)}
                />
              )}
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="button" onClick={() => setEditando(false)} style={{ ...btnOutline(C.textLight), flex: 1 }}>Cancelar</button>
                <button type="submit" disabled={guardando} style={{ ...btn(C.primary), flex: 1 }}>{guardando ? 'Guardando…' : 'Guardar cambios'}</button>
              </div>
            </form>
          )}
        </div>

        {/* Unidades */}
        <div style={{ ...S.card, padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>
              Unidades <span style={{ color: C.textLight, fontWeight: 400, fontSize: 13 }}>({unidades.length})</span>
            </span>
          </div>

          {unidades.length === 0 ? (
            <p style={{ fontSize: 14, color: C.textLight, marginBottom: 16 }}>Este libro no tiene unidades aún.</p>
          ) : (
            unidades.map((u, i) => (
              <UnidadRow
                key={u.id}
                unidad={u}
                unidades={unidades}
                activitiesVersion={activitiesVersion}
                index={i}
                total={unidades.length}
                onMover={handleMover}
                onNuevaActividad={(unidadId, orden, reload) => setModalAct({ unidadId, orden, reload })}
                onUpdate={handleUnidadUpdate}
                onDelete={handleUnidadDelete}
                onActivityMoved={() => setActivitiesVersion(v => v + 1)}
              />
            ))
          )}

          {!nuevaUnidadOpen ? (
            <button onClick={() => setNuevaUnidadOpen(true)} style={{ ...btn(C.success, 'sm'), marginTop: 8 }}>
              + Nueva unidad
            </button>
          ) : (
            <form onSubmit={handleNuevaUnidad} style={{ marginTop: 12, border: `1px solid ${C.border}`, borderRadius: 10, padding: '16px 20px', background: '#F0FDF4' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.success, marginBottom: 14 }}>Nueva unidad</div>
              <CamposUnidad form={nuevaUnidad} onChange={setNuevaUnidad} />
              <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
                <button type="button" onClick={() => { setNuevaUnidadOpen(false); setNuevaUnidad({ titulo: '', subtitulo: '', texto: '' }) }} style={{ ...btnOutline(C.textLight), flex: 1 }}>
                  Cancelar
                </button>
                <button type="submit" style={{ ...btn(C.success), flex: 1 }}>Crear unidad</button>
              </div>
            </form>
          )}
        </div>
      </div>

      {modalAct && (
        <ModalActividad
          orden={modalAct.orden}
          primaryColor={form.color_acento || libro.color_acento || C.primary}
          onClose={() => setModalAct(null)}
          onSave={async (data) => {
            await createActividad(modalAct.unidadId, data)
            modalAct.reload()
          }}
        />
      )}
    </AdminLayout>
  )
}
