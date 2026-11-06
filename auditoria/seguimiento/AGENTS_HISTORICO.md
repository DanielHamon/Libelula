## Pausa solicitada — fase 6, 27 de septiembre de 2026

Usuario pidió guardar memoria durante preparación de candidato. NO continuar implementación ni pruebas hasta nueva indicación. Esta entrada sustituye los pendientes históricos del 26 en el alcance confirmado abajo.

- AUD-014 verificado localmente: 44 llamadas con etiquetas estáticas; logger solo códigos permitidos/status. Script 31 ahora pasa 4 pruebas, incluida inspección AST de todo src. Sin console de aplicación fuera del logger. No cubre logs internos de librerías.
- AUD-010: TarjetasVolteables/SeleccionMultiple y helpers conservan contratos; script 32 compara 62 declaraciones con respaldo del árbol local (3845 → 3539 líneas); 8 casos en navegador pasan: descubrimiento/callback único, bloqueo, selección correcta, agotamiento, chips correcto/agotado, error/reintento servidor sin claves de solución, respuesta guardada. Solo extracción gradual de dos mecánicas.
- AUD-012 implementado tras medición: nuevo InactivityNotice.jsx extrae hook/modal de AppRoutes. Libro autenticado bajo aviso de inactividad: 6 renders extra en 6 s antes, 0 después; reloj 4:25 → 4:19 continúa. No se memoizó ni se midió completar actividad/CPU/móviles. Evidencia retoma-27/renders.json y App-antes-aud012.jsx.
- AUD-011: navegador con Auth local confirmó aviso con marca de 25 min, extensión (oculta aviso, actualiza marca, conserva páginas 3–4), marca vencida de 30 min cierra Auth y redirige /login. No esperar 30 min reales; timestamps de prueba. Multiventana sigue cubierta por dobles, no nueva prueba real entre pestañas.
- AUD-008: prueba REAL completada en cierre-local/storage-expiry.json: PDF 16617748 bytes/32 páginas, Range inicial 206 (65536 bytes), misma firma solicitada 300 s rechazada HTTP400 tras 305.16 s, nueva firma Range206. Auth/Storage locales reales. Navegador cargó PDF y conservó páginas 3–4 ante URL realmente caducada de 1 s inyectada con metadatos futuros, respuestas demoradas 1200 ms, renovación real. Retirar activación local deniega renovación sin pedir firma; restaurar y reintentar recupera páginas. No acredita Range tardío del propio PDF.js, suspensión real ni máximo TTL impuesto por servidor.
- ÚLTIMA PRUEBA INTERRUMPIDA: preparado /tmp/iabooks-fase6-range-vite.mjs (5182), transforma Document SOLO en harness con disableAutoFetch/disableStream para forzar Range tardío. No hay resultado de esa prueba; no afirmar que inició navegador o servidor sin comprobar. No cambios de producción por este script.
- Build árbol local pasa (principal 448.31 kB, Libro 452.65 kB). ESLint comparativo contra respaldo cierre-local: 35→34 errores, 23 avisos, cero nuevos. ESLint selectivo nuevos componentes pasa.
- CANDIDATO SELECTIVO NO PUBLICADO: /tmp/iabooks-fase6-candidato, detached origin/main 623804c. Sin commit/PR/despliegue. Aplicados cambios de fase 6 sobre main, sin copiar otras modificaciones. App conserva rutas admin de main convertidas a lazy (NO AdminWorkspace local). libros.service conserva fallback de portadas de main; PDF ahora exige ruta privada. Consulta cloud SOLO recuentos: 42 libros, 40 rutas Storage, 0 públicas /, 0 absolutas; no datos personales ni SQL de escritura. Mantener esta diferencia con árbol local.
- Candidato: build pasa (principal448.80 kB, Libro452.10 kB). ESLint base35 errores/24avisos → candidato34/23; cero nuevos. Pruebas 25/26/29/30/31:13+5+10+6+4 pasan. Script32 candidato compara60 declaraciones contra main; 3815→3509 líneas. Los cuatro archivos activities son idénticos a árbol local. Respaldo selectivo persistente en retoma-27/candidato-respaldo + patch; logs copiados. NO usar copia completa del árbol sucio para publicar.
- Navegador candidato 5181: Auth y actividades cargan. Primer fallo PDF era worker fuera de fs.allow por node_modules compartido; config de prueba corregida y servidor reiniciado (68650). La comprobación final se interrumpió: NO acreditar PDF final candidato ni captura candidato-lector.png como éxito. Aviso React heredado de key expandida en props de ActivityContent al abrir actividades, no error nuevo; fuera de refactor contractual. Falta terminar verificación del candidato, revisar paquete/manifiesto y publicación autorizada.
- ENTORNO A LIMPIAR al guardar esta entrada: Supabase fase3 activo, bucket privado libros con aud008-prueba/lectura-grande.pdf y pdf_url fixture temporal. Se creó activación y token ficticios exclusivos para estudiante_a1 (fixtures originales tenían 0 activaciones); journal retoma-27/activacion-temporal.json. Restaurar pdf_url desde cierre-local/storage-restaurar.json, retirar objeto/bucket, SOLO asociación/token del journal, política authenticated_read_libros_authorized e índice storage.aud008_local_storage_current. Luego recuentos 30 usuarios/perfiles y1500 respuestas, stop con backup:true. No regenerar fixtures. Se documentará debajo la limpieza realmente completada.
- Credenciales solo locales: cierre-local/local-test.json, /tmp/iabooks-auditoria-fase3/status.json, logs de start, copia local-test en candidato; NO imprimir ni versionar. Evidencia ignorada retoma-27 conserva resultados. /tmp puede desaparecer.
- Fase6 abierta; AUD007 diferido por evidencia. Fase5 cerrada; fase4 espera soporte. Dar pasos concretos cuando usuario deba intervenir. No hay acción manual de producción pendiente durante pausa.

## Pausa solicitada — trabajo interrumpido de fase 6, 26 de septiembre de 2026

Usuario pidió guardar memoria y confirmó que desea pausar. NO continuar implementación ni pruebas hasta nueva indicación.

- AUD-014 en curso: nuevo src/lib/diagnostics.js limita logs a etiqueta estática, códigos permitidos y status HTTP; sustituidas 44 llamadas en 15 archivos (ver logs-modificados.json para cantidad exacta). Script 31_diagnosticos_fase6.test.mjs pasó 3 pruebas. No declarar bloque terminado: falta revisión global y build/ESLint comparativo del conjunto.
- AUD-010 en curso: extraídas TarjetasVolteables y SeleccionMultiple a src/components/activities/, junto con activityStyles.js y ActivityFeedback.jsx. Cuerpos conservados por extracción automática; ActivityCard mantiene API/export C. ESLint de archivos nuevos pasó; faltan pruebas de mecánicas en navegador, comparación contractual y build completo posterior. No afirmar extracción verificada funcionalmente.
- AUD-012 aún NO medido ni modificado. No memoizar por recuento de hooks. Idea pendiente, no implementada: medir renders al completar una actividad antes de estabilizar callbacks/memoizar.
- AUD-008 verificación real INCOMPLETA. Recuperado volumen fase3; Auth con docente ficticio funciona. Se creó bucket privado local y PDF ficticio grande, asociado temporalmente al libro de fixtures. La prueba de caducidad real de 300 s NO produjo storage-expiry-progreso.json ni storage-expiry.json; llamada interrumpida, no acreditar Range/caducidad/renovación reales. Harness autenticado preparado pero no se inició Vite 5180 ni navegador en este bloque.
- Storage local presentó 42P10 al cargar: API instalada VERSION=1.77.0 usa ON CONFLICT con name COLLATE C, índice conservado no coincide. Se creó índice temporal storage.aud008_local_storage_current y política authenticated_read_libros_authorized copiada de security_phase5.sql. Solo local; no solución aplicada a cloud. Postgres no es propietario; ajuste se aplicó con supabase_admin y credencial interna del contenedor sin imprimir valores.
- LIMPIEZA DE PAUSA PARCIAL CONFIRMADA: /tmp/iabooks-pausa-fase6.mjs restauró y verificó pdf_url original, eliminó PDF aud008-prueba/lectura-grande.pdf y bucket temporal libros. Cuatro true en cierre-local/limpieza-storage.json. La llamada posterior para DROP de política/índice y recuentos SQL fue interrumpida durante aprobación: NO confirmar ejecución. Comprobar existencia de ambos antes de retirarlos al retomar.
- ENTORNO LOCAL POSIBLEMENTE ACTIVO: Supabase fase3 arrancó con Auth/Storage; no se confirmó stop en esta pausa. Al retomar, verificar contenedores, terminar limpieza acotada y detener con backup:true conservando volúmenes. Fixtures antes: 30 usuarios/perfiles y 1500 respuestas. No regenerarlos. No eliminar otros objetos ni aplicar schema completo. No se modificó producción.
- Evidencia y respaldo de todo src anterior a este bloque: auditoria/pruebas/resultados/fase6/cierre-local/src-antes/, hashes-antes.json y logs-modificados.json. Comparar contra este respaldo para aislar cambios nuevos; el árbol ya tenía cambios ajenos. Scripts temporales copiados a cierre-local: iabooks-prepare-storage.mjs, iabooks-storage-expiry.mjs, iabooks-fase6-vite.mjs, iabooks-log-rewrite.mjs e iabooks-extract-activities.mjs. No ejecutar preparación de nuevo sin revisar estado.
- ARCHIVOS CON CREDENCIALES SOLO LOCALES, NO IMPRIMIR NI VERSIONAR: /tmp/iabooks-auditoria-fase3/status.json, start-fase6-real.log, cierre-local/local-test.json (usuario ficticio/password), copias de configuración. /tmp puede desaparecer; evidencia ignorada persiste. No se guardaron credenciales reales.
- Resultados anteriores de AUD-005/011/008 conservados; las últimas modificaciones NO tienen aún build y navegador completos. AUD-007 sigue diferido según evidencia. Fase 6 abierta; sin commit/PR/despliegue. Fase 5 cerrada; fase 4 espera soporte. Usuario prefiere pasos concretos cuando deba intervenir.

## Fase 6 reanudada — AUD-008 local parcial, 26 de septiembre de 2026

