# Estado de auditoría de seguridad — IAbooks

Última actualización: 2026-07-27

## Fase 1 — Completada

Se cerraron y verificaron las vulnerabilidades críticas de autenticación,
autorización, activación de tokens, contenido licenciado y Storage.

### Cambios aplicados

- El registro siempre crea perfiles con rol `estudiante`.
- Los usuarios solo pueden actualizar su propio nombre.
- `rol`, `escuela_id` y `grado_id` no pueden modificarse desde el cliente.
- El cambio de rol se ejecuta mediante una RPC administrativa.
- Un administrador no puede degradar su propia cuenta.
- El sistema conserva al menos un administrador.
- Las RPC de activación derivan usuario y correo desde la sesión autenticada.
- Solo docentes asignados a una escuela pueden crear clases.
- Se corrigió el aislamiento por escuela y grado al unirse a clases.
- `clase_libros` tiene RLS para docente, estudiante y administrador.
- Unidades y actividades ya no tienen acceso anónimo.
- `get_libro_completo` comprueba licencia o rol autorizado.
- El bucket privado `libros` autoriza cada objeto según el acceso al libro.
- `progreso_clase` utiliza `security_invoker`.
- Se añadió rate limiting de verificación para usuarios autenticados.
- El frontend muestra acceso denegado en lugar de un libro vacío.
- El panel administrativo permite cambiar roles con confirmación y auditoría.

### SQL aplicado en Supabase

- `supabase/security_phase1.sql`
- `supabase/security_phase1_cleanup.sql`
- `supabase/security_phase1_token_hotfix.sql`
- `supabase/security_phase1_admin_role_hotfix.sql`

No volver a ejecutar estos archivos salvo que se prepare una instalación nueva o
se determine expresamente que una migración es idempotente.

### Verificaciones superadas

- Estudiante abre un libro activado.
- Libro sin licencia devuelve `403`.
- Un usuario sin licencia no genera URL firmada ni descarga el PDF.
- Usuario autorizado genera URL firmada y descarga el PDF correctamente.
- Activación de tokens de libro funciona.
- Docente inicia sesión y crea clases.
- Docente asigna libros a una clase.
- Estudiante se inscribe en una clase.
- Administrador cambia roles y los cambios aparecen en `admin_logs`.
- RLS, firmas RPC, `search_path`, permisos anónimos y Storage fueron verificados.
- Build de producción finaliza correctamente.

## Pendiente — Aprobación reforzada de acciones sensibles

Se evaluó añadir aprobación del superadministrador por correo y/o MFA para:

- Conceder rol de administrador.
- Eliminar escuelas o libros.
- Modificar licencias o relaciones comerciales.
- Ejecutar otras acciones administrativas de alto impacto.

Recomendación acordada:

- Superadministrador con MFA obligatorio.
- Tabla de acciones pendientes.
- Aprobación desde una sesión autenticada.
- Correo únicamente como notificación o código de un solo uso.
- Edge Function para envío de correo y secretos fuera del frontend.
- Auditoría de solicitante, aprobador, estado anterior y estado nuevo.

Este punto queda deliberadamente pendiente. No forma parte de la fase 2.

## Fase 2 — Completada

Reforzar RLS, integridad y consistencia del flujo de datos:

1. La base deriva unidad y libro desde la actividad; no confía en IDs del cliente.
2. La RPC comprueba la licencia antes de escribir progreso o respuestas.
3. Progreso, actividad y respuesta se guardan en una RPC transaccional.
4. Claves foráneas compuestas impiden combinaciones inconsistentes de IDs.
5. La lectura docente exige clase propia, misma escuela y libro asignado.
6. Las escrituras directas en las tablas sensibles quedaron revocadas.
7. Los servicios propagan los errores de lectura y escritura.
8. Se añadieron preflight y verificaciones estructurales.

### SQL aplicado en Supabase

1. `supabase/security_phase2_preflight.sql`
2. `supabase/security_phase2.sql`
3. `supabase/security_phase2_verify.sql`

El preflight no devolvió inconsistencias. La migración se ejecutó sin errores y
la verificación confirmó que `registrar_progreso_actividad` usa
`SECURITY DEFINER` con un `search_path` seguro.

### Verificaciones superadas

- Un estudiante sin licencia no puede guardar progreso ni respuestas.
- Las claves foráneas rechazan actividad, unidad y libro manipulados.
- `authenticated` no puede escribir directamente en `progreso`,
  `actividad_progreso` ni `respuestas`.
- La RPC no recibe usuario, unidad ni libro elegidos por el cliente.
- Un docente no puede consultar respuestas de otra escuela.
- Un docente no puede consultar respuestas de estudiantes ajenos a sus clases.
- Un docente sí puede consultar respuestas de un estudiante de su clase cuando
  el libro está asignado.
- La inscripción entre escuelas diferentes devuelve `escuela_incorrecta`.
- La inscripción con un grado diferente devuelve `grado_incorrecto`.
- Un estudiante no puede consultar respuestas ni progreso de otro estudiante.
- Un estudiante con licencia puede guardar correctamente desde el frontend.
- La escritura legítima conserva la relación actividad–unidad–libro y actualiza
  respuesta, actividad completada y progreso general con el mismo timestamp.

## Estado local

