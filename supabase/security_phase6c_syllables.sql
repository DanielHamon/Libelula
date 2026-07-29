-- ============================================================
-- IAbooks — Fase 6C: evaluación y redacción de separarSilabas
-- Aplicar después de desplegar el frontend compatible.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.normalizar_separacion_silabas(p_valor TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog
AS $$
  SELECT trim(BOTH '-' FROM regexp_replace(
    regexp_replace(
      regexp_replace(
        translate(lower(COALESCE(p_valor, '')), 'áéíóúüñ‐‑‒–—−', 'aeiouun------'),
        '\s*-\s*', '-', 'g'
      ),
      '\s+', '', 'g'
    ),
    '-+', '-', 'g'
  ))
$$;

REVOKE ALL ON FUNCTION public.normalizar_separacion_silabas(TEXT)
  FROM PUBLIC, anon, authenticated;

DO $setup$
BEGIN
  IF to_regprocedure(
    'public.evaluar_respuesta_actividad_pre_syllables(text,jsonb,jsonb)'
  ) IS NULL THEN
    ALTER FUNCTION public.evaluar_respuesta_actividad(TEXT, JSONB, JSONB)
      RENAME TO evaluar_respuesta_actividad_pre_syllables;
  END IF;

  IF to_regprocedure(
    'public.campos_publicos_actividad_pre_syllables(text,jsonb)'
  ) IS NULL THEN
    ALTER FUNCTION public.campos_publicos_actividad(TEXT, JSONB)
      RENAME TO campos_publicos_actividad_pre_syllables;
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
  IF p_tipo <> 'separarSilabas' THEN
    RETURN public.evaluar_respuesta_actividad_pre_syllables(
      p_tipo, p_campos, p_respuesta
    );
  END IF;

  IF jsonb_typeof(p_campos -> 'palabras') IS DISTINCT FROM 'array'
     OR jsonb_typeof(p_respuesta -> 'respuestas') IS DISTINCT FROM 'array' THEN
    RETURN NULL;
  END IF;

  SELECT count(*) INTO v_esperadas
  FROM jsonb_array_elements(p_campos -> 'palabras');
  SELECT count(*) INTO v_recibidas
  FROM jsonb_array_elements(p_respuesta -> 'respuestas');

  SELECT count(*) INTO v_incorrectas
  FROM jsonb_array_elements(p_campos -> 'palabras')
    WITH ORDINALITY AS esperado(item, n)
  WHERE NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_respuesta -> 'respuestas') recibido(item)
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
BEGIN
  IF p_tipo <> 'separarSilabas' THEN
    RETURN public.campos_publicos_actividad_pre_syllables(p_tipo, v_campos);
  END IF;

  IF jsonb_typeof(v_campos -> 'palabras') IS DISTINCT FROM 'array' THEN
    RETURN v_campos;
  END IF;

  RETURN jsonb_set(v_campos, '{palabras}', COALESCE((
    SELECT jsonb_agg(
      item
        - 'silabas'
        - 'respuesta'
        - 'correcta'
        - 'cantidad'
        - 'numSilabas'
        - 'numero'
        - 'esCorrecta'
      ORDER BY n
    )
    FROM jsonb_array_elements(v_campos -> 'palabras')
      WITH ORDINALITY AS p(item, n)
  ), '[]'::jsonb));
END;
$$;

REVOKE ALL ON FUNCTION public.evaluar_respuesta_actividad(TEXT, JSONB, JSONB)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.evaluar_respuesta_actividad_pre_syllables(TEXT, JSONB, JSONB)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.campos_publicos_actividad(TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.campos_publicos_actividad_pre_syllables(TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;

DO $verify$
DECLARE
  v_campos JSONB := '{
    "palabras":[
      {"id":"p1","palabra":"mariposa","silabas":"ma-ri-po-sa","cantidad":4}
    ]
  }'::jsonb;
  v_publico JSONB;
BEGIN
  IF public.evaluar_respuesta_actividad(
    'separarSilabas',
    v_campos,
    '{"respuestas":[{"id":"p1","silabasDadas":"ma - ri - po - sa","cantidadDada":"4"}]}'::jsonb
  ) IS DISTINCT FROM true
  OR public.evaluar_respuesta_actividad(
    'separarSilabas',
    v_campos,
    '{"respuestas":[{"id":"p1","silabasDadas":"mari-posa","cantidadDada":"2"}]}'::jsonb
  ) IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'fase6c sílabas: evaluación interna incorrecta';
  END IF;

  v_publico := public.campos_publicos_actividad('separarSilabas', v_campos);
  IF jsonb_path_exists(v_publico, '$.palabras[*].silabas')
     OR jsonb_path_exists(v_publico, '$.palabras[*].cantidad')
     OR v_publico #>> '{palabras,0,palabra}' <> 'mariposa' THEN
    RAISE EXCEPTION 'fase6c sílabas: redacción pública incorrecta';
  END IF;

  IF jsonb_path_exists(
    public.campos_publicos_actividad(
      'crucigrama',
      '{"palabras":[{"id":"p1","palabra":"LUNA","fila":0,"columna":0,"direccion":"h"}]}'::jsonb
    ), '$.palabras[*].palabra'
  ) THEN
    RAISE EXCEPTION 'fase6c sílabas: regresión en crucigrama';
  END IF;
END
$verify$;

COMMIT;

SELECT
  true AS separar_silabas_evaluado_por_servidor,
  true AS separaciones_y_cantidades_ocultas,
  true AS palabras_publicas_conservadas,
  true AS evaluadores_internos_bloqueados,
  true AS redacciones_anteriores_conservadas;