- Usuario pidió continuar; sustituye pausa del 24. Añadidos pdfAccess.js y LectorLibroPrivado.jsx; cambios selectivos en libros.service.js, Libro.jsx y LectorLibro.jsx (estos conservan cambios previos).
- PDF solicita firma por 300 s; portada permanece 3600 s. Renueva al entrar con URL caducada/próxima y ante fallos del PDF; vuelve a comprobar acceso por RPC antes de firmar. Conserva página, deduplica solicitudes, limita reintento automático y ofrece botón manual. No recarga periódicamente PDFs ya obtenidos.
- Pasan 10 pruebas del controlador + 6 del servicio con dobles, build; ESLint conserva cinco errores/dos avisos previos, cero nuevos. Navegador con PDF ficticio y Supabase simulado conserva páginas 3–4 tras error inyectado con reloj adelantado, denegación y reintento. No acredita Auth/Storage reales, PDF grande con Range ni límite TTL de servidor.
- Antes de publicar TTL corto: probar esas fronteras y red lenta/suspensión. AUD-008 permanece abierto; no pedir prueba en producción de cambios todavía locales. Informe AUD008_RENOVACION_PDF.md; FASE6/EVIDENCIA/CSV actualizados. Copias anteriores/diff exclusivo/logs/capturas/harness en resultados/fase6/aud008 ignorado.
- Navegador aud008 cerrado, servidor 5179 detenido salida 130. No bases, SQL, Edge, commit, PR ni despliegue; producción intacta. No publicar archivos completos del árbol sucio.
- Restan verificación real y publicación selectiva de AUD-005/011/008 y bloques AUD-010/012/014. AUD-007 diferido por evidencia. Fase 5 cerrada; fase 4 espera soporte. Dar pasos concretos cuando el usuario deba intervenir; no pedir credenciales ni URLs firmadas en chat.

## Pausa solicitada — fase 6, 24 de septiembre de 2026

Usuario pidió guardar memoria. Fase 6 abierta y pausada; no continuar hasta nueva indicación.
- AUD-005 y AUD-011 implementados solo localmente. AUD-011: 13 pruebas de reloj y 5 del hook con dobles React/Auth pasan; ESLint selectivo y build pasan. Falta navegador autenticado y candidato/publicación selectiva de ambos; no afirmar corrección en producción.
- AUD-007 revisado y medido: 21 FK, 58 índices, 18 series/126 planes. Decisión documentada: no añadir índices con la carga actual; reevaluar con crecimiento o latencia demostrada. No repetir mediciones sin cambios o nueva incertidumbre.
- Próximo bloque al reanudar: AUD-008, duración/renovación de URLs privadas sin interrumpir lecturas largas. Lectura preliminar: libros.service.js firma PDF/portada por 3600 s; LectorLibro recibe pdfUrl sin renovación. No se implementó ningún cambio de AUD-008 ni se decidió acortar TTL todavía. Después siguen AUD-010/012/014 y verificación/publicación selectiva.
- Referencias: FASE6.md, EVIDENCIA_FASE6.json, HALLAZGOS_ACTUALES.csv y AUD007_INDICES_MEDIDOS.md en auditoria/seguimiento/. Logs/planes/respaldo del hook en auditoria/pruebas/resultados/fase6/aud007 y aud011 (ignorados).
- Base local fase3 detenida con backup:true confirmado; 30 usuarios/perfiles y 1500 respuestas preservados. No regenerar fixtures. /tmp/iabooks-auditoria-fase3 puede desaparecer; no imprimir start-fase6.log, contiene claves locales. No se iniciaron servidores frontend ni navegador en los bloques AUD-011/007.
- Sin commit, PR, despliegue, migración persistente ni cambios Edge. Producción solo consultada por metadatos/estadísticas en AUD-007. Rama y cambios ajenos preservados; no publicar árbol completo.
- Preferencia del usuario: cuando necesite actuar, dar instrucciones concretas paso a paso. No hay acción manual pendiente ahora. Fase 5 cerrada; fase 4 espera soporte Supabase, no reanudar sin respuesta.

## Fase 6 — AUD-007 medido, 24 de septiembre de 2026

- Usuario pidió continuar y recibir pasos concretos cuando necesite actuar. AUD-007 revisado: 21 FK; 58 índices de producción conservan definiciones del catálogo previo. Consulta cloud solo de metadatos/estadísticas, sin datos de alumnos ni modificación de producción.
- Recuperado volumen fase3 (30 usuarios/perfiles, 1500 respuestas), sin regenerar fixtures. 18 series / 126 planes sobre fixtures y tabla temporal sintética de 150000 filas; índices experimentales revertidos. Scripts 27/28 y evidencia resultados/fase6/aud007.
- Decisión: NO añadir índices ahora. Respuestas ocupa 32 KiB cloud; estadísticas de filas discrepantes, no recuento exacto. Panel local 4.775 → 4.586 ms no acredita mejora material. Candidatos actividad/unidad/libro útiles al crecer; dos recomendaciones históricas duplicaban PK. AUD-007 queda optimización diferida por evidencia, no corrección desplegada.
- Informe AUD007_INDICES_MEDIDOS.md clasifica las 21 FK. FASE6.md/EVIDENCIA_FASE6.json/CSV actualizados. Sin migración, cambio de schema, commit, PR ni despliegue.
- Base local fase3 DETENIDA con backup:true; volúmenes y fixtures conservados. Config recuperada /tmp/iabooks-auditoria-fase3; start-fase6.log contiene claves solo locales, no imprimir.
- Siguiente bloque AUD-008 (URLs privadas y renovación); siguen AUD-010/012/014 y navegador autenticado/publicación selectiva de AUD-005/011. Fase 6 abierta; fase 5 cerrada; fase 4 espera soporte. No requiere acción manual del usuario este bloque.

## Fase 6 reanudada — AUD-011 local, 24 de septiembre de 2026

- Usuario pidió continuar fase 6; sustituye la pausa del 22 de septiembre. AUD-011 implementado localmente en useInactivityTimeout.js y nuevo inactivityTimer.js.
- Eventos actualizan memoria; un único reloj sincroniza cada 15 s y cada segundo durante aviso. Mantiene 30 min/aviso a 25 min; plazo absoluto conservado al recargar, sincronización entre pestañas, publicación al ocultar/salir/desmontar. Hook solo activo con sesión; refresh no renueva inactividad.
- Pasan 13 pruebas del controlador con reloj controlado y 5 del hook con dobles React/Auth, ESLint selectivo y build. Simulación 6000 movimientos/min: 5 escrituras incluida inicial, 5 programaciones y un timer simultáneo. Principal local 448.17 kB sin warning >500 kB.
- No equivale a navegador autenticado ni Auth real. Falta esa verificación y publicación selectiva para AUD-011/AUD-005. Logs y respaldo en resultados/fase6/aud011; seguimiento FASE6.md y EVIDENCIA_FASE6.json.
- Siguiente bloque: AUD-007 planes e índices medidos; siguen AUD-008/010/012/014. Sin commit, PR, despliegue, SQL, Edge, bases ni servidores iniciados. Cambios previos preservados. Fase 6 abierta; fase 5 cerrada; fase 4 espera soporte.

## Pausa solicitada — fase 6, 22 de septiembre de 2026

Usuario pidió guardar memoria después de revisar los pendientes. Fase 6 iniciada y abierta; no continuar trabajo durante esta pausa.
- Primer bloque AUD-005 implementado solo localmente: App.jsx usa lazy/Suspense y nuevo RouteLoadBoundary.jsx permite recuperar descargas fallidas. Principal 1385.07 → 447.37 kB; login observado 454614 bytes (aproximadamente 67 % menos que bundle previo). Build y ESLint selectivo pasan; no advertencia JS >500 kB. Métricas del árbol local con cambios anteriores, no del candidato publicable.
- Navegador: login renderiza; /admin y /libro/prueba sin sesión redirigen conservando redirect; descarga bloqueada muestra error; al retirar bloqueo y recargar vuelve el login. No se probaron sesiones autenticadas ni lector/paneles autenticados. No CAPTCHA ni formularios reales.
- Sin commit, PR, despliegue, SQL ni cambios Edge. Rama auditoria-saz y cambios ajenos preservados; App.jsx ya tenía modificaciones anteriores, no copiarlo completo a main. Origin/main local 623804cfe5def764a883371bfc294ccc295116e1.
- Referencias: auditoria/seguimiento/FASE6.md, EVIDENCIA_FASE6.json, HALLAZGOS_ACTUALES.csv. Logs, capturas, App previo y diff exclusivo en auditoria/pruebas/resultados/fase6/ (ignorado). Navegador fase6 cerrado confirmado; servidores 5177/5178 detenidos. Bases locales no iniciadas.
- Próximo bloque al reanudar: AUD-011 (reducir escrituras/reprogramaciones por actividad y verificar expiración, aviso, extensión, desmontaje y múltiples pestañas). Restan AUD-007 índices medidos, AUD-008 duración/renovación de URLs, AUD-010 extracción gradual de actividades, AUD-012 renders/efectos medidos, AUD-014 registros de consola. AUD-005 aún requiere navegación autenticada y candidato/publicación selectiva; no declarar corregido en producción ni fase 6 cerrada.
- Fase 5 cerrada: no repetir. Fase 4 sigue esperando respuesta de soporte Supabase; no reanudar sin respuesta.

## Fase 6 iniciada — 22 de septiembre de 2026

- Usuario autorizó iniciar fase 6. Primer bloque AUD-005 local: rutas lazy/Suspense y RouteLoadBoundary con recarga. Ver auditoria/seguimiento/FASE6.md y EVIDENCIA_FASE6.json.
- Build principal 1385.07 → 447.37 kB; login en navegador 454614 bytes; sin warning JS >500 kB. ESLint selectivo pasa. Login, redirecciones sin sesión y recuperación ante descarga bloqueada comprobados. No acredita sesiones autenticadas ni producción.
- Sin commit/PR/despliegue; App.jsx conserva cambios ajenos previos. No copiarlo completo a main. Siguiente bloque AUD-011; pendientes AUD-007/008/010/012/014 y verificación/publicación selectiva AUD-005. Fase 6 abierta.
- Fase 5 cerrada; fase 4 sigue en espera de soporte. No SQL/Edge cloud ni inicio de bases locales en este bloque.

## Pausa solicitada tras cerrar fase 5 — 21 de septiembre de 2026

