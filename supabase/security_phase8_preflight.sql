-- IAbooks — Fase 8: diagnóstico previo
-- Auditoría, funciones heredadas y límites finales.
--
-- Script exclusivamente de lectura. Ejecutarlo completo en el SQL Editor de
-- Supabase. No modifica permisos, funciones, políticas ni datos.

-- 1. Integridad y permisos efectivos de la bitácora administrativa.
SELECT
  c.relrowsecurity AS rls,
  c.relforcerowsecurity AS force_rls,
  has_table_privilege('anon', c.oid, 'SELECT') AS anon_select,
  has_table_privilege('anon', c.oid, 'INSERT') AS anon_insert,
  has_table_privilege('authenticated', c.oid, 'SELECT') AS auth_select,
  has_table_privilege('authenticated', c.oid, 'INSERT') AS auth_insert,
  has_table_privilege('authenticated', c.oid, 'UPDATE') AS auth_update,
  has_table_privilege('authenticated', c.oid, 'DELETE') AS auth_delete
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'admin_logs';

SELECT
  policyname,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'admin_logs'
ORDER BY policyname;

SELECT
  count(*) AS logs_total,
  count(*) FILTER (WHERE admin_id IS NULL) AS logs_sin_actor,
  count(*) FILTER (WHERE accion IS NULL OR trim(accion) = '') AS logs_sin_accion,
  count(*) FILTER (WHERE created_at IS NULL) AS logs_sin_fecha,
  max(pg_column_size(payload)) AS payload_maximo_bytes,
  count(*) FILTER (WHERE pg_column_size(payload) > 65536)
    AS payloads_mayores_64k
FROM public.admin_logs;

-- 2. SECURITY DEFINER: search_path, exposición y propietario. No devuelve el
-- cuerpo completo, pero sí indicadores suficientes para priorizar el cierre.
SELECT
  p.proname AS funcion,
  pg_get_function_identity_arguments(p.oid) AS argumentos,
  r.rolname AS propietario,
  p.proconfig AS configuracion,
  p.proconfig IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM unnest(p.proconfig) cfg
      WHERE cfg LIKE 'search_path=%'
    ) AS sin_search_path_fijo,
  EXISTS (
    SELECT 1
    FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) cfg
    WHERE cfg LIKE 'search_path=%'
      AND cfg NOT LIKE 'search_path=pg_catalog%'
  ) AS search_path_no_endurecido,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN pg_roles r ON r.oid = p.proowner
WHERE n.nspname = 'public'
  AND p.prosecdef
ORDER BY
  (
    p.proconfig IS NULL
    OR NOT EXISTS (
      SELECT 1
      FROM unnest(p.proconfig) cfg
      WHERE cfg LIKE 'search_path=%'
    )
  ) DESC,
  anon_execute DESC,
  p.proname,
  argumentos;

-- 3. Resumen de funciones privilegiadas potencialmente riesgosas.
WITH privilegiadas AS (
  SELECT
    p.oid,
    p.proconfig,
    has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
    has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_execute
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prosecdef
)
SELECT
  count(*) AS security_definer_total,
  count(*) FILTER (
    WHERE proconfig IS NULL
       OR NOT EXISTS (
         SELECT 1 FROM unnest(proconfig) cfg
         WHERE cfg LIKE 'search_path=%'
       )
  ) AS sin_search_path_fijo,
  count(*) FILTER (
    WHERE EXISTS (
      SELECT 1 FROM unnest(COALESCE(proconfig, ARRAY[]::text[])) cfg
      WHERE cfg LIKE 'search_path=%'
        AND cfg NOT LIKE 'search_path=pg_catalog%'
    )
  ) AS search_path_no_endurecido,
  count(*) FILTER (WHERE anon_execute) AS ejecutables_por_anon,
  count(*) FILTER (WHERE auth_execute) AS ejecutables_por_authenticated
FROM privilegiadas;

-- 4. Funciones que escriben en admin_logs y posibilidad de invocarlas desde el
-- cliente. Ayuda a separar escritores legítimos de rutas de falsificación.
SELECT
  p.proname AS funcion,
  pg_get_function_identity_arguments(p.oid) AS argumentos,
  p.prosecdef AS security_definer,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_execute,
  pg_get_functiondef(p.oid) ILIKE '%auth.uid()%' AS deriva_actor_de_sesion,
  pg_get_functiondef(p.oid) ILIKE '%INSERT INTO public.admin_logs%'
    AS inserta_log
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prokind IN ('f', 'p')
  AND pg_get_functiondef(p.oid) ILIKE '%admin_logs%'
