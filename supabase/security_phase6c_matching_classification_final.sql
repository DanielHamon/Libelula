-- ============================================================
-- IAbooks — Fase 6C: cierre de emparejar y clasificación
-- Verificación final. No modifica datos.
-- ============================================================

DO $verify$
DECLARE
  v_fallos INTEGER;
BEGIN
  -- Emparejar debe publicar dos bancos independientes, completos y sin pares.
  SELECT count(*)
  INTO v_fallos
  FROM public.actividades a
  CROSS JOIN LATERAL (
    SELECT public.campos_publicos_actividad(a.tipo, a.campos) AS campos
  ) publico
  WHERE a.tipo = 'emparejar'
    AND (
      publico.campos ? 'pares'
      OR jsonb_typeof(publico.campos -> 'elementosIzquierda')
           IS DISTINCT FROM 'array'
      OR jsonb_typeof(publico.campos -> 'elementosDerecha')
           IS DISTINCT FROM 'array'
      OR jsonb_array_length(publico.campos -> 'elementosIzquierda')
           IS DISTINCT FROM jsonb_array_length(a.campos -> 'pares')
      OR jsonb_array_length(publico.campos -> 'elementosDerecha')
           IS DISTINCT FROM jsonb_array_length(a.campos -> 'pares')
    );

  IF v_fallos > 0 THEN
    RAISE EXCEPTION
      'fase6c cierre: % actividades emparejar exponen o pierden datos',
      v_fallos;
  END IF;

  -- Ninguna derecha pública debe conservar la posición de su pareja real.
  SELECT count(*)
  INTO v_fallos
  FROM public.actividades a
  CROSS JOIN LATERAL jsonb_array_elements(a.campos -> 'pares')
    WITH ORDINALITY AS original(par, n)
  CROSS JOIN LATERAL jsonb_array_elements(
    public.campos_publicos_actividad(a.tipo, a.campos)
      -> 'elementosDerecha'
  ) WITH ORDINALITY AS publica(valor, n)
  WHERE a.tipo = 'emparejar'
    AND original.n = publica.n
    AND original.par -> 'derecha' = publica.valor;

  IF v_fallos > 0 THEN
    RAISE EXCEPTION
      'fase6c cierre: % posiciones todavía revelan parejas reales',
      v_fallos;
  END IF;

  -- La configuración interna de emparejar debe ser evaluable y no ambigua.
  SELECT count(*)
  INTO v_fallos
  FROM public.actividades a
  WHERE a.tipo = 'emparejar'
    AND (
      jsonb_typeof(a.campos -> 'pares') IS DISTINCT FROM 'array'
      OR jsonb_array_length(a.campos -> 'pares') < 2
      OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements(a.campos -> 'pares') par
        WHERE btrim(COALESCE(par ->> 'izquierda', '')) = ''
           OR btrim(COALESCE(par ->> 'derecha', '')) = ''
      )
      OR (
        SELECT count(*)
        FROM jsonb_array_elements(a.campos -> 'pares')
      ) IS DISTINCT FROM (
        SELECT count(DISTINCT public.normalizar_respuesta_texto(
          par ->> 'izquierda'
        ))
        FROM jsonb_array_elements(a.campos -> 'pares') par
      )
      OR (
        SELECT count(*)
        FROM jsonb_array_elements(a.campos -> 'pares')
      ) IS DISTINCT FROM (
        SELECT count(DISTINCT public.normalizar_respuesta_texto(
          par ->> 'derecha'
        ))
        FROM jsonb_array_elements(a.campos -> 'pares') par
      )
      OR public.evaluar_respuesta_actividad(
        a.tipo,
        a.campos,
        jsonb_build_object('parejas', (
          SELECT jsonb_agg(jsonb_build_object(
            'izquierda', par ->> 'izquierda',
            'derecha', par ->> 'derecha'
          ))
          FROM jsonb_array_elements(a.campos -> 'pares') par
        ))
      ) IS DISTINCT FROM true
    );

  IF v_fallos > 0 THEN
    RAISE EXCEPTION
      'fase6c cierre: % actividades emparejar tienen configuración inválida',
      v_fallos;
  END IF;

  -- Clasificación debe conservar contenido, pero retirar toda asignación.
  SELECT count(*)
  INTO v_fallos
  FROM public.actividades a
  CROSS JOIN LATERAL (
    SELECT public.campos_publicos_actividad(a.tipo, a.campos) AS campos
  ) publico
  WHERE a.tipo = 'clasificacionCategorias'
    AND (
      jsonb_path_exists(
        publico.campos,
        '$.**.categoriaId'
      )
      OR jsonb_path_exists(
        publico.campos,
        '$.**.categoria'
      )
      OR jsonb_path_exists(
        publico.campos,
        '$.**.respuesta'
      )
      OR jsonb_path_exists(
        publico.campos,
        '$.**.esCorrecta'
      )
      OR jsonb_path_exists(
        publico.campos,
        '$.**.categoriaCorrecta'
      )
      OR jsonb_array_length(
        COALESCE(publico.campos -> 'items', publico.campos -> 'elementos')
      ) IS DISTINCT FROM jsonb_array_length(
        COALESCE(a.campos -> 'items', a.campos -> 'elementos')
      )
    );

  IF v_fallos > 0 THEN
    RAISE EXCEPTION
      'fase6c cierre: % clasificaciones exponen o pierden datos',
      v_fallos;
  END IF;

  -- La respuesta correcta interna de clasificación debe seguir siendo
  -- evaluable después de retirar esas claves del contenido público.
  SELECT count(*)
  INTO v_fallos
  FROM public.actividades a
  WHERE a.tipo = 'clasificacionCategorias'
    AND (
      jsonb_typeof(
        COALESCE(a.campos -> 'items', a.campos -> 'elementos')
      ) IS DISTINCT FROM 'array'
      OR jsonb_array_length(
        COALESCE(a.campos -> 'items', a.campos -> 'elementos')
      ) < 1
      OR public.evaluar_respuesta_actividad(
        a.tipo,
        a.campos,
        jsonb_build_object('clasificaciones', (
          SELECT jsonb_agg(jsonb_build_object(
            'id', item ->> 'id',
            'categoriaElegidaId', COALESCE(
              item ->> 'categoriaId',
              item ->> 'categoria',
              item ->> 'respuesta'
            )
          ))
          FROM jsonb_array_elements(
            COALESCE(a.campos -> 'items', a.campos -> 'elementos')
          ) item
        ))
      ) IS DISTINCT FROM true
    );

  IF v_fallos > 0 THEN
    RAISE EXCEPTION
      'fase6c cierre: % clasificaciones no son evaluables internamente',
      v_fallos;
  END IF;

  -- Los estudiantes no deben poder ejecutar directamente los helpers internos.
  IF has_function_privilege(
       'authenticated',
       'public.campos_publicos_actividad(text,jsonb)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'authenticated',
       'public.campos_publicos_actividad_pre_matching(text,jsonb)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'authenticated',
       'public.evaluar_respuesta_actividad(text,jsonb,jsonb)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION
      'fase6c cierre: un helper interno todavía es ejecutable por estudiantes';
  END IF;

  -- Guardia mínima contra regresiones de los tipos protegidos anteriormente.
  SELECT count(*)
  INTO v_fallos
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
      'fase6c cierre: % actividades tienen soluciones booleanas visibles',
      v_fallos;
  END IF;
END
$verify$;

SELECT
  true AS emparejar_cerrado,
  true AS clasificacion_cerrada,
  true AS soluciones_publicas_ocultas,
  true AS evaluacion_interna_operativa,
  true AS helpers_internos_bloqueados,
  true AS redacciones_anteriores_conservadas;