Usuario pidió guardar memoria después de autorizar y completar la publicación de fase 5.
- Fase 5 cerrada en el alcance acreditado; no repetir integración, despliegue ni pruebas ya documentadas. PR #3 MERGED, merge 623804cfe5def764a883371bfc294ccc295116e1. Vercel Production READY dpl_J59TLA7cVpk37YqvbvMuYkmQPW2G. Ver detalle de cierre inmediatamente debajo.
- Referencias: auditoria/seguimiento/FASE5.md, EVIDENCIA_FASE5.json, HALLAZGOS_ACTUALES.csv y PAQUETE_FASE5.json. Los documentos locales de cierre son posteriores al commit integrado; el manifiesto identifica los bytes publicados.
- Se preservaron cambios ajenos, rama de trabajo y volúmenes locales detenidos. No hubo SQL ni cambios Edge en producción en fase 5. Navegador de verificación cerrado.
- Fase 4 continúa pendiente de respuesta de soporte Supabase; no reanudarla sin respuesta. Fase 6 no iniciada: esperar indicación del usuario. No interpretar esta solicitud de memoria como autorización para iniciar otra fase.

## Fase 5 cerrada y publicada — 21 de septiembre de 2026

Esta entrada sustituye pendientes históricos de integración/publicación de fase 5.
- Usuario autorizó integración. PR #3 https://github.com/DanielHamon/Libelula/pull/3 MERGED; head 4b9e9c02404b192d9b7ad00da5a85ddf80e94a3e, merge 623804cfe5def764a883371bfc294ccc295116e1. Origin/main actualizado; 19 archivos del paquete y hashes verificados. No cambiar la rama principal de trabajo ni publicar otros cambios locales.
- Vercel Production READY dpl_J59TLA7cVpk37YqvbvMuYkmQPW2G, https://libelula-alpha.vercel.app. Build cloud confirma main 623804c, un paquete añadido y cinco actualizados. Login observado sin errores JS; bundle index-JvGgHHn5.js. Logs nivel error del despliegue últimos 10 minutos: sin registros. No se probaron sesiones reales ni signup cloud.
- AUD-009/013/015 cerrados en alcance acreditado: dependencias publicadas y reconstrucción versionada con pruebas locales previas. No hubo SQL ni cambios Edge en producción. No ejecutar schema/snapshot ACL allí. Bases locales detenidas con volúmenes conservados; no repetir fixtures/pruebas ya acreditados.
- ESLint selectivo conserva 35 errores y 24 advertencias idénticos a main base; cero nuevos. Advertencia bundle permanece para fase 6.
- FASE5.md, EVIDENCIA_FASE5.json y HALLAZGOS_ACTUALES.csv actualizados localmente con cierre. Manifiesto corresponde al commit integrado; documentación local de cierre es posterior. Evidencia ignorada en resultados/fase5/publicacion-produccion.json y login-produccion.png.
- Fase 4 sigue en espera de soporte Supabase; no reanudar sin respuesta. Fase 6 no iniciada. Navegador fase5-produccion cerrado.

## Fase 5: paquete selectivo publicado en PR #3 — 21 de septiembre de 2026

- Reanudación solicitada por el usuario. PR borrador https://github.com/DanielHamon/Libelula/pull/3, rama auditoria-fase5-reconstruccion, commit 4b9e9c02404b192d9b7ad00da5a85ddf80e94a3e. Remoto verificado; main sigue 2e7e5497b7a7892963dab41d2d9e1ca4aff73505. Sin integración ni modificación de producción.
- Worktree limpio /tmp/iabooks-fase5-publicacion. Paquete de 19 archivos; PAQUETE_FASE5.json contiene hashes del commit (la documentación de seguimiento local tiene actualización posterior). REVISION_PAQUETE_FASE5.md clasifica los 14 bloques del schema y dependencias previas ya acreditadas, incluido texto de unidad confirmado en catálogo guardado. Los ocho hashes de implementación coinciden con evidencia anterior. No copiar otros cambios del árbol principal.
- Build del candidato pasa con node_modules compartido; no instalación limpia. ESLint del candidato falla: 35 errores y 24 advertencias IDÉNTICOS mensaje por mensaje a origin/main con mismas dependencias; cero diagnósticos nuevos. El ESLint aprobado anteriormente correspondía al árbol local con otras correcciones. No incorporar esas correcciones indiscriminadamente.
- Checks Vercel y Vercel Preview Comments del PR pasan. Preview no verificada funcionalmente. Sin repetir SQL/pruebas acreditadas; bases siguen detenidas con volúmenes conservados.
- Pendiente para cerrar fase 5: integración/publicación y verificación de producción. No ejecutar schema, migración local ni snapshot ACL en producción; trigger y objetos ya existen. Fase 4 permanece en espera de soporte.

## Pausa solicitada por el usuario — fase 5, 21 de septiembre de 2026

Usuario pidió guardar memoria tras interrumpir el cierre documental de fase 5. Trabajo local implementado y verificado; fase 5 permanece abierta por preparación/versionado/publicación selectiva. No hubo commits, PR ni modificaciones de producción en fase 5. Fase 4 sigue pendiente de respuesta de soporte Supabase (consulta enviada confirmada por usuario); no reanudarla sin respuesta.

- Referencias actuales: auditoria/seguimiento/FASE5.md, EVIDENCIA_FASE5.json y HALLAZGOS_ACTUALES.csv. Evidencias detalladas ignoradas por Git: auditoria/pruebas/resultados/fase5/.
- AUD-009: package-lock.json actualizado con versiones compatibles; package.json intacto. @humanfs/node 0.16.8, core 0.19.2, types 0.15.0, brace-expansion 1.1.21, js-yaml 4.3.2, nanoid 3.3.19. npm audit final 0; build y ESLint completos pasan; advertencia histórica de bundle fase 6.
- AUD-015: schema incluye on_auth_user_created en auth.users; prueba API Auth local crea exactamente un perfil estudiante, conserva nombre/email, rechaza escalada de rol/escuela/superadministrador vía metadatos y permite lectura propia. Producción ya tiene trigger, función y ACL correctos; no recrearlos allí.
- AUD-013: schema incorpora normalizar_orden_unidad_al_insertar y reserva de órdenes pendientes en admin_solicitar_accion_sensible_v2 según definiciones leídas de producción. Referencias public explícitas en tres políticas para restaurar con search_path vacío. ACL de reconstrucción explícitos de 86 objetos al final del schema y en audit_013_reconstruction_acl.sql. No ejecutar schema/snapshot ACL en producción.
- Nueva migración local audit_013_015_reconstruction.sql y verificador asociado; reaplicación pasa. Scripts 22_registro_fase5.mjs, 23_orden_fase5.sql y 24_catalogo_fase5.py. Último script compara metadatos guardados; todos pasan.
- Comparación final local limpio/producción: 9 triggers, 46 políticas, 25 tablas/vistas en atributos consultados, 58 índices, 59 funciones con definiciones completas, 7 defaults y 406 grants de roles de aplicación. Sin diferencias; solo normaliza CRLF/LF. No acredita igualdad completa de columnas/constraints, datos ni configuración de servicios gestionados; supabase_admin conserva residual de fase 4.
- RLS 24/24 en fixtures recuperados; unitarias paginación 6, entorno local 2, Edge 6 y CAPTCHA 9 pasan. Orden duplicado/nulo y reservas consecutivas pasan con ROLLBACK. La prueba de registro limpia elimina únicamente su usuario ficticio.
- Volumen fase3 recuperado conservó 30 usuarios/perfiles y 1500 respuestas; no se regeneraron fixtures. Se creó instancia nueva fase5 para instalación limpia. AMBAS DETENIDAS CON backup:true confirmado. Primer stop fase5 falló por prune; reintento recogido tras solicitud de memoria terminó correctamente. Configuraciones /tmp/iabooks-auditoria-fase3 y /tmp/iabooks-auditoria-fase5; pueden desaparecer. No imprimir status.json ni logs de start: contienen claves exclusivamente locales. Conservar volúmenes.
- README de pruebas actualizado: 01/02 históricos no deben repetirse sobre fixtures; 02 presupone provisión directa de admin y requiere bootstrap específico con trigger nuevo. No debilitar protección de cambio de rol para hacer pasar fixtures.
- Próximo paso: revisar paquete selectivo desde origin/main limpio para versionar/publicar fase 5; mantener cambios ajenos. Schema del árbol contiene cambios previos y NO se debe copiar sin revisar su diff/dependencias. No hay candidato selectivo de fase 5 ni PR preparado todavía. Revalidar solo lo necesario tras cambios; no repetir pruebas ya acreditadas indiscriminadamente.

## Fase 5 iniciada y verificada localmente — 21 de septiembre de 2026

- Usuario pidió iniciar fase 5. Correcciones locales completadas y verificadas; sin commit/PR/despliegue. Ver auditoria/seguimiento/FASE5.md y EVIDENCIA_FASE5.json. Fase 4 permanece en espera de soporte.
- AUD-009: solo package-lock.json actualizado; npm audit 0; build/ESLint pasan.
- AUD-015: añadido trigger auth.users al esquema; signup local crea perfil estudiante e ignora metadatos privilegiados. Producción ya tiene trigger; no recrearlo.
- AUD-013: esquema incorpora normalización/reserva de orden ya presentes en producción, referencias public explícitas en tres políticas y ACL de reconstrucción. Comparación local limpia vs producción pasa en alcance documentado, no es dump completo. No ejecutar schema ni snapshot ACL sobre producción.
- Recuperado volumen fase3 (30 usuarios/perfiles y 1500 respuestas), fixtures preservados. Nueva base descartable fase5 con esquema desde cero. RLS 24/24 en volumen recuperado; registro limpio y orden/reservas pasan. Configuraciones /tmp/iabooks-auditoria-fase3 y /tmp/iabooks-auditoria-fase5; claves solo locales no imprimir. Consultar estado de parada en EVIDENCIA_FASE5.json.
- Próximo paso: preparar publicación selectiva desde main limpio; preservar cambios ajenos. No copiar indiscriminadamente schema del árbol sucio; revisar su diff y dependencias de fases anteriores. Fase 5 abierta por versionado/publicación pendiente.

## Fase 4 pendiente de respuesta de soporte — 21 de septiembre de 2026

Usuario confirma envío de la consulta a Supabase y solicita dejar fase 4 pendiente hasta recibir respuesta. Consulta enviada sobre defaults gestionados de supabase_admin (AUD-006); no se proporcionó identificador de ticket. No hay respuesta del proveedor ni aceptación de riesgo.