El repositorio contiene cambios de frontend y migraciones todavía sin commit.
La carpeta `respuestas supabase/` está excluida mediante `.gitignore` porque
puede contener correos, UUID y otros datos de auditoría.

## Fase 3 — Completada

Objetivo: proteger acciones administrativas sensibles mediante un
superadministrador, MFA obligatorio, aprobación explícita y auditoría
transaccional del lado del servidor.

Superadministrador inicial previsto:
`superlibelulaadmin@gmail.com`.

### Prerrequisitos verificados

- Pantalla de inscripción y desafío MFA mediante TOTP.
- Comprobación del nivel de sesión `aal2`.
- Redirección al desafío después del login cuando existe un factor verificado.
- Acceso a la configuración MFA desde el menú administrativo.
- La cuenta `superlibelulaadmin@gmail.com` tiene rol `admin`.
- El factor TOTP está enrolado y un nuevo inicio de sesión alcanzó `aal2`.

### Implementado localmente

- Registro explícito de identidades de superadministrador.
- Cola de acciones administrativas pendientes con estados auditables.
- Solicitud administrativa mediante una RPC con tipos permitidos.
- Aprobación o rechazo exclusivo del superadministrador.
- Comprobación de `aal2` dentro de la RPC, no solo en el frontend.
- Ejecución de la acción y auditoría en una única transacción.
- Concesión de `admin`, desactivaciones, relaciones escuela–libro y tokens
  protegidos mediante aprobación.
- Revocación de escrituras directas sobre relaciones comerciales y tokens.
- Bloqueo por trigger de desactivaciones directas.
- Pantalla administrativa de aprobaciones y acceso a verificación MFA.
- Preflight y verificación estructural:
  - `supabase/security_phase3_preflight.sql`
  - `supabase/security_phase3_verify.sql`

### SQL aplicado en Supabase

1. `supabase/security_phase3_preflight.sql`
2. `supabase/security_phase3.sql`
3. `supabase/security_phase3_verify.sql`

### Verificaciones superadas

- El preflight confirmó perfil administrador y factor TOTP verificado.
- Los once indicadores estructurales devolvieron `true`.
- Las cuatro funciones privilegiadas usan `SECURITY DEFINER` y un
  `search_path` fijo.
- Una solicitud rechazada no ejecutó la acción ni creó el token.
- Una solicitud aprobada desde una sesión `aal2` ejecutó la acción.
- El token aprobado apareció en el panel.
- La solicitud, el rechazo y la aprobación quedaron registrados en auditoría.

### Ajuste de alcance posterior

- Los administradores pueden crear tokens de libro y tokens docentes sin
  aprobación del superadministrador.
- La generación se ejecuta mediante RPC administrativas con validación y
  auditoría transaccional; el `INSERT` directo sobre `tokens` continúa revocado.
- Crear, editar, reordenar y eliminar actividades continúa siendo una operación
  directa del administrador y no requiere aprobación.
- La revocación de tokens y las demás acciones sensibles mantienen el flujo de
  aprobación.
- La política definitiva usa una lista permitida: solo tokens y actividades
  pueden mutarse sin aprobación.
- Crear o cambiar escuelas, crear o editar libros y sus metadatos, activar o
  desactivar contenido, y crear, editar, borrar o reordenar unidades requiere
  aprobación del superadministrador con `aal2`.
- Los permisos directos de escritura sobre `escuelas`, `libros` y `unidades`
  fueron revocados al rol `authenticated`; la aprobación se ejecuta mediante
  RPC transaccional.
- Los archivos de portada/PDF pueden subirse como material en preparación, pero
  no afectan un libro publicado hasta aprobar los metadatos que los referencian.
- SQL del ajuste:
  - `supabase/security_phase3_admin_direct_operations.sql`
  - `supabase/security_phase3_admin_direct_operations_verify.sql`
  - `supabase/security_phase3_approval_allowlist.sql`
  - `supabase/security_phase3_approval_allowlist_verify.sql`

## Segunda auditoría integral — 2026-07-27

Se volvió a analizar el código, las migraciones, las dependencias y una parte
del Data API anónimo. No se realizaron intentos destructivos ni se modificaron
datos reales durante la auditoría.

Hallazgos principales:

1. Inserción directa en `libro_activaciones`, que permitía eludir los tokens.
2. Un administrador podía degradar al superadministrador sin aprobación.
3. Storage permite cargas con `upsert`, con riesgo de sobrescribir contenido
   publicado sin pasar por aprobación.
4. Las soluciones de actividades llegan al cliente y la corrección se recibe
   desde el frontend.
5. Los administradores pueden insertar directamente registros de auditoría.
6. La validación anónima de tokens no tiene rate limiting efectivo.
7. Metadatos internos de escuelas y libros son consultables anónimamente.
8. Dependencias con avisos de seguridad pendientes de actualización.
9. Payloads JSON y dibujos Base64 sin límites suficientes.
10. Funciones privilegiadas anteriores con `search_path` mejorable.
11. Códigos de clase cortos y enumerables.
12. Endurecimiento pendiente de cabeceras y despliegue en Vercel.

Plan acordado:

- Fase 4: contención crítica de activaciones y roles.
- Fase 5: Storage y publicaciones seguras.
- Fase 6: integridad académica y límites de abuso.
- Fase 7: tokens, clases y exposición pública.
- Fase 8: auditoría, dependencias y endurecimiento final.
- Validación integral de regresión antes del despliegue.