ORDER BY p.proname, argumentos;

-- 5. Límites efectivos de payload en respuestas, actividades y aprobaciones.
SELECT
  conrelid::regclass AS tabla,
  conname AS restriccion,
  pg_get_constraintdef(oid) AS definicion,
  convalidated AS validada
FROM pg_constraint
WHERE conrelid IN (
    'public.respuestas'::regclass,
    'public.actividades'::regclass,
    'public.acciones_admin_pendientes'::regclass
  )
  AND (
    pg_get_constraintdef(oid) ILIKE '%pg_column_size%'
    OR pg_get_constraintdef(oid) ILIKE '%base64%'
    OR pg_get_constraintdef(oid) ILIKE '%jsonb%'
  )
ORDER BY conrelid::regclass::text, conname;

SELECT
  (SELECT max(pg_column_size(respuesta)) FROM public.respuestas)
    AS respuesta_max_bytes,
  (SELECT count(*) FROM public.respuestas
    WHERE pg_column_size(respuesta) > 65536)
    AS respuestas_mayores_64k,
  (SELECT max(pg_column_size(campos)) FROM public.actividades)
    AS actividad_campos_max_bytes,
  (SELECT count(*) FROM public.actividades
    WHERE pg_column_size(campos) > 262144)
    AS actividades_mayores_256k,
  (SELECT max(pg_column_size(payload))
    FROM public.acciones_admin_pendientes)
    AS aprobacion_payload_max_bytes,
  (SELECT count(*) FROM public.acciones_admin_pendientes
    WHERE pg_column_size(payload) > 524288)
    AS aprobaciones_mayores_512k;

-- 6. Grants de escritura directa en tablas sensibles de auditoría/aprobación.
SELECT
  c.relname AS tabla,
  has_table_privilege('anon', c.oid, 'INSERT') AS anon_insert,
  has_table_privilege('authenticated', c.oid, 'INSERT') AS auth_insert,
  has_table_privilege('authenticated', c.oid, 'UPDATE') AS auth_update,
  has_table_privilege('authenticated', c.oid, 'DELETE') AS auth_delete
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN (
    'admin_logs',
    'acciones_admin_pendientes',
    'superadministradores'
  )
ORDER BY c.relname;

-- 7. Triggers de protección y auditoría activos.
SELECT
  event_object_table AS tabla,
  trigger_name,
  event_manipulation AS evento,
  action_timing,
  action_statement
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND event_object_table IN (
    'admin_logs',
    'acciones_admin_pendientes',
    'profiles',
    'tokens',
    'libros',
    'escuelas',
    'unidades',
    'actividades'
  )
ORDER BY event_object_table, trigger_name, event_manipulation;

-- 8. Indicadores agregados para diseñar la migración exacta.
WITH logs AS (
  SELECT
    has_table_privilege('authenticated', 'public.admin_logs', 'INSERT')
      AS auth_inserta_logs,
    has_table_privilege('authenticated', 'public.admin_logs', 'UPDATE')
      AS auth_actualiza_logs,
    has_table_privilege('authenticated', 'public.admin_logs', 'DELETE')
      AS auth_borra_logs
), funciones AS (
  SELECT
    count(*) FILTER (
      WHERE p.prosecdef
        AND (
          p.proconfig IS NULL
          OR NOT EXISTS (
            SELECT 1 FROM unnest(p.proconfig) cfg
            WHERE cfg LIKE 'search_path=%'
          )
        )
    ) AS definer_sin_path,
    count(*) FILTER (
      WHERE p.prosecdef
        AND has_function_privilege('anon', p.oid, 'EXECUTE')
    ) AS definer_anon
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
)
SELECT
  logs.*,
  funciones.*,
  EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.respuestas'::regclass
      AND conname = 'respuestas_payload_tamano_check'
      AND convalidated
  ) AS respuestas_limitadas,
  EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.actividades'::regclass
      AND conname = 'actividades_campos_tamano_check'
      AND convalidated
  ) AS actividades_limitadas
FROM logs
CROSS JOIN funciones;
