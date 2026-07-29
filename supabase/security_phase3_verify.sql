-- Debe devolver una fila con todos los indicadores en true.
SELECT
  to_regclass('public.superadministradores') IS NOT NULL AS tabla_superadmins,
  to_regclass('public.acciones_admin_pendientes') IS NOT NULL AS tabla_aprobaciones,
  to_regprocedure('public.es_superadministrador()') IS NOT NULL AS fn_superadmin,
  to_regprocedure('public.sesion_es_aal2()') IS NOT NULL AS fn_aal2,
  to_regprocedure('public.admin_solicitar_accion_sensible(text,jsonb)') IS NOT NULL AS fn_solicitar,
  to_regprocedure('public.superadmin_resolver_accion(uuid,boolean)') IS NOT NULL AS fn_resolver,
  NOT has_table_privilege('authenticated', 'public.escuela_libros', 'INSERT') AS relacion_insert_revocado,
  NOT has_table_privilege('authenticated', 'public.escuela_libros', 'DELETE') AS relacion_delete_revocado,
  NOT has_table_privilege('authenticated', 'public.tokens', 'INSERT') AS tokens_insert_revocado,
  NOT has_table_privilege('authenticated', 'public.tokens', 'UPDATE') AS tokens_update_revocado,
  EXISTS (
    SELECT 1
    FROM public.superadministradores s
    JOIN public.profiles p ON p.id = s.usuario_id
    WHERE s.activo
      AND p.rol = 'admin'
      AND lower(p.email) = 'superlibelulaadmin@gmail.com'
  ) AS superadmin_inicial;

-- Las funciones privilegiadas deben usar SECURITY DEFINER y search_path fijo.
SELECT
  p.proname,
  p.prosecdef AS security_definer,
  p.proconfig
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'es_superadministrador',
    'admin_solicitar_accion_sensible',
    'superadmin_resolver_accion',
    'admin_cambiar_rol_usuario'
  )
ORDER BY p.proname;
