-- ============================================================
-- IAbooks — Fase 6C: evaluación y redacción de crucigrama
-- Aplicar después de desplegar el frontend compatible.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.normalizar_crucigrama_texto(p_valor TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog
AS $$
  SELECT regexp_replace(
    translate(lower(COALESCE(p_valor, '')), 'áéíóúüñ', 'aeiouun'),
    '[^a-z0-9]', '', 'g'
  )
$$;

REVOKE ALL ON FUNCTION public.normalizar_crucigrama_texto(TEXT)
  FROM PUBLIC, anon, authenticated;

DO $setup$
BEGIN
  IF to_regprocedure(
    'public.evaluar_respuesta_actividad_pre_crossword(text,jsonb,jsonb)'
  ) IS NULL THEN
    ALTER FUNCTION public.evaluar_respuesta_actividad(TEXT, JSONB, JSONB)
      RENAME TO evaluar_respuesta_actividad_pre_crossword;
  END IF;

  IF to_regprocedure(
    'public.campos_publicos_actividad_pre_crossword(text,jsonb)'
  ) IS NULL THEN
    ALTER FUNCTION public.campos_publicos_actividad(TEXT, JSONB)
      RENAME TO campos_publicos_actividad_pre_crossword;
  END IF;
END
$setup$;

CREATE OR REPLACE FUNCTION public.evaluar_respuesta_actividad(
  p_tipo TEXT,
  p_campos JSONB,
  p_respuesta JSONB
)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_esperadas INTEGER;
  v_recibidas INTEGER;
  v_incorrectas INTEGER;
BEGIN
  IF p_tipo <> 'crucigrama' THEN
    RETURN public.evaluar_respuesta_actividad_pre_crossword(
      p_tipo, p_campos, p_respuesta
    );
  END IF;

  IF jsonb_typeof(COALESCE(p_campos -> 'palabras', p_campos -> 'words'))
       IS DISTINCT FROM 'array'
     OR jsonb_typeof(p_respuesta -> 'palabras') IS DISTINCT FROM 'array' THEN
    RETURN NULL;
  END IF;

  SELECT count(*) INTO v_esperadas
  FROM jsonb_array_elements(
    COALESCE(p_campos -> 'palabras', p_campos -> 'words')
  );

  SELECT count(*) INTO v_recibidas
  FROM jsonb_array_elements(p_respuesta -> 'palabras');

  SELECT count(*) INTO v_incorrectas
  FROM jsonb_array_elements(
    COALESCE(p_campos -> 'palabras', p_campos -> 'words')
  ) WITH ORDINALITY AS esperado(palabra, n)
  WHERE NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_respuesta -> 'palabras') recibido(palabra)
    WHERE recibido.palabra ->> 'id' = COALESCE(
      esperado.palabra ->> 'id',
      'palabra-' || esperado.n::text
    )
      AND public.normalizar_crucigrama_texto(
        recibido.palabra ->> 'respuestaDada'
      ) = public.normalizar_crucigrama_texto(COALESCE(
        esperado.palabra ->> 'w',
        esperado.palabra ->> 'palabra',
        esperado.palabra ->> 'texto'
      ))
  );

  RETURN v_esperadas > 0
    AND v_recibidas = v_esperadas
    AND v_incorrectas = 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.campos_publicos_actividad(
  p_tipo TEXT,
  p_campos JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_campos JSONB := COALESCE(p_campos, '{}'::jsonb);
  v_clave TEXT;
  v_publicas JSONB;
BEGIN
  IF p_tipo <> 'crucigrama' THEN
    RETURN public.campos_publicos_actividad_pre_crossword(p_tipo, v_campos);
  END IF;

  v_clave := CASE
    WHEN jsonb_typeof(v_campos -> 'palabras') = 'array' THEN 'palabras'
    WHEN jsonb_typeof(v_campos -> 'words') = 'array' THEN 'words'
    ELSE NULL
  END;

  IF v_clave IS NULL THEN
    RETURN v_campos;
  END IF;

  SELECT jsonb_agg(
    (palabra - 'w' - 'palabra' - 'texto' - 'respuesta' - 'correcta')
      || jsonb_build_object(
        'id', COALESCE(palabra ->> 'id', 'palabra-' || n::text),
        'longitud', char_length(public.normalizar_crucigrama_texto(COALESCE(
          palabra ->> 'w',
          palabra ->> 'palabra',
          palabra ->> 'texto'
        )))
      )
    ORDER BY n
  )
  INTO v_publicas
  FROM jsonb_array_elements(v_campos -> v_clave)
    WITH ORDINALITY AS p(palabra, n);

  RETURN jsonb_set(
    v_campos - CASE WHEN v_clave = 'palabras' THEN 'words' ELSE 'palabras' END,
    ARRAY[v_clave],
    COALESCE(v_publicas, '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.evaluar_respuesta_actividad(TEXT, JSONB, JSONB)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.evaluar_respuesta_actividad_pre_crossword(TEXT, JSONB, JSONB)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.campos_publicos_actividad(TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.campos_publicos_actividad_pre_crossword(TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;

DO $verify$
DECLARE
  v_campos JSONB := '{
    "filas":5,"columnas":5,
    "palabras":[
      {"id":"p1","palabra":"LUNA","fila":0,"columna":0,
       "direccion":"h","pista":"Se ve de noche"}
    ]
  }'::jsonb;
  v_publico JSONB;
BEGIN
  IF public.evaluar_respuesta_actividad(
    'crucigrama',
    v_campos,
    '{"palabras":[{"id":"p1","respuestaDada":"luna"}]}'::jsonb
  ) IS DISTINCT FROM true
  OR public.evaluar_respuesta_actividad(
    'crucigrama',
    v_campos,
    '{"palabras":[{"id":"p1","respuestaDada":"sol"}]}'::jsonb
  ) IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'fase6c crucigrama: evaluación interna incorrecta';
  END IF;

  v_publico := public.campos_publicos_actividad('crucigrama', v_campos);
  IF jsonb_path_exists(v_publico, '$.palabras[*].palabra')
     OR jsonb_path_exists(v_publico, '$.palabras[*].w')
     OR jsonb_path_exists(v_publico, '$.palabras[*].texto')
     OR v_publico #>> '{palabras,0,longitud}' <> '4'
     OR v_publico #>> '{palabras,0,pista}' <> 'Se ve de noche' THEN
    RAISE EXCEPTION 'fase6c crucigrama: redacción pública incorrecta';
  END IF;

  IF jsonb_path_exists(
    public.campos_publicos_actividad(
      'seleccionMultiple',
      '{"opciones":[{"texto":"A","esCorrecta":true}]}'::jsonb
    ), '$.opciones[*].esCorrecta'
  ) THEN
    RAISE EXCEPTION 'fase6c crucigrama: regresión anterior';
  END IF;
END
$verify$;

COMMIT;

SELECT
  true AS crucigrama_evaluado_por_servidor,
  true AS palabras_correctas_ocultas,
  true AS pistas_y_diseno_conservados,
  true AS evaluadores_internos_bloqueados,
  true AS redacciones_anteriores_conservadas;
