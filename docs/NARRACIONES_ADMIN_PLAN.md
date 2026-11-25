# Narraciones administrables de IAbooks

**Estado:** candidato en `feature/lector-voz-piloto`, aplicado y probado solo en Supabase local. No se ha integrado en `main` ni desplegado.

## Modelo

- `libros.narracion_habilitada` es el estado efectivo y empieza en `false`. `narracion_revision` impide que una solicitud antigua cambie un estado posterior.
- `narraciones_libro` conserva versiones `draft`, `published` y `archived`. Crear un borrador copia las asociaciones publicadas si el PDF es el mismo. Editarlo no afecta la versión que oyen los estudiantes.
- Cada página PDF debe estar `ready` con MP3 o `skipped` porque no requiere voz. Una página ausente o `pending` impide publicar. La publicación no cambia la habilitación.
- Los registros y archivos usan números de página PDF, contando la portada como PDF 1. El borrador administrativo muestra ambos números («Página 7 · PDF 8») y el reproductor estudiantil muestra el número impreso (PDF 8 = página 7). La portada figura como «Portada · PDF 1». Este cambio de etiqueta no desplaza las asociaciones de MP3 ni la reproducción. El salto directo del lector sigue indicando números PDF.
- La versión guarda ruta, ID y fecha de modificación del objeto PDF, y el número de páginas leído por PDF.js. La base comprueba de nuevo el objeto PDF, cada página declarada y cada MP3 al publicar y al aprobar la habilitación. PostgreSQL no decodifica el PDF por sí mismo: confía en el número de páginas que leyó el panel administrativo.
- Los cuatro MP3 y la versión 2 de «Roja como un tomate» se conservan. El libro queda deshabilitado inicialmente. Para habilitarlo bajo la regla de cobertura completa hay que crear un borrador, completar o marcar expresamente las demás páginas, publicar y solicitar aprobación.

## Administración

En **Admin → Libros → [libro] → Narración del libro** se puede cambiar de libro, ver el PDF y su número de páginas, estado efectivo, versiones y solicitudes pendientes. Las páginas se muestran de 24 en 24.

1. **Crear borrador.** El panel cuenta las páginas del PDF y la base registra la identidad del objeto. Si cambia el PDF, se descarta el borrador y se crea otro.
2. **Cargar o reemplazar MP3.** El navegador comprueba tamaño, cabecera y duración. La base reserva una ruta generada por ella, Storage acepta solo `audio/mpeg` de hasta 10 MiB en el bucket privado y una RPC confirma que el objeto existe antes de asociarlo. No se acepta una ruta elegida por el cliente. Cada página tiene una revisión: si otro administrador la cambió durante la carga, la confirmación se rechaza y el archivo nuevo se limpia. La interfaz permite escuchar el archivo.
3. **Eliminar o marcar sin narración.** Solo cambia el borrador. Eliminar pide confirmación. `Sin narración` se usa en portadas, ilustraciones u otras páginas sin voz. Storage impide eliminar un archivo referido por cualquier versión conservada. **Limpiar cargas interrumpidas** retira objetos sin referencias y reservas caducadas.
4. **Validar y publicar.** Se exige cobertura de todas las páginas declaradas, al menos un MP3, objetos coherentes con los metadatos y PDF vigente. La versión anterior pasa a `archived` en la misma transacción. El estado del reproductor no cambia.
5. **Solicitar habilitación o deshabilitación.** Se crea una fila en `acciones_admin_pendientes` sin cambiar el estado. La vista de aprobaciones muestra libro, solicitante, acción, estados anterior y solicitado, fecha, versión, MP3 listos y páginas omitidas. Solo el superadmin con MFA AAL2 resuelve. Aprobar repite la validación, compara revisión y versión examinada, cambia el estado y registra `admin_logs` en la misma transacción. Rechazar conserva el estado. Un índice impide solicitudes pendientes duplicadas o contradictorias.

Las cargas, borradores y publicaciones se autorizaron directamente para administradores **solo en el nuevo bucket y RPC de narración**. El bucket general de libros conserva sus reglas. Habilitar y deshabilitar siempre pasa por la aprobación sensible existente.

## Acceso y revocación

Los estudiantes solo ven metadatos y obtienen firmas si tienen acceso al libro, está habilitado, la versión publicada es válida y la página tiene MP3. Un libro deshabilitado no muestra panel ni activa voz del navegador. Las páginas `skipped` pasan silenciosamente a la siguiente tras un segundo. El panel consulta el estado cada tres segundos para detener una reproducción al deshabilitar.

Las URLs firmadas duran **120 segundos**. Supabase Storage puede seguir sirviendo una URL ya emitida hasta que expire: deshabilitar impide nuevas firmas, pero no revoca instantáneamente las anteriores. La prueba local confirmó HTTP 200 para una URL firmada antes de deshabilitar y denegó una firma nueva. Con conectividad, el reproductor abierto se detiene en aproximadamente tres segundos. Los administradores pueden escuchar borradores.

## Migraciones y pruebas

Las migraciones versionadas, en orden, son `supabase/migrations/202611210001_narraciones_admin.sql` (tablas, estado, bucket y RLS), `202611210002_narraciones_operaciones.sql` (borradores, MP3, publicación y solicitudes) y `202611210003_narraciones_integracion.sql` (resolución mediante el RPC existente y limpieza). Requieren el esquema principal de IAbooks y sus funciones de roles, acceso y aprobaciones. En la réplica local se aplicaron con `docker exec -i supabase_db_iabooks-replica-20261110 psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f - < archivo.sql`. También se aplicaron, en orden, sobre una base temporal sin datos tras retirar sus tablas y columnas de narración: las tres pasaron, el valor inicial fue `false` y la base temporal se eliminó. Ese contenedor pertenece solo a la réplica local. Los SQL históricos del piloto no deben reaplicarse después de estas migraciones.

```bash
npm run lint
npm run build
node --test scripts/elevenlabs-api.test.mjs src/lib/speechFallback.test.mjs
node scripts/verify-voice-pilot-local.mjs
node scripts/verify-narraciones-admin-local.mjs
```

La prueba integral usa solo Supabase local y un tono MP3 sintético de GStreamer. Cubre dos libros, carga, reemplazo, versiones, aprobación y rechazo, MFA, permisos, limpieza y solicitudes obsoletas; retira sus fixtures. Con `npm run dev -- --host 127.0.0.1` activo, se puede fijar `AGENT_BROWSER_BIN=/ruta/a/agent-browser` para probar la carga desde el panel y el reproductor móvil.

Para probar manualmente: iniciar la réplica y Vite desde este worktree; ingresar con un administrador local; abrir **Libros → [libro] → Narración del libro**; preparar, escuchar, validar y publicar un borrador; solicitar la habilitación; aprobar con superadmin y MFA AAL2 en **Aprobaciones**; abrir el PDF con un estudiante autorizado. Deshabilitar requiere otra solicitud y aprobación.

No se generó audio con ElevenLabs. La inspección de cabecera y duración ocurre en el navegador; Storage y SQL verifican MIME, tamaño, permisos, rutas y existencia. Un administrador malicioso podría etiquetar bytes no MP3 como `audio/mpeg` mediante llamadas directas; para tratar a los administradores como actores no confiables se necesitaría además inspección binaria del lado del servidor.