CAPTCHA real (aceptación y rechazo de reutilización) y activación de alumno con acceso después de recargar acreditados mediante reporte manual del usuario. Alcance gestionado documentado en AUD006_ALCANCE_GESTIONADO.md. Fase 4 abierta y en espera; no repetir pruebas, publicaciones o migraciones ya acreditadas. Al recibir respuesta, revisar la propuesta y su impacto antes de cualquier cambio en producción. No avanzar automáticamente a otra fase.

## AUD-006: alcance gestionado documentado — 21 de septiembre de 2026

Documento formal: `auditoria/seguimiento/AUD006_ALCANCE_GESTIONADO.md`. Consulta lista para envío por el usuario: `auditoria/seguimiento/AUD006_CONSULTA_SOPORTE.md` (no enviada). Revisión basada en catálogo guardado del 16 de septiembre y documentación oficial; no nueva consulta cloud ni modificación de producción.

Documentación completada; residual supabase_admin abierto pendiente de respuesta del proveedor o decisión explícita e informada. No se declara aceptación de riesgo ni corrección completa. Fase 4 se mantiene abierta por ese residual; CAPTCHA y activación de alumno acreditados manualmente. Próximo paso del usuario: enviar consulta a soporte y aportar respuesta sin secretos. No repetir publicaciones, migraciones ni pruebas ya acreditadas.

## Activación legítima de alumno verificada — 21 de septiembre de 2026

- Usuario confirmó en producción la activación con una cuenta de alumno existente y un código válido para un libro aún no asociado: completó el procedimiento sin errores y pudo abrir el libro después de recargar.
- Evidencia manual reportada en conversación; no se consultaron datos personales, credenciales ni el código. No equivale a una activación docente en producción.
- CAPTCHA real aceptado y reutilización rechazada ya acreditados manualmente el mismo día.
- Único pendiente de cierre de fase 4: resolver o documentar formalmente el alcance gestionado de defaults supabase_admin (AUD-006). No se presume aceptación del riesgo ni corrección completa. Fase 4 permanece abierta; AUD-015 sigue en fase 5 y localhost está excluido.

## Reutilización CAPTCHA verificada manualmente — 21 de septiembre de 2026

Esta actualización sustituye el pendiente de reutilización de CAPTCHA de las entradas históricas.
- Usuario ejecutó la prueba en producción con Firefox y código ficticio: primera respuesta `{"valido":false,"motivo":"token_invalido"}`.
- Tras indicar reenviar la misma petición sin modificarla, el usuario reportó `{"valido":false,"motivo":"captcha_invalido"}`. Prueba manual positiva de aceptación inicial y rechazo de reutilización; no prueba unitaria simulada.
- Evidencia: respuestas comunicadas por el usuario en conversación; sin captura HTTP independiente, sin guardar el proof ni credenciales. No se observó directamente el código interno devuelto por Siteverify.
- Pendientes actuales: activación legítima en producción con caso concreto acordado y resolución o documentación formal de defaults gestionados supabase_admin (AUD-006). Fase 4 abierta; localhost excluido y AUD-015 reservado a fase 5.

## Pausa solicitada por el usuario — cierre pendiente de fase 4, 17 de septiembre de 2026

El usuario pidió guardar memoria. Al retomar, continuar con las verificaciones finales de fase 4; no repetir publicaciones ni configurar localhost.

Estado confirmado:
- PR #2 integrado en main (2e7e5497b7a7892963dab41d2d9e1ca4aff73505); frontend Production READY dpl_DrsTB7wEQronuqEbS5q5VocfgyCz; Edge prevalidar-token v3 ACTIVE publicada. Migraciones de cuota y ACL ya aplicadas y verificadas.
- CORS cloud correcto: origen permitido exacto, OPTIONS 204; orígenes ajenos rechazados 403 sin cabecera CORS. CAPTCHA ausente o inválido rechazado. Unitarias 6/6 + 9/9.
- Usuario probó producción en incógnito y sesión cerrada con código ficticio: «Código no válido», sin casilla visible aun recargando. Esto respalda aceptación de CAPTCHA automático y consulta de código, según el flujo publicado. Es evidencia manual reportada; no captura HTTP de prueba positiva. appearance=interaction-only explica ausencia de desafío visible.
- Localhost falla verificación; usuario decidió expresamente NO configurarlo. No constituye pendiente ni requisito de cierre.

Próximos pasos, en orden:
1. Probar reutilización de una prueba CAPTCHA real ya consumida y confirmar rechazo por servidor. Aún no realizado con proveedor real; no confundir con unitarias simuladas. Si requiere navegador del usuario, guiar sin pedir secretos ni publicar el proof en chat.
2. Completar una activación legítima en producción con código válido y comprobar asociación del libro. Activaciones de alumno/docente pasaron localmente; producción solo probó código ficticio. No consumir códigos ni crear cuentas reales sin acordar el caso concreto. No pedir códigos reales en chat.
3. Resolver o documentar formalmente el alcance de los defaults gestionados de supabase_admin (AUD-006). ACL de aplicación y defaults postgres están corregidos/verificados; postgres no puede administrar esos defaults gestionados. No afirmar corrección completa ni aceptación del riesgo por el usuario sin evidencia.
4. Actualizar FASE4.md, EVIDENCIA_FASE4.json y HALLAZGOS_ACTUALES.csv con resultados finales; cerrar únicamente el alcance acreditado. AUD-015 pertenece a fase 5 y no bloquea por sí mismo este cierre.

Preservar todos los cambios locales del usuario; no publicar árbol sucio ni aplicar schema completo. Respaldo Edge v2: auditoria/pruebas/resultados/fase4/edge-backup-2026-09-17/index.ts. Evidencia runtime: auditoria/pruebas/resultados/fase4/runtime-produccion-2026-09-17.json. Sin nuevos despliegues ni commits durante esta pausa. Fase 4 permanece abierta.

## Alcance de cierre confirmado — 17 de septiembre de 2026

Usuario descarta configurar localhost; no es requisito de cierre. Pendientes de fase 4: prueba de reutilización de CAPTCHA real, activación real y resolución o documentación formal del alcance gestionado de AUD-006 (supabase_admin). AUD-015 pertenece a fase 5, no al cierre de fase 4. CAPTCHA positivo respaldado por prueba manual en producción sin sesión/incógnito. CSV de hallazgos actualizado al despliegue real; no se declara fase 4 cerrada.

## Prueba manual del usuario — CAPTCHA, 17 de septiembre de 2026

- Usuario confirma en producción, ventana de incógnito y sesión cerrada: código ficticio devuelve «Código no válido», sin desafío visible aun recargando. Según el flujo publicado, este resultado respalda aceptación de CAPTCHA real y llegada a validación SQL. Evidencia manual reportada por usuario; no captura HTTP ni prueba de reutilización.
- Widget usa appearance=interaction-only: ausencia de casilla no significa ausencia de verificación.
- Localhost en incógnito/sesión cerrada muestra error de verificación de seguridad. Inspección local confirma site key real (no clave de prueba) y conexión a Supabase de producción. La lista por defecto de orígenes de Edge solo incluye los dos dominios Vercel; no localhost. Falta confirmar en Cloudflare autorización del hostname local/código específico del error; no dar por probado que esa sea la causa exacta del fallo del widget.
- Desarrollo local requiere configuración separada y coherente de widget/hostname y backend/CORS; sustituir solo la clave frontend por una de prueba no funciona contra Siteverify real de producción. No se modificaron claves, CORS ni despliegues.
- Siguen pendientes reutilización real, activación real y alcance gestionado AUD-006. AUD-015 sigue en fase 5.

## Reanudación y publicación de Edge — 17 de septiembre de 2026

Esta actualización sustituye los estados históricos de «solo local» y «sin PR» de fase 4.

- PR #2 https://github.com/DanielHamon/Libelula/pull/2 confirmado MERGED: head `d91b7d4cee0aa2e16bf01df35497df572ad61a75`, merge `2e7e5497b7a7892963dab41d2d9e1ca4aff73505`. Solo 12 archivos del paquete selectivo. origin/main actualizado; rama y cambios locales del usuario preservados.
- SQL ya aplicado en sesión anterior: evidencias migracion-red-produccion.json, migracion-acl-produccion.json y acl-verificacion-produccion.json; no se reaplicó. Verificación guardada OK con salvedad defaults supabase_admin.
- Frontend Production READY: `dpl_DrsTB7wEQronuqEbS5q5VocfgyCz`, https://libelula-alpha.vercel.app, bundle `index-JvGgHHn5.js`. CSP efectiva permite Turnstile en script-src/frame-src. Widget real visible.
- Al retomar, Edge versión 2 conservaba código anterior: CORS *, sin CAPTCHA. Se descargó respaldo y se publicó exclusivamente index.ts + handler.ts extraídos de origin/main, con hashes idénticos al manifiesto. CLI confirmó despliegue; listado confirma versión 3 ACTIVE, verify_jwt=false.
- Comprobaciones cloud posteriores: OPTIONS permitido 204 con origen exacto; POST sin CAPTCHA y con proof inválido devuelven captcha_invalido; POST y OPTIONS ajenos 403 sin Access-Control-Allow-Origin. Evidencia: auditoria/pruebas/resultados/fase4/runtime-produccion-2026-09-17.json. Ahora CAPTCHA se exige en servidor; esto NO acredita todavía aceptación de prueba válida.
- Unitarias repetidas: 6/6 Edge y 9/9 CAPTCHA. Secretos confirmados por listado de nombres/digests, sin leer valores reales.
- Navegador automatizado: Turnstile carga pero desafío falla; Continuar permanece bloqueado y ofrece reintento. No se obtuvo proof válido, no se creó cuenta ni se probó activación real. Se preguntó al usuario si completa el widget en navegador propio; respuesta pendiente. Falta aceptación Siteverify positiva y prueba de reutilización real. No afirmar fase 4 cerrada.
- Respaldo persistente de Edge v2: auditoria/pruebas/resultados/fase4/edge-backup-2026-09-17/index.ts (ignorado por Git). Reversión solo si se decide por regresión: restaurar Edge anterior antes de retirar widget y antes de revertir cuota; retira protección CAPTCHA.
- AUD-006 defaults gestionados supabase_admin y AUD-015 de fase 5 siguen pendientes. No repetir fases 1–3 ni publicar árbol sucio/schema completo.

# Convenciones del proyecto