## Fase 4 — Completada

Objetivo: cerrar el bypass de activaciones y obligar a aprobar los cambios
administrativos de rol.

### SQL aplicado en Supabase

1. `supabase/security_phase4_preflight.sql`
2. `supabase/security_phase4.sql`
3. `supabase/security_phase4_verify.sql`

### Cambios aplicados

- `authenticated` y `anon` no pueden insertar, actualizar ni borrar
  `libro_activaciones`.
- La política anterior de escritura se sustituyó por una política exclusivamente
  `SELECT` para las activaciones del usuario autenticado.
- `libro_activaciones.token_id` es obligatorio.
- La migración comprueba que las activaciones existentes correspondan al
  usuario, libro, tipo y estado de su token.
- Todos los cambios administrativos hacia o desde el rol `admin` crean una
  acción pendiente.
- Un trigger impide atravesar la frontera de rol `admin` sin una aprobación
  concreta, superadministrador activo y sesión MFA `aal2`.
- No se puede degradar al último administrador ni al último
  superadministrador activo.
- La activación legítima de un token docente conserva el cambio
  `estudiante -> docente`.
- `superadmin_resolver_accion_v3` ejecuta los cambios protegidos.
- `superadmin_resolver_accion_v2` permanece como alias compatible para el
  frontend anterior, pero redirige al resolvedor V3.
- Los resolvedores internos y V1 no son ejecutables por `authenticated`.
- Las funciones nuevas usan `SECURITY DEFINER` con
  `search_path=pg_catalog, public, auth`.

### Verificaciones superadas

- Los once indicadores de `security_phase4_verify.sql` devolvieron `true`.
- Solo existe `libro_act_own_select`, de tipo `SELECT`, para
  `libro_activaciones`.
- Existe exactamente un superadministrador activo con rol `admin`.
- Solicitar un cambio de rol no lo aplica inmediatamente.
- Rechazar la solicitud conserva el rol anterior.
- Aprobarla con superadmin y MFA aplica el cambio.
- La protección del último superadministrador funciona.
- La activación legítima de tokens de estudiante y docente continúa operativa.
- El frontend compila correctamente con `npm run build`.
- El lint específico de los archivos modificados no presenta errores.

### Preferencia operativa para las fases siguientes

Siempre que sea seguro, entregar un único archivo SQL por fase que:

1. Ejecute el preflight.
2. Aborte automáticamente si encuentra inconsistencias.
3. Aplique la migración dentro de una transacción.
4. Ejecute el postflight.
5. Devuelva una única fila resumen con indicadores `true/false`.

Separar el preflight únicamente cuando aparezcan datos ambiguos que requieran
una decisión humana.

## Fase 5 — Completada

Primera entrega local implementada:

- Las cargas administrativas dejaron de usar `upsert`.
- Cada archivo recibe una ruta staging inmutable y aleatoria, aislada por
  usuario: `staging/<usuario>/<portadas|pdfs>/<uuid>.<ext>`.
- El frontend valida extensión, MIME, tamaño y firma básica del contenido.
- `supabase/security_phase5.sql` unifica preflight, migración y postflight.
- Las políticas de Storage solo permiten insertar archivos staging válidos.
- Los clientes no reciben una política `UPDATE`, por lo que no pueden
  sobrescribir objetos.
- La tabla `archivos_libro` registra propietario, tipo, tamaño, vencimiento y
  estado de publicación.
- Una ruta staging solo pasa a `publicado` cuando la modificación del libro se
  ejecuta dentro del flujo aprobado del superadministrador.
- Una solicitud rechazada marca sus archivos como rechazados y reduce su
  vencimiento a 24 horas.
- Los administradores pueden eliminar sus temporales; los rechazados o
  caducados quedan disponibles para limpieza mediante Storage API.

### SQL aplicado en Supabase

1. `supabase/security_phase5.sql`

El archivo unificado ejecutó preflight, migración y postflight correctamente.
Los cinco indicadores devolvieron `true`:

- Fase 5 aplicada.
- Inserción staging restringida.
- Sobrescritura del bucket bloqueada.
- Registro de archivos activo.
- Publicación limitada al flujo aprobado.

### Cierre y verificación final

- Los objetos UUID heredados y la carpeta `staging/` fueron eliminados.
- `security_phase5_final_verify.sql` devolvió todos sus indicadores en `true`:
  - bucket privado;
  - carga exclusiva del superadministrador con MFA `aal2`;
  - borrado con protección de archivos en uso;
  - sobrescritura bloqueada;
  - staging limpio;
  - acceso condicionado por estado y asignación escolar;
  - panel con estado de disponibilidad habilitado;
  - Fase 5 lista para cerrar.
- Se superaron las pruebas funcionales de creación, aprobación, rechazo,
  sustitución, duplicados, MFA, acceso autorizado/no autorizado, concurrencia,
  auditoría, desactivación y retiro de la escuela.

La limpieza periódica mediante Edge Function dejó de ser necesaria: la
biblioteca definitiva escribe directamente en `portada/` y `pdfs/`, rechaza
nombres duplicados y elimina mediante Storage API únicamente por acción
explícita del superadministrador.

### Ajustes derivados de pruebas funcionales

- `security_phase5_access_and_staging_hotfix.sql` exige libro activo y
  asignación vigente para acceder, muestra el estado deshabilitado en el panel
  y corrige el registro de rutas.
