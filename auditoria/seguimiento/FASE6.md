# Fase 6 — rendimiento y mantenimiento

Estado: **reanudada el 28 de septiembre de 2026; abierta, con candidato selectivo sin publicar**. Usuario autorizó iniciar esta fase. Bloques AUD-005 y AUD-011 implementados y verificados localmente; reanudación autorizada el 24 de septiembre de 2026. Sin commit, PR ni despliegue. Fase 5 permanece cerrada; fase 4 sigue esperando respuesta de soporte.

## Primer bloque: carga diferida de rutas (AUD-005)

App.jsx declara las páginas y AdminWorkspace mediante React.lazy a nivel de módulo. Suspense ofrece un estado de carga accesible; RouteLoadBoundary muestra un error recuperable y permite recargar si falla una descarga. Se conservan las rutas y sus guardas. El aviso de inactividad permanece fuera de Suspense.

Comparación sobre el mismo árbol local y las mismas dependencias instaladas (Vite observado 8.1.5; no se instalaron ni actualizaron paquetes):

| Medida | Antes | Después |
|---|---:|---:|
| Archivo JS principal | 1385.07 kB | 447.37 kB |
| Principal gzip | 364.43 kB | 129.51 kB |
| JS de login observado en navegador | No medido antes en navegador | 454614 bytes (base + Login) |
| Advertencia JS > 500 kB | Sí | No |

El login carga base y Login, sin lector PDF, ActivityCard ni AdminWorkspace. La comparación entre el JS observado del login y el bundle previo indica aproximadamente 67 % menos bytes sin comprimir. No equivale a medir tiempo de carga o rendimiento en dispositivos reales. El worker PDF sigue pesando 1046.21 kB, diferido con el lector. No se ha reducido el código total descargable.

## Verificación realizada

- Build antes/después: pasa. ESLint de los dos archivos afectados: pasa.
- Login en desarrollo y compilación preview local: renderiza; sin errores JS registrados antes de las fallas provocadas.
- /admin y /libro/prueba sin sesión: redirigen a login preservando redirect.
- Descarga de Activar bloqueada: muestra mensaje de error y botón de recarga.
- Descarga de Login bloqueada: muestra el mismo estado; al retirar bloqueo y pulsar Volver a cargar, recupera el formulario.
- Capturas y logs en auditoria/pruebas/resultados/fase6/ (ignorados por Git).

No se probaron sesiones reales, lector autenticado, panel docente/admin autenticado ni CAPTCHA. No se enviaron formularios ni se consultaron datos privados. Las fallas de descarga fueron simuladas mediante interceptación en el navegador.

## Secuencia restante

1. AUD-011: implementación y pruebas controladas completadas localmente; falta navegador autenticado y publicación.
2. AUD-007: revisión y mediciones completadas; índices nuevos diferidos hasta crecimiento o latencia demostrada. Ver tercer bloque.
3. AUD-008: estudiar duración y renovación de PDFs/portadas privados; no acortar TTL sin asegurar sesiones de lectura largas.
4. AUD-010: extracción gradual de mecánicas de ActivityCard conservando contratos y comportamiento; verificar cada mecánica extraída.
5. AUD-012: medir renders/efectos de flujos concretos antes de memoizar; el recuento de hooks no prueba lentitud.
6. AUD-014: clasificar console.* por información expuesta y utilidad; reducir mensajes sensibles preservando diagnóstico útil.
7. Completar navegación autenticada y preparar candidato selectivo sobre main para publicación; verificar métricas del candidato, no asumir que coinciden con este árbol.

## Preservación y límites

Rama auditoria-saz conservada. Origin/main local apunta a 623804cfe5def764a883371bfc294ccc295116e1. App.jsx tenía cambios anteriores (incluido AdminWorkspace); no copiar el archivo completo a main. Respaldo del App previo y diff exclusivo de este bloque en resultados/fase6. No se tocó SQL, Edge ni producción; volúmenes Supabase no iniciados. AUD-005 permanece abierto por verificación autenticada y publicación, y los otros seis hallazgos siguen pendientes. No declarar fase 6 cerrada.

