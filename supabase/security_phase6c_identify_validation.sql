-- ============================================================
-- IAbooks — Fase 6C: integridad del contenido de identificar
-- Preflight, protección y postflight.
-- ============================================================

BEGIN;

DO $preflight$
DECLARE
  v_invalidas BIGINT;
BEGIN
  SELECT count(*) INTO v_invalidas
  FROM public.actividades a
  WHERE a.tipo = 'identificar'
    AND CASE
      WHEN jsonb_typeof(a.campos -> 'opciones') IS DISTINCT FROM 'array'
        THEN true
      ELSE
        jsonb_array_length(a.campos -> 'opciones') < 2
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements(a.campos -> 'opciones') o
          WHERE trim(COALESCE(o ->> 'texto', '')) = ''
        )
        OR (
          SELECT count(*)
          FROM jsonb_array_elements(a.campos -> 'opciones')
        ) <> (
          SELECT count(
            DISTINCT public.normalizar_respuesta_texto(o ->> 'texto')
          )
          FROM jsonb_array_elements(a.campos -> 'opciones') o
        )
        OR NOT EXISTS (
          SELECT 1
          FROM jsonb_array_elements(a.campos -> 'opciones') o
          WHERE COALESCE((o ->> 'esCorrecta')::boolean, false)
        )
        OR NOT EXISTS (
          SELECT 1
          FROM jsonb_array_elements(a.campos -> 'opciones') o
          WHERE NOT COALESCE((o ->> 'esCorrecta')::boolean, false)
        )
    END;

  IF v_invalidas > 0 THEN
    RAISE EXCEPTION
      'fase6c_identificar: existen % actividades inválidas', v_invalidas;
  END IF;
END
$preflight$;

CREATE OR REPLACE FUNCTION public.validar_actividad_identificar()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
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

DROP TRIGGER IF EXISTS actividades_identificar_validacion
  ON public.actividades;
CREATE TRIGGER actividades_identificar_validacion
BEFORE INSERT OR UPDATE OF tipo, campos
ON public.actividades
FOR EACH ROW
EXECUTE FUNCTION public.validar_actividad_identificar();

REVOKE ALL ON FUNCTION public.validar_actividad_identificar()
  FROM PUBLIC, anon, authenticated;

DO $verify$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = 'public.actividades'::regclass
      AND tgname = 'actividades_identificar_validacion'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'fase6c_identificar: trigger ausente';
  END IF;
END
$verify$;

COMMIT;

SELECT
  true AS identificar_validado_en_base,
  true AS textos_vacios_bloqueados,
  true AS textos_duplicados_bloqueados,
  true AS correcta_y_distractor_requeridos;
