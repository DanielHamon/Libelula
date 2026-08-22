-- IAbooks — Fase 12: verificación posterior.

WITH generators AS (
  SELECT pg_get_functiondef(p.oid) AS definition
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN ('admin_crear_tokens_libro', 'admin_crear_tokens_docente')
)
SELECT
  to_regprocedure('public.generar_token_10()') IS NOT NULL AS helper_instalado,
  NOT has_function_privilege('anon', 'public.generar_token_10()', 'EXECUTE') AS helper_anon_cerrado,
  NOT has_function_privilege('authenticated', 'public.generar_token_10()', 'EXECUTE') AS helper_cliente_cerrado,
  (SELECT bool_and(definition ILIKE '%generar_token_10%') FROM generators)
    AS generadores_actualizados,
  (SELECT bool_and(definition ILIKE '%base32_10_chars_50_bits%') FROM generators)
    AS auditoria_actualizada,
  EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.tokens'::regclass
      AND conname = 'token_valido_formato_seguro'
      AND pg_get_constraintdef(oid) LIKE '%[0-9A-HJKMNP-TV-Z]{10}%'
  ) AS formato_restringido,
  NOT EXISTS (
    SELECT 1 FROM generate_series(1, 1000)
    WHERE public.generar_token_10() !~ '^[0-9A-HJKMNP-TV-Z]{10}$'
  ) AS muestra_formato_valida,
  (SELECT count(DISTINCT public.generar_token_10()) = 1000
   FROM generate_series(1, 1000)) AS muestra_sin_colisiones,
  NOT has_function_privilege(
    'anon',
    'public.admin_crear_tokens_libro(uuid,text,integer,integer,timestamp with time zone)',
    'EXECUTE'
  ) AS libro_anon_cerrado,
  NOT has_function_privilege(
    'anon',
    'public.admin_crear_tokens_docente(uuid,text[],timestamp with time zone)',
    'EXECUTE'
  ) AS docente_anon_cerrado;

SELECT
  estado,
  count(*) AS total,
  count(*) FILTER (WHERE id ~ '^[0-9A-HJKMNP-TV-Z]{10}$') AS formato_nuevo,
  count(*) FILTER (WHERE id ~ '^(TL|TD)-[0-9A-F]{32}$') AS formato_128_bits,
  count(*) FILTER (
    WHERE id !~ '^[0-9A-HJKMNP-TV-Z]{10}$'
      AND id !~ '^(TL|TD)-[0-9A-F]{32}$'
  ) AS historicos
FROM public.tokens
GROUP BY estado
ORDER BY estado;