Al finalizar este bloque se cerró el navegador fase6 y se detuvieron los servidores locales 5177/5178.

## Pausa solicitada — 22 de septiembre de 2026

Usuario solicitó guardar memoria tras revisar pendientes. Se conserva el primer bloque local verificado. Esperar indicación para reanudar por AUD-011; no repetir pruebas de AUD-005 salvo cambios o incertidumbres nuevas. Sin publicación. Estado y pendientes detallados en AGENTS.md y EVIDENCIA_FASE6.json.

## Segundo bloque: inactividad (AUD-011), 24 de septiembre de 2026

Reanudación solicitada por el usuario. `useInactivityTimeout` inicia el controlador únicamente con sesión autenticada y lo retira al cambiar usuario, cerrar sesión o desmontar. Las renovaciones del token y notificaciones repetidas del mismo usuario no reinician el plazo. La llamada de cierre automático se difiere fuera del callback de Auth y se descarta si la instancia o usuario ya cambió antes de iniciarla.

Nuevo `src/lib/inactivityTimer.js`: conserva los 30 minutos y el aviso cinco minutos antes. Los eventos actualizan la fecha en memoria; un único temporizador sincroniza cada 15 segundos y pasa a una cadencia de un segundo durante el aviso. Calcula el tiempo restante desde la fecha, sin restar ticks. Escucha storage, focus y visibilitychange; publica actividad pendiente al ocultar/salir/desmontar. Recargar conserva el plazo y una interacción posterior al vencimiento no revive la sesión. Continuar publica inmediatamente la extensión. Los cambios de estado solo se notifican cuando cambia el aviso o sus segundos.

Verificación: 13 pruebas de controlador con reloj controlado y 5 del cableado del hook con dobles de React/Auth pasan (scripts 25 y 26). Cubren aviso, expiración exacta, extensión, recarga, suspensión, múltiples pestañas, marcas inválidas, fallo de storage, desmontaje, ausencia/cambio de sesión, refresh y cierre manual. Los dobles no equivalen a montar React en navegador ni a probar Supabase Auth real.

Medición simulada: 6000 movimientos en 60 segundos generan cinco escrituras (una inicial y cuatro periódicas), cinco programaciones, un temporizador simultáneo y una notificación de estado. El código anterior ejecutaba una escritura y dos programaciones por evento además de la inicial; esa cifra anterior deriva del código, no de una medición en navegador. No se mide CPU ni dispositivos reales.

ESLint de los dos archivos de implementación pasa. Build pasa: principal 448.17 kB, sin advertencia JS >500 kB. Métricas del árbol local, no del candidato publicable. Logs y respaldo del hook anterior en `auditoria/pruebas/resultados/fase6/aud011/`.

Límites: entre pestañas hay hasta 15 segundos de demora al publicar actividad ordinaria; un cierre abrupto puede perder esa actividad pendiente. Si storage no está disponible el controlador conserva el reloj local, pero no garantiza sincronización entre pestañas. Falta comprobar el flujo en navegador autenticado y publicar selectivamente. No se modifica `src/lib/session.js` ni se acredita el cierre real de Auth ante fallos de almacenamiento. Sin SQL, Edge, commit, PR, despliegue, bases locales ni servidores iniciados en este bloque.

Siguiente bloque de implementación: AUD-007, planes e índices medidos. AUD-005 y AUD-011 siguen pendientes de verificación autenticada y publicación; fase 6 abierta. Fase 4 permanece en espera de soporte y fase 5 cerrada.

## Tercer bloque: índices medidos (AUD-007), 24 de septiembre de 2026