## Turnstile configurado — 16 de septiembre de 2026

- Usuario confirmó widget creado y secreto guardado; entregó Site Key pública según la guía. Se confirmó por listado que `TURNSTILE_SECRET_KEY` existe en Supabase junto a `PREVALIDACION_TOKEN_HASH_SECRET`; no se leyó su valor ni se validó aún el par real mediante Siteverify.
- `VITE_TURNSTILE_SITE_KEY` configurada en `.env.local` sin reemplazar otras variables y en Vercel proyecto `libelula`, scope `daniel-hamon-s-projects`, **solo Production**, tipo Config pública. Se recuperó la variable y se confirmó igualdad con la proporcionada. No imprimir ni versionar archivos de entorno. Preview aún necesita hostname autorizado y variable propia.
- CLI Vercel vinculada en `/tmp/iabooks-captcha-config`, no en el repositorio. `production.env` contiene placeholders `[SENSITIVE]` para las dos variables Supabase y no sirve como entorno completo de compilación. No sobrescribir `.env.local` con él.
- Se actualizó referencia `origin/main` mediante fetch a `98fb208`; rama de trabajo sigue `auditoria-saz`, rama local main antigua. No reset ni cambio de rama del usuario.
- Candidato selectivo preparado por archive de origin/main en `/tmp/iabooks-fase4-candidato`. Manifiesto y hashes: `auditoria/seguimiento/PAQUETE_FASE4.json`. Conserva AUD-001 publicado. Frontend: TokenCaptcha, Activar, servicio tokens y **solo ampliación CSP** sobre vercel.json de main; NO copiar vercel.json entero del árbol sucio. Incluye scripts SQL y Edge de fase4 para revisión; no aplicar schema completo.
- Build del candidato pasa (JS `index-JvGgHHn5.js`, advertencia histórica de tamaño); usa node_modules local compartido y variables públicas locales. Sin commits, sin preview ni publicación de correcciones. Falta autorización de publicación selectiva conforme a regla anterior, y prueba con widget/secret reales tras preparar dominio/entorno. No declarar CAPTCHA activo ni fase4 cerrada. Defaults supabase_admin y AUD-015 mantienen sus pendientes.


## Retomado tras la pausa de CAPTCHA — 16 de septiembre de 2026

- Se completó ESLint pendiente (pasa) y build aislado. Se verificó widget real de prueba con CSP exacta de vercel.json servida sobre compilación estática local: carga y avance a registro, sin errores JS. Siteverify/SQL simulados; claves reales y despliegue siguen pendientes. Evidencias en `auditoria/pruebas/resultados/fase4/captcha/continuacion-csp.json`.
- Búsqueda de integración Cloudflare/Turnstile sin resultados. Se preguntó por disponibilidad/configuración del widget y claves; todavía sin respuesta. No pedir otra vez elegir CAPTCHA. No hay nuevos despliegues ni commits.
- Servidores locales de prueba detenidos: CSP 5176, Vite 5174 y harness 54329 (salida 130 por interrupción controlada). Navegadores captcha-csp y captcha cerrados. Supabase sigue detenido con respaldo previo.


## Pausa tras añadir CAPTCHA — 16 de septiembre de 2026

Esta entrada sustituye las menciones anteriores de elección CAPTCHA/red pendiente y el orden de publicación sin CAPTCHA.

- Usuario eligió explícitamente «bien, añade captcha» y después pidió guardar memoria para continuar. **CAPTCHA implementado solo localmente; ninguna corrección de fase 4 ni CAPTCHA publicada. No hay commit/PR de esta fase.** Fases 1–3 conservan su estado previo; no repetir sus despliegues.
- Proveedor elegido: Cloudflare Turnstile Managed. Se preguntó si ya existe un widget; no hubo respuesta. No se encontraron variables CAPTCHA en `.env`/`.env.local` (se inspeccionaron solo nombres). **Falta obtener/configurar un widget real, site key pública `VITE_TURNSTILE_SITE_KEY` y secreto Edge `TURNSTILE_SECRET_KEY`.** No pedir ni mostrar secretos en chat ni versionarlos. No volver a preguntar si quiere CAPTCHA: ya lo autorizó.
- Código: nuevo `src/components/TokenCaptcha.jsx`, cambios en `src/pages/Activar.jsx`, `src/services/tokens.service.js`, `supabase/functions/prevalidar-token/handler.ts`, `.env.example` y ampliación CSP específica de `vercel.json`. Preservar los numerosos cambios previos, especialmente los otros cambios de vercel/schema/frontend; no publicar el árbol completo.
- Widget en español, interacción solo cuando sea necesaria, timeout de carga, desmontaje seguro, vencimiento/error con reintento, prueba consumida y renovada tras cada envío. Solo prevalidación pública; RPC autenticadas y Supabase Auth no reciben CAPTCHA adicional en este paquete.
- Edge exige Siteverify antes de SQL, `success === true`, acción `prevalidar_token` y hostname autorizado/coincidente con Origin cuando existe. Sin secreto, sin prueba o si falla el proveedor, no consulta códigos. Timeout 10 s; sin caché/bypass. Cuerpo máximo **4096 bytes** (sustituye 2048) y proof máximo 2048 caracteres. Mantiene cuota compartida 100/IP/h tras CAPTCHA; no subirla silenciosamente.
- Pruebas: script 14 **6/6** y nuevo `21_captcha_fase4.test.mjs` **9/9**; logs en `auditoria/pruebas/resultados/fase4/captcha/`. ESLint de los tres archivos frontend pasó antes del último cambio solo de backend; se inició repetición sin recoger salida final (sesión 87153). Build pasó (advertencia histórica de bundle grande), antes de último ajuste del handler para errores de configuración del proveedor; no hubo cambios frontend posteriores.
- Navegador con widget real y site key pública de PRUEBA Cloudflare: código incorrecto → error/renovación → código ficticio válido → pantalla de registro. Handler real en loopback; **Siteverify y SQL simulados**, no equivale a validación de proveedor/DB reales. Callbacks vencimiento/error simulados probaron bloqueo y reintento. Escritorio/móvil y navegación a login comprobados; sin errores JS registrados. No se creó cuenta. Capturas en la carpeta captcha ignorada por Git.
- `18_runtime_edge_fase4.mjs` actualizado para exigir CAPTCHA ausente rechazado y prueba positiva opcional con `PREVALIDACION_TEST_CAPTCHA_TOKEN` fresco. **No se ejecutó después de este cambio**. Sigue pendiente la diferencia CORS de Kong local (impone `*`) frente a sonda cloud; no debilitar aserciones.
- Guía completa: `auditoria/seguimiento/CAPTCHA_FASE4.md`. Publicación revisada para evitar corte: preparar claves y preview; SQL cuota/ACL autorizado; frontend + widget + CSP; después Edge que exige CAPTCHA. Backend anterior tolera campo adicional pero no protege aún; clientes antiguos deben recargar cuando se active exigencia. Reversión: Edge antes de retirar widget; SQL cuota después. Mantener publicación selectiva y verificación final.
- El volumen Supabase de fase3 sigue detenido con respaldo confirmado antes de CAPTCHA. **Pueden seguir activos** el harness `/tmp/iabooks-captcha-ui.mjs` (puerto 54329, sesión 60090), Vite de prueba (127.0.0.1:5174, sesión 58393; env ficticia y site key pública de prueba) y navegador `agent-browser --session captcha`. Se interrumpió el turno antes de cerrarlos: comprobar y cerrar/reutilizar únicamente estos procesos al retomar. No copiar esa configuración a producción. `/tmp` puede desaparecer.
- Pendientes al retomar: conectar widget/keys reales sin exponer secreto; completar verificación real Siteverify y CSP de despliegue; publicar solo con alcance controlado. AUD-006 defaults `supabase_admin` sigue abierto; AUD-015 registro sin perfil sigue pendiente de fase 5. No declarar fase 4 cerrada.


## Continuación de fase 4 — 16 de septiembre de 2026

Entorno local detenido al terminar; CLI confirmó `backup: true`. Secreto HMAC de producción confirmado por nombre, sin consultar su valor.

- Correcciones todavía solo locales, sin despliegue de fase 4. Ver `auditoria/seguimiento/FASE4.md` y `EVIDENCIA_FASE4.json` para actualización que sustituye pendientes históricos.
- Sonda temporal repetida y retirada; listado final solo `prevalidar-token` v1. Dos XFF falsificados conservaron primera IP; alternativa x-real-ip/cf recibió 403 no JSON (inconclusa). Cloud respeta CORS exacto/ausencia para origen ajeno en sonda. No equivale a nueva Edge desplegada.
- Recuperado volumen fase3 (30 usuarios/perfiles, 1500 respuestas), runners y configuración en `/tmp/iabooks-auditoria-fase3`. No regenerar fixtures. Copia original Edge recuperada en `/tmp/iabooks-fase4-edge-backup`.
- IPv4 mapeada IPv6 normalizada; zonas IPv6 rechazadas. Schema y servicio tokens sincronizados con diseño provisional de cuota 100/IP/h. CAPTCHA/red preguntado de nuevo, aún sin respuesta; no asumir aprobación.
- Pasan unitarias 6/6, RLS 24/24, tasa 100/110, activación alumno/docente, ACL/defaults y reversión ACL transaccional (script 20), build. Script 19: signup crea usuario pero no perfil; AUD-015 sigue pendiente. Script 18 ahora FALLA correctamente porque Kong local impone CORS `*` en OPTIONS y ambos POST; cloud sonda no lo impone.
- Reversión ACL acotada preparada `audit_006_017_acl_rollback.sql`: reabre solo permisos previos, requiere decisión de emergencia. Defaults supabase_admin siguen pendientes, no cerrar AUD-006.
- Publicación debe ser selectiva y controlada: SQL cuota + ACL, Edge, luego servicio frontend; nunca árbol completo ni schema completo. Ver orden de reversión en FASE4.md.


## Memoria de fase 4 — pausa solicitada el 15 de septiembre de 2026

