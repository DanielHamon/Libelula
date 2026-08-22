-- IAbooks — Fase 13: verificación posterior.

SELECT
  to_regclass('public.intentos_token_anonimos') IS NOT NULL AS tabla_instalada,
  to_regprocedure('public.prevalidar_token_anonimo(text,text,text)') IS NOT NULL AS rpc_instalada,
  NOT has_table_privilege('anon', 'public.intentos_token_anonimos', 'SELECT') AS tabla_anon_cerrada,
  NOT has_table_privilege('authenticated', 'public.intentos_token_anonimos', 'SELECT') AS tabla_cliente_cerrada,
  NOT has_function_privilege(
    'anon', 'public.prevalidar_token_anonimo(text,text,text)', 'EXECUTE'
  ) AS rpc_anon_cerrada,
  NOT has_function_privilege(
    'authenticated', 'public.prevalidar_token_anonimo(text,text,text)', 'EXECUTE'
  ) AS rpc_cliente_cerrada,
  has_function_privilege(
    'service_role', 'public.prevalidar_token_anonimo(text,text,text)', 'EXECUTE'
  ) AS rpc_service_role_disponible,
  EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'prevalidar_token_anonimo'
      AND p.prosecdef
      AND pg_get_functiondef(p.oid) ILIKE '%pg_advisory_xact_lock%'
      AND pg_get_functiondef(p.oid) NOT ILIKE '%libro_titulo%'
      AND pg_get_functiondef(p.oid) NOT ILIKE '%email_autorizado%'
  ) AS rpc_limitada_sin_metadatos;
