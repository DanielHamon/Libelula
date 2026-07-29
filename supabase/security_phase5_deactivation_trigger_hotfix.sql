-- IAbooks — Hotfix: trigger compartido de desactivación
-- Corrige el acceso a OLD.activa/OLD.activo en registros de tablas diferentes.

BEGIN;

CREATE OR REPLACE FUNCTION public.bloquear_desactivacion_directa()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_old JSONB := to_jsonb(OLD);
  v_new JSONB := to_jsonb(NEW);
  v_antes_activo BOOLEAN;
  v_despues_activo BOOLEAN;
BEGIN
  IF TG_TABLE_SCHEMA <> 'public'
     OR TG_TABLE_NAME NOT IN ('escuelas', 'libros') THEN
    RAISE EXCEPTION 'tabla_no_permitida_para_trigger'
      USING ERRCODE = '55000';
  END IF;

  v_antes_activo := CASE TG_TABLE_NAME
    WHEN 'escuelas' THEN (v_old ->> 'activa')::boolean
    WHEN 'libros' THEN (v_old ->> 'activo')::boolean
  END;
  v_despues_activo := CASE TG_TABLE_NAME
    WHEN 'escuelas' THEN (v_new ->> 'activa')::boolean
    WHEN 'libros' THEN (v_new ->> 'activo')::boolean
  END;

  IF v_antes_activo
     AND NOT v_despues_activo
     AND COALESCE(auth.jwt() ->> 'role', '') <> 'service_role'
     AND current_setting('app.fase3_aprobada', true) IS DISTINCT FROM 'si' THEN
    RAISE EXCEPTION 'aprobacion_requerida' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.bloquear_desactivacion_directa() FROM PUBLIC;

DO $$
DECLARE
  v_definition TEXT;
BEGIN
  SELECT pg_get_functiondef(
    'public.bloquear_desactivacion_directa()'::regprocedure
  ) INTO v_definition;

  IF v_definition NOT LIKE '%to_jsonb(OLD)%'
     OR v_definition LIKE '%OLD.activa%'
     OR v_definition LIKE '%OLD.activo%' THEN
    RAISE EXCEPTION 'postflight_trigger_desactivacion_fallo';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = 'public.escuelas'::regclass
      AND tgname = 'escuelas_bloquear_desactivacion_directa'
      AND NOT tgisinternal
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = 'public.libros'::regclass
      AND tgname = 'libros_bloquear_desactivacion_directa'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'triggers_desactivacion_no_encontrados';
  END IF;
END;
$$;

COMMIT;

SELECT
  true AS hotfix_aplicado,
  true AS escuelas_protegidas,
  true AS libros_protegidos,
  true AS campos_dinamicos_corregidos;