- Usuario pidió empezar fase 4 y luego guardar memoria para mañana. **Fase 4 abierta; ninguna corrección de esta fase desplegada en producción.** No confundir con fase 3, ya cerrada y publicada por PR #1 (`main` `98fb208`).
- Preflight de producción exitoso: `auditoria/pruebas/resultados/fase4/preflight-produccion.json` (consulta de solo metadatos). Seis objetos y dos secuencias conservan permisos anon; `generar_token_10()` ya estaba cerrado. `postgres` no es miembro de `supabase_admin`: no puede cambiar sus defaults gestionados. No afirmar AUD-006 cerrado sin resolver/documentar ese alcance.
- Implementación **provisional, solo local**: `supabase/audit_006_017_acl.sql`, `audit_006_017_acl_verify.sql`, `audit_002_network.sql`, `audit_002_network_rollback.sql`; Edge `supabase/functions/prevalidar-token/handler.ts` e `index.ts`. Schema canónico y frontend de tokens aún no actualizados por esta fase. No desplegar automáticamente los archivos pendientes.
- Diseño provisional sin CAPTCHA: cuota compartida 100/red/h; elimina el supuesto límite fiable por dispositivo, conserva la firma SQL y HTTP 200 para resultados de negocio. CORS por orígenes exactos configurables (`PREVALIDACION_TOKEN_ALLOWED_ORIGINS`), cuerpo máximo real 2048 bytes, timeout RPC. Se preguntó por anti-bot vs red: **usuario aún no respondió**; se avanzó con red como supuesto explícito, no aprobación de una opción.
- Identidad de red propuesta: primera IP de `x-forwarded-for`; ignora `x-real-ip`, `cf-connecting-ip`, dispositivo y user-agent. **Falta verificar que el borde desplegado sobrescriba XFF**; la documentación orienta pero no basta para afirmar resistencia a spoofing. Revisar también normalización IPv4/IPv6 antes de cerrar.
- Se desplegó temporalmente `audit-ip-fase4`, protegida por secreto aleatorio y devolviendo solo huellas, para comprobar cabeceras. Las peticiones desde este entorno fallaron HTTP 403 de Cloudflare «DNS points to prohibited IP». **No acredita caída general de producción ni resultado de la prueba IP.** CLI confirmó borrado de la sonda (`Deleted Edge Function`). Una consulta adicional de listado fue interrumpida; confirmar su ausencia al retomar. No se cambió `prevalidar-token` en producción.
- Copia exacta de la Edge original descargada en `/tmp/iabooks-fase4-edge-backup/supabase/functions/prevalidar-token/index.ts`. La sonda y secreto temporal están en `/tmp/iabooks-fase4-ip-probe`; no mostrar ni versionar secretos. Los proyectos consultados indican IAbooks ACTIVE_HEALTHY, ref `bexlhfydrnwfoeysgcyx`; el endpoint coincide con la configuración local.
- Se recuperó el volumen `iabooks-auditoria-fase3`, con 30 usuarios/perfiles ficticios y 1500 respuestas. Configuración `/tmp/iabooks-auditoria-fase3`; `run-local.mjs` recuperado carga claves sin mostrarlas. **Detenido al pausar, respaldo confirmado `backup: true`.** No regenerar fixtures ni aplicar schema completo encima. La base conserva ambas migraciones provisionales de fase 4; rollback de cuota y reaplicación se probaron. Hay intentos autenticados de pruebas, no borrarlos indiscriminadamente.
- Pruebas: script `14_edge_fase4.test.mjs` 6/6 (ejecutar `node archivo` para detalle); `15_defaults_fase4.sql` crea objetos en transacción y ROLLBACK: pasó; `16_tasa_fase4.mjs` 110 concurrentes, 100 admitidas y 10 bloqueadas, otra red independiente y RPC denegadas con firma real: pasó; `17_activacion_fase4.mjs` activación legítima y aislamiento entre escuelas: pasó. No prueba signup ni activación docente específica todavía.
- Matriz `03_matriz_rls.mjs`: 24/24 antes y después. Se ajustaron C01–C04/C06/C07 de «vacío» a «denegado»: solo vacío por RLS o SQL 42501, otros errores siguen fallando. Primera corrida posterior dio 18/24 porque las revocaciones generan 42501; ajuste metodológico documentado, no debilitamiento del control. ACL verify pasó tras revocar permisos heredados locales de las RPC de tokens, que ya estaban cerradas en producción.
- Runtime Deno/Supabase real: prueba inicial pasó POST permitido y rechazo de origen ajeno 403. **Gateway local devuelve OPTIONS 204 con CORS `*`**, aunque handler unitario devuelve origen exacto. Falta verificar cabeceras efectivas de POST permitido/rechazado y borde cloud. Script `18_runtime_edge_fase4.mjs` preparado con esas salidas; la última ejecución fue interrumpida y su resultado no se recuperó, repetir. No declarar AUD-004 cerrado.
- Evidencias persistentes en `auditoria/pruebas/resultados/fase4/` (ignoradas por Git): preflight, hashes iniciales, matriz antes/después y ACL local. Otras pruebas solo tienen salida de sesión; volver a capturarlas si se necesita evidencia completa. No hubo commits/PR de fase 4; preservar todos los cambios previos del usuario.
- Próximos pasos: confirmar sonda retirada; resolver acceso al endpoint para comprobar cabeceras y CORS; confirmar elección anti-bot/red; terminar pruebas pendientes y reversión ACL acotada, sincronizar schema sin perder cambios previos; contrastar catálogo antes/después y preparar publicación controlada. No repetir AUD-016/AUD-003 ni desplegar todo el árbol.


## Actualización de cierre de fase 3 — 15 de septiembre de 2026

Esta entrada sustituye los estados pendientes de publicación de las memorias históricas siguientes.
- AUD-001 publicado mediante PR #1, integrado con autorización expresa del usuario. Commit de cambio `0eba4a9`; integración a `main` `98fb208a592a526b0c1b40e250af64c832cb9b98`.
- Producción Vercel `dpl_H2jQG3kiW6j84FGq7YL1mNwJwpm7`, READY, https://libelula-alpha.vercel.app. Solo se publicaron los tres archivos de AUD-001.
- Usuario confirmó prueba docente exitosa en preview. Producción comprobada técnicamente: login visible, bundle `index-C7Q3y1gb.js`, sin errores JavaScript ni errores runtime registrados en ventana de diez minutos. No se repitió sesión docente en producción.
- Fase 3 cerrada con ese alcance; ver `auditoria/seguimiento/FASE3.md` y `EVIDENCIA_FASE3.json`. No repetir AUD-016/AUD-003 ni publicar los otros cambios locales. Siguiente paquete: fase 4 AUD-002/004/006/017.


## Memoria de corrección de auditoría — 14 de septiembre de 2026

- El usuario pidió analizar `auditoria/`, preparar un plan de corrección y ejecutar sus fases. Se completaron las fases 1 y 2. En fase 3, AUD-003 ya está desplegado y verificado; AUD-001 está implementado y probado localmente. El siguiente paso pendiente es **publicar el frontend de AUD-001 y verificarlo para cerrar la fase 3**. No repetir los despliegues de AUD-016 ni AUD-003 ni dar por corregidos los otros hallazgos.
- Referencias actuales: `auditoria/seguimiento/FASE1.md`, `FASE2.md`, `HALLAZGOS_ACTUALES.csv`, `EVIDENCIA_FASE1.json` y `EVIDENCIA_FASE2.json`. El informe y CSV originales de auditoría describen el commit `070ac28`; se conservaron como documentos históricos y no representan por sí solos el estado actual.
- **Fase 1 completada:** contraste de los 17 hallazgos con el árbol actual, consulta de solo lectura del catálogo de producción y reproducción local con datos ficticios. Se corrigieron errores metodológicos de los scripts. Producción no fue modificada en esta fase.
  - AUD-001 reproducido: 25 alumnos × 60 actividades, 1.500 respuestas existentes y solo 1.000 recibidas sin error. La URL real medida fue de 3.453 caracteres; la cifra histórica de 14.725 no se reprodujo y provenía de una medición defectuosa. `src/services/docente.service.js` sigue sin paginación y sin propagar los errores de ambas consultas de respuestas/progreso.
  - AUD-003: JOIN de la política evaluado 1.500 veces en local. Las variantes del script 07 conservan la misma política; sus tiempos no demuestran el efecto de una migración. Medir la corrección real antes/después, sin debilitar el aislamiento.
  - AUD-002: límite por dispositivo evadible en local, control bloquea en intento 11. No se demostró evasión por red ni se verificaron las cabeceras de IP del borde de producción.
  - Diferencias de catálogo: producción sí tiene `on_auth_user_created` y `normalizar_orden_unidad_al_insertar`, ausentes del esquema versionado. En instalación limpia se crearon siete usuarios y cero perfiles. No recrear a ciegas triggers existentes en producción.
  - Producción concede SELECT anónimo en seis objetos, frente a 25 en la instalación limpia; esto no implica acceso a filas por RLS. `generar_token_10()` no es ejecutable por anon/authenticated en producción, aunque sí en la reconstrucción local. Los ACL efectivos de producción no se reconstruyen fielmente con `schema.sql`: **no aplicar el esquema completo a producción**.
  - Sondeos RPC con `{}` y firma no resuelta son indeterminados, no prueba de protección. Hay 21 restricciones FK sin prefijo de índice apto según el criterio revisado; no crear índices automáticamente. npm audit registró tres altas y una moderada; dependencias aún sin actualizar. Compilación exitosa, JS principal de unos 1.382 kB sin carga diferida por rutas.
- **Fase 2 completada y desplegada en producción:** AUD-016 cerrado. Se aplicó `supabase/audit_016_profiles.sql` y pasó `supabase/audit_016_profiles_verify.sql`. La comparación de catálogos confirmó únicamente la sustitución de una política y la adición de una función; otros objetos y permisos preexistentes permanecieron iguales.
  - Se eliminó `profiles_authenticated_read`. Nueva política: `profiles_docente_alumnos_select`, apoyada en `public.puede_leer_perfil_de_alumno(uuid)`.
  - Lectura docente exige rol docente, alumno con rol estudiante inscrito en su clase y escuela coincidente entre docente, clase y alumno. Se conserva lectura histórica de clases inactivas, acceso al perfil propio y acceso global de admin/superadmin. La política limita filas, no columnas distintas por rol. No concede escritura docente sobre perfiles.
  - Helper `STABLE SECURITY DEFINER`, propiedad de postgres, `search_path=pg_catalog`, nombres cualificados, solicitante derivado de `auth.uid()`. EXECUTE revocado a PUBLIC/anon y concedido a authenticated/service_role. Evita recursión de RLS.
  - `supabase/schema.sql` actualizado con función, ACL y política, conservando los cambios previos del usuario. No hubo cambios de frontend.
  - Verificación: matriz general **24/24** y pruebas específicas **15/15**, incluyendo consultas docentes anidadas, administradores, cambio de escuela y retirada de inscripción. Se probaron reaplicación y reversión. Prueba específica: `auditoria/pruebas/scripts/08_perfiles_aud016.mjs`. Producción verificada por catálogo y aserciones SQL; no se iniciaron sesiones de usuarios reales ni se hicieron pruebas visuales de navegador.
  - Reversión de emergencia: `supabase/audit_016_profiles_rollback.sql`. Mantiene cerrada la exposición y conserva acceso propio/admin, pero temporalmente quita lectura docente de alumnos. **No restaura la política universal**.
