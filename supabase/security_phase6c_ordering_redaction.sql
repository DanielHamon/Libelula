-- ============================================================
-- IAbooks — Fase 6C: ocultación de órdenes correctos
-- ordenarPalabras + ordenarEventos
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
  v_palabras JSONB;
  v_palabras_originales JSONB;
  v_eventos JSONB;
  v_eventos_originales JSONB;
BEGIN
  IF p_tipo IN (
    'seleccionMultiple', 'identificar', 'selectorEmocionColor'
  ) AND jsonb_typeof(v_campos -> 'opciones') = 'array' THEN
    RETURN jsonb_set(v_campos, '{opciones}', COALESCE((
      SELECT jsonb_agg(opcion - 'esCorrecta' ORDER BY n)
      FROM jsonb_array_elements(v_campos -> 'opciones')
        WITH ORDINALITY AS o(opcion, n)
    ), '[]'::jsonb));
  END IF;

  IF p_tipo = 'verdaderoFalso'
     AND jsonb_typeof(v_campos -> 'afirmaciones') = 'array' THEN
    RETURN jsonb_set(v_campos, '{afirmaciones}', COALESCE((
      SELECT jsonb_agg(afirmacion - 'esVerdadero' ORDER BY n)
      FROM jsonb_array_elements(v_campos -> 'afirmaciones')
        WITH ORDINALITY AS a(afirmacion, n)
    ), '[]'::jsonb));
  END IF;

  IF p_tipo = 'lineaTiempoEmocional'
     AND jsonb_typeof(v_campos -> 'momentos') = 'array' THEN
    RETURN jsonb_set(v_campos, '{momentos}', COALESCE((
      SELECT jsonb_agg(
        momento || jsonb_build_object('opciones', COALESCE((
          SELECT jsonb_agg(opcion - 'esCorrecta' ORDER BY opcion_n)
          FROM jsonb_array_elements(
            COALESCE(momento -> 'opciones', '[]'::jsonb)
          ) WITH ORDINALITY AS o(opcion, opcion_n)
        ), '[]'::jsonb))
        ORDER BY momento_n
      )
      FROM jsonb_array_elements(v_campos -> 'momentos')
        WITH ORDINALITY AS m(momento, momento_n)
    ), '[]'::jsonb));
  END IF;

  IF p_tipo = 'completarPalabras' THEN
    v_texto := regexp_replace(
      COALESCE(v_campos ->> 'texto', ''),
      '\[[^]\n]+\]', '[___]', 'g'
    );
    v_texto := regexp_replace(v_texto, '\{\{[^}\n]+\}\}', '{{___}}', 'g');
    v_campos := jsonb_set(v_campos, '{texto}', to_jsonb(v_texto));
    IF jsonb_typeof(v_campos -> 'respuestas') = 'array' THEN
      v_campos := jsonb_set(v_campos, '{respuestas}', COALESCE((
        SELECT jsonb_agg('___'::text ORDER BY n)
        FROM jsonb_array_elements(v_campos -> 'respuestas')
          WITH ORDINALITY AS r(valor, n)
      ), '[]'::jsonb));
    END IF;
    RETURN v_campos;
  END IF;

  IF p_tipo = 'ordenarEventos'
     AND jsonb_typeof(v_campos -> 'eventos') = 'array' THEN
    SELECT
      jsonb_agg(evento_publico ORDER BY n),
      jsonb_agg(evento_publico ORDER BY md5(evento_publico::text))
    INTO v_eventos_originales, v_eventos
    FROM (
      SELECT evento - 'orden' - 'id' AS evento_publico, n
      FROM jsonb_array_elements(v_campos -> 'eventos')
        WITH ORDINALITY AS e(evento, n)
    ) eventos_publicos;

    IF v_eventos = v_eventos_originales
       AND jsonb_array_length(v_eventos) > 1 THEN
      SELECT jsonb_agg(evento - 'orden' - 'id' ORDER BY n DESC)
      INTO v_eventos
      FROM jsonb_array_elements(v_campos -> 'eventos')
        WITH ORDINALITY AS e(evento, n);
    END IF;

    RETURN jsonb_set(
      v_campos, '{eventos}', COALESCE(v_eventos, '[]'::jsonb)
    );
  END IF;

  IF p_tipo = 'ordenarPalabras' THEN
    IF jsonb_typeof(v_campos -> 'palabras') = 'array' THEN
      SELECT
        jsonb_agg(to_jsonb(palabra) ORDER BY n),
        jsonb_agg(to_jsonb(palabra) ORDER BY md5(palabra))
      INTO v_palabras_originales, v_palabras
      FROM jsonb_array_elements_text(v_campos -> 'palabras')
        WITH ORDINALITY AS p(palabra, n);
    ELSE
      SELECT
        jsonb_agg(to_jsonb(palabra) ORDER BY n),
        jsonb_agg(to_jsonb(palabra) ORDER BY md5(palabra))
      INTO v_palabras_originales, v_palabras
      FROM unnest(
        regexp_split_to_array(trim(COALESCE(v_campos ->> 'fraseCorrecta', '')), '\s+')
      ) WITH ORDINALITY AS p(palabra, n)
      WHERE palabra <> '';
    END IF;

    IF v_palabras = v_palabras_originales
       AND jsonb_array_length(v_palabras) > 1 THEN
      SELECT jsonb_agg(value ORDER BY n DESC)
      INTO v_palabras
      FROM jsonb_array_elements(v_palabras_originales)
        WITH ORDINALITY AS p(value, n);
    END IF;

    RETURN (v_campos - 'fraseCorrecta')
      || jsonb_build_object('palabras', COALESCE(v_palabras, '[]'::jsonb));
  END IF;

  RETURN v_campos;
