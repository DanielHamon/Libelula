-- ============================================================
-- IAbooks — Hotfix Fase 6C: permisos del trigger identificar
-- Mantiene normalizar_respuesta_texto como función interna.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.validar_actividad_identificar()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_total INTEGER;
  v_distintas INTEGER;
BEGIN
  IF NEW.tipo <> 'identificar' THEN
    RETURN NEW;
  END IF;

  IF jsonb_typeof(NEW.campos -> 'opciones') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'identificar_opciones_invalidas' USING ERRCODE = '23514';
  END IF;

  SELECT
    count(*),
    count(DISTINCT public.normalizar_respuesta_texto(o ->> 'texto'))
  INTO v_total, v_distintas
  FROM jsonb_array_elements(NEW.campos -> 'opciones') o;

  IF v_total < 2 THEN
    RAISE EXCEPTION 'identificar_requiere_dos_opciones'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(NEW.campos -> 'opciones') o
    WHERE trim(COALESCE(o ->> 'texto', '')) = ''
  ) THEN
    RAISE EXCEPTION 'identificar_texto_vacio' USING ERRCODE = '23514';
  END IF;

  IF v_distintas <> v_total THEN
    RAISE EXCEPTION 'identificar_texto_duplicado' USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(NEW.campos -> 'opciones') o
    WHERE COALESCE((o ->> 'esCorrecta')::boolean, false)
  ) THEN
    RAISE EXCEPTION 'identificar_sin_respuesta_correcta'
      USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(NEW.campos -> 'opciones') o
    WHERE NOT COALESCE((o ->> 'esCorrecta')::boolean, false)
  ) THEN
    RAISE EXCEPTION 'identificar_sin_distractor' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validar_actividad_identificar()
  FROM PUBLIC, anon, authenticated;

DO $verify$
DECLARE
  v_security_definer BOOLEAN;
  v_safe_path BOOLEAN;
BEGIN
  SELECT
    p.prosecdef,
    COALESCE(p.proconfig, ARRAY[]::text[])
      @> ARRAY['search_path=pg_catalog, public']
  INTO v_security_definer, v_safe_path
  FROM pg_proc p
  WHERE p.oid = 'public.validar_actividad_identificar()'::regprocedure;

  IF NOT COALESCE(v_security_definer, false)
     OR NOT COALESCE(v_safe_path, false) THEN
    RAISE EXCEPTION 'fase6c_identificar_hotfix: función no endurecida';
  END IF;

  IF has_function_privilege(
    'authenticated',
    'public.normalizar_respuesta_texto(text)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'fase6c_identificar_hotfix: normalizador expuesto';
  END IF;
END
$verify$;

COMMIT;

SELECT
  true AS trigger_identificar_security_definer,
  true AS search_path_seguro,
  true AS normalizador_sigue_restringido,
  true AS creacion_admin_compatible;
