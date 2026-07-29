-- ============================================================
-- IAbooks — Fase 6C: intentos evaluados por el servidor
-- Ejecutar después de security_phase6b_server_evaluation.sql.
-- La RPC antigua permanece disponible durante la migración del frontend.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.intentos_actividad (
  usuario_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  actividad_id TEXT NOT NULL
    REFERENCES public.actividades(id) ON DELETE CASCADE,
  intentos INTEGER NOT NULL DEFAULT 0 CHECK (intentos >= 0),
  ultimo_resultado BOOLEAN,
  completada BOOLEAN NOT NULL DEFAULT false,
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (usuario_id, actividad_id)
);

ALTER TABLE public.intentos_actividad ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.intentos_actividad
  FROM PUBLIC, anon, authenticated;

CREATE POLICY intentos_actividad_own_read
ON public.intentos_actividad
FOR SELECT TO authenticated
USING (usuario_id = auth.uid());

GRANT SELECT (
  actividad_id, intentos, ultimo_resultado, completada, actualizado_en
) ON public.intentos_actividad TO authenticated;

CREATE OR REPLACE FUNCTION public.evaluar_intento_actividad(
  p_actividad_id TEXT,
  p_respuesta JSONB
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_rol TEXT;
  v_unidad_id TEXT;
  v_libro_id TEXT;
  v_tipo TEXT;
  v_campos JSONB;
  v_es_correcta BOOLEAN;
  v_intentos INTEGER;
  v_max_intentos INTEGER;
  v_completada BOOLEAN;
  v_ya_completada BOOLEAN;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'autenticacion_requerida' USING ERRCODE = '42501';
  END IF;

  SELECT rol INTO v_rol
  FROM public.profiles
  WHERE id = v_uid;

  IF v_rol IS DISTINCT FROM 'estudiante' THEN
    RAISE EXCEPTION 'solo_estudiantes_envian_intentos'
      USING ERRCODE = '42501';
  END IF;

  IF length(COALESCE(p_actividad_id, '')) > 160 THEN
    RAISE EXCEPTION 'actividad_id_invalido' USING ERRCODE = '22023';
  END IF;

  PERFORM public.validar_payload_respuesta(p_respuesta);
  PERFORM public.consumir_limite_progreso(v_uid);

  SELECT
    a.unidad_id,
    u.libro_id,
    a.tipo,
    COALESCE(a.campos, '{}'::jsonb)
  INTO v_unidad_id, v_libro_id, v_tipo, v_campos
  FROM public.actividades a
  JOIN public.unidades u ON u.id = a.unidad_id
  WHERE a.id = p_actividad_id;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'motivo', 'actividad_no_encontrada');
  END IF;

  IF NOT public.puede_acceder_libro(v_libro_id) THEN
    RAISE EXCEPTION 'licencia_requerida' USING ERRCODE = '42501';
  END IF;

  v_es_correcta := public.evaluar_respuesta_actividad(
    v_tipo, v_campos, p_respuesta
  );

  IF v_es_correcta IS NULL THEN
    RETURN json_build_object(
      'ok', false,
      'motivo', 'actividad_no_evaluable',
      'actividad_id', p_actividad_id
    );
  END IF;

  v_max_intentos := LEAST(
    GREATEST(COALESCE((v_campos ->> 'maxIntentos')::integer, 2), 1),
    10
  );

  SELECT completada INTO v_ya_completada
  FROM public.intentos_actividad
  WHERE usuario_id = v_uid
    AND actividad_id = p_actividad_id
  FOR UPDATE;

  IF COALESCE(v_ya_completada, false) THEN
    SELECT intentos, ultimo_resultado
    INTO v_intentos, v_es_correcta
    FROM public.intentos_actividad
    WHERE usuario_id = v_uid
      AND actividad_id = p_actividad_id;

    RETURN json_build_object(
      'ok', true,
      'actividad_id', p_actividad_id,
      'es_correcta', v_es_correcta,
      'intentos', v_intentos,
      'max_intentos', v_max_intentos,
      'agotado', NOT COALESCE(v_es_correcta, false),
      'completada', true,
      'ya_completada', true
    );
  END IF;

  INSERT INTO public.intentos_actividad (
    usuario_id,
    actividad_id,
    intentos,
    ultimo_resultado,
    completada,
    actualizado_en
  )
  VALUES (
    v_uid,
    p_actividad_id,
    1,
    v_es_correcta,
    v_es_correcta,
    now()
  )
  ON CONFLICT (usuario_id, actividad_id)
  DO UPDATE SET
    intentos = public.intentos_actividad.intentos + 1,
    ultimo_resultado = EXCLUDED.ultimo_resultado,
    completada = public.intentos_actividad.completada
      OR EXCLUDED.completada,
    actualizado_en = EXCLUDED.actualizado_en
  RETURNING intentos, completada
  INTO v_intentos, v_completada;

  IF v_intentos >= v_max_intentos THEN
    v_completada := true;
  END IF;

  IF v_completada THEN
    UPDATE public.intentos_actividad
    SET completada = true,
        actualizado_en = now()
    WHERE usuario_id = v_uid
      AND actividad_id = p_actividad_id;

    INSERT INTO public.actividad_progreso (
      usuario_id, actividad_id, completada_en
    )
    VALUES (v_uid, p_actividad_id, now())
    ON CONFLICT (usuario_id, actividad_id)
    DO UPDATE SET completada_en = EXCLUDED.completada_en;

    INSERT INTO public.progreso (usuario_id, libro_id, ultima_actividad)
    VALUES (v_uid, v_libro_id, now())
    ON CONFLICT (usuario_id, libro_id)
    DO UPDATE SET ultima_actividad = EXCLUDED.ultima_actividad;

    INSERT INTO public.respuestas (
      usuario_id,
      actividad_id,
      libro_id,
      unidad_id,
      respuesta,
      es_correcta,
      created_at
    )
    VALUES (
      v_uid,
      p_actividad_id,
      v_libro_id,
      v_unidad_id,
      p_respuesta,
      v_es_correcta,
      now()
    )
    ON CONFLICT (usuario_id, actividad_id)
    DO UPDATE SET
      libro_id = EXCLUDED.libro_id,
      unidad_id = EXCLUDED.unidad_id,
      respuesta = EXCLUDED.respuesta,
      es_correcta = EXCLUDED.es_correcta,
      created_at = EXCLUDED.created_at;
  END IF;

  RETURN json_build_object(
    'ok', true,
    'actividad_id', p_actividad_id,
    'es_correcta', v_es_correcta,
    'intentos', v_intentos,
    'max_intentos', v_max_intentos,
    'agotado', v_intentos >= v_max_intentos AND NOT v_es_correcta,
    'completada', v_completada,
    'ya_completada', false
  );
