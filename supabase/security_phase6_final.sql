-- ============================================================
-- IAbooks — Fase 6: cierre global
-- Impide que la RPC heredada complete actividades objetivas.
-- Las actividades abiertas/experienciales conservan compatibilidad.
-- ============================================================

BEGIN;

DO $setup$
BEGIN
  IF to_regprocedure(
    'public.registrar_progreso_actividad_pre_phase6_final(text,jsonb,boolean,boolean)'
  ) IS NULL THEN
    ALTER FUNCTION public.registrar_progreso_actividad(
      TEXT, JSONB, BOOLEAN, BOOLEAN
    ) RENAME TO registrar_progreso_actividad_pre_phase6_final;
  END IF;
END
$setup$;

CREATE OR REPLACE FUNCTION public.registrar_progreso_actividad(
  p_actividad_id TEXT,
  p_respuesta JSONB DEFAULT NULL,
  p_es_correcta BOOLEAN DEFAULT NULL,
  p_guardar_respuesta BOOLEAN DEFAULT false
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_tipo TEXT;
  v_campos JSONB;
  v_objetiva BOOLEAN := false;
BEGIN
  SELECT tipo, COALESCE(campos, '{}'::jsonb)
  INTO v_tipo, v_campos
  FROM public.actividades
  WHERE id = p_actividad_id;

  IF FOUND THEN
    v_objetiva := v_tipo IN (
      'seleccionMultiple',
      'verdaderoFalso',
      'identificar',
      'selectorEmocionColor',
      'lineaTiempoEmocional',
      'completarPalabras',
      'ordenarPalabras',
      'ordenarEventos',
      'clasificacionCategorias',
      'emparejar',
      'sopaLetras',
      'crucigrama',
      'separarSilabas'
    );

    IF v_tipo = 'acrostico' THEN
      v_objetiva := COALESCE(
        (v_campos ->> 'modoEvaluable')::boolean,
        false
      ) OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements(COALESCE(v_campos -> 'lineas', '[]'::jsonb))
          linea
        WHERE btrim(COALESCE(
          linea ->> 'respuesta',
          linea ->> 'correcta',
          ''
        )) <> ''
      );
    END IF;
  END IF;

  IF v_objetiva THEN
    RAISE EXCEPTION 'actividad_objetiva_requiere_rpc_intentos'
      USING ERRCODE = '42501';
  END IF;

  RETURN public.registrar_progreso_actividad_pre_phase6_final(
    p_actividad_id,
    p_respuesta,
    p_es_correcta,
    p_guardar_respuesta
  );
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_progreso_actividad(
  TEXT, JSONB, BOOLEAN, BOOLEAN
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_progreso_actividad(
  TEXT, JSONB, BOOLEAN, BOOLEAN
) TO authenticated;

REVOKE ALL ON FUNCTION public.registrar_progreso_actividad_pre_phase6_final(
  TEXT, JSONB, BOOLEAN, BOOLEAN
) FROM PUBLIC, anon, authenticated;

DO $verify$
DECLARE
  v_definition TEXT;
  v_fallos INTEGER;
BEGIN
  SELECT pg_get_functiondef(
    'public.registrar_progreso_actividad(text,jsonb,boolean,boolean)'::regprocedure
  ) INTO v_definition;

  IF v_definition NOT LIKE '%actividad_objetiva_requiere_rpc_intentos%'
     OR has_function_privilege(
       'authenticated',
       'public.registrar_progreso_actividad_pre_phase6_final(text,jsonb,boolean,boolean)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'fase6 final: RPC heredada no quedó restringida';
  END IF;

  SELECT count(*) INTO v_fallos
  FROM public.actividades a
  WHERE a.tipo IN (
    'seleccionMultiple', 'verdaderoFalso', 'identificar',
    'selectorEmocionColor', 'lineaTiempoEmocional',
    'completarPalabras', 'ordenarPalabras', 'ordenarEventos',
    'clasificacionCategorias', 'emparejar', 'sopaLetras',
    'crucigrama', 'separarSilabas'
  )
    AND public.evaluar_respuesta_actividad(
      a.tipo,
      a.campos,
      CASE a.tipo
        WHEN 'seleccionMultiple' THEN '{"seleccionadasIndices":[]}'::jsonb
        WHEN 'verdaderoFalso' THEN '{"respuestas":[]}'::jsonb
        WHEN 'identificar' THEN '{"seleccionadas":[]}'::jsonb
        WHEN 'selectorEmocionColor' THEN '{"seleccion":{"id":"__inexistente__"}}'::jsonb
        WHEN 'lineaTiempoEmocional' THEN '{"momentos":[]}'::jsonb
        WHEN 'completarPalabras' THEN '{"respuestas":[]}'::jsonb
        WHEN 'ordenarPalabras'
          THEN '{"frase":"__diagnostico_respuesta_no_vacia__"}'::jsonb
        WHEN 'ordenarEventos' THEN '{"orden":[]}'::jsonb
        WHEN 'clasificacionCategorias' THEN '{"clasificaciones":[]}'::jsonb
        WHEN 'emparejar' THEN '{"parejas":[]}'::jsonb
        WHEN 'sopaLetras' THEN '{"palabrasEncontradas":[]}'::jsonb
        WHEN 'crucigrama' THEN '{"palabras":[]}'::jsonb
        WHEN 'separarSilabas' THEN '{"respuestas":[]}'::jsonb
        ELSE '{}'::jsonb
      END
    ) IS NULL;

  -- Una respuesta con estructura válida puede ser incorrecta, pero nunca
  -- "no evaluable".
  IF v_fallos > 0 THEN
    RAISE EXCEPTION
      'fase6 final: % actividades objetivas no tienen evaluador activo',
      v_fallos;
  END IF;

  SELECT count(*) INTO v_fallos
  FROM public.actividades a
  WHERE a.tipo = 'acrostico'
    AND (
      COALESCE((a.campos ->> 'modoEvaluable')::boolean, false)
      OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements(COALESCE(a.campos -> 'lineas', '[]'::jsonb))
          linea
        WHERE btrim(COALESCE(
          linea ->> 'respuesta', linea ->> 'correcta', ''
        )) <> ''
      )
    )
    AND public.evaluar_respuesta_actividad(
      a.tipo, a.campos, '{"respuestas":[]}'::jsonb
    ) IS NULL;

  IF v_fallos > 0 THEN
    RAISE EXCEPTION
      'fase6 final: % acrósticos evaluables no tienen evaluador activo',
      v_fallos;
  END IF;

  IF has_function_privilege(
       'authenticated',
       'public.evaluar_respuesta_actividad(text,jsonb,jsonb)',
       'EXECUTE'
     )
     OR NOT has_function_privilege(
       'authenticated',
       'public.evaluar_intento_actividad(text,jsonb)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'fase6 final: permisos de evaluación incorrectos';
  END IF;

  SELECT count(*) INTO v_fallos
  FROM public.actividades a
  WHERE jsonb_path_exists(
    public.campos_publicos_actividad(a.tipo, a.campos),
    '$.**.esCorrecta'
  )
  OR jsonb_path_exists(
    public.campos_publicos_actividad(a.tipo, a.campos),
    '$.**.esVerdadero'
  );

  IF v_fallos > 0 THEN
    RAISE EXCEPTION
      'fase6 final: % actividades todavía exponen booleanos de solución',
      v_fallos;
  END IF;
END
$verify$;

COMMIT;

NOTIFY pgrst, 'reload schema';

SELECT
  true AS fase_6_cerrada,
  true AS rpc_heredada_bloquea_actividades_objetivas,
  true AS actividades_abiertas_conservan_compatibilidad,
  true AS evaluadores_objetivos_activos,
  true AS evaluadores_internos_bloqueados,
  true AS rpc_intentos_disponible,
  true AS soluciones_booleanas_ocultas;
