SELECT
  EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'admin_crear_tokens_libro'
      AND p.pronargs = 5
  ) AS rpc_tokens_libro,
  EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'admin_crear_tokens_docente'
      AND p.pronargs = 3
  ) AS rpc_tokens_docente,
  NOT has_table_privilege('authenticated', 'public.tokens', 'INSERT')
    AS insert_directo_sigue_revocado,
  EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'admin_crear_tokens_libro'
      AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
  ) AS admin_puede_generar_tokens_libro,
  EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'admin_crear_tokens_docente'
      AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
  ) AS admin_puede_generar_tokens_docente,
  has_table_privilege('authenticated', 'public.actividades', 'INSERT')
    AS data_api_actividad_insert,
  has_table_privilege('authenticated', 'public.actividades', 'UPDATE')
    AS data_api_actividad_update,
  has_table_privilege('authenticated', 'public.actividades', 'DELETE')
    AS data_api_actividad_delete,
  EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'actividades'
      AND policyname = 'actividades_admin_write'
  ) AS actividades_siguen_limitadas_por_rls;

SELECT
  p.proname,
  p.prosecdef AS security_definer,
  p.proconfig
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('admin_crear_tokens_libro', 'admin_crear_tokens_docente')
ORDER BY p.proname;
