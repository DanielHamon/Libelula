-- ============================================================
-- IAbooks — Fase 6C: ocultación de soluciones
-- emparejar + clasificacionCategorias
-- Aplicar únicamente después de validar el frontend compatible.
-- ============================================================

BEGIN;

-- Conserva la redacción acumulada de los tipos ya protegidos. La guarda se
-- crea una sola vez para que este archivo pueda ejecutarse nuevamente.
DO $setup$
BEGIN
  IF to_regprocedure(
    'public.campos_publicos_actividad_pre_matching(text,jsonb)'
  ) IS NULL THEN
    ALTER FUNCTION public.campos_publicos_actividad(TEXT, JSONB)
      RENAME TO campos_publicos_actividad_pre_matching;
  END IF;
END
$setup$;

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
  v_izquierdas JSONB;
  v_derechas JSONB;
  v_total INTEGER;
BEGIN
  IF p_tipo = 'emparejar'
     AND jsonb_typeof(v_campos -> 'pares') = 'array' THEN
    v_total := jsonb_array_length(v_campos -> 'pares');

    -- Publica dos bancos independientes. La derecha se rota para que ni
    -- siquiera la posición entre ambos arreglos permita reconstruir parejas.
    IF v_total > 1 THEN
      SELECT jsonb_agg(par -> 'izquierda' ORDER BY n)
      INTO v_izquierdas
      FROM jsonb_array_elements(v_campos -> 'pares')
        WITH ORDINALITY AS izquierdo(par, n);

      SELECT jsonb_agg(derecho.par -> 'derecha' ORDER BY izquierdo.n)
      INTO v_derechas
      FROM jsonb_array_elements(v_campos -> 'pares')
        WITH ORDINALITY AS izquierdo(par, n)
      JOIN jsonb_array_elements(v_campos -> 'pares')
        WITH ORDINALITY AS derecho(par, n)
        ON derecho.n = (izquierdo.n % v_total) + 1;

      RETURN (v_campos - 'pares') || jsonb_build_object(
        'elementosIzquierda', COALESCE(v_izquierdas, '[]'::jsonb),
        'elementosDerecha', COALESCE(v_derechas, '[]'::jsonb)
      );
    END IF;

    -- Una sola pareja no puede publicarse sin revelar la solución.
    RETURN (v_campos - 'pares') || jsonb_build_object(
      'elementosIzquierda', '[]'::jsonb,
      'elementosDerecha', '[]'::jsonb
    );
  END IF;

  IF p_tipo = 'clasificacionCategorias' THEN
    IF jsonb_typeof(v_campos -> 'items') = 'array' THEN
      v_campos := jsonb_set(v_campos, '{items}', COALESCE((
        SELECT jsonb_agg(
          item
            - 'categoriaId'
            - 'categoria'
            - 'respuesta'
            - 'esCorrecta'
            - 'categoriaCorrecta'
            - 'categoriaCorrectaId'
          ORDER BY n
        )
        FROM jsonb_array_elements(v_campos -> 'items')
          WITH ORDINALITY AS i(item, n)
      ), '[]'::jsonb));
    END IF;

    IF jsonb_typeof(v_campos -> 'elementos') = 'array' THEN
      v_campos := jsonb_set(v_campos, '{elementos}', COALESCE((
        SELECT jsonb_agg(
          item
            - 'categoriaId'
            - 'categoria'
            - 'respuesta'
            - 'esCorrecta'
            - 'categoriaCorrecta'
            - 'categoriaCorrectaId'
          ORDER BY n
        )
        FROM jsonb_array_elements(v_campos -> 'elementos')
          WITH ORDINALITY AS i(item, n)
      ), '[]'::jsonb));
    END IF;

    RETURN v_campos;
  END IF;

  RETURN public.campos_publicos_actividad_pre_matching(p_tipo, v_campos);
END;
$$;

REVOKE ALL ON FUNCTION public.campos_publicos_actividad(TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.campos_publicos_actividad_pre_matching(TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;

DO $verify$
DECLARE
  v_emparejar JSONB;
  v_clasificar JSONB;
BEGIN
  v_emparejar := public.campos_publicos_actividad(
    'emparejar',
    '{"pares":[
      {"izquierda":"uno","derecha":"1"},
      {"izquierda":"dos","derecha":"2"},
      {"izquierda":"tres","derecha":"3"}
    ]}'::jsonb
  );

  IF v_emparejar ? 'pares'
     OR jsonb_array_length(v_emparejar -> 'elementosIzquierda') <> 3
     OR jsonb_array_length(v_emparejar -> 'elementosDerecha') <> 3
     OR v_emparejar #>> '{elementosDerecha,0}' = '1'
     OR v_emparejar #>> '{elementosDerecha,1}' = '2'
     OR v_emparejar #>> '{elementosDerecha,2}' = '3' THEN
    RAISE EXCEPTION 'fase6c: las parejas reales siguen visibles';
  END IF;

  v_clasificar := public.campos_publicos_actividad(
    'clasificacionCategorias',
    '{"categorias":[{"id":"a","label":"A"}],
      "items":[{"id":"1","texto":"Elemento","categoriaId":"a",
                "categoriaCorrecta":"A","esCorrecta":true}]}'::jsonb
  );

  IF jsonb_path_exists(v_clasificar, '$.items[*].categoriaId')
     OR jsonb_path_exists(v_clasificar, '$.items[*].categoria')
     OR jsonb_path_exists(v_clasificar, '$.items[*].respuesta')
     OR jsonb_path_exists(v_clasificar, '$.items[*].esCorrecta')
     OR jsonb_path_exists(v_clasificar, '$.items[*].categoriaCorrecta')
     OR v_clasificar #>> '{items,0,texto}' <> 'Elemento' THEN
    RAISE EXCEPTION 'fase6c: redacción de clasificación fallida';
  END IF;

  IF jsonb_path_exists(
    public.campos_publicos_actividad(
      'seleccionMultiple',
      '{"opciones":[{"texto":"A","esCorrecta":true}]}'::jsonb
    ), '$.opciones[*].esCorrecta'
  ) OR public.campos_publicos_actividad(
    'ordenarPalabras',
    '{"fraseCorrecta":"yo leo","palabras":["yo","leo"]}'::jsonb
  ) ? 'fraseCorrecta' THEN
    RAISE EXCEPTION 'fase6c: regresión en redacciones anteriores';
  END IF;
END
$verify$;

COMMIT;

SELECT
  true AS emparejar_sin_relaciones_reales,
  true AS bancos_de_emparejar_conservados,
  true AS clasificacion_sin_categoria_correcta,
  true AS contenido_de_clasificacion_conservado,
  true AS redacciones_anteriores_conservadas;