Revisadas las 21 FK y confirmadas las definiciones de los 58 índices contra metadatos actuales de producción. Recuperado el volumen local fase3 con 30 usuarios/perfiles y 1500 respuestas; sin regenerar fixtures. Se midieron 18 series antes/después (126 planes; seis repeticiones útiles por serie) sobre fixtures y tabla temporal sintética de 150000 filas. Todos los índices experimentales se revirtieron.

Decisión: **no crear índices con la carga actual**. Respuestas ocupa 32 KiB en producción; los conteos estadísticos son estimaciones discrepantes, no filas reales. Panel local: 4.775 → 4.586 ms, diferencia insuficiente para acreditar mejora material. La búsqueda selectiva por actividad mejora; unidad/libro solo muestran utilidad clara en el escenario sintético. Dos propuestas históricas ya duplicaban claves primarias. No se crea migración ni se modifica schema.sql.

Informe y disposición de cada FK: [AUD007_INDICES_MEDIDOS.md](AUD007_INDICES_MEDIDOS.md). Scripts 27/28 reproducen y resumen las mediciones locales. Evidencia en resultados/fase6/aud007. AUD-007 queda como optimización diferida por evidencia, a reevaluar con crecimiento o latencia observada; no se declara una corrección desplegada. Ninguna acción manual necesaria para este bloque. Siguiente bloque: AUD-008, renovación de URLs privadas sin interrumpir lecturas largas.

Entorno fase3 detenido al terminar AUD-007; CLI confirmó `backup: true`. Se conservan volúmenes y fixtures.

## Pausa solicitada — 24 de septiembre de 2026

Usuario pidió guardar memoria tras completar la revisión de AUD-007. Fase abierta y pausada; esperar nueva indicación. Retomar por AUD-008 (renovación de URLs privadas, aún sin implementación); no repetir los bloques verificados sin motivo. AUD-005/AUD-011 siguen locales y pendientes de navegador autenticado/publicación selectiva. AUD-007 queda diferido según evidencia. Restan AUD-010/012/014. Base fase3 detenida con backup:true, fixtures conservados. Sin acción manual pendiente; cuando se necesite intervención del usuario, explicar paso a paso. Fase 4 en espera de soporte y fase 5 cerrada.

## Cuarto bloque: recuperación de PDF (AUD-008), 26 de septiembre de 2026

Reanudación solicitada. Implementación local: PDF firmado por 300 s, revalidación de acceso mediante get_libro_completo antes de renovar, recuperación al volver con URL vencida y ante errores de carga, conservación de página, deduplicación de firmas y protección contra bucles. Portadas conservan 3600 s. No se renueva ni recarga periódicamente un PDF ya descargado.

Pasan 10 pruebas del controlador y 6 del servicio con dobles; build pasa. ESLint sin diagnósticos nuevos (persisten cinco errores y dos avisos previos). Navegador con PDF ficticio/Supabase simulado acredita recuperación y páginas 3–4 conservadas tras callback de error con reloj adelantado; no acredita caducidad Range real ni Auth/Storage reales. Navegador cerrado y servidor 5179 detenido. Sin bases ni cambios cloud.

Detalle: [AUD008_RENOVACION_PDF.md](AUD008_RENOVACION_PDF.md). Antes de publicar el TTL corto falta PDF grande con Range, autenticación/Storage reales y red lenta/suspensión. El TTL solicitado en frontend no acredita un máximo impuesto en servidor. AUD-008 sigue abierto. No corresponde pedir al usuario que pruebe estos cambios en producción todavía. Restan AUD-010/012/014 y verificación/publicación selectiva de los bloques locales.

## Pausa durante verificación y refactor, 26 de septiembre de 2026

Usuario pidió guardar memoria. AUD-014: logger saneado y sustitución de llamadas en 15 archivos; 3 pruebas pasan, falta verificación global. AUD-010: dos mecánicas y helpers extraídos, pendientes navegador/contratos/build. AUD-012 sin medición ni cambios. Copia completa de src anterior y manifiesto en resultados/fase6/cierre-local.

