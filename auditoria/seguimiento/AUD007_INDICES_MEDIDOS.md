# AUD-007 — revisión y medición, 24 de septiembre de 2026

## Decisión

**No añadir índices en la carga actual.** Revisión completada; optimización diferida y condicionada a crecimiento o latencia demostrada, no declarada corrección desplegada. Las 21 FK sin prefijo apto no equivalen a 21 problemas de rendimiento medidos. No se crean migraciones ni se modifica schema.sql a partir del ensayo sintético.

Los 58 índices consultados de producción conservan exactamente las definiciones del catálogo del 21 de septiembre. La revisión de las FK utiliza ese catálogo; no se reconsultaron sus definiciones en esta sesión.

Se descartan las recomendaciones históricas `inscripciones(clase_id)` y `clase_libros(clase_id, libro_id)`: ya están cubiertas por sus claves primarias. El servicio docente filtra por usuario y actividad, cubiertos por `respuestas_usuario_id_actividad_id_key`; no se añade automáticamente `(usuario_id, libro_id)`.

## Tamaño observado en producción

Consulta exclusivamente de metadatos/estadísticas: `consulta_indices_fase6.sql`, sin SELECT de datos de alumnos, DDL, ANALYZE ni EXPLAIN ANALYZE en producción. Respuestas: 32768 bytes de tabla (32 KiB), 122880 bytes totales. `n_live_tup=4` frente a `reltuples=52`; son estimaciones discrepantes y no acreditan cuatro respuestas reales. Tokens: 24 KiB de tabla; activaciones: 8 KiB. Las estadísticas tampoco equivalen a telemetría de latencia o frecuencia por consulta. No se infiere que un índice con cero usos deba eliminarse.

## Mediciones locales

Recuperado volumen fase3: 30 usuarios, 30 perfiles y 1500 respuestas ficticias, sin regenerar fixtures. PostgreSQL 17.6. Script 27 genera SQL y script 28 resume resultados. Cada serie usa una ejecución de calentamiento descartada y seis medidas; 18 series, 126 EXPLAIN en total.

Se midió la forma de consulta docente (25 alumnos, 25 actividades, orden usuario/actividad, LIMIT 500) con rol authenticated y claims de docente ficticio. Las otras consultas buscan referencias como propietario y son **sondas SELECT**, no tiempos de DELETE/cascada ni de políticas RLS. No se alteraron las políticas.

Índices ensayados juntos: respuestas(actividad_id, unidad_id), respuestas(unidad_id, libro_id), respuestas(libro_id). Cubren cinco FK con tres índices. Se crearon dentro de una transacción y se eliminaron por ROLLBACK, sin dejar cambios persistentes. El primer intento abortó por falta de EXECUTE en la función temporal de medición; se concedió únicamente ese permiso temporal y se repitió. No se debilitó ningún ACL de la aplicación.

La tabla temporal de 150000 respuestas es sintética, con tipos/constraints de columnas e índices únicos equivalentes, 6000 actividades, 1000 unidades y 100 libros distribuidos uniformemente. No incorpora FK, triggers ni RLS; solo mide búsquedas. No representa el volumen ni la distribución actuales de producción. Las medidas no incluyen el coste de mantener índices durante escrituras; el almacenamiento adicional de los tres índices sintéticos fue 3375104 bytes.

| Escenario | Consulta | Antes, mediana ms | Después, mediana ms | Bloques antes → después |
|---|---|---:|---:|---:|
| fixtures_1500 | panel_docente | 4.7750 | 4.5860 | 402 → 381 |
| fixtures_1500 | fk_actividad | 0.1195 | 0.0205 | 41 → 27 |
| fixtures_1500 | fk_unidad | 0.1460 | 0.1450 | 41 → 41 |
| fixtures_1500 | fk_libro | 0.1870 | 0.2130 | 41 → 41 |
| sintetico_150000 | fk_actividad | 11.5835 | 0.0200 | 2587 → 27 |
| sintetico_150000 | fk_unidad | 12.4680 | 0.0695 | 2587 → 152 |
| sintetico_150000 | fk_libro | 13.2145 | 4.3220 | 2587 → 1503 |
| sintetico_150000 | fk_actividad_unidad | 12.7370 | 0.0165 | 2587 → 27 |
| sintetico_150000 | fk_unidad_libro | 12.7535 | 0.0690 | 2587 → 152 |

El cambio 4.775 → 4.586 ms en panel es pequeño y no se presenta como mejora acreditada para usuarios. En los fixtures, el planificador conserva Seq Scan para unidad/libro porque recuperan 50 %/100 % de filas. El índice por actividad sí reduce el trabajo; su ganancia absoluta a este volumen es inferior a una décima de milisegundo. El escenario sintético justifica conservar candidatos, no desplegarlos ahora.

## Disposición de las 21 restricciones

