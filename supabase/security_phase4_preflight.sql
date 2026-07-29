-- IAbooks — Fase 4: preflight de contención crítica
-- Solo lectura. Debe ejecutarse antes de security_phase4.sql.

SELECT
  to_regclass('public.libro_activaciones') IS NOT NULL AS tabla_activaciones,
  to_regclass('public.acciones_admin_pendientes') IS NOT NULL AS tabla_aprobaciones,
  to_regclass('public.superadministradores') IS NOT NULL AS tabla_superadmins,
  to_regprocedure('public.activar_token(text)') IS NOT NULL AS rpc_activar_token,
  to_regprocedure('public.admin_cambiar_rol_usuario(uuid,text)') IS NOT NULL AS rpc_cambiar_rol,
  to_regprocedure('public.superadmin_resolver_accion_v2(uuid,boolean)') IS NOT NULL AS rpc_resolver_v2;

-- Debe devolver 0. Si devuelve un valor mayor, no ejecutar la migración:
-- esas activaciones deben investigarse porque no están vinculadas a un token.
SELECT count(*) AS activaciones_sin_token
FROM public.libro_activaciones
WHERE token_id IS NULL;

-- Debe devolver 0. Detecta activaciones que no corresponden al usuario,
-- libro y estado del token que supuestamente las originó.
SELECT count(*) AS activaciones_inconsistentes
FROM public.libro_activaciones la
LEFT JOIN public.tokens t ON t.id = la.token_id
WHERE t.id IS NULL
   OR t.tipo IS DISTINCT FROM 'libro'
   OR t.estado IS DISTINCT FROM 'activado'
   OR t.usuario_id IS DISTINCT FROM la.usuario_id
   OR t.libro_id IS DISTINCT FROM la.libro_id;

-- Debe devolver al menos 1.
SELECT count(*) AS superadmins_activos_con_rol_admin
FROM public.superadministradores s
JOIN public.profiles p ON p.id = s.usuario_id
WHERE s.activo
  AND p.rol = 'admin';