- `security_phase5_superadmin_file_library.sql` cambia las nuevas cargas a una
  biblioteca directa en `portada/` y `pdfs/`, conserva el nombre original,
  rechaza duplicados y permite al superadministrador eliminar únicamente
  archivos que no estén en uso.

## Fase 6 — En progreso

Objetivo: proteger la integridad académica y limitar payloads y escrituras
abusivas.

### Bloque 6A — Aplicado y verificado

- `supabase/security_phase6.sql` unifica preflight, migración y postflight.
- Las respuestas JSON quedan limitadas a 64 KiB tanto en el cliente como en la
  base de datos.
- Se rechazan Data URL/Base64 dentro de las respuestas.
- Los campos de una actividad quedan limitados a 256 KiB.
- Cada estudiante puede registrar hasta 30 operaciones de progreso por minuto.
- La tabla interna del rate limit no es consultable ni modificable por clientes.
- La actividad de colorear conserva el lienzo en el dispositivo y guarda en la
  base únicamente una marca pequeña de finalización.
- Los lienzos Base64 históricos de colorear se convierten automáticamente a
  una marca de finalización; cualquier Base64 en otro campo hace abortar el
  preflight para evitar una limpieza ambigua.

`supabase/security_phase6.sql` se ejecutó correctamente. El postflight devolvió
todos los indicadores en `true` y convirtió seis dibujos históricos.

### Bloque 6B — Aplicado, validación de datos pendiente

- La evaluación server-side cubre inicialmente selección múltiple,
  verdadero/falso, completar palabras, ordenar palabras, ordenar eventos,
  identificar, selector de emoción, clasificación, emparejar y sopa de letras.
- `p_es_correcta` se conserva temporalmente en la firma por compatibilidad, pero
  la función lo ignora y persiste únicamente el resultado del evaluador.

`security_phase6b_server_evaluation.sql` fue aplicado correctamente y sus
cuatro indicadores estructurales devolvieron `true`. Antes de ocultar las
soluciones se ejecutará `security_phase6b_data_verify.sql`, una comparación
agregada y de solo lectura contra las respuestas históricas.

La comparación histórica fue superada: todos los tipos evaluables devolvieron
cero diferencias, incluidas las trece respuestas de selección múltiple. Los
tipos reflexivos o artísticos permanecen deliberadamente sin calificación
automática.

### Pendiente para cerrar la fase

- Extraer las soluciones de los campos visibles para estudiantes.
- Adaptar el feedback de cada tipo de actividad al resultado devuelto por la
  RPC y ejecutar las pruebas de regresión.

### Bloque 6C — Contrato preparado localmente

- `security_phase6c_attempts.sql` añade una RPC transaccional de intentos.
- La base cuenta los intentos y aplica `maxIntentos` entre 1 y 10.
- Solo se completa y persiste una actividad objetiva cuando la respuesta es
  correcta o se agotan los intentos.
- El estudiante solo puede leer su contador; no puede modificarlo directamente.
- La RPC comprueba rol, licencia, tamaño, frecuencia y evaluación server-side.
- La RPC anterior permanece activa hasta terminar la migración del frontend.
- Selección múltiple usa ya la RPC de intentos en las vistas del estudiante.
- `security_phase6c_selection_redaction.sql` retira `esCorrecta` del contenido
  estudiantil de selección múltiple y bloquea el `SELECT` directo sobre
  actividades para estudiantes.

La migración frontend de selección múltiple superó las pruebas funcionales:
acierto inicial, error seguido de acierto, agotamiento incorrecto, persistencia
tras recarga, actualización del progreso y ausencia de errores visibles.

`security_phase6c_selection_redaction.sql` fue aplicado correctamente. Los
cinco indicadores confirmaron redacción de soluciones, bloqueo de lectura
directa estudiantil, acceso de personal y disponibilidad de las RPC seguras.

La adaptación local de verdadero/falso usa la RPC de intentos, evita feedback
por afirmación antes de verificar y conserva la vista previa administrativa.
`security_phase6c_true_false_redaction.sql` queda pendiente de aplicar después
de la prueba funcional previa a la redacción.

La prueba funcional previa a la redacción de verdadero/falso fue superada sin
errores, incluyendo los flujos de acierto, reintento, agotamiento y recarga.

`security_phase6c_true_false_redaction.sql` fue aplicado correctamente. Sus
cuatro indicadores confirmaron la eliminación de `esVerdadero`, la conservación
de las afirmaciones y la ausencia de regresiones en selección múltiple.

La prueba posterior confirmó que `esVerdadero` ya no aparece en el contenido
estudiantil. El diagnóstico agregado verificó que las coincidencias restantes
de `esCorrecta` pertenecen exclusivamente a `identificar`,
`lineaTiempoEmocional` y `selectorEmocionColor`, todavía pendientes de migrar.
Verdadero/falso queda cerrado.

La adaptación local de `identificar` usa la RPC de intentos y entrega únicamente
los textos seleccionados. El feedback estudiantil es general y no identifica
qué opción concreta era correcta. La redacción de `esCorrecta` queda preparada
en `security_phase6c_identify_redaction.sql`, pendiente de la prueba funcional
previa.

