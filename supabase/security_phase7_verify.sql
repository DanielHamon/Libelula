-- IAbooks — Fase 7: verificación posterior de solo lectura

WITH funciones AS (
  SELECT
    NOT has_function_privilege(
      'anon', 'public.verificar_token(text)', 'EXECUTE'
    ) AS token_anon_bloqueado,
    bool_and(NOT has_function_privilege('anon', p.oid, 'EXECUTE'))
      AS rpc_sensibles_anon_bloqueadas,
    bool_and(has_function_privilege('authenticated', p.oid, 'EXECUTE'))
      AS rpc_sensibles_auth_habilitadas
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN (
      'verificar_token',
      'activar_token',
      'activar_token_docente',
      'crear_clase',
      'buscar_clase_para_unirse',
      'unirse_clase'
    )
), cuerpos AS (
  SELECT
    bool_or(
      p.proname = 'activar_token'
      AND pg_get_functiondef(p.oid) ILIKE '%FOR UPDATE%'
    ) AS activacion_libro_atomica,
    bool_or(
      p.proname = 'activar_token_docente'
      AND pg_get_functiondef(p.oid) ILIKE '%FOR UPDATE%'
    ) AS activacion_docente_atomica,
    bool_or(
      p.proname = 'crear_clase'
      AND (
        pg_get_functiondef(p.oid) ILIKE '%gen_random_bytes(10)%'
        OR pg_get_functiondef(p.oid) ILIKE '%gen_random_uuid()%'
      )
    ) AS codigos_nuevos_largos,
    bool_and(
      CASE
        WHEN p.proname IN ('buscar_clase_para_unirse', 'unirse_clase')
        THEN pg_get_functiondef(p.oid) ILIKE '%intentos_clase%'
        ELSE true
      END
    ) AS clases_con_limite
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN (
      'activar_token',
      'activar_token_docente',
      'crear_clase',
      'buscar_clase_para_unirse',
      'unirse_clase'
    )
)
SELECT
  f.*,
  c.*,
  NOT has_table_privilege('anon', 'public.escuelas', 'SELECT')
    AS escuelas_anon_bloqueadas,
  NOT has_table_privilege('anon', 'public.grados', 'SELECT')
    AS grados_anon_bloqueados,
  NOT has_table_privilege('anon', 'public.libros', 'SELECT')
    AS libros_anon_bloqueados,
  to_regclass('public.intentos_clase') IS NOT NULL
    AS tabla_limite_clases
FROM funciones f
CROSS JOIN cuerpos c;

-- Las inconsistencias históricas se informan pero no se corrigen
-- automáticamente.
SELECT
  count(*) FILTER (
    WHERE c.escuela_id IS NULL OR c.grado_id IS NULL
  ) AS clases_historicas_sin_ambito,
  count(*) FILTER (
    WHERE p.id IS NULL
       OR p.rol IS DISTINCT FROM 'docente'
       OR p.escuela_id IS DISTINCT FROM c.escuela_id
  ) AS clases_historicas_docente_incompatible
FROM public.clases c
LEFT JOIN public.profiles p ON p.id = c.docente_id;