- Plan restante: terminar la publicación y verificación del frontend de AUD-001 para cerrar fase 3; fase 4 tokens, CORS y permisos AUD-002/004/006/017; fase 5 reconstrucción, trazabilidad y dependencias AUD-015/013/009; fase 6 rendimiento/mantenimiento AUD-005/007/008/010/011/012/014. Los paquetes y criterios de verificación están en los informes de seguimiento.
- Entorno histórico de fases 1 y 2: instancia Docker `iabooks-auditoria-fase1`, configuración en `/tmp/iabooks-auditoria-fase1`, detenida con respaldo al terminar ambas fases. Al comenzar fase 3 ya no existía; usar el entorno nuevo descrito abajo. Contiene exclusivamente datos ficticios. No regenerar usuarios/datos sobre la base ya cargada; hay claves únicas. `run-local.mjs` en ese directorio carga las credenciales descartables sin mostrarlas. Si `/tmp` ya no existe, reconstruir según `auditoria/pruebas/README.md`.
- Evidencias detalladas y capturas previas: `auditoria/pruebas/resultados/fase1/` y `fase2/`, ignoradas por Git. Los JSON resumidos versionables no incluyen credenciales ni datos de alumnos reales. Los scripts de prueba activos solo admiten URL raíz de loopback. La CLI Supabase autenticada permite consultar el proyecto vinculado mediante `db query --linked --file ...`; reservar los scripts de creación/mutación de fixtures para local.
- Hay numerosos cambios previos del usuario sin commit, además de los cambios de auditoría. Se preservaron por comparación de hashes. No restaurarlos, descartarlos ni incluirlos indiscriminadamente en un commit. En estas fases no se creó ningún commit.

## Memoria de fase 3 — 14 de septiembre de 2026

- AUD-003: migración `supabase/audit_001_003_progress.sql` aplicada y verificada en producción. Solo cambiaron seis expresiones de políticas; otros objetos y permisos del catálogo permanecen iguales. Reversión: `audit_001_003_progress_rollback.sql`, conserva AUD-016.
- AUD-001: servicios paginados y errores visibles implementados y probados con Supabase local: 1.500 respuestas y 1.500 progresos. **Falta publicar el frontend**, por lo que la fase 3 aún no está cerrada. Vercel no estaba instalado/conectado; se sugirió su integración. No repetir la migración SQL innecesariamente.
- Evidencias: `auditoria/seguimiento/FASE3.md`, `EVIDENCIA_FASE3.json`. Matriz 24/24, alcance 12/12 y pares/roles 12/12; reaplicación y reversión probadas. Rendimiento local: respuestas 86,803 → 12,913 ms; progreso de actividades 423,132 → 20,863 ms. No equivalen a tiempos de producción.
- Frontend pendiente: `src/services/docente.service.js`, `src/services/lecturaPaginada.js` y `src/pages/DocenteRespuestaEstudiante.jsx`. Compilación exitosa; sin prueba visual de navegador. La pantalla propaga errores, permite reintentar e ignora cargas obsoletas. La paginación no garantiza una instantánea entre solicitudes con escrituras concurrentes. No publicar indiscriminadamente los numerosos cambios previos del usuario.
- El entorno anterior ya no existía. Se reconstruyó `iabooks-auditoria-fase3` en `/tmp/iabooks-auditoria-fase3`, solo con fixtures. Quedó detenida con respaldo confirmado (`backup: true`). No regenerar datos sobre ella. Scripts 10–13 permiten reproducir servicio, alcance, pares y planes. No hubo commits ni despliegue de frontend.

## Convenciones de contenido

- Los títulos de las unidades siempre deben seguir el formato `[emoji] Sección #` (por ejemplo, `⚽ Sección 1`); usar el subtítulo para el tema o los capítulos.
- Cuando el usuario mencione "el agente", se refiere al MCP `iabooksAdminLocal`. Usa las herramientas de ese MCP para atender la solicitud.
- Cuando el usuario pida "copiar actividades", usa como fuente la plantilla HTML ubicada en `Proyecto Plan Lector Libelula/GRADO N/Actividades Plataforma/nombre_libro.html`, identifica el grado y el archivo correspondientes al libro, adapta cada actividad al tipo compatible de la plataforma y créala con el MCP `iabooksAdminLocal` dentro de las unidades ya existentes, conservando sección, contenido y orden. Al final, verifica con el agente la cantidad y el orden de las actividades creadas.
- Durante la copia de actividades, crea una actividad únicamente si su mecánica ya existe en la plataforma o puede reproducirse fielmente con un tipo compatible y una mecánica equivalente. Si la actividad de la plantilla requiere una mecánica no implementada, o solo podría copiarse cambiando su funcionamiento por otro distinto, no la crees ni la sustituyas por una aproximación. Continúa con las demás actividades y entrega al final un reporte con la sección, posición, título y motivo de cada actividad omitida.
- Estado conocido de copias: `valeria_y_el_dibujo_que_desaparecio` tiene 29 actividades copiadas (10 en la sección 1, 10 en la sección 2 y 9 en la sección 3). Se omitió la actividad 1 de la sección 3, `¿De qué color es tu emoción? 🎨`, porque su mecánica de asignar colores independientes a varias emociones no está implementada en la plataforma y no tiene una equivalencia fiel.
- Estado conocido de copias de grado 2, verificado con `iabooksAdminLocal`:
  - `ana_y_el_color_esperado` tiene 27 actividades copiadas (7 en la sección 1, 6 en la sección 2, 5 en la sección 3 y 9 en la sección 4). Se omitió la actividad 1 de la sección 3, `¿Y si…? — El juego de la curiosidad`, porque combina escritura libre guiada y una pregunta evaluable en una sola mecánica sin equivalencia completa en la plataforma.
  - `del_miedo_al_arcoiris` tiene 24 actividades copiadas (7 en la sección 1, 6 en la sección 2, 4 en la sección 3 y 7 en la sección 4). Se omitieron: sección 2, posición 1, `¿Dónde siente el miedo Sara? 🗺️`, porque combina selección evaluable y reflexión escrita; sección 3, posición 1, `¡Respira como la abuela Rosario! 🌬️`, porque combina respiración animada y pregunta evaluable; y sección 3, posición 2, `Juego del relámpago y el trueno ⚡`, porque requiere medir interactivamente el tiempo entre relámpago y trueno.
  - `las_manos_que_ven` tiene 29 actividades copiadas (5 en la sección 1, 5 en la sección 2, 6 en la sección 3, 6 en la sección 4 y 7 en la sección 5). Se omitieron: sección 1, posición 5, `¿Cómo me sentiría yo?`, porque combina un medidor de nervios y una pregunta evaluable; y sección 2, posición 3, `¿Qué es el braille? 🤲`, porque combina una representación interactiva de braille y una pregunta evaluable.
  - `los_hombres_no_lloran` tiene 29 actividades copiadas (8 en la sección 1, 6 en la sección 2, 6 en la sección 3 y 9 en la sección 4), sin actividades omitidas.
  - `una_pizca_de_caos` tiene 25 actividades copiadas (7 en la sección 1, 6 en la sección 2, 5 en la sección 3 y 7 en la sección 4). Se omitieron: sección 2, posición 1, `El termómetro de la vergüenza 😳`, porque combina un medidor de intensidad y una pregunta evaluable; sección 3, posición 1, `Los pasos de Camilo 🥄`, porque requiere revelar un aprendizaje distinto tras cada paso acertado; y sección 4, posición 2, `El medidor de confianza de Camilo 💪`, porque combina una escala por niveles y una pregunta evaluable.
- En flujos del agente con acciones dependientes, ejecuta cada paso hasta que una aprobación pendiente del superadmin impida continuar. Espera como máximo un minuto por la aprobación y comprueba periódicamente si fue concedida.
- Si la aprobación no llega dentro de ese minuto, informa con precisión hasta qué punto avanzó el agente, qué acción quedó pendiente y qué operación posterior no pudo realizarse.

## Registro de libros con actividades (10 de septiembre de 2026)

Inventario consultado con `iabooksAdminLocal`: 26 libros con 736 actividades guardadas. Las cantidades por sección siguen el orden devuelto por el agente. Este inventario confirma existencia y cantidad; no declara completas las copias de plantillas salvo donde se documenta expresamente. Consultar el estado real antes de añadir actividades para evitar duplicados.

| Grado | Libro (ID) | Actividades por sección | Total |
|---|---|---|---:|
| 1 | `el_secreto_de_la_sombra` | 10 / 10 / 10 | 30 |
| 1 | `no_es_mi_turno` | 10 / 10 / 10 | 30 |
| 1 | `quiero_jugar_ya` | 10 / 10 / 10 | 30 |
| 1 | `roja_como_un_tomate` | 10 / 7 / 16 | 33 |
| 1 | `un_juego_para_dos` | 10 / 10 / 10 | 30 |
| 1 | `valeria_y_el_dibujo_que_desaparecio` | 10 / 10 / 9 | 29 |
| 2 | `ana_y_el_color_esperado` | 7 / 6 / 5 / 9 | 27 |
| 2 | `del_miedo_al_arcoiris` | 7 / 6 / 4 / 7 | 24 |
| 2 | `las_manos_que_ven` | 5 / 5 / 6 / 6 / 7 | 29 |
| 2 | `los_hombres_no_lloran` | 8 / 6 / 6 / 9 | 29 |
| 2 | `una_pizca_de_caos` | 7 / 6 / 5 / 7 | 25 |
| 3 | `cuando_alguien_deja_de_ser_invisible` | 5 / 5 / 5 / 4 | 19 |
| 3 | `el_avion_del_abuelo` | 5 / 9 / 5 / 5 | 24 |
| 3 | `el_mundo_de_lucia` | 5 / 7 / 8 | 20 |
| 3 | `ese_lugar_era_mio` | 5 / 6 / 3 / 5 | 19 |
| 3 | `mas_que_un_salon` | 2 / 5 / 8 / 3 | 18 |
| 4 | `cuando_emilio_llego` | 8 / 8 / 8 / 8 | 32 |
| 4 | `el_capitan_del_5` | 8 / 8 / 8 / 8 | 32 |
| 4 | `el_segundo_de_silencio` | 8 / 8 / 8 / 8 | 32 |
| 4 | `la_voz_que_te_pertenece` | 8 / 8 / 8 / 8 | 32 |
| 4 | `lo_que_lucia_no_podia_decir` | 8 / 8 / 8 / 8 | 32 |
| 5 | `bien_normal` | 8 / 8 / 8 / 8 | 32 |
| 5 | `cual_es_tu_parte` | 8 / 8 / 8 / 8 | 32 |
| 5 | `el_olor_a_cafe_con_canela` | 8 / 8 / 8 / 8 | 32 |
| 5 | `lo_que_escucho_cuando_se_callo` | 8 / 8 / 8 / 8 | 32 |
| 5 | `lo_que_no_sabia_de_nicolas` | 8 / 8 / 8 / 8 | 32 |

