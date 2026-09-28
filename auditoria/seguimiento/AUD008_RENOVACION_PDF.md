# AUD-008 — recuperación del lector y firma breve, 26 de septiembre de 2026

Estado: **implementación local parcial; no publicada ni cerrada**. El usuario autorizó continuar fase 6. No se modificó Supabase, SQL, Storage ni Edge; no se iniciaron bases locales. No hay commit, PR ni despliegue.

## Comportamiento

La app solicita firmas de PDF por 300 segundos en vez de 3600. Portadas mantienen 3600 segundos: no se acorta su TTL en este bloque. La vigencia inicial se calcula desde antes de solicitar la firma (con margen de 30 segundos al entrar al lector). Si la URL ha vencido, está próxima a vencer o falló la firma inicial, se obtiene otra antes de montar Document.

Cada renovación llama get_libro_completo para volver a verificar el acceso y obtener la ruta actual; después Storage firma con el cliente autenticado. El controlador conserva URL solo en memoria. No se registran ruta ni error remoto de firma PDF en consola. El historial de libros recientes solo conserva id, título y emoji.

Los fallos de carga del documento o de sus páginas visibles permiten renovar la URL y recrear únicamente Document, preservando el estado de página del lector. No se recarga periódicamente un PDF que ya está descargado. Por ello el contenido ya obtenido puede seguir leyéndose tras caducar la firma: no se promete revocación de bytes descargados.

Las solicitudes concurrentes de recuperación comparten una firma; tras un intento automático hay 60 segundos de protección contra bucles. Si el fallo persiste se ofrece Reintentar lectura. El desmontaje ignora resultados tardíos y evita iniciar firmas encoladas antes de la limpieza de StrictMode. El reintento manual permite recuperarse tras restablecer la conexión o el acceso. No se añade un timeout de red independiente del SDK.

## Verificación

- Script 29: 10 pruebas del controlador con reloj/servicio controlados pasan. Incluyen URL próxima/caducada, sesión larga simulada, ausencia de firma inicial, concurrencia, URL idéntica, fallo persistente, reintento manual y desmontaje inmediato/tardío.
- Script 30: 6 pruebas del servicio con doble de Supabase pasan. Verifican TTL solicitado 300, nueva comprobación RPC, denegación sin firma, rechazo de rutas públicas/externas y recuperación de firma inicial fallida.
- Build local pasa. ESLint de código nuevo y servicio pasa; conjunto de cinco archivos de implementación conserva cinco errores y dos advertencias preexistentes en LectorLibro/Libro. Cero diagnósticos nuevos según comparación archivo/regla/severidad/primera línea del mensaje; los marcos de código cambian números de línea. No se afirma ESLint global limpio.
- Navegador agent-browser en servidor 127.0.0.1:5179 aislado, con Supabase sustituido por un doble y un PDF ficticio de cuatro páginas: error inicial de documento recuperado; navegación a páginas 3–4; callback de fallo PDF simulado tras adelantar Date.now dos horas conserva páginas 3–4; RPC denegada no firma; botón manual recupera; volver a montar tras otras dos horas renueva y restaura página. Estado final: cinco RPC, cuatro firmas, todas de 300 segundos, tres canvas, sin alerta ni overlay de Vite. Capturas guardadas.
- La caducidad durante lectura fue inyectada por el callback real onPdfError del componente, **no** mediante una petición Range rechazada por Storage. La carga inicial fallida sí procede de una URL de prueba que no sirve un PDF. No se hicieron solicitudes cloud ni se usaron cuentas, libros o códigos reales.
- Navegador cerrado; servidor detenido con salida 130 por interrupción controlada. La última mejora de cancelación previa a la microtarea se verificó por prueba unitaria y build, sin repetir navegador.

## Alcance pendiente

Esta configuración reduce la vigencia solicitada por la app, **no acredita un límite máximo de firma impuesto por el servidor**. No impide que un usuario autorizado guarde y redistribuya el PDF. No se implementan marca de agua, registro de emisiones ni cuota de firma. Si se requiere limitar TTL de cualquier cliente, necesita un diseño de servidor y revisión de las políticas de Storage; no se cambia de forma implícita en este bloque.

Antes de publicar el TTL corto: verificar con cuenta ficticia autenticada y Storage privado real/local, incluyendo un PDF grande con peticiones parciales, red lenta/corte, expiración real, permiso retirado y regreso tras suspensión. La prueba con doble no acredita estas fronteras. AUD-008 sigue abierto por esa verificación y publicación selectiva; también falta evaluar renovación de portadas si se cambia su vigencia.

No se pide al usuario probar estos cambios en producción: aún no están publicados. Cuando exista un entorno autenticado adecuado se entregará una guía con URL, cuenta/rol de prueba, pasos y resultado esperado; nunca solicitar credenciales o URLs firmadas en chat.

## Preservación

Servicio y página Libro ya tenían cambios previos. Copias anteriores y diff exclusivo en resultados/fase6/aud008; no copiar archivos completos indiscriminadamente a main. Archivos nuevos: pdfAccess.js y LectorLibroPrivado.jsx. Scripts 29/30 son reproducibles sin conexión. Harness y PDF ficticio se guardan únicamente en evidencia ignorada, fuera del bundle importado por la app.

Referencias: contrato de createSignedUrl inspeccionado en el SDK instalado (StorageFileApi.ts: expiresIn expresado en segundos); [documentación React-PDF de la rama 10.x](https://github.com/wojtekmaj/react-pdf/tree/10.x) y callbacks de Document/Page de la versión instalada. El límite de lo verificado se describe arriba.

## Actualización del 27–28 de septiembre de 2026

Las limitaciones históricas de Auth/Storage reales se resuelven en local: PDF ficticio de 16.6 MB/32 páginas; firma de 300 s, Range206 inicial, HTTP400 tras 305.16 s y Range206 al renovar. Navegador preserva páginas 3–4 tras rechazo real de URL caducada y respuestas demoradas 1200 ms; deniega renovación al retirar acceso y recupera con reintento manual al restaurarlo.

Candidato de main comprobado en ruta protegida de alumno. Prueba adicional con PDF.js: espera real327.244 s; petición de página31 origina cuatro rechazos 400 y una única firma nueva; vuelve 206 y muestra páginas 31–32 sin alerta ni errores JS. Para forzar tráfico parcial el harness utiliza disableAutoFetch/disableStream y proxy local (Storage no expone Accept-Ranges por CORS). No son cambios de producto ni prueba de suspensión del SO. Evidencia retoma-28/range-tardio.json y captura range-renovado-31.png.

Se conserva el límite: el cliente solicita 300 s; no se acredita un máximo impuesto por servidor ni revocación de bytes descargados/copias públicas. No se publican ni borran assets ajenos al paquete; el candidato conserva el fallback de portadas de main. Consulta de compatibilidad solo de recuentos: 42 libros, 40 rutas Storage, 0 públicas/absolutas. No se modificó producción. Publicación selectiva pendiente de autorización.
