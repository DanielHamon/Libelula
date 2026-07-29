-- ============================================================
-- IAbooks — Diagnóstico del modo evaluable de acrostico
-- Solo lectura. No devuelve respuestas configuradas.
-- ============================================================

WITH diagnostico AS (
  SELECT
    a.id AS actividad_id,
    COALESCE(a.campos ->> 'titulo', '(sin título)') AS titulo,
    COALESCE((a.campos ->> 'modoEvaluable')::boolean, false)
      AS modo_evaluable_guardado,
    (
      SELECT count(*)
      FROM jsonb_array_elements(COALESCE(a.campos -> 'lineas', '[]'::jsonb))
        linea
      WHERE btrim(COALESCE(
        linea ->> 'respuesta',
        linea ->> 'correcta',
        ''
      )) <> ''
    ) AS respuestas_configuradas,
    COALESCE((
      public.campos_publicos_actividad(a.tipo, a.campos)
        ->> 'evaluacionServidor'
    )::boolean, false) AS evaluacion_publica,
    public.evaluar_respuesta_actividad(
      a.tipo,
      a.campos,
      jsonb_build_object('respuestas', (
        SELECT jsonb_agg(jsonb_build_object(
          'id', COALESCE(linea ->> 'id', 'linea-' || n::text),
          'letra', linea ->> 'letra',
          'texto', COALESCE(linea ->> 'letra', '') || ' ejemplo'
        ) ORDER BY n)
        FROM jsonb_array_elements(COALESCE(a.campos -> 'lineas', '[]'::jsonb))
          WITH ORDINALITY AS l(linea, n)
      ))
    ) AS evaluador_reconoce_modo
  FROM public.actividades a
  WHERE a.tipo = 'acrostico'
)
SELECT
  *,
  CASE
    WHEN evaluacion_publica
         AND evaluador_reconoce_modo IS NULL
      THEN 'DESINCRONIZADO: vuelve a ejecutar security_phase6c_acrostic.sql'
    WHEN NOT modo_evaluable_guardado
         AND respuestas_configuradas = 0
      THEN 'CREATIVO: activa Modo evaluable y guarda la actividad'
    WHEN evaluacion_publica
         AND evaluador_reconoce_modo = true
      THEN 'OK'
    ELSE 'REVISAR CONFIGURACIÓN'
  END AS diagnostico
FROM diagnostico
ORDER BY actividad_id;
