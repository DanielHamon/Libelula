# Handoff — narración IA del lector PDF

Última actualización: 2026-08-20 (America/Bogota)

## Estado y decisión actual

El proyecto quiere reemplazar o complementar `speechSynthesis` con narraciones
de voz IA naturales, generadas una sola vez por página y reutilizadas desde
Supabase Storage.

**Decisión vigente:** no generar todavía los audios del catálogo. Algunos PDF
no están en su versión final y sus textos pueden cambiar o desplazarse a otras
páginas. Generarlos ahora produciría archivos obsoletos y gasto duplicado.

Antes de iniciar la generación definitiva se debe declarar cada PDF como
`final/congelado` y volver a ejecutar el extractor. Los reportes actuales son un
diagnóstico provisional, no una fuente definitiva para TTS.

No se ha llamado a ElevenLabs y no se han consumido créditos de TTS.

## Funcionamiento actual del lector

Archivo principal: `src/components/LectorLibro.jsx`.

- Renderiza el PDF mediante `react-pdf`/PDF.js.
- Extrae texto en el navegador con `page.getTextContent()`.
- Narra mediante `window.speechSynthesis` y voces disponibles en el dispositivo.
- En escritorio muestra dos páginas; une el texto de izquierda y derecha.
- Al cambiar de spread cancela la narración.
- Tiene controles de iniciar, pausar, continuar y reiniciar.
- El estado de velocidad existe, pero su interfaz está comentada.
- `goNext()` y `goPrev()` manejan la navegación y una animación de hoja de 1.100 ms.
- No existe todavía reproductor de MP3 narrados, esquema de narraciones ni bucket
  de audiolibros.

El PDF se obtiene en `src/services/libros.service.js`. Los objetos privados del
bucket `libros` se sirven actualmente mediante URLs firmadas de una hora.

## Arquitectura aprobada conceptualmente

### Generación

- Proceso administrativo/batch, nunca desde el navegador del estudiante.
- Extracción y limpieza página por página.
- Omitir páginas realmente sin texto.
- Revisar/OCR para páginas con imágenes y sin texto extraíble.
- Calcular hash del texto limpio más la configuración de voz.
- Generar únicamente páginas nuevas o cuyo hash/configuración haya cambiado.
- Almacenar un archivo MP3 independiente por página.
- Validar el audio antes de marcarlo como listo.
- Reutilizar permanentemente el archivo para todos los usuarios autorizados.

### Storage

Bucket recomendado: `audiobooks`, privado.

Ruta recomendada:

```text
{libro_id}/v001/pagina_001-{hash_corto}.mp3
```

Ejemplo:

```text
roja_como_un_tomate/v001/pagina_017-a83f02c1.mp3
```

Las rutas deben ser versionadas e inmutables para permitir caché larga, evitar
audios antiguos después de una actualización y facilitar rollback.

Formato base acordado:

```text
MP3, mono, 64 kbps, voz hablada
```

Si ElevenLabs entrega otro formato/bitrate, normalizar administrativamente con
`ffmpeg` antes de subir.

### Base de datos futura

Crear tablas normalizadas, no arreglos JSON dentro de `libros`:

1. `narraciones_libro`
   - `id`, `libro_id`, `version`, `estado`
   - proveedor, modelo, `voz_id`, idioma
   - formato, bitrate, velocidad base
   - total de páginas, páginas listas, `config_hash`
   - fechas de creación y publicación

2. `narraciones_pagina`
   - `narracion_id`, `libro_id`, `pagina_pdf`
   - `texto_hash`, opcionalmente texto limpio
   - `storage_path`, estado, duración, tamaño y MIME
   - intentos, último error y fecha de generación

Estados sugeridos de página:

```text
pending | processing | ready | failed | skipped | needs_review
```

La detección de existencia debe consultar la tabla y validar estado, hash y
configuración; no listar Storage en cada reproducción.

### Seguridad futura

- Bucket privado, no público.
- Lectura condicionada por la función existente `puede_acceder_libro(libro_id)`.
- Política de Storage apoyada en `narraciones_pagina.storage_path`.
- Escritura/borrado solo mediante proceso administrativo con credencial secreta.
- URLs firmadas reutilizadas durante la sesión; no crear una nueva al pulsar
  pausa o reproducir.
- Nunca exponer la clave de ElevenLabs ni `SUPABASE_SERVICE_ROLE_KEY` con prefijo
  `VITE_` o dentro del frontend.

## Comportamiento futuro del reproductor

- Usar `HTMLAudioElement`, no `speechSynthesis`, para narraciones publicadas.
- Conservar `speechSynthesis` solamente como respaldo si falta un audio.
- Controles: reproducir, pausar, reiniciar, anterior, siguiente y velocidad.
- Recordar página, `currentTime` y velocidad en sesión.
- Precargar únicamente el audio que se reproducirá inmediatamente después.
- No precargar el libro completo.

Flujo móvil:

```text
termina audio actual
→ ejecutar animación de página
→ esperar el punto acordado de la animación
→ reproducir audio ya precargado de la página siguiente
```

Flujo de escritorio con doble página:

```text
narrar izquierda
→ narrar derecha (sin animación, ya está visible)
→ animar cambio de hoja/spread
→ narrar nueva izquierda
```

Para páginas omitidas sin narración:

- La página debe seguir siendo visible.
- Decidir antes de implementar si el modo continuo espera 2–3 segundos y avanza
  o si se detiene hasta que el usuario pulse Siguiente.

