-- IAbooks — Fase 4: verificación posterior
-- La primera consulta debe devolver una fila con todos los indicadores en true.

SELECT
  NOT has_table_privilege(
    'authenticated', 'public.libro_activaciones', 'INSERT'
  ) AS activaciones_insert_cerrado,
  NOT has_table_privilege(
    'authenticated', 'public.libro_activaciones', 'UPDATE'
  ) AS activaciones_update_cerrado,
  NOT has_table_privilege(
    'authenticated', 'public.libro_activaciones', 'DELETE'
  ) AS activaciones_delete_cerrado,
  (
    SELECT a.attnotnull
    FROM pg_attribute a
    WHERE a.attrelid = 'public.libro_activaciones'::regclass
      AND a.attname = 'token_id'
      AND NOT a.attisdropped
  ) AS token_id_obligatorio,
  to_regprocedure(
    'public.superadmin_resolver_accion_v3(uuid,boolean)'
  ) IS NOT NULL AS resolver_v3,
  has_function_privilege(
    'authenticated',
    'public.superadmin_resolver_accion_v3(uuid,boolean)',
    'EXECUTE'
  ) AS authenticated_puede_resolver_v3,
  has_function_privilege(
    'authenticated',
    'public.superadmin_resolver_accion_v2(uuid,boolean)',
    'EXECUTE'
  ) AS alias_v2_compatible,
  NOT has_function_privilege(
    'authenticated',
    'public.superadmin_resolver_accion_fase3_interna(uuid,boolean)',
    'EXECUTE'
  ) AS resolver_interno_cerrado,
  NOT has_function_privilege(
    'authenticated',
    'public.superadmin_resolver_accion(uuid,boolean)',
    'EXECUTE'
  ) AS resolver_v1_cerrado,
  EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = 'public.profiles'::regclass
      AND tgname = 'proteger_cambio_rol_aprobado'
      AND NOT tgisinternal
      AND tgenabled <> 'D'
  ) AS trigger_roles_activo,
  EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.acciones_admin_pendientes'::regclass
      AND conname = 'acciones_admin_pendientes_tipo_check'
      AND pg_get_constraintdef(oid) LIKE '%cambiar_rol_usuario%'
  ) AS tipo_cambio_rol_permitido;

-- Debe devolver exactamente una política SELECT, sin INSERT/UPDATE/DELETE.
SELECT
  policyname,
  cmd,
  roles,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'libro_activaciones'
ORDER BY policyname;

-- Deben ser SECURITY DEFINER y usar pg_catalog al comienzo del search_path.
SELECT
  p.proname,
  p.prosecdef AS security_definer,
  p.proconfig
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'admin_cambiar_rol_usuario',
    'proteger_cambio_rol_aprobado',
    'superadmin_resolver_accion_v3'
  )
ORDER BY p.proname;

-- Debe devolver al menos 1.
SELECT count(*) AS superadmins_activos_con_rol_admin
FROM public.superadministradores s
JOIN public.profiles p ON p.id = s.usuario_id
WHERE s.activo
  AND p.rol = 'admin';