| Tabla | Restricción | Decisión |
|---|---|---|
| `tokens` | `tokens_usuario_id_fkey` | Diferir: tabla pequeña; búsquedas habituales por PK/índices existentes. Reexaminar consultas inversas y bajas de referencias al crecer. |
| `clase_libros` | `clase_libros_libro_id_fkey` | Diferir: tabla pequeña; búsquedas habituales por PK/índices existentes. Reexaminar consultas inversas y bajas de referencias al crecer. |
| `libro_activaciones` | `libro_activaciones_libro_id_fkey` | Diferir: tabla pequeña; búsquedas habituales por PK/índices existentes. Reexaminar consultas inversas y bajas de referencias al crecer. |
| `libro_activaciones` | `libro_activaciones_token_id_fkey` | Diferir: tabla pequeña; búsquedas habituales por PK/índices existentes. Reexaminar consultas inversas y bajas de referencias al crecer. |
| `progreso` | `progreso_libro_id_fkey` | Diferir: tabla pequeña; búsquedas habituales por PK/índices existentes. Reexaminar consultas inversas y bajas de referencias al crecer. |
| `profiles` | `profiles_grado_id_fkey` | Diferir: FK de grado en tabla pequeña; no se acreditó consulta selectiva por grado ni coste de bajas. |
| `clases` | `clases_grado_id_fkey` | Diferir: FK de grado en tabla pequeña; no se acreditó consulta selectiva por grado ni coste de bajas. |
| `tokens` | `tokens_grado_id_fkey` | Diferir: tabla pequeña; búsquedas habituales por PK/índices existentes. Reexaminar consultas inversas y bajas de referencias al crecer. |
| `admin_logs` | `admin_logs_admin_id_fkey` | Diferir: listados actuales usan estado/fecha; sin evidencia de filtro frecuente por actor. No eliminar usuarios para medir cascadas. |
| `respuestas` | `respuestas_actividad_id_fkey` | Candidato condicionado a crecimiento: actividad/unidad/libro; planes medidos. No migrar con la carga actual. |
| `respuestas` | `respuestas_libro_id_fkey` | Candidato condicionado a crecimiento: actividad/unidad/libro; planes medidos. No migrar con la carga actual. |
| `respuestas` | `respuestas_unidad_id_fkey` | Candidato condicionado a crecimiento: actividad/unidad/libro; planes medidos. No migrar con la carga actual. |
| `respuestas` | `respuestas_actividad_unidad_fk` | Candidato condicionado a crecimiento: actividad/unidad/libro; planes medidos. No migrar con la carga actual. |
| `respuestas` | `respuestas_unidad_libro_fk` | Candidato condicionado a crecimiento: actividad/unidad/libro; planes medidos. No migrar con la carga actual. |
| `superadministradores` | `superadministradores_creado_por_fkey` | Diferir: tabla pequeña; sin carga medida por estas referencias. Reexaminar al crecer. |
| `intentos_actividad` | `intentos_actividad_actividad_id_fkey` | Diferir: tabla pequeña; búsquedas habituales por PK/índices existentes. Reexaminar consultas inversas y bajas de referencias al crecer. |
| `acciones_admin_pendientes` | `acciones_admin_pendientes_solicitante_id_fkey` | Diferir: listados actuales usan estado/fecha; sin evidencia de filtro frecuente por actor. No eliminar usuarios para medir cascadas. |
| `acciones_admin_pendientes` | `acciones_admin_pendientes_aprobador_id_fkey` | Diferir: listados actuales usan estado/fecha; sin evidencia de filtro frecuente por actor. No eliminar usuarios para medir cascadas. |
| `archivos_libro` | `archivos_libro_propietario_id_fkey` | Diferir: tabla pequeña; sin carga medida por estas referencias. Reexaminar al crecer. |
| `archivos_libro` | `archivos_libro_libro_id_fkey` | Diferir: tabla pequeña; sin carga medida por estas referencias. Reexaminar al crecer. |
| `archivos_libro` | `archivos_libro_resuelto_por_fkey` | Diferir: tabla pequeña; sin carga medida por estas referencias. Reexaminar al crecer. |

## Cuándo reabrir la optimización

Antes de un aumento sustancial de alumnos/respuestas o si se observa lentitud en paneles/bajas administrativas: refrescar los metadatos, reproducir el volumen y la distribución afectados localmente y medir la consulta concreta con su rol/RLS. Priorizar actividad/unidad si son selectivas. Comparar coste de escritura y tamaño; preparar entonces una migración selectiva con creación concurrente, verificación de validez y reversión. No ejecutar el SQL de medición sobre producción.

No se exige ninguna acción del usuario para este bloque. Los pendientes de publicación y navegador autenticado de AUD-005/AUD-011 siguen separados. AUD-007 permanece documentado como optimización diferida por evidencia, sin presumir aceptación de riesgos ajenos.

Fuentes técnicas: [índices multicolumna PostgreSQL 17](https://www.postgresql.org/docs/17/indexes-multicolumn.html) y [claves foráneas](https://www.postgresql.org/docs/17/ddl-constraints.html#DDL-CONSTRAINTS-FK). Las conclusiones de rendimiento proceden de los planes guardados, no de esas fuentes.
