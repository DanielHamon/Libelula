-- ============================================================
-- IAbooks — Fase 6B: la base decide la corrección
-- Ejecutar después de security_phase6.sql.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.normalizar_respuesta_texto(p_valor TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog
AS $$
  SELECT lower(regexp_replace(trim(COALESCE(p_valor, '')), '\s+', ' ', 'g'))
$$;

REVOKE ALL ON FUNCTION public.normalizar_respuesta_texto(TEXT)
  FROM PUBLIC, anon, authenticated;

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
  IF p_respuesta IS NULL
     OR jsonb_typeof(p_respuesta) IS DISTINCT FROM 'object' THEN
    RETURN NULL;
  END IF;

  CASE p_tipo
    WHEN 'seleccionMultiple' THEN
      IF jsonb_typeof(p_campos -> 'opciones') IS DISTINCT FROM 'array' THEN
        RETURN NULL;
      END IF;

      SELECT count(*) INTO v_esperadas
      FROM jsonb_array_elements(p_campos -> 'opciones') WITH ORDINALITY AS o(item, n)
      WHERE COALESCE((item ->> 'esCorrecta')::boolean, false);

      -- Contrato anterior: una única respuesta se guardaba como texto.
      IF jsonb_typeof(p_respuesta -> 'seleccionadasIndices')
          IS DISTINCT FROM 'array' THEN
        IF COALESCE(p_respuesta ->> 'opcionElegida', '') = '' THEN
          RETURN NULL;
        END IF;

        RETURN v_esperadas = 1 AND EXISTS (
          SELECT 1
          FROM jsonb_array_elements(p_campos -> 'opciones') o
          WHERE COALESCE((o ->> 'esCorrecta')::boolean, false)
            AND public.normalizar_respuesta_texto(
              COALESCE(o ->> 'texto', o #>> '{}')
            ) = public.normalizar_respuesta_texto(
              p_respuesta ->> 'opcionElegida'
            )
        );
      END IF;

      SELECT count(DISTINCT value::integer) INTO v_recibidas
      FROM jsonb_array_elements_text(p_respuesta -> 'seleccionadasIndices');

      SELECT count(*) INTO v_incorrectas
      FROM jsonb_array_elements_text(p_respuesta -> 'seleccionadasIndices') s(value)
      WHERE NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(p_campos -> 'opciones') WITH ORDINALITY AS o(item, n)
        WHERE n - 1 = s.value::integer
          AND COALESCE((item ->> 'esCorrecta')::boolean, false)
      );

      RETURN v_recibidas = v_esperadas AND v_incorrectas = 0;

    WHEN 'verdaderoFalso' THEN
      IF jsonb_typeof(p_campos -> 'afirmaciones') IS DISTINCT FROM 'array'
         OR jsonb_typeof(p_respuesta -> 'respuestas') IS DISTINCT FROM 'array' THEN
        RETURN NULL;
      END IF;

      SELECT count(*) INTO v_esperadas
      FROM jsonb_array_elements(p_campos -> 'afirmaciones');
      SELECT count(*) INTO v_recibidas
      FROM jsonb_array_elements(p_respuesta -> 'respuestas');

      SELECT count(*) INTO v_incorrectas
      FROM jsonb_array_elements(p_campos -> 'afirmaciones')
        WITH ORDINALITY AS a(item, n)
      LEFT JOIN jsonb_array_elements(p_respuesta -> 'respuestas')
        WITH ORDINALITY AS r(item, n) USING (n)
      WHERE r.item IS NULL
         OR (r.item ->> 'respondio')::boolean
            IS DISTINCT FROM (a.item ->> 'esVerdadero')::boolean;

      RETURN v_esperadas > 0
        AND v_recibidas = v_esperadas
        AND v_incorrectas = 0;

    WHEN 'completarPalabras' THEN
      IF jsonb_typeof(p_campos -> 'respuestas') IS DISTINCT FROM 'array'
         OR jsonb_typeof(p_respuesta -> 'respuestas') IS DISTINCT FROM 'array' THEN
        RETURN NULL;
      END IF;

      SELECT count(*) INTO v_esperadas
      FROM jsonb_array_elements(p_campos -> 'respuestas');
      SELECT count(*) INTO v_recibidas
      FROM jsonb_array_elements(p_respuesta -> 'respuestas');

      SELECT count(*) INTO v_incorrectas
      FROM jsonb_array_elements_text(p_campos -> 'respuestas')
        WITH ORDINALITY AS a(valor, n)
      LEFT JOIN jsonb_array_elements(p_respuesta -> 'respuestas')
        WITH ORDINALITY AS r(item, n) USING (n)
      WHERE r.item IS NULL
         OR public.normalizar_respuesta_texto(r.item ->> 'dada')
            <> public.normalizar_respuesta_texto(a.valor);

      RETURN v_esperadas > 0
        AND v_recibidas = v_esperadas
        AND v_incorrectas = 0;

    WHEN 'ordenarPalabras' THEN
      IF COALESCE(p_respuesta ->> 'frase', '') = '' THEN
        RETURN NULL;
      END IF;
      RETURN public.normalizar_respuesta_texto(p_respuesta ->> 'frase')
        = public.normalizar_respuesta_texto(
          COALESCE(
            p_campos ->> 'fraseCorrecta',
            (
              SELECT string_agg(value, ' ' ORDER BY n)
              FROM jsonb_array_elements_text(p_campos -> 'palabras')
                WITH ORDINALITY AS w(value, n)
            )
          )
        );

    WHEN 'ordenarEventos' THEN
      IF jsonb_typeof(p_campos -> 'eventos') IS DISTINCT FROM 'array'
         OR jsonb_typeof(p_respuesta -> 'orden') IS DISTINCT FROM 'array' THEN
        RETURN NULL;
      END IF;

      SELECT count(*) INTO v_esperadas
      FROM jsonb_array_elements(p_campos -> 'eventos');
      SELECT count(*) INTO v_recibidas
      FROM jsonb_array_elements(p_respuesta -> 'orden');

      SELECT count(*) INTO v_incorrectas
      FROM (
        SELECT item ->> 'texto' AS texto,
          row_number() OVER (
            ORDER BY COALESCE((item ->> 'orden')::integer, n::integer)
          ) AS posicion
        FROM jsonb_array_elements(p_campos -> 'eventos')
          WITH ORDINALITY AS e(item, n)
      ) esperado
      LEFT JOIN jsonb_array_elements_text(p_respuesta -> 'orden')
        WITH ORDINALITY AS recibido(texto, posicion)
        USING (posicion)
      WHERE recibido.texto IS NULL
         OR public.normalizar_respuesta_texto(recibido.texto)
            <> public.normalizar_respuesta_texto(esperado.texto);

      RETURN v_esperadas > 0
        AND v_recibidas = v_esperadas
        AND v_incorrectas = 0;

    WHEN 'identificar' THEN
      IF jsonb_typeof(p_campos -> 'opciones') IS DISTINCT FROM 'array'
         OR jsonb_typeof(p_respuesta -> 'seleccionadas') IS DISTINCT FROM 'array' THEN
        RETURN NULL;
      END IF;

      SELECT count(*) INTO v_esperadas
      FROM jsonb_array_elements(p_campos -> 'opciones') o
      WHERE COALESCE((o ->> 'esCorrecta')::boolean, false);
      SELECT count(DISTINCT public.normalizar_respuesta_texto(value))
      INTO v_recibidas
      FROM jsonb_array_elements_text(p_respuesta -> 'seleccionadas');

      SELECT count(*) INTO v_incorrectas
      FROM jsonb_array_elements_text(p_respuesta -> 'seleccionadas') s(value)
      WHERE NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(p_campos -> 'opciones') o
        WHERE COALESCE((o ->> 'esCorrecta')::boolean, false)
          AND public.normalizar_respuesta_texto(o ->> 'texto')
              = public.normalizar_respuesta_texto(s.value)
      );

      RETURN v_recibidas = v_esperadas AND v_incorrectas = 0;

    WHEN 'selectorEmocionColor' THEN
      IF COALESCE(p_respuesta #>> '{seleccion,id}', '') = '' THEN
        RETURN NULL;
      END IF;
      RETURN EXISTS (
        SELECT 1
        FROM jsonb_array_elements(p_campos -> 'opciones') o
        WHERE o ->> 'id' = p_respuesta #>> '{seleccion,id}'
          AND COALESCE((o ->> 'esCorrecta')::boolean, false)
      );

    WHEN 'clasificacionCategorias' THEN
      IF jsonb_typeof(COALESCE(p_campos -> 'items', p_campos -> 'elementos'))
          IS DISTINCT FROM 'array'
         OR jsonb_typeof(p_respuesta -> 'clasificaciones')
          IS DISTINCT FROM 'array' THEN
        RETURN NULL;
      END IF;

      SELECT count(*) INTO v_esperadas
      FROM jsonb_array_elements(
        COALESCE(p_campos -> 'items', p_campos -> 'elementos')
      );
      SELECT count(*) INTO v_recibidas
      FROM jsonb_array_elements(p_respuesta -> 'clasificaciones');

      SELECT count(*) INTO v_incorrectas
      FROM jsonb_array_elements(
        COALESCE(p_campos -> 'items', p_campos -> 'elementos')
      ) esperado
      LEFT JOIN jsonb_array_elements(p_respuesta -> 'clasificaciones') recibido
        ON recibido ->> 'id' = esperado ->> 'id'
      WHERE recibido IS NULL
         OR COALESCE(
              recibido ->> 'categoriaElegidaId',
              recibido ->> 'categoriaElegida'
            ) IS DISTINCT FROM COALESCE(
              esperado ->> 'categoriaId',
              esperado ->> 'categoria',
              esperado ->> 'respuesta'
            );

      RETURN v_esperadas > 0
        AND v_recibidas = v_esperadas
        AND v_incorrectas = 0;

    WHEN 'emparejar' THEN
      IF jsonb_typeof(p_campos -> 'pares') IS DISTINCT FROM 'array'
         OR jsonb_typeof(p_respuesta -> 'parejas') IS DISTINCT FROM 'array' THEN
        RETURN NULL;
      END IF;

      SELECT count(*) INTO v_esperadas
      FROM jsonb_array_elements(p_campos -> 'pares');
      SELECT count(*) INTO v_recibidas
      FROM jsonb_array_elements(p_respuesta -> 'parejas');

      SELECT count(*) INTO v_incorrectas
      FROM jsonb_array_elements(p_campos -> 'pares') esperado
      WHERE NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(p_respuesta -> 'parejas') recibido
        WHERE public.normalizar_respuesta_texto(recibido ->> 'izquierda')
              = public.normalizar_respuesta_texto(esperado ->> 'izquierda')
          AND public.normalizar_respuesta_texto(recibido ->> 'derecha')
              = public.normalizar_respuesta_texto(esperado ->> 'derecha')
      );

      RETURN v_esperadas > 0
        AND v_recibidas = v_esperadas
        AND v_incorrectas = 0;

    WHEN 'sopaLetras' THEN
      IF jsonb_typeof(p_campos -> 'palabras') IS DISTINCT FROM 'array'
         OR jsonb_typeof(p_respuesta -> 'palabrasEncontradas')
          IS DISTINCT FROM 'array' THEN
        RETURN NULL;
      END IF;

      SELECT count(*) INTO v_esperadas
      FROM jsonb_array_elements_text(p_campos -> 'palabras');
      SELECT count(DISTINCT public.normalizar_respuesta_texto(value))
      INTO v_recibidas
      FROM jsonb_array_elements_text(p_respuesta -> 'palabrasEncontradas');

      SELECT count(*) INTO v_incorrectas
      FROM jsonb_array_elements_text(p_campos -> 'palabras') esperado(value)
      WHERE NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(
          p_respuesta -> 'palabrasEncontradas'
        ) recibido(value)
        WHERE public.normalizar_respuesta_texto(recibido.value)
              = public.normalizar_respuesta_texto(esperado.value)
      );

      RETURN v_esperadas > 0
        AND v_recibidas = v_esperadas
        AND v_incorrectas = 0;

    WHEN 'lineaTiempoEmocional' THEN
      IF jsonb_typeof(p_campos -> 'momentos') IS DISTINCT FROM 'array'
         OR jsonb_typeof(p_respuesta -> 'momentos') IS DISTINCT FROM 'array' THEN
        RETURN NULL;
      END IF;

      SELECT count(*) INTO v_esperadas
      FROM jsonb_array_elements(p_campos -> 'momentos');
      SELECT count(*) INTO v_recibidas
      FROM jsonb_array_elements(p_respuesta -> 'momentos');

      SELECT count(*) INTO v_incorrectas
      FROM jsonb_array_elements(p_campos -> 'momentos')
        WITH ORDINALITY AS esperado(momento, n)
      LEFT JOIN jsonb_array_elements(p_respuesta -> 'momentos')
        WITH ORDINALITY AS recibido(momento, n) USING (n)
      WHERE recibido.momento IS NULL
         OR NOT EXISTS (
           SELECT 1
           FROM jsonb_array_elements(
             COALESCE(esperado.momento -> 'opciones', '[]'::jsonb)
           ) opcion
           WHERE COALESCE((opcion ->> 'esCorrecta')::boolean, false)
             AND public.normalizar_respuesta_texto(opcion ->> 'texto')
                 = public.normalizar_respuesta_texto(
                   recibido.momento ->> 'seleccion'
                 )
         );

      RETURN v_esperadas > 0
        AND v_recibidas = v_esperadas
        AND v_incorrectas = 0;

    ELSE
      -- Actividades reflexivas, artísticas o sin una única solución.
      RETURN NULL;
  END CASE;
