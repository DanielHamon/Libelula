-- ============================================================
-- IAbooks — Hotfix: protección del cambio administrativo de rol
-- Impide auto-degradación y conservar al menos un administrador.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.admin_cambiar_rol_usuario(
  p_usuario_id UUID,
  p_rol TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT public.es_admin() THEN
    RAISE EXCEPTION 'acceso_denegado' USING ERRCODE = '42501';
  END IF;

  IF p_rol NOT IN ('estudiante', 'docente', 'admin') THEN
    RETURN json_build_object('ok', false, 'motivo', 'rol_invalido');
  END IF;

  IF p_usuario_id = auth.uid() AND p_rol IS DISTINCT FROM 'admin' THEN
    RETURN json_build_object('ok', false, 'motivo', 'no_puedes_cambiar_tu_rol');
  END IF;

  IF p_rol IS DISTINCT FROM 'admin'
     AND EXISTS (
       SELECT 1 FROM public.profiles
       WHERE id = p_usuario_id AND rol = 'admin'
     )
     AND (SELECT COUNT(*) FROM public.profiles WHERE rol = 'admin') <= 1 THEN
    RETURN json_build_object('ok', false, 'motivo', 'ultimo_admin');
  END IF;

  UPDATE public.profiles
  SET rol = p_rol
  WHERE id = p_usuario_id;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'motivo', 'usuario_no_encontrado');
  END IF;

  RETURN json_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_cambiar_rol_usuario(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_cambiar_rol_usuario(UUID, TEXT)
  TO authenticated;

COMMIT;

SELECT
  p.prosecdef AS security_definer,
  p.proconfig AS configuracion,
  has_function_privilege(
    'authenticated',
    'public.admin_cambiar_rol_usuario(uuid,text)',
    'EXECUTE'
  ) AS authenticated_puede_ejecutar
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'admin_cambiar_rol_usuario';
