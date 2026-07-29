-- ============================================================
-- IAbooks — Fase 6C: modo evaluable de acrostico
-- El modo creativo sin respuestas permanece abierto/no evaluable.
-- Aplicar después de desplegar el frontend compatible.
-- ============================================================

BEGIN;

DO $setup$
BEGIN
  IF to_regprocedure(
    'public.evaluar_respuesta_actividad_pre_acrostic(text,jsonb,jsonb)'
  ) IS NULL THEN
    ALTER FUNCTION public.evaluar_respuesta_actividad(TEXT, JSONB, JSONB)
      RENAME TO evaluar_respuesta_actividad_pre_acrostic;
  END IF;

  IF to_regprocedure(
    'public.campos_publicos_actividad_pre_acrostic(text,jsonb)'
  ) IS NULL THEN
    ALTER FUNCTION public.campos_publicos_actividad(TEXT, JSONB)
      RENAME TO campos_publicos_actividad_pre_acrostic;
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
  v_evaluable BOOLEAN;
  v_esperadas INTEGER;
  v_recibidas INTEGER;
  v_incorrectas INTEGER;
BEGIN
  IF p_tipo <> 'acrostico' THEN
    RETURN public.evaluar_respuesta_actividad_pre_acrostic(
      p_tipo, p_campos, p_respuesta
    );
  END IF;

  IF jsonb_typeof(p_campos -> 'lineas') IS DISTINCT FROM 'array' THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE((p_campos ->> 'modoEvaluable')::boolean, false)
    OR COALESCE(bool_or(
    btrim(COALESCE(linea ->> 'respuesta', linea ->> 'correcta', '')) <> ''
  ), false)
  INTO v_evaluable
  FROM jsonb_array_elements(p_campos -> 'lineas') linea;

  IF NOT v_evaluable THEN
    RETURN NULL;
  END IF;

  IF jsonb_typeof(p_respuesta -> 'respuestas') IS DISTINCT FROM 'array' THEN
    RETURN NULL;
  END IF;

  SELECT count(*) INTO v_esperadas
  FROM jsonb_array_elements(p_campos -> 'lineas');
  SELECT count(*) INTO v_recibidas
  FROM jsonb_array_elements(p_respuesta -> 'respuestas');

  SELECT count(*) INTO v_incorrectas
  FROM jsonb_array_elements(p_campos -> 'lineas')
    WITH ORDINALITY AS esperado(linea, n)
  WHERE NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_respuesta -> 'respuestas') recibido(linea)
    WHERE recibido.linea ->> 'id' = COALESCE(
      esperado.linea ->> 'id',
      'linea-' || esperado.n::text
    )
      AND public.normalizar_crucigrama_texto(
        recibido.linea ->> 'texto'
      ) LIKE public.normalizar_crucigrama_texto(
        esperado.linea ->> 'letra'
      ) || '%'
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
  v_evaluable BOOLEAN := false;
  v_lineas JSONB;
BEGIN
  IF p_tipo <> 'acrostico' THEN
    RETURN public.campos_publicos_actividad_pre_acrostic(p_tipo, v_campos);
  END IF;

  IF jsonb_typeof(v_campos -> 'lineas') = 'array' THEN
    SELECT
      COALESCE((v_campos ->> 'modoEvaluable')::boolean, false)
        OR COALESCE(bool_or(
        btrim(COALESCE(linea ->> 'respuesta', linea ->> 'correcta', '')) <> ''
      ), false),
      jsonb_agg(
        linea - 'respuesta' - 'correcta' - 'respuestaCorrecta' - 'esCorrecta'
        ORDER BY n
      )
    INTO v_evaluable, v_lineas
    FROM jsonb_array_elements(v_campos -> 'lineas')
      WITH ORDINALITY AS l(linea, n);

    v_campos := jsonb_set(
      v_campos,
      '{lineas}',
      COALESCE(v_lineas, '[]'::jsonb)
    );
  END IF;

  RETURN v_campos || jsonb_build_object(
    'evaluacionServidor', v_evaluable
  );
END;
$$;

REVOKE ALL ON FUNCTION public.evaluar_respuesta_actividad(TEXT, JSONB, JSONB)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.evaluar_respuesta_actividad_pre_acrostic(TEXT, JSONB, JSONB)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.campos_publicos_actividad(TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.campos_publicos_actividad_pre_acrostic(TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;

DO $verify$
DECLARE
  v_evaluable JSONB := '{
    "palabra":"SOL","modoEvaluable":true,
    "lineas":[
      {"id":"l1","letra":"S","respuesta":"Sonríe","pista":"Expresión feliz"},
      {"id":"l2","letra":"O","respuesta":"","pista":"Respuesta abierta"}
    ]
  }'::jsonb;
  v_abierto JSONB := '{
    "palabra":"LUZ",
    "lineas":[{"id":"l1","letra":"L","respuesta":""}]
  }'::jsonb;
  v_publico JSONB;
BEGIN
  IF public.evaluar_respuesta_actividad(
    'acrostico',
    v_evaluable,
    '{"respuestas":[
      {"id":"l1","letra":"S","texto":"Salta alto"},
      {"id":"l2","letra":"O","texto":"Otra idea"}
    ]}'::jsonb
  ) IS DISTINCT FROM true
  OR public.evaluar_respuesta_actividad(
    'acrostico',
    v_evaluable,
    '{"respuestas":[
      {"id":"l1","letra":"S","texto":"Otra palabra"},
      {"id":"l2","letra":"O","texto":"Otra idea"}
    ]}'::jsonb
  ) IS DISTINCT FROM false
  OR public.evaluar_respuesta_actividad(
    'acrostico',
    v_abierto,
    '{"respuestas":[{"id":"l1","texto":"Libre"}]}'::jsonb
  ) IS NOT NULL THEN
    RAISE EXCEPTION 'fase6c acróstico: evaluación mixta incorrecta';
  END IF;

  v_publico := public.campos_publicos_actividad('acrostico', v_evaluable);
  IF jsonb_path_exists(v_publico, '$.lineas[*].respuesta')
     OR jsonb_path_exists(v_publico, '$.lineas[*].correcta')
     OR COALESCE((v_publico ->> 'evaluacionServidor')::boolean, false)
        IS DISTINCT FROM true
     OR v_publico #>> '{lineas,0,pista}' <> 'Expresión feliz' THEN
    RAISE EXCEPTION 'fase6c acróstico: redacción pública incorrecta';
  END IF;

  IF COALESCE((
    public.campos_publicos_actividad('acrostico', v_abierto)
      ->> 'evaluacionServidor'
  )::boolean, false) THEN
    RAISE EXCEPTION 'fase6c acróstico: modo abierto marcado como evaluable';
  END IF;
END
$verify$;

COMMIT;

NOTIFY pgrst, 'reload schema';

SELECT
  true AS acrostico_evaluable_en_servidor,
  true AS respuestas_configuradas_ocultas,
  true AS modo_creativo_conservado,
  true AS pistas_y_letras_conservadas,
  true AS redacciones_anteriores_conservadas;
