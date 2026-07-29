-- IAbooks — Fase 8: verificación de auditoría y privilegios.

WITH privilegiadas AS (
  SELECT p.oid, p.proconfig,
    has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prosecdef AND p.prokind = 'f'
), api_requerida(firma) AS (
  VALUES
    ('public.verificar_token(text)'),
    ('public.activar_token(text)'),
    ('public.activar_token_docente(text)'),
    ('public.crear_clase(text,integer)'),
    ('public.buscar_clase_para_unirse(text)'),
    ('public.unirse_clase(text)'),
    ('public.get_mis_libros_estado()'),
    ('public.get_libro_completo(text)'),
    ('public.get_actividad_publica(text)'),
    ('public.evaluar_intento_actividad(text,jsonb)'),
    ('public.admin_solicitar_accion_sensible_v2(text,jsonb)'),
    ('public.superadmin_resolver_accion_v3(uuid,boolean)')
)
SELECT
  count(*) FILTER (WHERE anon_execute) = 0 AS definer_anon_bloqueadas,
  count(*) FILTER (
    WHERE proconfig IS NULL OR NOT EXISTS (
      SELECT 1 FROM unnest(proconfig) cfg
      WHERE cfg LIKE 'search_path=pg_catalog%'
    )
  ) = 0 AS definer_search_path_endurecido,
  NOT has_table_privilege('authenticated', 'public.admin_logs', 'INSERT')
    AS logs_append_solo_servidor,
  NOT has_table_privilege('authenticated', 'public.admin_logs', 'UPDATE')
    AS logs_inmutables_update,
  NOT has_table_privilege('authenticated', 'public.admin_logs', 'DELETE')
    AS logs_inmutables_delete,
  NOT has_table_privilege(
    'authenticated', 'public.acciones_admin_pendientes', 'INSERT'
  ) AS aprobaciones_solo_rpc,
  NOT has_table_privilege(
    'authenticated', 'public.superadministradores', 'INSERT'
  ) AS superadministradores_solo_servidor,
  (SELECT bool_and(has_function_privilege(
    'authenticated', firma, 'EXECUTE'
  )) FROM api_requerida) AS api_requerida_habilitada,
  EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.actividades'::regclass
      AND tgname = 'actividades_auditoria_admin' AND NOT tgisinternal
  ) AS auditoria_actividad_activa,
  EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.admin_logs'::regclass
      AND conname = 'admin_logs_payload_tamano_check' AND convalidated
  ) AS logs_limitados_64k,
  EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.acciones_admin_pendientes'::regclass
      AND conname = 'acciones_admin_payload_tamano_check' AND convalidated
  ) AS aprobaciones_limitadas_512k
FROM privilegiadas;
