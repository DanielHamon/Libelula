-- ============================================================
-- IAbooks — Fase 6C: ocultación de lineaTiempoEmocional
-- Aplicar únicamente después de validar el frontend compatible.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.campos_publicos_actividad(
  p_tipo TEXT,
  p_campos JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog
AS $$
DECLARE
  v_campos JSONB := COALESCE(p_campos, '{}'::jsonb);
BEGIN
  IF p_tipo IN (
    'seleccionMultiple',
    'identificar',
    'selectorEmocionColor'
  ) AND jsonb_typeof(v_campos -> 'opciones') = 'array' THEN
    RETURN jsonb_set(
      v_campos,
      '{opciones}',
      COALESCE(
        (
          SELECT jsonb_agg(opcion - 'esCorrecta' ORDER BY n)
          FROM jsonb_array_elements(v_campos -> 'opciones')
            WITH ORDINALITY AS o(opcion, n)
        ),
        '[]'::jsonb
      )
    );
  END IF;

  IF p_tipo = 'verdaderoFalso'
     AND jsonb_typeof(v_campos -> 'afirmaciones') = 'array' THEN
    RETURN jsonb_set(
      v_campos,
      '{afirmaciones}',
      COALESCE(
        (
          SELECT jsonb_agg(afirmacion - 'esVerdadero' ORDER BY n)
          FROM jsonb_array_elements(v_campos -> 'afirmaciones')
            WITH ORDINALITY AS a(afirmacion, n)
        ),
        '[]'::jsonb
      )
    );
  END IF;

  IF p_tipo = 'lineaTiempoEmocional'
     AND jsonb_typeof(v_campos -> 'momentos') = 'array' THEN
    RETURN jsonb_set(
      v_campos,
      '{momentos}',
      COALESCE(
        (
          SELECT jsonb_agg(
            momento || jsonb_build_object(
              'opciones',
              COALESCE(
                (
                  SELECT jsonb_agg(opcion - 'esCorrecta' ORDER BY opcion_n)
                  FROM jsonb_array_elements(
                    COALESCE(momento -> 'opciones', '[]'::jsonb)
                  ) WITH ORDINALITY AS o(opcion, opcion_n)
                ),
                '[]'::jsonb
              )
            )
            ORDER BY momento_n
          )
          FROM jsonb_array_elements(v_campos -> 'momentos')
            WITH ORDINALITY AS m(momento, momento_n)
        ),
        '[]'::jsonb
      )
    );
  END IF;

  RETURN v_campos;
END;
$$;

REVOKE ALL ON FUNCTION public.campos_publicos_actividad(TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;

DO $verify$
DECLARE
  v_timeline JSONB;
BEGIN
  v_timeline := public.campos_publicos_actividad(
    'lineaTiempoEmocional',
    '{"momentos":[{"texto":"Inicio","opciones":[{"id":"a","texto":"Calma","esCorrecta":true},{"id":"b","texto":"Miedo","esCorrecta":false}]}]}'::jsonb
  );

  IF jsonb_path_exists(v_timeline, '$.momentos[*].opciones[*].esCorrecta') THEN
    RAISE EXCEPTION 'fase6c: esCorrecta continúa visible en línea emocional';
  END IF;

  IF v_timeline #>> '{momentos,0,texto}' <> 'Inicio'
     OR v_timeline #>> '{momentos,0,opciones,0,texto}' <> 'Calma'
     OR jsonb_array_length(v_timeline #> '{momentos,0,opciones}') <> 2 THEN
    RAISE EXCEPTION 'fase6c: se eliminó contenido público de línea emocional';
  END IF;

  IF jsonb_path_exists(
    public.campos_publicos_actividad(
      'seleccionMultiple',
      '{"opciones":[{"texto":"A","esCorrecta":true}]}'::jsonb
    ),
    '$.opciones[*].esCorrecta'
  ) OR jsonb_path_exists(
    public.campos_publicos_actividad(
      'identificar',
      '{"opciones":[{"texto":"A","esCorrecta":true}]}'::jsonb
    ),
    '$.opciones[*].esCorrecta'
  ) OR jsonb_path_exists(
    public.campos_publicos_actividad(
      'selectorEmocionColor',
      '{"opciones":[{"id":"a","esCorrecta":true}]}'::jsonb
    ),
    '$.opciones[*].esCorrecta'
  ) OR jsonb_path_exists(
    public.campos_publicos_actividad(
      'verdaderoFalso',
      '{"afirmaciones":[{"texto":"A","esVerdadero":true}]}'::jsonb
    ),
    '$.afirmaciones[*].esVerdadero'
  ) THEN
    RAISE EXCEPTION 'fase6c: regresión en redacciones anteriores';
  END IF;
END
$verify$;

COMMIT;

SELECT
  true AS linea_emocional_sin_soluciones,
  true AS momentos_y_opciones_conservados,
  true AS selector_emocion_sigue_protegido,
  true AS identificar_sigue_protegido,
  true AS verdadero_falso_sigue_protegido,
  true AS seleccion_multiple_sigue_protegida;