`security_phase6c_identify_redaction.sql` fue aplicado correctamente y mantuvo
las protecciones de selección múltiple y verdadero/falso. El defecto descubierto
con opciones vacías se corrige en el editor y mediante el trigger de
`security_phase6c_identify_validation.sql`.

`security_phase6c_identify_validation.sql` fue aplicado correctamente. Los
cuatro indicadores confirmaron el bloqueo de textos vacíos, duplicados y
configuraciones sin respuesta correcta o sin distractor.

La prueba de creación reveló que el trigger invocaba el normalizador interno
con permisos del cliente. `security_phase6c_identify_validation_hotfix.sql`
cambia únicamente el trigger a `SECURITY DEFINER` con `search_path` fijo, sin
exponer la función auxiliar a `authenticated`.

Las pruebas finales de `identificar` fueron superadas: el editor bloquea textos
vacíos y duplicados, exige respuesta correcta y distractor, el estudiante puede
fallar y acertar después de la redacción, y `get_libro_completo` ya no expone
`esCorrecta` para este tipo. `Identificar` queda cerrado.

La adaptación local de `selectorEmocionColor` envía cada selección como intento
server-side y no usa `esCorrecta` en el flujo estudiantil. La redacción queda
preparada en `security_phase6c_emotion_selector_redaction.sql`, pendiente de la
prueba funcional previa.

La prueba funcional previa de `selectorEmocionColor` fue superada: acierto
inicial, error seguido de acierto, agotamiento, persistencia, progreso y
feedback sin revelar la tarjeta correcta.

`security_phase6c_emotion_selector_redaction.sql` fue aplicado correctamente.
Sus cinco indicadores confirmaron la redacción del selector, conservación del
contenido visual y ausencia de regresiones en los tres tipos ya protegidos.

La prueba posterior fue superada y el diagnóstico confirmó que
`selectorEmocionColor` ya no expone `esCorrecta`. Solo resta la exposición
explícita de `lineaTiempoEmocional`. El selector queda cerrado.

El evaluador local de Fase 6B se amplió para `lineaTiempoEmocional`: compara
cada selección con la opción correcta del momento correspondiente e incluye
pruebas que demuestran que ignora los booleanos enviados por el cliente.

La adaptación local de `lineaTiempoEmocional` permite seleccionar una emoción
por momento y verificar el conjunto mediante la RPC de intentos. El feedback
estudiantil es general y no marca soluciones individuales. La redacción queda
preparada en `security_phase6c_emotional_timeline_redaction.sql`.

La prueba funcional previa de `lineaTiempoEmocional` fue superada: acierto,
reintento, agotamiento, persistencia, progreso y feedback sin revelar soluciones
individuales.

`security_phase6c_emotional_timeline_redaction.sql` fue aplicado correctamente.
Sus seis indicadores confirmaron la redacción anidada y la conservación de las
cuatro protecciones anteriores.

La prueba posterior de `lineaTiempoEmocional` fue superada. El diagnóstico
agregado de redacción devolvió cero filas: ningún tipo estudiantil expone ya
claves `esCorrecta` o `esVerdadero`. Queda cerrado el grupo de soluciones
booleanas; continúan pendientes respuestas embebidas, órdenes, categorías y
correspondencias.

Como mejora de continuidad, las vistas de libro y unidad guardan en
`sessionStorage` la pestaña, sección y posición vertical para restaurarlas al
recargar durante la misma sesión del navegador.

La adaptación local de `completarPalabras` envía únicamente los textos escritos
al evaluador server-side, oculta el banco de soluciones en modo estudiantil y
usa feedback general. La redacción de texto y arreglo de respuestas queda
preparada en `security_phase6c_complete_words_redaction.sql`.

La prueba funcional previa de `completarPalabras` fue superada: acierto,
reintento, agotamiento, varios espacios, persistencia, progreso y conservación
de todos los campos de entrada.

`security_phase6c_complete_words_redaction.sql` fue aplicado correctamente.
Sus cuatro indicadores confirmaron la sustitución de respuestas embebidas, la
conservación de la plantilla y la ausencia de regresiones anteriores.

La prueba posterior fue superada. `get_libro_completo` devuelve únicamente
marcadores `___` en el texto y el arreglo de respuestas, sin palabras originales,
y el flujo de error, acierto, persistencia y progreso continúa funcionando.
`CompletarPalabras` queda cerrado.

Las adaptaciones locales de `ordenarEventos` y `ordenarPalabras` verifican el
orden mediante la RPC server-side. La redacción preparada elimina orden, IDs
secuenciales y frase correcta, y reordena los bancos públicos para que la
posición original del JSON no revele la solución.

La prueba funcional previa de ambos tipos fue superada: acierto, reintento,
agotamiento, botones, arrastre, persistencia y frases con palabras repetidas.

`security_phase6c_ordering_redaction.sql` fue aplicado correctamente. Sus
cuatro indicadores confirmaron la eliminación de metadatos de orden y frase
correcta, el reordenamiento de bancos y la conservación de redacciones previas.

Las pruebas posteriores fueron superadas: ambos tipos permiten ordenar, fallar
y corregir; conservan progreso y persistencia; `get_libro_completo` no contiene
`orden`, IDs secuenciales ni `fraseCorrecta`, y los bancos públicos no conservan
la secuencia original. `OrdenarEventos` y `OrdenarPalabras` quedan cerrados.