AUD-008: Auth local funcionó; preparación de PDF grande logró avanzar con índice temporal por incompatibilidad de colación del Storage instalado. No hay resultados de expiración real: prueba interrumpida. Harness preparado, no ejecutado. Al pausar se restauró la ruta del libro y se retiraron PDF/bucket temporales, todo confirmado en limpieza-storage.json. Retirada de política/índice y parada de Supabase NO confirmadas: verificar y completar limpieza al retomar, preservando volúmenes y fixtures. Detalle de nombres, rutas y precauciones en la primera entrada de AGENTS.md. No hay cambios de producción ni publicación.

## Candidato selectivo y verificación autenticada — 27–28 de septiembre de 2026

AUD-010 y AUD-014 verificados en alcance local: dos mecánicas extraídas, ocho casos funcionales en navegador y comparación AST sin cambios de contrato salvo diagnósticos; 44 llamadas con etiquetas estáticas y cuatro pruebas del logger. AUD-012 ahora separa el aviso de inactividad: seis renders de Libro en seis segundos pasan a cero, con contador activo. AUD-011 acredita aviso, extensión y cierre real de Auth local usando marcas de tiempo de prueba.

AUD-008 acredita Range real de Storage: 206 antes de caducar, 400 tras 305.16 s para firma solicitada por 300 s, 206 con firma nueva. PDF ficticio de 16.6 MB/32 páginas. En navegador, URL realmente caducada de 1 s introducida con metadatos futuros dispara renovación real y conserva páginas 3–4; demora de respuestas 1200 ms, permiso retirado y reintento manual comprobados. Esto aún no equivale a Range tardío emitido por PDF.js; esa prueba se está completando.

Candidato desde main 623804c, recuperado desde respaldo selectivo en /tmp/iabooks-fase6-retoma28: 34 archivos de implementación y pruebas idénticos al candidato anterior. Conserva rutas admin y fallback de portadas de main. Build pasa (principal 448.80 kB, Libro452.10 kB); ESLint35/24 en base frente 34/23 en candidato, cero nuevos. Treinta y ocho pruebas de scripts 25/26/29/30/31 y 60 declaraciones contrastadas por script32. Navegador autenticado del candidato: lector de alumno, panel docente, clase y respuestas; ocho casos de actividades; cero errores JS no controlados. El aviso heredado de React sobre key en props permanece.

No hay commit, PR ni despliegue. Consulta cloud de compatibilidad limitada a recuentos de rutas PDF:42 libros, 40 rutas Storage, 0 públicas y 0 absolutas. Sin modificaciones de producción. Detalles y límites en REVISION_PAQUETE_FASE6.md.

### Resultado final de la prueba Range, 28 de septiembre

Con el candidato y una configuración exclusivamente de harness (disableAutoFetch/disableStream, proxy para hacer visibles las cabeceras), PDF.js pidió páginas nuevas tras 327.244 s. Cuatro peticiones recibieron 400; una nueva firma recuperó fragmentos 206 y el lector mostró páginas 31–32, sin alerta ni errores JS. La configuración normal local no expone Accept-Ranges por CORS y descarga el PDF completo; el proxy/opciones no se incluyen en el producto. No se acredita suspensión real del SO ni máximo TTL impuesto en servidor.

La verificación local del candidato queda completada en ese alcance. Limpieza de PDF/bucket/activación/token y política/índice temporales confirmada; 30 usuarios/perfiles y 1500 respuestas preservados. Único ajuste posterior del candidato: retirar líneas vacías finales de ActivityCard; comparación contractual vuelve a pasar 60 declaraciones y git diff --check pasa. Archivo candidato 3503 líneas. Pendiente autorización de publicación y verificación del despliegue; fase6 continúa abierta.

Supabase local detenido con `backup: true`; navegadores y servidores 5181/5182 cerrados. Sin commit, PR ni despliegue.
