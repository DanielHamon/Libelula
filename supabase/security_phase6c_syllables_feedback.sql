-- ============================================================
-- IAbooks — Fase 6C: feedback seguro por fila para separarSilabas
-- Devuelve solo verdadero/falso por palabra. Nunca devuelve soluciones.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.evaluar_detalle_separar_silabas(
  p_actividad_id TEXT,
  p_respuesta JSONB
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_tipo TEXT;
  v_campos JSONB;
  v_libro_id TEXT;
  v_resultados JSONB;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'autenticacion_requerida' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_uid AND rol = 'estudiante'
  ) THEN
    RAISE EXCEPTION 'solo_estudiantes_evalúan_respuestas'
      USING ERRCODE = '42501';
  END IF;

  PERFORM public.validar_payload_respuesta(p_respuesta);

  SELECT a.tipo, a.campos, u.libro_id
  INTO v_tipo, v_campos, v_libro_id
  FROM public.actividades a
  JOIN public.unidades u ON u.id = a.unidad_id
  WHERE a.id = p_actividad_id;

  IF NOT FOUND OR v_tipo <> 'separarSilabas' THEN
    RAISE EXCEPTION 'actividad_invalida' USING ERRCODE = '22023';
  END IF;

  IF NOT public.puede_acceder_libro(v_libro_id) THEN
    RAISE EXCEPTION 'licencia_requerida' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'id', COALESCE(esperado.item ->> 'id', 'palabra-' || esperado.n::text),
      'separacionValida', EXISTS (
        SELECT 1
        FROM jsonb_array_elements(
          COALESCE(p_respuesta -> 'respuestas', '[]'::jsonb)
        ) recibido(item)
        WHERE recibido.item ->> 'id' = COALESCE(
          esperado.item ->> 'id',
          'palabra-' || esperado.n::text
        )
          AND public.normalizar_separacion_silabas(
            recibido.item ->> 'silabasDadas'
          ) = public.normalizar_separacion_silabas(COALESCE(
            esperado.item ->> 'silabas',
            esperado.item ->> 'respuesta',
            esperado.item ->> 'correcta'
          ))
      ),
      'cantidadValida', EXISTS (
        SELECT 1
        FROM jsonb_array_elements(
          COALESCE(p_respuesta -> 'respuestas', '[]'::jsonb)
        ) recibido(item)
        WHERE recibido.item ->> 'id' = COALESCE(
          esperado.item ->> 'id',
          'palabra-' || esperado.n::text
        )
          AND COALESCE(recibido.item ->> 'cantidadDada', '') = COALESCE(
            esperado.item ->> 'cantidad',
            esperado.item ->> 'numSilabas',
            esperado.item ->> 'numero',
            array_length(string_to_array(
              public.normalizar_separacion_silabas(COALESCE(
                esperado.item ->> 'silabas',
                esperado.item ->> 'respuesta',
                esperado.item ->> 'correcta'
              )),
              '-'
            ), 1)::text
          )
      )
    )
    ORDER BY esperado.n
  )
  INTO v_resultados
  FROM jsonb_array_elements(v_campos -> 'palabras')
    WITH ORDINALITY AS esperado(item, n);

  RETURN json_build_object(
    'ok', true,
    'resultados', COALESCE(v_resultados, '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.evaluar_detalle_separar_silabas(TEXT, JSONB)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.evaluar_detalle_separar_silabas(TEXT, JSONB)
  TO authenticated;

DO $verify$
DECLARE
  v_definition TEXT;
BEGIN
  SELECT pg_get_functiondef(
    'public.evaluar_detalle_separar_silabas(text,jsonb)'::regprocedure
  ) INTO v_definition;

  IF v_definition ~* 'silabasCorrectas|cantidadCorrecta'
     OR has_function_privilege(
       'anon',
       'public.evaluar_detalle_separar_silabas(text,jsonb)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'fase6c sílabas: feedback por fila inseguro';
  END IF;
END
$verify$;

COMMIT;

NOTIFY pgrst, 'reload schema';

SELECT
  true AS feedback_por_fila_disponible,
  true AS soluciones_no_devueltas,
  true AS acceso_anonimo_bloqueado,
  true AS licencia_y_rol_verificados;
