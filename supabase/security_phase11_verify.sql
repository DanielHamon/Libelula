-- IAbooks — Fase 11: verificación posterior.

WITH generators AS (
  SELECT
    p.proname,
    p.prosecdef,
    coalesce(array_to_string(p.proconfig, ', '), '') AS config,
    pg_get_functiondef(p.oid) AS definition
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN ('admin_crear_tokens_libro', 'admin_crear_tokens_docente')
), checks AS (
  SELECT
    count(*) = 2
      AND bool_and(prosecdef)
      AND bool_and(config LIKE 'search_path=pg_catalog,%')
      AS generadores_endurecidos,
    bool_and(definition ILIKE '%generar_token_128%')
      AND bool_and(definition NOT ILIKE '%md5(random()%')
      AS generadores_128_bits
  FROM generators
)
SELECT
  checks.generadores_endurecidos,
  checks.generadores_128_bits,
  to_regprocedure('public.generar_token_128(text)') IS NOT NULL AS helper_instalado,
  NOT has_function_privilege('anon', 'public.generar_token_128(text)', 'EXECUTE') AS helper_anon_cerrado,
  NOT has_function_privilege('authenticated', 'public.generar_token_128(text)', 'EXECUTE') AS helper_cliente_cerrado,
  NOT has_function_privilege('anon', 'public.admin_crear_tokens_libro(uuid,text,integer,integer,timestamp with time zone)', 'EXECUTE') AS libro_anon_cerrado,
  NOT has_function_privilege('anon', 'public.admin_crear_tokens_docente(uuid,text[],timestamp with time zone)', 'EXECUTE') AS docente_anon_cerrado,
  has_function_privilege('authenticated', 'public.admin_crear_tokens_libro(uuid,text,integer,integer,timestamp with time zone)', 'EXECUTE') AS libro_admin_api,
  has_function_privilege('authenticated', 'public.admin_crear_tokens_docente(uuid,text[],timestamp with time zone)', 'EXECUTE') AS docente_admin_api,
  EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.tokens'::regclass
      AND conname = 'token_valido_formato_seguro'
  ) AS formato_restringido,
  NOT EXISTS (
    SELECT 1 FROM public.tokens
    WHERE estado = 'valido'
      AND id !~ '^(TL|TD)-[0-9A-F]{32}$'
  ) AS ningun_debil_valido,
  NOT EXISTS (
    SELECT 1 FROM public.acciones_admin_pendientes
    WHERE estado = 'pendiente'
      AND tipo IN ('crear_tokens_libro', 'crear_tokens_docente')
  ) AS sin_generacion_heredada_pendiente
FROM checks;

-- Resumen no sensible del inventario posterior.
SELECT
  estado,
  count(*) AS total,
  count(*) FILTER (WHERE id ~ '^(TL|TD)-[0-9A-F]{32}$') AS formato_128_bits,
  count(*) FILTER (WHERE id !~ '^(TL|TD)-[0-9A-F]{32}$') AS historicos
FROM public.tokens
GROUP BY estado
ORDER BY estado;