EXCEPTION
  WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.evaluar_respuesta_actividad(TEXT, JSONB, JSONB)
  FROM PUBLIC, anon, authenticated;

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
  v_tipo TEXT;
  v_campos JSONB;
  v_es_correcta BOOLEAN;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'autenticacion_requerida' USING ERRCODE = '42501';
  END IF;

  SELECT rol INTO v_rol FROM public.profiles WHERE id = v_uid;
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

  SELECT a.unidad_id, u.libro_id, a.tipo, COALESCE(a.campos, '{}'::jsonb)
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

  IF p_guardar_respuesta THEN
    v_es_correcta := public.evaluar_respuesta_actividad(
      v_tipo, v_campos, p_respuesta
    );
  END IF;

  INSERT INTO public.actividad_progreso (usuario_id, actividad_id, completada_en)
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
      p_respuesta, v_es_correcta, now()
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
    'libro_id', v_libro_id,
    'es_correcta', v_es_correcta
  );
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_progreso_actividad(
  TEXT, JSONB, BOOLEAN, BOOLEAN
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_progreso_actividad(
  TEXT, JSONB, BOOLEAN, BOOLEAN
) TO authenticated;

DO $verify$
DECLARE
  v_definition TEXT;
BEGIN
  SELECT pg_get_functiondef(
    'public.registrar_progreso_actividad(text,jsonb,boolean,boolean)'::regprocedure
  ) INTO v_definition;

  IF v_definition NOT LIKE '%evaluar_respuesta_actividad%'
     OR v_definition LIKE '%p_respuesta, p_es_correcta,%' THEN
    RAISE EXCEPTION 'fase6b: registrar_progreso_actividad no quedó protegido';
  END IF;

  IF has_function_privilege(
    'authenticated',
    'public.evaluar_respuesta_actividad(text,jsonb,jsonb)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'fase6b: el evaluador interno es ejecutable por clientes';
  END IF;

  IF public.evaluar_respuesta_actividad(
    'verdaderoFalso',
    '{"afirmaciones":[{"texto":"A","esVerdadero":true}]}'::jsonb,
    '{"respuestas":[{"texto":"A","respondio":true,"esCorrecta":false}]}'::jsonb
  ) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'fase6b: prueba positiva del evaluador fallida';
  END IF;

  IF public.evaluar_respuesta_actividad(
    'verdaderoFalso',
    '{"afirmaciones":[{"texto":"A","esVerdadero":true}]}'::jsonb,
    '{"respuestas":[{"texto":"A","respondio":false,"esCorrecta":true}]}'::jsonb
  ) IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'fase6b: el evaluador confió en datos del cliente';
  END IF;

  IF public.evaluar_respuesta_actividad(
    'seleccionMultiple',
    '{"opciones":[{"texto":"Sí","esCorrecta":true},{"texto":"No","esCorrecta":false}]}'::jsonb,
    '{"opcionElegida":"Sí"}'::jsonb
  ) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'fase6b: compatibilidad de selección antigua fallida';
  END IF;

  IF public.evaluar_respuesta_actividad(
    'seleccionMultiple',
    '{"opciones":[{"texto":"Sí","esCorrecta":true}]}'::jsonb,
    '{}'::jsonb
  ) IS NOT NULL THEN
    RAISE EXCEPTION 'fase6b: payload incompleto no quedó sin calificar';
  END IF;

  IF public.evaluar_respuesta_actividad(
    'reflexionPersonal',
    '{}'::jsonb,
    '{"respuesta":"texto libre"}'::jsonb
  ) IS NOT NULL THEN
    RAISE EXCEPTION 'fase6b: una actividad subjetiva fue calificada';
  END IF;

  IF public.evaluar_respuesta_actividad(
    'lineaTiempoEmocional',
    '{"momentos":[{"texto":"Inicio","opciones":[{"texto":"Calma","esCorrecta":true},{"texto":"Miedo","esCorrecta":false}]}]}'::jsonb,
    '{"momentos":[{"momento":"Inicio","seleccion":"Miedo","esCorrecta":true}]}'::jsonb
  ) IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'fase6b: línea emocional confió en el cliente';
  END IF;

  IF public.evaluar_respuesta_actividad(
    'lineaTiempoEmocional',
    '{"momentos":[{"texto":"Inicio","opciones":[{"texto":"Calma","esCorrecta":true}]}]}'::jsonb,
    '{"momentos":[{"momento":"Inicio","seleccion":"Calma","esCorrecta":false}]}'::jsonb
  ) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'fase6b: evaluación de línea emocional fallida';
  END IF;
END
$verify$;

COMMIT;

SELECT
  true AS fase_6b_evaluacion_servidor,
  true AS p_es_correcta_ignorado,
  true AS evaluador_interno_no_ejecutable,
  true AS resultado_devuelto_por_rpc;