END;
$$;

REVOKE ALL ON FUNCTION public.campos_publicos_actividad(TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;

DO $verify$
DECLARE
  v_eventos JSONB;
  v_palabras JSONB;
BEGIN
  v_eventos := public.campos_publicos_actividad(
    'ordenarEventos',
    '{"eventos":[{"id":"1","texto":"Primero","orden":1},{"id":"2","texto":"Después","orden":2}]}'::jsonb
  );
  v_palabras := public.campos_publicos_actividad(
    'ordenarPalabras',
    '{"fraseCorrecta":"yo leo hoy","palabras":["yo","leo","hoy"]}'::jsonb
  );

  IF jsonb_path_exists(v_eventos, '$.eventos[*].orden')
     OR jsonb_path_exists(v_eventos, '$.eventos[*].id') THEN
    RAISE EXCEPTION 'fase6c: metadatos de orden de eventos visibles';
  END IF;

  IF v_palabras ? 'fraseCorrecta'
     OR jsonb_array_length(v_palabras -> 'palabras') <> 3 THEN
    RAISE EXCEPTION 'fase6c: redacción de ordenarPalabras fallida';
  END IF;

  IF jsonb_path_exists(
    public.campos_publicos_actividad(
      'lineaTiempoEmocional',
      '{"momentos":[{"opciones":[{"texto":"A","esCorrecta":true}]}]}'::jsonb
    ), '$.momentos[*].opciones[*].esCorrecta'
  ) OR public.campos_publicos_actividad(
    'completarPalabras',
    '{"texto":"El [perro].","respuestas":["perro"]}'::jsonb
  )::text ~* 'perro' THEN
    RAISE EXCEPTION 'fase6c: regresión en redacciones anteriores';
  END IF;
END
$verify$;

COMMIT;

SELECT
  true AS ordenar_eventos_sin_orden_visible,
  true AS ordenar_palabras_sin_frase_visible,
  true AS bancos_publicos_reordenados,
  true AS redacciones_anteriores_conservadas;
