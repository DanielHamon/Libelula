-- ============================================================
-- IAbooks — Fase 6C: ocultación de selectorEmocionColor
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

  RETURN v_campos;
END;
$$;

REVOKE ALL ON FUNCTION public.campos_publicos_actividad(TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;

DO $verify$
DECLARE
  v_selector JSONB;
BEGIN
  v_selector := public.campos_publicos_actividad(
    'selectorEmocionColor',
    '{"opciones":[{"id":"a","nombre":"A","color":"#fff","esCorrecta":true}]}'::jsonb
  );

  IF jsonb_path_exists(v_selector, '$.opciones[*].esCorrecta') THEN
    RAISE EXCEPTION 'fase6c: esCorrecta continúa visible en selector';
  END IF;

  IF v_selector #>> '{opciones,0,id}' <> 'a'
     OR v_selector #>> '{opciones,0,nombre}' <> 'A'
     OR v_selector #>> '{opciones,0,color}' <> '#fff' THEN
    RAISE EXCEPTION 'fase6c: se eliminó contenido público del selector';
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
  true AS selector_emocion_sin_soluciones,
  true AS contenido_visual_conservado,
  true AS identificar_sigue_protegido,
  true AS verdadero_falso_sigue_protegido,
  true AS seleccion_multiple_sigue_protegida;