Los libros activos de grado 6 `espejo_de_sofia`, `habitacion_12b` y `senal_del_faro` aún no tienen unidades ni actividades. Los registros inactivos `fase_5`, `mi_nuevo_libro`, `libro_6`, `libro-test` y `roja` tampoco tienen actividades; no se incluyen en los totales anteriores.

## Flujo acordado para grado 5 (memoria del 9 de septiembre de 2026)

- Trabajar un libro a la vez con `iabooksAdminLocal`. Leer su PDF completo antes de redactar metadatos, unidades y actividades; este flujo crea actividades originales basadas en el cuento, no copia plantillas HTML.
- Primera fase: enviar exactamente cinco solicitudes al superadmin: una edición de metadatos (descripción acorde a la historia, emoji principal y los cuatro colores del panel) y cuatro creaciones de unidades. Conservar los demás metadatos. Usar descripciones de unidad de una sola frase breve y subtítulos claros. Variar bastante la paleta entre libros, manteniendo colores que combinen y buena legibilidad.
- Avisar al usuario cuando las cinco solicitudes estén pendientes y detenerse. En este flujo el usuario pidió expresamente aprobarlas y luego decir «adelante»; no crear actividades antes de esa señal. Esta pausa explícita prevalece sobre la espera automática de un minuto indicada para otros flujos.
- Segunda fase, tras «adelante»: comprobar con el agente que las cuatro unidades existan y estén ordenadas; crear ocho actividades por unidad (32 por libro). Variar bastante las mecánicas dentro de cada libro y entre libros, usando tipos compatibles y su contrato real en `src/components/ActivityCard.jsx`. Combinar comprensión literal e inferencial, vocabulario, reflexión y creación; distinguir ejemplos inventados de hechos del cuento y respuestas abiertas de evaluables.
- Preparar y confirmar cada actividad secuencialmente para conservar el orden. Si una llamada tarda o falla, comprobar qué quedó guardado antes de reintentar para evitar duplicados. Al finalizar verificar con el agente contenido, cantidad y orden 1–8 en cada unidad.
- Para leer PDFs privados existe el comando `npm run report:pdf -- --book-id ID --include-text --output DIRECTORIO`, que descarga y extrae el texto sin exponer credenciales. Leer todas las páginas y revisar anomalías; no formular preguntas que dependan de contradicciones editoriales del PDF.
- Estado completado y verificado: `bien_normal` tiene metadatos aprobados, cuatro unidades y 32 actividades, ocho por unidad en orden 1–8. No repetir su creación. Protagonista: Joel; historia sobre ocultar un examen, contar la verdad y cuidar la confianza familiar. El PDF tiene una mención aislada a Tomás e inconsistencias de calendario que no se usaron como preguntas.
  - Emoji: 🌱. Paleta: acento `#4D7C0F`, encabezado `#14532D` → `#4D7C0F`, fondo `#FAFAF0` (verde bosque, oliva y marfil).
  - Unidad 1: `bien_normal_ufb0b6c60`, «📚 Sección 1», capítulos I–III.
  - Unidad 2: `bien_normal_u45e0c937`, «🌨️ Sección 2», capítulos IV–V.
  - Unidad 3: `bien_normal_u2dddfabe`, «🤝 Sección 3», capítulos VI–VII.
  - Unidad 4: `bien_normal_u09097901`, «🌱 Sección 4», capítulos VIII–IX.
  - Se usaron 13 tipos: seleccionMultiple, ordenarEventos, emparejar, completarPalabras, verdaderoFalso, clasificacionCategorias, completarMapa, reflexionPersonal, dibujoLibre, escribirCarta, tarjetasVolteables, ordenarPalabras y acrostico.
- Completado y verificado el 10 de septiembre de 2026: `cual_es_tu_parte` tiene metadatos aprobados y 32 actividades, ocho por sección en orden 1–8, con 15 tipos de actividad. Se verificó que todo el contenido guardado coincide con el preparado. No repetir su creación.
  - Emoji ⚽; acento `#1D4ED8`, encabezado `#172554` → `#1D4ED8`, fondo `#EFF6FF`.
  - `cual_es_tu_parte_u2296b5e3`: «⚽ Sección 1», capítulos I–III.
  - `cual_es_tu_parte_u5e85b8b7`: «💬 Sección 2», capítulos IV–V.
  - `cual_es_tu_parte_uf8dba4dd`: «🤝 Sección 3», capítulos VI–VII.
  - `cual_es_tu_parte_uaf0dc9cd`: «🌟 Sección 4», capítulos VIII–IX.
  - PDF leído completo (16 páginas); mezcla los nombres Alejandra/Sofía y contiene inconsistencias de minutos y marcador que no se usaron como preguntas.
- Grado 5 completado: verificación final con `iabooksAdminLocal` el 10 de septiembre de 2026 de los cinco libros (`bien_normal`, `cual_es_tu_parte`, `el_olor_a_cafe_con_canela`, `lo_que_escucho_cuando_se_callo`, `lo_que_no_sabia_de_nicolas`). Cada uno tiene cuatro secciones en orden 1–4 y ocho actividades en orden 1–8 por sección: 160 actividades en total. Todos los títulos de sección siguen `[emoji] Sección #`. No repetir creaciones.
- `lo_que_no_sabia_de_nicolas`: completado y verificado el 10 de septiembre de 2026. Metadatos y cuatro secciones aprobados; 32 actividades, ocho por sección en orden 1–8, con 16 tipos distintos. Se verificó que el contenido guardado coincide con el preparado.
  - PDF completo leído: 15 páginas, capítulos 1–6. Sebastián descubre los prejuicios que tenía sobre Nicolás, su nuevo compañero con síndrome de Down. Nicolás registra estadísticas de fútbol, necesita apoyo en lectura y fracciones, asiste como público al partido y ofrece enseñar su sistema a Sebastián. No generalizar las características del personaje a todas las personas con esa condición. Erratas menores del PDF no usadas como contenido.
  - Emoji 🔎; acento `#0F766E`, encabezado `#134E4A` → `#0F766E`, fondo `#F0FDFA`.
  - `lo_que_no_sabia_de_n_ucaf41d94`: «🔎 Sección 1», capítulos 1–2.
  - `lo_que_no_sabia_de_n_u9e9bbde9`: «🧩 Sección 2», capítulo 3.
  - `lo_que_no_sabia_de_n_ue3721e4c`: «⚽ Sección 3», capítulo 4.
  - `lo_que_no_sabia_de_n_udc7a5a0a`: «🤝 Sección 4», capítulos 5–6.
- `lo_que_escucho_cuando_se_callo`: completado y verificado el 10 de septiembre de 2026. Metadatos y cuatro secciones aprobados; 32 actividades, ocho por sección en orden 1–8, con 16 tipos distintos. Se verificó que el contenido guardado coincide con el preparado. No repetir su creación.
  - PDF leído completo: 18 páginas, capítulos I–IX. Daniela aprende de su abuela Consuelo a escuchar; acompaña a Mariana ante una posible mudanza a Medellín y a su papá ante un posible cambio laboral. Al final Mariana se queda porque su papá no obtiene el trabajo. La primera página contiene propuestas editoriales de cambio de título: no se aplicaron, se conservó el título del catálogo.
  - Emoji 👂; acento `#7E22CE`, encabezado `#4C1D95` → `#7E22CE`, fondo `#FAF5FF`.
  - `lo_que_escucho_cuand_u37b7b211`: «🍽️ Sección 1», capítulos I–III.
  - `lo_que_escucho_cuand_u832bc445`: «💬 Sección 2», capítulos IV–V.
  - `lo_que_escucho_cuand_u4afb8c86`: «👂 Sección 3», capítulos VI–VII.
  - `lo_que_escucho_cuand_u8bf2a5dd`: «🧶 Sección 4», capítulos VIII–IX.
- `el_olor_a_cafe_con_canela`: completado y verificado el 10 de septiembre de 2026. Metadatos y cuatro unidades aprobados; 32 actividades, ocho por sección en orden 1–8, con 17 tipos distintos. El contenido guardado coincide con el preparado. No repetir su creación.
  - PDF completo leído: 25 páginas, capítulos I–VIII; incluye ejercicios editoriales, pero las actividades de plataforma serán originales. Lorena y su abuela Rosa mantienen su vínculo tras la mudanza de Rosa a Pasto; escritura, llamadas y tradición del café. Evitar inconsistencias de días en la llamada del sábado, el papel que alterna recetas y la cronología de los ejercicios impresos. La página 1 marcada para revisión solo contiene el título.
  - Emoji ☕; acento `#92400E`, encabezado `#78350F` → `#A16207`, fondo `#FFFBEB`.
  - `el_olor_a_cafe_con_c_ueb636868`: «☕ Sección 1», capítulos I–II.
  - `el_olor_a_cafe_con_c_uf57a3a6e`: «📓 Sección 2», capítulos III–IV.
  - `el_olor_a_cafe_con_c_u8e0c609f`: «☎️ Sección 3», capítulos V–VI.
  - `el_olor_a_cafe_con_c_ue8e9679c`: «🌼 Sección 4», capítulos VII–VIII.
