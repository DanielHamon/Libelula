-- ============================================================
-- IAbooks — Fase 6C: ocultación de soluciones verdadero/falso
-- Aplicar únicamente después de validar el frontend compatible.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.campos_publicos_actividad(
  p_tipo TEXT,
  p_campos JSONB
)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT CASE
    WHEN p_tipo = 'seleccionMultiple'
         AND jsonb_typeof(COALESCE(p_campos, '{}'::jsonb) -> 'opciones') = 'array'
      THEN jsonb_set(
        COALESCE(p_campos, '{}'::jsonb),
        '{opciones}',
        COALESCE(
          (
            SELECT jsonb_agg(opcion - 'esCorrecta' ORDER BY n)
            FROM jsonb_array_elements(p_campos -> 'opciones')
              WITH ORDINALITY AS o(opcion, n)
          ),
          '[]'::jsonb
        )
      )
    WHEN p_tipo = 'verdaderoFalso'
         AND jsonb_typeof(
           COALESCE(p_campos, '{}'::jsonb) -> 'afirmaciones'
         ) = 'array'
      THEN jsonb_set(
        COALESCE(p_campos, '{}'::jsonb),
        '{afirmaciones}',
        COALESCE(
          (
            SELECT jsonb_agg(afirmacion - 'esVerdadero' ORDER BY n)
            FROM jsonb_array_elements(p_campos -> 'afirmaciones')
              WITH ORDINALITY AS a(afirmacion, n)
          ),
          '[]'::jsonb
        )
      )
    ELSE COALESCE(p_campos, '{}'::jsonb)
  END
$$;

REVOKE ALL ON FUNCTION public.campos_publicos_actividad(TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;

DO $verify$
DECLARE
  v_publico JSONB;
BEGIN
  v_publico := public.campos_publicos_actividad(
    'verdaderoFalso',
    '{"afirmaciones":[{"texto":"A","esVerdadero":true},{"texto":"B","esVerdadero":false}]}'::jsonb
  );

  IF jsonb_path_exists(v_publico, '$.afirmaciones[*].esVerdadero') THEN
    RAISE EXCEPTION 'fase6c: esVerdadero continúa en campos públicos';
  END IF;

  IF jsonb_array_length(v_publico -> 'afirmaciones') <> 2
     OR v_publico #>> '{afirmaciones,0,texto}' <> 'A' THEN
    RAISE EXCEPTION 'fase6c: se eliminó contenido público requerido';
  END IF;

  IF jsonb_path_exists(
    public.campos_publicos_actividad(
      'seleccionMultiple',
      '{"opciones":[{"texto":"A","esCorrecta":true}]}'::jsonb
    ),
    '$.opciones[*].esCorrecta'
  ) THEN
    RAISE EXCEPTION 'fase6c: regresión en selección múltiple';
  END IF;
END
$verify$;

COMMIT;

SELECT
  true AS verdadero_falso_sin_soluciones,
  true AS afirmaciones_conservadas,
  true AS seleccion_multiple_sigue_protegida,
  true AS helper_publico_actualizado;