Las adaptaciones locales de `clasificacionCategorias` y `emparejar` envían al
servidor la distribución completa. En emparejar, el flujo estudiantil ya no
valida cada clic: permite construir todas las relaciones y devuelve únicamente
feedback general después de verificar.

Las pruebas funcionales de ambos tipos fueron superadas: acierto, error seguido
de corrección, agotamiento, persistencia y progreso después de recargar. La
interfaz de `emparejar` dibuja hilos entre las relaciones seleccionadas, permite
anularlas individualmente y conserva esos hilos después de concluir y recargar.

`security_phase6c_matching_classification_redaction.sql` fue aplicado
correctamente. `Emparejar` ya no publica objetos `{izquierda, derecha}`:
`get_libro_completo` devuelve dos bancos independientes y desacoplados,
`elementosIzquierda` y `elementosDerecha`. En `clasificacionCategorias` se
conservan categorías e ítems, pero se retiran las claves que revelan la
categoría correcta.

La consulta final
`security_phase6c_matching_classification_final.sql` devolvió sus seis
indicadores en `true`: ambos tipos cerrados, soluciones públicas ocultas,
evaluación interna operativa, helpers internos bloqueados y redacciones
anteriores conservadas. `Emparejar` y `ClasificacionCategorias` quedan cerrados.

`SopaLetras` fue migrada a la RPC transaccional y superó las pruebas de trazos
incorrectos, finalización, progreso, persistencia, ratón, pantalla táctil y
ausencia de `esCorrecta` en la petición. Su banco de palabras permanece público
porque forma parte del enunciado. El diagnóstico final devolvió sus seis
indicadores en `true`; una actividad histórica vacía fue eliminada antes del
cierre. `SopaLetras` queda cerrada.

Una auditoría posterior de todo el catálogo encontró tres tipos académicos que
no estaban incluidos en el inventario inicial de 6B: `crucigrama`,
`separarSilabas` y el modo con respuestas de `acrostico`. También se detectó la
ruta heredada `/libro/:libroId/unidad/:unidadId/actividad/:actividadId`, que
permite completar la implementación antigua de `sopaLetras` sin usar la RPC de
intentos. Estos cuatro puntos deben cerrarse antes de declarar finalizada la
fase 6. Los demás tipos pendientes registran participación o expresión abierta
y no contienen una respuesta académica única que redactar.

La adaptación local inicial de `crucigrama` ya envía únicamente IDs, letras y
palabras escritas, usa intentos server-side y mantiene evaluación local solo en
la vista previa administrativa. La evaluación y redacción se prepararon en
`security_phase6c_crossword.sql`: las palabras correctas se sustituyen por su
longitud, conservando coordenadas, dirección y pistas.

`security_phase6c_crossword.sql` fue aplicado correctamente y devolvió sus cinco
indicadores en `true`. Las pruebas posteriores cubrieron acierto inicial, error
y corrección, agotamiento, persistencia, progreso, navegación, borrado y cruces.
La petición no contiene letras ni palabras correctas y `get_libro_completo`
conserva únicamente IDs, longitudes, coordenadas, direcciones y pistas. La vista
previa administrativa se actualiza en tiempo real y la escritura sustituye
letras existentes al avanzar. `Crucigrama` queda cerrado.

`security_phase6c_syllables.sql` y su complemento de feedback seguro fueron
aplicados correctamente. Las pruebas posteriores cubrieron acierto, corrección,
cantidad incorrecta, agotamiento, persistencia, mayúsculas, tildes y espacios.
Cada separación y cantidad recibe un estado visual independiente sin devolver
la solución, la petición no contiene campos de corrección y el contenido
público conserva únicamente IDs y palabras. `SepararSilabas` queda cerrado.

El modo evaluable de `acrostico` fue migrado y validado. La base comprueba que
cada texto comience con la letra indicada, ignorando mayúsculas, minúsculas y
tildes, sin exigir que coincida con un ejemplo administrativo. Las respuestas
configuradas no se publican. El modo creativo permanece sin calificación ni
consumo de intentos. Ambos modos superaron las pruebas funcionales, de
persistencia, progreso y redacción. `Acrostico` queda cerrado.

La ruta heredada de actividad individual ahora redirige a la vista segura de la
unidad. `security_phase6_final.sql` bloquea además la RPC heredada
`registrar_progreso_actividad` para todos los tipos objetivos, evitando que una
invocación manual omita el contador transaccional de intentos. Los tipos
abiertos y experienciales conservan la compatibilidad necesaria.

La verificación global devolvió sus siete indicadores en `true`: fase cerrada,
RPC heredada bloqueada para actividades objetivas, compatibilidad de actividades
abiertas, evaluadores objetivos activos, evaluadores internos bloqueados, RPC
de intentos disponible y soluciones booleanas ocultas. **La Fase 6 queda
finalizada.**

## Fase 7 — En curso

Objetivo: endurecer la validación y activación de tokens, hacer resistentes a
enumeración los códigos y flujos de unión a clases, y retirar la exposición
anónima de metadatos internos de escuelas y libros.

Se preparó `supabase/security_phase7_preflight.sql`, un diagnóstico de solo
lectura que comprueba funciones y permisos efectivos, políticas RLS, exposición
anónima, formato de códigos de clase, integridad de inscripciones y estado
agregado del limitador de tokens. La migración se definirá con los resultados
del entorno desplegado para no asumir que el esquema local refleja exactamente
la base activa.

