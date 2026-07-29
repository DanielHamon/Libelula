-- ============================================================
-- IAbooks — Fase 6C: cierre de sopaLetras
-- Verificación final. No modifica datos.
--
-- En este tipo, "palabras" es el banco visible necesario para jugar.
-- No es una solución privada. La calificación, en cambio, sí debe quedar
-- exclusivamente en evaluar_respuesta_actividad/evaluar_intento_actividad.
-- ============================================================

DO $verify$
DECLARE
  v_fallos INTEGER;
BEGIN
  -- Configuración válida: al menos una palabra, sin vacíos ni duplicados,
  -- y todas deben caber dentro del tablero configurado.
  SELECT count(*)
  INTO v_fallos
  FROM public.actividades a
  WHERE a.tipo = 'sopaLetras'
    AND (
      jsonb_typeof(a.campos -> 'palabras') IS DISTINCT FROM 'array'
      OR jsonb_array_length(a.campos -> 'palabras') < 1
      OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(a.campos -> 'palabras') palabra(valor)
        WHERE btrim(palabra.valor) = ''
           OR char_length(palabra.valor) > LEAST(
             GREATEST(COALESCE((a.campos ->> 'espacio')::integer, 8), 5),
             20
           )
      )
      OR (
        SELECT count(*)
        FROM jsonb_array_elements_text(a.campos -> 'palabras')
      ) IS DISTINCT FROM (
        SELECT count(DISTINCT public.normalizar_respuesta_texto(valor))
        FROM jsonb_array_elements_text(a.campos -> 'palabras') palabra(valor)
      )
    );

  IF v_fallos > 0 THEN
    RAISE EXCEPTION
      'fase6c cierre: % sopas tienen palabras inválidas, repetidas o demasiado largas',
      v_fallos;
  END IF;

  -- El banco público debe conservarse porque forma parte del enunciado.
  SELECT count(*)
  INTO v_fallos
  FROM public.actividades a
  WHERE a.tipo = 'sopaLetras'
    AND public.campos_publicos_actividad(a.tipo, a.campos) -> 'palabras'
          IS DISTINCT FROM a.campos -> 'palabras';

  IF v_fallos > 0 THEN
    RAISE EXCEPTION
      'fase6c cierre: % sopas perdieron su banco público de palabras',
      v_fallos;
  END IF;

  -- Una respuesta completa construida desde la definición privada debe ser
  -- aceptada por el evaluador interno.
  SELECT count(*)
  INTO v_fallos
  FROM public.actividades a
  WHERE a.tipo = 'sopaLetras'
    AND public.evaluar_respuesta_actividad(
      a.tipo,
      a.campos,
      jsonb_build_object(
        'palabrasEncontradas',
        a.campos -> 'palabras'
      )
    ) IS DISTINCT FROM true;

  IF v_fallos > 0 THEN
    RAISE EXCEPTION
      'fase6c cierre: % sopas no son evaluables internamente',
      v_fallos;
  END IF;

  -- Los clientes no pueden ejecutar el evaluador ni alterar intentos.
  IF has_function_privilege(
       'authenticated',
       'public.evaluar_respuesta_actividad(text,jsonb,jsonb)',
       'EXECUTE'
     )
     OR has_table_privilege(
       'authenticated',
       'public.intentos_actividad',
       'INSERT,UPDATE,DELETE'
     ) THEN
    RAISE EXCEPTION
      'fase6c cierre: evaluación o intentos internos expuestos a estudiantes';
  END IF;

  -- La RPC transaccional debe continuar disponible para el frontend.
  IF NOT has_function_privilege(
    'authenticated',
    'public.evaluar_intento_actividad(text,jsonb)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION
      'fase6c cierre: evaluar_intento_actividad no está disponible';
  END IF;
END
$verify$;

SELECT
  true AS sopa_letras_cerrada,
  true AS banco_visible_conservado,
  true AS configuraciones_validas,
  true AS evaluacion_interna_operativa,
  true AS intentos_directos_bloqueados,
  true AS rpc_transaccional_disponible;
