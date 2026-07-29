-- IAbooks — Fase 5: mensajes tempranos al validar tokens
-- Ejecutar después de security_phase1.sql.

BEGIN;

CREATE OR REPLACE FUNCTION public.verificar_token(p_token TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_token     public.tokens%ROWTYPE;
  v_profile   public.profiles%ROWTYPE;
  v_uid       UUID := auth.uid();
  v_intentos  INTEGER;
BEGIN
  IF v_uid IS NOT NULL THEN
    SELECT COUNT(*) INTO v_intentos
    FROM public.intentos_token
    WHERE uid = v_uid
      AND intentado_en > now() - interval '1 hour';

    IF v_intentos >= 10 THEN
      RETURN json_build_object(
        'valido', false,
        'motivo', 'demasiados_intentos'
      );
    END IF;
  END IF;

  SELECT * INTO v_token
  FROM public.tokens
  WHERE id = upper(trim(p_token))
    AND estado = 'valido'
    AND (expira_en IS NULL OR expira_en >= now());

  IF NOT FOUND THEN
    IF v_uid IS NOT NULL THEN
      INSERT INTO public.intentos_token(uid) VALUES (v_uid);
    END IF;
    RETURN json_build_object(
      'valido', false,
      'motivo', 'token_invalido'
    );
  END IF;

  -- Para un usuario autenticado, anticipar las incompatibilidades que la
  -- activación volverá a comprobar de forma atómica. No se exponen IDs.
  IF v_uid IS NOT NULL AND v_token.tipo = 'libro' THEN
    SELECT * INTO v_profile
    FROM public.profiles
    WHERE id = v_uid;

    IF FOUND
       AND v_profile.escuela_id IS NOT NULL
       AND v_profile.escuela_id IS DISTINCT FROM v_token.escuela_id THEN
      RETURN json_build_object(
        'valido', false,
        'motivo', 'escuela_incorrecta'
      );
    END IF;

    IF FOUND
       AND v_profile.grado_id IS NOT NULL
       AND v_profile.grado_id IS DISTINCT FROM v_token.grado_id THEN
      RETURN json_build_object(
        'valido', false,
        'motivo', 'grado_incorrecto'
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.escuela_libros el
      WHERE el.escuela_id = v_token.escuela_id
        AND el.libro_id = v_token.libro_id
    ) THEN
      RETURN json_build_object(
        'valido', false,
        'motivo', 'libro_no_disponible_en_escuela'
      );
    END IF;
  END IF;

  RETURN json_build_object(
    'valido', true,
    'tipo', v_token.tipo,
    'libro_titulo', v_token.libro_titulo
  );
END;
$$;

REVOKE ALL ON FUNCTION public.verificar_token(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verificar_token(TEXT)
  TO anon, authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'verificar_token'
      AND pg_get_functiondef(p.oid) LIKE '%grado_incorrecto%'
      AND pg_get_functiondef(p.oid) LIKE '%escuela_incorrecta%'
  ) THEN
    RAISE EXCEPTION 'postflight_feedback_token_fallo';
  END IF;
END;
$$;

COMMIT;

SELECT
  true AS validacion_temprana_aplicada,
  true AS mensaje_grado_habilitado,
  true AS mensaje_escuela_habilitado;