El preflight confirmó que las seis RPC sensibles heredaban `EXECUTE` anónimo,
el limitador de tokens no cubría solicitudes anónimas, escuelas y libros eran
consultables sin sesión y las 12 clases existentes conservaban códigos de seis
caracteres. También detectó tres clases históricas sin ámbito completo y una
con docente incompatible; no se modificarán automáticamente.

Se prepararon `supabase/security_phase7.sql` y
`supabase/security_phase7_verify.sql`. La migración retira la validación anónima,
limita verificación y activación de tokens, bloquea sus filas al consumirlas,
limita búsquedas y uniones a clases, genera códigos nuevos de diez caracteres,
elimina la búsqueda directa de clases activas y restringe el catálogo a
usuarios autenticados autorizados. El frontend valida los códigos nuevos solo
después de establecer una sesión.

`security_phase7.sql` fue aplicado en Supabase. Sus cinco comprobaciones
inmediatas devolvieron `true`: validación anónima bloqueada, validación
autenticada habilitada, escuelas y libros anónimos bloqueados, y limitador de
clases instalado. Queda pendiente ejecutar la verificación integral y probar
los flujos funcionales antes de cerrar la fase.

`security_phase7_verify.sql` devolvió sus once indicadores técnicos en `true`.
Las RPC sensibles no son ejecutables por `anon`, permanecen habilitadas para
`authenticated`, ambas activaciones bloquean el token antes de consumirlo, los
códigos nuevos usan diez caracteres, los dos flujos de clase tienen límite y
el catálogo interno quedó bloqueado para sesiones anónimas. Las tres clases sin
ámbito y la clase con docente incompatible siguen registradas como deuda de
datos histórica, sin cambios automáticos.

La comprobación directa posterior contra el Data API confirmó respuestas
HTTP 401 / PostgreSQL `42501` para `verificar_token` y para consultas anónimas
a `escuelas`, `grados` y `libros`. El bloqueo anónimo está activo también en la
capa HTTP desplegada, no únicamente en los catálogos de permisos.

Las pruebas funcionales de registro con token válido, registro con token
inválido, activación desde una cuenta existente y lectura autorizada de
catálogos fueron superadas. La creación de clases falló al ejecutar el generador
`gen_random_bytes` desde el `search_path` endurecido; se preparó
`security_phase7_class_code_hotfix.sql` para usar `gen_random_uuid`, conservando
códigos nuevos de diez caracteres y 40 bits, sin ampliar el `search_path`.

El hotfix fue aplicado y las pruebas restantes fueron superadas: creación de
clase con código nuevo de diez caracteres, búsqueda y unión de un estudiante
del mismo ámbito, y respuesta genérica ante un código inexistente. La prueba
completa cubrió también registro con token válido e inválido, activación desde
una cuenta existente y acceso autenticado al catálogo.

La Fase 7 queda finalizada. El cierre conserva como deuda de datos, sin impacto
en los flujos nuevos, tres clases históricas sin escuela o grado y una clase con
docente incompatible. Su corrección requiere identificar la asignación real y
no debe automatizarse.

## Fase 8 — Pendiente

Objetivo previsto: integridad de auditoría, actualización de dependencias,
límites restantes de payload, endurecimiento de funciones heredadas, cabeceras
HTTP y configuración final de despliegue, seguido por una validación integral
de regresión.

## Fase 8 — En curso

El preflight local confirmó una configuración CSP inicial en `vercel.json` y
límites de 64 KiB ya instalados para respuestas. `npm audit` reportó ocho
vulnerabilidades conocidas en el árbol actual: siete de severidad alta y una
baja, todas con corrección disponible. Entre los paquetes afectados están
React Router, Vite, PostCSS, `ws`, `js-yaml`, `brace-expansion` y Babel.

Se preparó `supabase/security_phase8_preflight.sql`, de solo lectura, para
inventariar permisos de `admin_logs`, escritores de auditoría, funciones
`SECURITY DEFINER`, `search_path`, ejecución anónima, límites de payload,
escrituras directas sensibles y triggers desplegados.

El preflight desplegado encontró 39 funciones `SECURITY DEFINER`: 25 heredaban
ejecución anónima, una no fijaba `search_path` y nueve lo iniciaban fuera de
`pg_catalog`. `admin_logs`, `acciones_admin_pendientes` y
`superadministradores` conservaban grants directos de mutación para
`authenticated`; la bitácora tenía 308 filas íntegras y ningún payload mayor de
64 KiB. Respuestas y actividades ya respetaban sus límites, mientras la cola
de aprobación aún no tenía restricción de tamaño.

Se prepararon `supabase/security_phase8.sql` y
`supabase/security_phase8_verify.sql`. La migración convierte la bitácora en
append-only de servidor, audita las actividades mediante trigger, retira
mutaciones directas de aprobación y superadministradores, limita payloads,
cierra por defecto todas las funciones privilegiadas y reabre una lista
explícita de APIs y helpers RLS. El frontend deja de insertar logs elegidos por
el cliente.

La migración y su verificación devolvieron once indicadores en `true`: ninguna
función privilegiada es anónima, todos los `search_path` están endurecidos, la
bitácora es append-only de servidor, aprobaciones y superadministradores solo
se mutan mediante código privilegiado, la API requerida permanece habilitada,
el trigger de actividades está activo y ambos límites de payload existen.

