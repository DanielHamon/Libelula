-- Verificación consolidada de la fase 1.
-- Es una sola consulta: Supabase permite exportar todos los resultados juntos.

WITH function_audit AS (
  SELECT
    p.proname,
    pg_get_function_identity_arguments(p.oid) AS argumentos,
    p.prosecdef,
    COALESCE(array_to_string(p.proconfig, ', '), '') AS configuracion
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN (
      'activar_token',
      'activar_token_docente',
      'crear_clase',
      'get_libro_completo',
      'admin_cambiar_rol_usuario'
    )
),
checks AS (
  SELECT
    1 AS orden,
    'firmas_rpc_seguras'::text AS comprobacion,
    (
      (SELECT COUNT(*) FROM function_audit) = 5
      AND NOT EXISTS (
        SELECT 1 FROM function_audit
        WHERE proname IN ('activar_token', 'activar_token_docente')
          AND argumentos <> 'p_token text'
      )
    ) AS correcto,
    COALESCE(
      (SELECT jsonb_agg(to_jsonb(f) ORDER BY f.proname) FROM function_audit f),
      '[]'::jsonb
    ) AS detalle

  UNION ALL

  SELECT
    2,
    'security_definer_con_search_path',
    NOT EXISTS (
      SELECT 1 FROM function_audit
      WHERE NOT prosecdef
         OR configuracion NOT LIKE '%search_path=%'
    ),
    COALESCE(
      (SELECT jsonb_agg(to_jsonb(f) ORDER BY f.proname) FROM function_audit f),
      '[]'::jsonb
    )

  UNION ALL

  SELECT
    3,
    'rls_clase_libros',
    (
      COALESCE((
        SELECT c.relrowsecurity
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = 'clase_libros'
      ), false)
      AND (
        SELECT COUNT(*) = 3
        FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'clase_libros'
      )
    ),
    COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object('policy', policyname, 'cmd', cmd, 'roles', roles)
        ORDER BY policyname
      )
      FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'clase_libros'
    ), '[]'::jsonb)

  UNION ALL

  SELECT
    4,
    'contenido_sin_privilegios_anon',
    NOT EXISTS (
      SELECT 1
      FROM information_schema.role_table_grants
      WHERE table_schema = 'public'
        AND table_name IN ('unidades', 'actividades')
        AND grantee = 'anon'
    ),
    COALESCE((
      SELECT jsonb_agg(to_jsonb(g))
      FROM information_schema.role_table_grants g
      WHERE table_schema = 'public'
        AND table_name IN ('unidades', 'actividades')
        AND grantee = 'anon'
    ), '[]'::jsonb)

  UNION ALL

  SELECT
    5,
    'politicas_contenido_autorizado',
    (
      EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'unidades'
          AND policyname = 'unidades_authorized_read'
      )
      AND EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'actividades'
          AND policyname = 'actividades_authorized_read'
      )
    ),
    COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object('tabla', tablename, 'policy', policyname, 'cmd', cmd)
        ORDER BY tablename, policyname
      )
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename IN ('unidades', 'actividades')
        AND policyname IN (
          'unidades_authorized_read',
          'actividades_authorized_read'
        )
    ), '[]'::jsonb)

  UNION ALL

  SELECT
    6,
    'vista_progreso_security_invoker',
    COALESCE((
      SELECT 'security_invoker=true' = ANY(COALESCE(c.reloptions, ARRAY[]::text[]))
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'progreso_clase'
    ), false),
    COALESCE((
      SELECT to_jsonb(c.reloptions)
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'progreso_clase'
    ), 'null'::jsonb)

  UNION ALL

  SELECT
    7,
    'storage_sin_lectura_global',
    (
      NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'storage'
          AND tablename = 'objects'
          AND policyname = 'authenticated read libros'
      )
      AND EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'storage'
          AND tablename = 'objects'
          AND policyname = 'authenticated_read_libros_authorized'
      )
    ),
    COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object('policy', policyname, 'cmd', cmd, 'roles', roles)
        ORDER BY policyname
      )
      FROM pg_policies
      WHERE schemaname = 'storage'
        AND tablename = 'objects'
        AND policyname IN (
          'authenticated read libros',
          'authenticated_read_libros_authorized'
        )
    ), '[]'::jsonb)

  UNION ALL

  SELECT
    8,
    'perfil_sin_update_columnas_sensibles',
    (
      NOT has_column_privilege('authenticated', 'public.profiles', 'rol', 'UPDATE')
      AND NOT has_column_privilege('authenticated', 'public.profiles', 'escuela_id', 'UPDATE')
      AND NOT has_column_privilege('authenticated', 'public.profiles', 'grado_id', 'UPDATE')
      AND has_column_privilege('authenticated', 'public.profiles', 'nombre', 'UPDATE')
    ),
    jsonb_build_object(
      'rol', has_column_privilege('authenticated', 'public.profiles', 'rol', 'UPDATE'),
      'escuela_id', has_column_privilege('authenticated', 'public.profiles', 'escuela_id', 'UPDATE'),
      'grado_id', has_column_privilege('authenticated', 'public.profiles', 'grado_id', 'UPDATE'),
      'nombre', has_column_privilege('authenticated', 'public.profiles', 'nombre', 'UPDATE')
    )
)
SELECT comprobacion, correcto, detalle
FROM checks
ORDER BY orden;