EXCEPTION
  WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RAISE EXCEPTION 'configuracion_intentos_invalida'
      USING ERRCODE = '22023';
END;
$$;

REVOKE ALL ON FUNCTION public.evaluar_intento_actividad(TEXT, JSONB)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.evaluar_intento_actividad(TEXT, JSONB)
  TO authenticated;

DO $verify$
DECLARE
  v_definition TEXT;
BEGIN
  SELECT pg_get_functiondef(
    'public.evaluar_intento_actividad(text,jsonb)'::regprocedure
  ) INTO v_definition;

  IF v_definition NOT LIKE '%evaluar_respuesta_actividad%'
     OR v_definition NOT LIKE '%intentos_actividad%'
     OR v_definition NOT LIKE '%puede_acceder_libro%' THEN
    RAISE EXCEPTION 'fase6c: definición incompleta';
  END IF;

  IF has_table_privilege(
    'authenticated', 'public.intentos_actividad', 'INSERT'
  ) OR has_table_privilege(
    'authenticated', 'public.intentos_actividad', 'UPDATE'
  ) OR has_table_privilege(
    'authenticated', 'public.intentos_actividad', 'DELETE'
  ) THEN
    RAISE EXCEPTION 'fase6c: escritura directa de intentos habilitada';
  END IF;

  IF NOT has_function_privilege(
    'authenticated',
    'public.evaluar_intento_actividad(text,jsonb)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'fase6c: RPC no ejecutable';
  END IF;
END
$verify$;

COMMIT;

SELECT
  true AS fase_6c_intentos_servidor,
  true AS intentos_directos_bloqueados,
  true AS licencia_verificada,
  true AS finalizacion_transaccional,
  true AS rpc_compatible_sin_activar;