`npm audit fix` actualizó 35 paquetes compatibles. Babel, Vite, PostCSS,
`js-yaml` y `ws` quedaron actualizados; permanecen avisos asociados al árbol de
desarrollo de ESLint y a capacidades RSC/servidor de React Router que esta SPA
no utiliza. No se aplicó `--force` porque npm propone cambios incompatibles y,
para React Router, una degradación que reintroduciría avisos anteriores.

`vercel.json` fue reforzado con HSTS, Permissions Policy, Cross-Origin Opener
Policy y directivas CSP para atributos de script, ancestros, formularios y
actualización de recursos inseguros.

La regresión funcional final fue superada en todos los roles. Se verificaron la
consulta de logs, auditoría automática al crear/editar/eliminar actividades,
creación y resolución MFA de solicitudes sensibles, usuarios, tokens,
actividades estudiantiles, unión a clases y consulta docente de progreso. La
lista explícita de funciones no cerró ninguna RPC legítima.

**La Fase 8 queda finalizada.** También queda completado el plan de
endurecimiento de ocho fases y su validación integral previa al despliegue.

## Riesgos residuales aceptados

- `npm audit` conserva un aviso para capacidades RSC/acciones de servidor de
  React Router. Esta aplicación es una SPA con `BrowserRouter` y no expone esas
  capacidades. La corrección automática propuesta degrada el paquete y
  reintroduce avisos anteriores.
- El árbol de desarrollo conserva avisos transitivos de ESLint que requieren
  una actualización mayor. No forman parte del bundle de producción.
- El bundle principal supera 500 KiB comprimido antes de gzip; es una deuda de
  rendimiento, no un fallo de seguridad.
- Permanecen tres clases históricas sin ámbito y una con docente incompatible.
  Requieren una decisión de datos del negocio antes de corregirse.
- HSTS, CSP y las demás cabeceras nuevas deben comprobarse sobre la URL de
  producción después del próximo despliegue.

## Fase 11 — Completada

Objetivo: sustituir los tokens heredados de 24 bits por tokens con 128 bits de
aleatoriedad criptográfica y preparar un esquema endurecido reproducible.

El preflight confirmó que `admin_crear_tokens_libro` y
`admin_crear_tokens_docente` todavía utilizaban seis caracteres hexadecimales
derivados de `md5(random())`. Existían 34 tokens débiles en estado `valido`: 27
utilizables y siete expirados. También había 51 activados y cuatro revocados.

Se aplicó `supabase/security_phase11.sql` con autorización para invalidar todos
los códigos de prueba heredados. Los 34 tokens débiles válidos quedaron
revocados; los 51 activados se conservaron para auditoría e integridad de las
FK. El inventario posterior contiene 51 activados históricos y 38 revocados.

`security_phase11_verify.sql` devolvió sus doce indicadores en `true`:
generadores endurecidos, 128 bits activos, helper interno instalado y cerrado a
clientes, ejecución anónima bloqueada, APIs administrativas disponibles,
restricción de formato activa, ningún token débil válido y ninguna generación
heredada pendiente.

Las pruebas funcionales fueron superadas: generación de tokens de libro y
docente con prefijos correctos y 128 bits, activación válida y rechazo de la
reutilización.

El 19 de agosto de 2026 se generó con Supabase CLI 2.115.0 un dump de solo
esquema del proyecto desplegado, limitado al esquema `public`, y se sustituyó
`supabase/schema.sql` por ese catálogo canónico. El archivo no contiene filas
de datos ni credenciales. Con este paso queda cerrada la reproducibilidad de la
fase 11.

## Fase 12 — Preparada para despliegue

Objetivo: hacer viables los códigos impresos sustituyendo la generación de 128
bits por códigos Crockford Base32 de 10 caracteres y 50 bits de entropía.

`supabase/security_phase12_tokens_10_chars.sql` instala el nuevo generador,
actualiza las dos RPC administrativas y admite simultáneamente el formato nuevo
y los tokens largos ya emitidos. No revoca códigos existentes. El alfabeto
excluye `I`, `L`, `O` y `U` para reducir errores de transcripción.

La migración debe aplicarse al proyecto desplegado y comprobarse con
`supabase/security_phase12_tokens_10_chars_verify.sql`, siguiendo
`supabase/PHASE12_TOKENS_10_CHARS_RUNBOOK.md`.

## Fase 13 — Preparada para despliegue

Objetivo: validar la disponibilidad básica del token antes de pedir los datos
de registro, sin abrir la RPC autenticada existente a clientes anónimos.

La Edge Function `prevalidar-token` devuelve únicamente un booleano y un motivo
genérico. La RPC interna es exclusiva de `service_role`, registra hashes HMAC
de red y dispositivo y limita a 100 intentos por red y 10 por dispositivo cada
hora. La validación autenticada y el consumo atómico se repiten después del
registro, por lo que la prevalidación no reserva el token ni crea carreras.

El despliegue requiere aplicar `security_phase13_prevalidacion_anonima.sql`,
configurar `PREVALIDACION_TOKEN_HASH_SECRET` y desplegar la Edge Function sin
verificación JWT. El procedimiento completo está en
`supabase/PHASE13_PREVALIDACION_RUNBOOK.md`.
