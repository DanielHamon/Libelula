-- ============================================================
-- IAbooks — Diagnóstico de identificar
-- Solo lectura. No devuelve respuestas ni usuarios.
-- ============================================================

WITH opciones AS (
  SELECT
    a.id AS actividad_id,
    o.n::integer - 1 AS indice,
    COALESCE((o.opcion ->> 'esCorrecta')::boolean, false)
      AS configurada_correcta,
    public.evaluar_respuesta_actividad(
      'identificar',
      a.campos,
      jsonb_build_object(
        'seleccionadas',
        jsonb_build_array(o.opcion ->> 'texto')
      )
    ) AS servidor_acepta_seleccion_individual
  FROM public.actividades a
  CROSS JOIN LATERAL jsonb_array_elements(a.campos -> 'opciones')
    WITH ORDINALITY AS o(opcion, n)
  WHERE a.tipo = 'identificar'
),
intentos AS (
  SELECT
    actividad_id,
    count(*) AS estudiantes_con_intentos,
    count(*) FILTER (WHERE completada) AS estudiantes_ya_completaron
  FROM public.intentos_actividad
  GROUP BY actividad_id
)
SELECT
  o.actividad_id,
  o.indice,
  o.configurada_correcta,
  o.servidor_acepta_seleccion_individual,
  COALESCE(i.estudiantes_con_intentos, 0) AS estudiantes_con_intentos,
  COALESCE(i.estudiantes_ya_completaron, 0) AS estudiantes_ya_completaron
FROM opciones o
LEFT JOIN intentos i USING (actividad_id)
ORDER BY o.actividad_id, o.indice;
