-- ============================================================
-- IAbooks — Fase 6A: límites de abuso e integridad de payloads
-- Preflight, migración y postflight en una única transacción.
--
-- Esta entrega no cambia todavía la evaluación académica. Su objetivo es
-- cerrar la vía de abuso por JSON/Base64 y limitar la frecuencia de escritura
-- sin romper los tipos de actividad existentes.
-- ============================================================

BEGIN;

DO $preflight$
DECLARE
  v_respuestas_grandes BIGINT;
  v_data_urls_ambiguas BIGINT;
  v_campos_grandes BIGINT;
BEGIN
  IF to_regclass('public.respuestas') IS NULL
     OR to_regclass('public.actividades') IS NULL THEN
    RAISE EXCEPTION 'fase6_preflight: faltan tablas requeridas';
  END IF;

  IF to_regprocedure(
    'public.registrar_progreso_actividad(text,jsonb,boolean,boolean)'
  ) IS NULL THEN
    RAISE EXCEPTION 'fase6_preflight: falta registrar_progreso_actividad';
  END IF;

  SELECT count(*) INTO v_respuestas_grandes
  FROM public.respuestas
  WHERE respuesta IS NOT NULL
    AND pg_column_size(respuesta) > 65536;

  -- Las versiones anteriores guardaban el lienzo de colorear en la clave
  -- superior imageData. Ese caso es inequívoco y puede convertirse sin perder
  -- la marca de finalización. Cualquier Base64 restante requiere revisión.
  SELECT count(*) INTO v_data_urls_ambiguas
  FROM public.respuestas
  WHERE respuesta IS NOT NULL
    AND (respuesta - 'imageData')::text ~* '"data:[^"]*;base64,';

  SELECT count(*) INTO v_campos_grandes
  FROM public.actividades
  WHERE pg_column_size(COALESCE(campos, '{}'::jsonb)) > 262144;

  IF v_respuestas_grandes > 0
     OR v_data_urls_ambiguas > 0
     OR v_campos_grandes > 0 THEN
    RAISE EXCEPTION
      'fase6_preflight: datos incompatibles (respuestas_grandes=%, data_urls_ambiguas=%, campos_grandes=%)',
      v_respuestas_grandes, v_data_urls_ambiguas, v_campos_grandes;
  END IF;
END
$preflight$;

-- Migra únicamente el formato histórico conocido de la actividad de colorear.
-- Se conserva el resto del payload y se deja constancia de que el lienzo no
-- forma parte de la respuesta persistida.
UPDATE public.respuestas
SET respuesta = (respuesta - 'imageData')
  || jsonb_build_object(
    'completado', true,
    'imagen_omitida_por_seguridad', true
  )
WHERE respuesta IS NOT NULL
  AND respuesta ? 'imageData'
  AND COALESCE(respuesta ->> 'imageData', '') ~* '^data:[^;"]*;base64,';

