-- Ejecutar antes de security_phase3.sql.
-- Debe devolver exactamente una fila y todos sus indicadores deben ser true.
SELECT
  p.id IS NOT NULL AS perfil_existe,
  p.rol = 'admin' AS perfil_es_admin,
  EXISTS (
    SELECT 1
    FROM auth.mfa_factors f
    WHERE f.user_id = p.id
      AND f.factor_type = 'totp'
      AND f.status = 'verified'
  ) AS totp_verificado,
  to_regprocedure('public.es_admin()') IS NOT NULL AS funcion_es_admin,
  to_regprocedure('public.admin_cambiar_rol_usuario(uuid,text)') IS NOT NULL AS rpc_roles_existente
FROM public.profiles p
WHERE lower(p.email) = 'superlibelulaadmin@gmail.com';