Al cambiar manualmente de página se debe detener el audio anterior, invalidar
solicitudes antiguas y cargar la nueva página sin carreras.

## Proveedor de voz

El usuario ya eligió una voz que considera adecuada dentro del panel oficial de
ElevenLabs (`elevenlabs.io`). Aún no se ha registrado en el repositorio:

- `voice_id`
- nombre visible de la voz
- modelo exacto usado (por ejemplo `eleven_multilingual_v2`)
- ajustes de estabilidad, similitud, estilo y velocidad

Antes del piloto definitivo, registrar esos valores en una configuración
administrativa sin incluir la API key.

La clave de ElevenLabs debe guardarse únicamente como:

```text
ELEVENLABS_API_KEY=...
```

Sin prefijo `VITE_` y fuera de Git.

## Extractor y reportes implementados

Script: `scripts/extract-pdf-report.mjs`.

Comando npm:

```bash
npm run report:pdf -- --file /ruta/libro.pdf --book-id id --include-text
npm run report:pdf -- --book-id id --include-text
npm run report:pdf -- --all --include-text
```

Funciones implementadas:

- PDF local o descarga administrativa desde el bucket privado `libros`.
- Extracción por página con PDF.js.
- Reconstrucción de líneas según coordenadas.
- Eliminación de números de página.
- Detección de encabezados/pies repetidos.
- Unión de palabras partidas al final de línea.
- Clasificación `lista`, `sin_texto`, `posible_imagen` o
  `requiere_revision`.
- Detección de operadores de imagen para señalar posible OCR.
- Hash SHA-256 del texto limpio.
- Reportes JSON, CSV y Markdown.
- Resumen agregado del catálogo.

Los resultados se escriben en `.reports/pdf-pages/`, ignorado por Git porque
puede contener el texto completo de obras.

## Diagnóstico provisional ejecutado

La ejecución del 2026-08-20 encontró 32 registros de libros, pero solo 30 PDF
únicos. Dos pares de registros apuntan al mismo objeto:

- `cuando_emilio_llego` y `fase_5`
- `roja` y `roja_como_un_tomate`

Totales sobre los 30 PDF únicos actuales:

```text
PDF únicos:                    30
Páginas:                      657
Caracteres limpios:       493.969
Páginas listas:               615
Páginas sin texto:              4
Posibles imágenes/OCR:         19
Páginas para revisión:         19
```

El reporte bruto de los 32 registros muestra 710 páginas y 515.903 caracteres,
pero incluye los dos PDF duplicados y no debe usarse para calcular costos.

El PDF con más páginas sin texto extraíble es `roja-como-un-tomate.pdf`, con
nueve páginas marcadas como posibles imágenes/OCR. Los resultados deben volver
a calcularse cuando los PDF sean finales.

## Estimaciones de capacidad anteriores

Estimación inicial aportada antes de medir el catálogo:

```text
6,25 horas de audio
MP3 mono a 64 kbps
≈ 180 MB total
≈ 6 MB por libro
≈ 200 KB por página de 25 segundos
```

Supabase Free ofrecía al momento de la revisión 1 GB de almacenamiento, 5 GB de
egress normal y 5 GB de egress cacheado. El almacenamiento estimado cabe, pero
el egress mensual será el límite que debe vigilarse.

El conteo provisional real es mayor que la aproximación original en caracteres
(493.969 caracteres únicos); el costo exacto debe recalcularse después de
congelar y volver a extraer los PDF finales.

## Checklist para reanudar el proyecto

1. Confirmar que todos los PDF están en su versión final.
2. Corregir registros duplicados o decidir explícitamente si comparten narración.
3. Ejecutar nuevamente:

   ```bash
   npm run report:pdf -- --all --include-text
   ```

4. Revisar todas las páginas `posible_imagen` y `requiere_revision`.
5. Aplicar OCR solo donde visualmente exista texto que deba narrarse.
6. Confirmar numeración física del PDF frente a la página visible.
7. Registrar `voice_id`, modelo y ajustes exactos de ElevenLabs.
8. Calcular caracteres definitivos y costo real.
9. Generar un solo libro piloto.
10. Escuchar y aprobar cada página del piloto.
11. Crear bucket privado, tablas, RLS y proceso idempotente.
12. Integrar reproductor con la animación y precarga de una sola página.
13. Generar el resto del catálogo únicamente después de aprobar el piloto.

## Archivos modificados en esta sesión

- `scripts/extract-pdf-report.mjs` — extractor y generador de reportes.
- `package.json` — comando `report:pdf` y dependencia directa `pdfjs-dist`.
- `package-lock.json` — declaración de dependencia directa.
- `.env.example` — documentación de credencial administrativa local.
- `.gitignore` — exclusión de `.reports/`.
- `README.md` — instrucciones de uso del extractor.

No se modificaron `LectorLibro.jsx`, la base de datos ni las políticas de
Supabase. No se crearon audios ni se integró ElevenLabs.

## Validaciones realizadas

- Ayuda del comando: correcta.
- Extracción con PDF local de prueba: correcta.
- Extracción completa desde Supabase: correcta.
- ESLint del script nuevo: correcto.
- Build de producción: correcto.
- `git diff --check`: correcto.
- El lint general conserva errores preexistentes en otros componentes, no
  relacionados con este trabajo.