CREATE TABLE IF NOT EXISTS public.limites_progreso (
  usuario_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  ventana_inicio TIMESTAMPTZ NOT NULL,
  operaciones INTEGER NOT NULL CHECK (operaciones >= 0),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.limites_progreso ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.limites_progreso FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.validar_payload_respuesta(
  p_respuesta JSONB
)
RETURNS VOID
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog
AS $$
DECLARE
  v_texto TEXT;
BEGIN
  IF p_respuesta IS NULL THEN
    RETURN;
  END IF;

  IF pg_column_size(p_respuesta) > 65536 THEN
    RAISE EXCEPTION 'respuesta_demasiado_grande'
      USING ERRCODE = '22023';
  END IF;

  v_texto := p_respuesta::text;

  IF v_texto ~* '"data:[^"]*;base64,' THEN
    RAISE EXCEPTION 'respuesta_base64_no_permitida'
      USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(p_respuesta) NOT IN ('object', 'array') THEN
    RAISE EXCEPTION 'formato_respuesta_invalido'
      USING ERRCODE = '22023';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.validar_payload_respuesta(JSONB)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.consumir_limite_progreso(
  p_usuario_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_ahora TIMESTAMPTZ := clock_timestamp();
  v_operaciones INTEGER;
BEGIN
  INSERT INTO public.limites_progreso (
    usuario_id, ventana_inicio, operaciones, actualizado_en
  )
  VALUES (p_usuario_id, v_ahora, 1, v_ahora)
  ON CONFLICT (usuario_id) DO UPDATE
  SET
    ventana_inicio = CASE
      WHEN public.limites_progreso.ventana_inicio <= v_ahora - interval '1 minute'
        THEN v_ahora
      ELSE public.limites_progreso.ventana_inicio
    END,
    operaciones = CASE
      WHEN public.limites_progreso.ventana_inicio <= v_ahora - interval '1 minute'
        THEN 1
      ELSE public.limites_progreso.operaciones + 1
    END,
    actualizado_en = v_ahora
  RETURNING operaciones INTO v_operaciones;

  IF v_operaciones > 30 THEN
    RAISE EXCEPTION 'limite_progreso_excedido'
      USING ERRCODE = 'P0001';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.consumir_limite_progreso(UUID)
  FROM PUBLIC, anon, authenticated;

ALTER TABLE public.respuestas
  DROP CONSTRAINT IF EXISTS respuestas_payload_tamano_check,
  DROP CONSTRAINT IF EXISTS respuestas_sin_data_url_check;

ALTER TABLE public.respuestas
  ADD CONSTRAINT respuestas_payload_tamano_check
    CHECK (
      respuesta IS NULL
      OR pg_column_size(respuesta) <= 65536
    ),
  ADD CONSTRAINT respuestas_sin_data_url_check
    CHECK (
      respuesta IS NULL
      OR respuesta::text !~* '"data:[^"]*;base64,'
    );

ALTER TABLE public.actividades
  DROP CONSTRAINT IF EXISTS actividades_campos_tamano_check;

ALTER TABLE public.actividades
  ADD CONSTRAINT actividades_campos_tamano_check
    CHECK (pg_column_size(COALESCE(campos, '{}'::jsonb)) <= 262144);

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
  v_uid UUID := auth.uid();
  v_unidad_id TEXT;
  v_libro_id TEXT;
  v_rol TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'autenticacion_requerida' USING ERRCODE = '42501';
  END IF;

  SELECT rol INTO v_rol
  FROM public.profiles
  WHERE id = v_uid;

  IF v_rol IS DISTINCT FROM 'estudiante' THEN
    RAISE EXCEPTION 'solo_estudiantes_guardan_progreso'
      USING ERRCODE = '42501';
  END IF;

  IF length(COALESCE(p_actividad_id, '')) > 160 THEN
    RAISE EXCEPTION 'actividad_id_invalido' USING ERRCODE = '22023';
  END IF;

  IF p_guardar_respuesta THEN
    PERFORM public.validar_payload_respuesta(p_respuesta);
  ELSIF p_respuesta IS NOT NULL OR p_es_correcta IS NOT NULL THEN
    RAISE EXCEPTION 'payload_respuesta_inesperado' USING ERRCODE = '22023';
  END IF;

  PERFORM public.consumir_limite_progreso(v_uid);

  SELECT a.unidad_id, u.libro_id
  INTO v_unidad_id, v_libro_id
  FROM public.actividades a
  JOIN public.unidades u ON u.id = a.unidad_id
  WHERE a.id = p_actividad_id;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'motivo', 'actividad_no_encontrada');
  END IF;

  IF NOT public.puede_acceder_libro(v_libro_id) THEN
    RAISE EXCEPTION 'licencia_requerida' USING ERRCODE = '42501';
  END IF;

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

  IF p_guardar_respuesta THEN
    INSERT INTO public.respuestas (
      usuario_id, actividad_id, libro_id, unidad_id,
      respuesta, es_correcta, created_at
    )
    VALUES (
      v_uid, p_actividad_id, v_libro_id, v_unidad_id,
      p_respuesta, p_es_correcta, now()
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
    'unidad_id', v_unidad_id,
    'libro_id', v_libro_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_progreso_actividad(
  TEXT, JSONB, BOOLEAN, BOOLEAN
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_progreso_actividad(
  TEXT, JSONB, BOOLEAN, BOOLEAN
) TO authenticated;

DO $postflight$
DECLARE
  v_ok BOOLEAN;
BEGIN
  SELECT
    to_regclass('public.limites_progreso') IS NOT NULL
    AND has_function_privilege(
      'authenticated',
      'public.registrar_progreso_actividad(text,jsonb,boolean,boolean)',
      'EXECUTE'
    )
    AND NOT has_table_privilege(
      'authenticated', 'public.limites_progreso', 'SELECT'
    )
    AND EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conrelid = 'public.respuestas'::regclass
        AND conname = 'respuestas_payload_tamano_check'
    )
    AND EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conrelid = 'public.respuestas'::regclass
        AND conname = 'respuestas_sin_data_url_check'
    )
    AND EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conrelid = 'public.actividades'::regclass
        AND conname = 'actividades_campos_tamano_check'
    )
  INTO v_ok;

  IF NOT v_ok THEN
    RAISE EXCEPTION 'fase6_postflight: verificacion estructural fallida';
  END IF;
END
$postflight$;

COMMIT;

SELECT
  true AS fase_6a_aplicada,
  (
    SELECT count(*)
    FROM public.respuestas
    WHERE respuesta @> '{"imagen_omitida_por_seguridad": true}'::jsonb
  ) AS dibujos_historicos_convertidos,
  true AS respuestas_limitadas_64k,
  true AS data_urls_bloqueadas,
  true AS actividades_limitadas_256k,
  true AS limite_30_operaciones_minuto;
