-- =========================================================================
-- Fase 2 — Auditoría dinámica. Paso 7: medición de políticas RLS.
--
-- AUD-003 sostiene que las políticas reevalúan auth.uid() por fila y que
-- `respuestas_docente_scoped_read` ejecuta además un JOIN triple por cada fila
-- candidata. Las tablas de proyección del informe son analíticas.
--
-- Este script las sustituye por medición: ejecuta EXPLAIN (ANALYZE, BUFFERS)
-- sobre la consulta del panel docente SUPLANTANDO a un docente real.
--
-- IMPORTANTE: la suplantación se hace dentro de un bloque BEGIN/COMMIT. Sin
-- transacción, `SET LOCAL ROLE` es ignorado con un WARNING y la consulta se
-- ejecuta como superusuario, que ESTÁ EXENTO DE RLS: el plan resultante no
-- mediría nada de lo que se quiere medir.
--
-- Uso:
--   psql "$DB_URL" -v docente_id="'<uuid>'" -v clase_id="'<uuid>'" \
--        -f 07_explain_rls.sql
-- =========================================================================

\timing on
\set ON_ERROR_STOP on

\echo '=== Contexto: volumen de las tablas implicadas ==='
SELECT relname AS tabla,
       n_live_tup AS filas_estimadas,
       pg_size_pretty(pg_total_relation_size(relid)) AS tamano
FROM pg_stat_user_tables
WHERE schemaname = 'public'
  AND relname IN ('respuestas','actividad_progreso','inscripciones','clases','clase_libros','profiles')
ORDER BY n_live_tup DESC;

\echo ''
\echo '=== AUD-003: llamadas a auth.uid() sin envolver ==='
SELECT count(*) AS politicas_totales
FROM pg_policies WHERE schemaname = 'public';

SELECT count(*) AS politicas_con_auth_uid_sin_envolver
FROM pg_policies
WHERE schemaname = 'public'
  AND (coalesce(qual,'') || ' ' || coalesce(with_check,'')) ~* 'auth\.uid\(\)'
  AND (coalesce(qual,'') || ' ' || coalesce(with_check,'')) !~* '\(\s*select\s+auth\.uid\(\)';

-- -------------------------------------------------------------------------
-- PLAN REAL COMO DOCENTE. Todo dentro de una transacción para que la
-- suplantación surta efecto y las políticas RLS se apliquen de verdad.
-- -------------------------------------------------------------------------
\echo ''
\echo '=== PLAN COMO DOCENTE (RLS aplicado) ==='

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', :docente_id, 'role', 'authenticated')::text, true);

-- Confirmación de que la suplantación surtió efecto: debe imprimir
-- 'authenticated' y el uuid del docente, no 'postgres'.
SELECT current_user AS rol_efectivo,
       current_setting('request.jwt.claims', true)::json->>'sub' AS uid_efectivo;

EXPLAIN (ANALYZE, BUFFERS, VERBOSE)
SELECT usuario_id, actividad_id, respuesta, es_correcta
FROM public.respuestas
WHERE usuario_id IN (
  SELECT estudiante_id FROM public.inscripciones WHERE clase_id = :clase_id
);
COMMIT;

-- -------------------------------------------------------------------------
-- Contraste: la misma consulta con la remediación propuesta por AUD-003,
-- es decir, con auth.uid() promovido a InitPlan mediante (SELECT ...).
-- -------------------------------------------------------------------------
\echo ''
\echo '=== CONTRASTE: coste del JOIN de la política, evaluado directamente ==='

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', :docente_id, 'role', 'authenticated')::text, true);

-- Reproduce la subconsulta EXISTS de respuestas_docente_scoped_read tal como
-- está escrita hoy (auth.uid() sin envolver, evaluado por fila).
EXPLAIN (ANALYZE, BUFFERS)
SELECT count(*)
FROM public.respuestas r
WHERE EXISTS (
  SELECT 1
  FROM public.inscripciones i
  JOIN public.clases c       ON c.id = i.clase_id
  JOIN public.clase_libros cl ON cl.clase_id = c.id AND cl.libro_id = r.libro_id
  WHERE i.estudiante_id = r.usuario_id
    AND c.docente_id = auth.uid()
    AND c.escuela_id = (SELECT p.escuela_id FROM public.profiles p WHERE p.id = auth.uid())
);
COMMIT;

\echo ''
\echo '=== Misma consulta con (SELECT auth.uid()) — remediación propuesta ==='

BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', :docente_id, 'role', 'authenticated')::text, true);

EXPLAIN (ANALYZE, BUFFERS)
SELECT count(*)
FROM public.respuestas r
WHERE EXISTS (
  SELECT 1
  FROM public.inscripciones i
  JOIN public.clases c       ON c.id = i.clase_id
  JOIN public.clase_libros cl ON cl.clase_id = c.id AND cl.libro_id = r.libro_id
  WHERE i.estudiante_id = r.usuario_id
    AND c.docente_id = (SELECT auth.uid())
    AND c.escuela_id = (SELECT p.escuela_id FROM public.profiles p WHERE p.id = (SELECT auth.uid()))
);
COMMIT;

\echo ''
\echo '=== AUD-007: claves foráneas SIN índice ==='
SELECT t.relname AS tabla,
       a.attname AS columna,
       EXISTS (
         SELECT 1 FROM pg_index i
         WHERE i.indrelid = t.oid AND a.attnum = ANY (i.indkey)
       ) AS tiene_indice
FROM pg_constraint c
JOIN pg_class t ON t.oid = c.conrelid
JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY (c.conkey)
WHERE c.contype = 'f'
  AND t.relnamespace = 'public'::regnamespace
ORDER BY tiene_indice, t.relname, a.attname;

\echo ''
\echo '=== Índices nunca utilizados tras la carga ==='
SELECT relname AS tabla, indexrelname AS indice, idx_scan AS usos
FROM pg_stat_user_indexes
WHERE schemaname = 'public' AND idx_scan = 0
ORDER BY relname;

\echo ''
\echo '=== Tablas de public SIN RLS (debe devolver cero filas) ==='
SELECT c.relname AS tabla_sin_rls
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity;

\echo ''
\echo '=== Tablas con RLS activo pero SIN políticas (denegación total) ==='
SELECT c.relname AS tabla
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
  AND NOT EXISTS (
    SELECT 1 FROM pg_policies p
    WHERE p.schemaname = 'public' AND p.tablename = c.relname
  );
