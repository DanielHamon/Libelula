-- ============================================================
-- IAbooks — Fase 6C: ocultación de completarPalabras
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
  v_texto TEXT;
BEGIN
  IF p_tipo IN (
    'seleccionMultiple', 'identificar', 'selectorEmocionColor'
  ) AND jsonb_typeof(v_campos -> 'opciones') = 'array' THEN
    RETURN jsonb_set(
      v_campos, '{opciones}',
      COALESCE((
        SELECT jsonb_agg(opcion - 'esCorrecta' ORDER BY n)
        FROM jsonb_array_elements(v_campos -> 'opciones')
          WITH ORDINALITY AS o(opcion, n)
      ), '[]'::jsonb)
    );
  END IF;

  IF p_tipo = 'verdaderoFalso'
     AND jsonb_typeof(v_campos -> 'afirmaciones') = 'array' THEN
    RETURN jsonb_set(
      v_campos, '{afirmaciones}',
      COALESCE((
        SELECT jsonb_agg(afirmacion - 'esVerdadero' ORDER BY n)
        FROM jsonb_array_elements(v_campos -> 'afirmaciones')
          WITH ORDINALITY AS a(afirmacion, n)
      ), '[]'::jsonb)
    );
  END IF;

  IF p_tipo = 'lineaTiempoEmocional'
     AND jsonb_typeof(v_campos -> 'momentos') = 'array' THEN
    RETURN jsonb_set(
      v_campos, '{momentos}',
      COALESCE((
        SELECT jsonb_agg(
          momento || jsonb_build_object(
            'opciones',
            COALESCE((
              SELECT jsonb_agg(opcion - 'esCorrecta' ORDER BY opcion_n)
              FROM jsonb_array_elements(
                COALESCE(momento -> 'opciones', '[]'::jsonb)
              ) WITH ORDINALITY AS o(opcion, opcion_n)
            ), '[]'::jsonb)
          )
          ORDER BY momento_n
        )
        FROM jsonb_array_elements(v_campos -> 'momentos')
          WITH ORDINALITY AS m(momento, momento_n)
      ), '[]'::jsonb)
    );
  END IF;

  IF p_tipo = 'completarPalabras' THEN
    v_texto := regexp_replace(
      COALESCE(v_campos ->> 'texto', ''),
      '\[[^]\n]+\]',
      '[___]',
      'g'
    );
    v_texto := regexp_replace(
      v_texto,
      '\{\{[^}\n]+\}\}',
      '{{___}}',
      'g'
    );

    v_campos := jsonb_set(v_campos, '{texto}', to_jsonb(v_texto));

    IF jsonb_typeof(v_campos -> 'respuestas') = 'array' THEN
      v_campos := jsonb_set(
        v_campos,
        '{respuestas}',
        COALESCE((
          SELECT jsonb_agg('___'::text ORDER BY n)
          FROM jsonb_array_elements(v_campos -> 'respuestas')
            WITH ORDINALITY AS r(valor, n)
        ), '[]'::jsonb)
      );
    END IF;

    RETURN v_campos;
  END IF;

  RETURN v_campos;
END;
$$;

REVOKE ALL ON FUNCTION public.campos_publicos_actividad(TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;

DO $verify$
DECLARE
  v_publico JSONB;
BEGIN
  v_publico := public.campos_publicos_actividad(
    'completarPalabras',
    '{"texto":"El [perro] mira la {{luna}}.","respuestas":["perro","luna"]}'::jsonb
  );

  IF v_publico::text ~* 'perro|luna' THEN
    RAISE EXCEPTION 'fase6c: respuestas de completarPalabras visibles';
  END IF;

  IF v_publico ->> 'texto' <> 'El [___] mira la {{___}}.'
     OR jsonb_array_length(v_publico -> 'respuestas') <> 2 THEN
    RAISE EXCEPTION 'fase6c: plantilla de completarPalabras dañada';
  END IF;

  IF jsonb_path_exists(
    public.campos_publicos_actividad(
      'seleccionMultiple',
      '{"opciones":[{"texto":"A","esCorrecta":true}]}'::jsonb
    ), '$.opciones[*].esCorrecta'
  ) OR jsonb_path_exists(
    public.campos_publicos_actividad(
      'verdaderoFalso',
      '{"afirmaciones":[{"texto":"A","esVerdadero":true}]}'::jsonb
    ), '$.afirmaciones[*].esVerdadero'
  ) OR jsonb_path_exists(
    public.campos_publicos_actividad(
      'lineaTiempoEmocional',
      '{"momentos":[{"opciones":[{"texto":"A","esCorrecta":true}]}]}'::jsonb
    ), '$.momentos[*].opciones[*].esCorrecta'
  ) THEN
    RAISE EXCEPTION 'fase6c: regresión en redacciones anteriores';
  END IF;
END
$verify$;

COMMIT;

SELECT
  true AS completar_palabras_sin_soluciones,
  true AS plantilla_y_espacios_conservados,
  true AS respuestas_array_redactadas,
  true AS redacciones_anteriores_conservadas;
