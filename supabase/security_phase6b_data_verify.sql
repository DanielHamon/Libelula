-- ============================================================
-- IAbooks — Fase 6B: verificación agregada de compatibilidad
-- Solo lectura. No devuelve respuestas, correos ni identificadores.
-- ============================================================

WITH evaluadas AS (
  SELECT
    a.tipo,
    r.es_correcta AS resultado_historico,
    public.evaluar_respuesta_actividad(
      a.tipo,
      COALESCE(a.campos, '{}'::jsonb),
      r.respuesta
    ) AS resultado_servidor
  FROM public.respuestas r
  JOIN public.actividades a ON a.id = r.actividad_id
),
resumen AS (
  SELECT
    tipo,
    count(*) AS respuestas,
    count(*) FILTER (WHERE resultado_servidor IS NOT NULL) AS evaluables,
    count(*) FILTER (WHERE resultado_servidor IS NULL) AS no_evaluables,
    count(*) FILTER (
      WHERE resultado_servidor IS NOT NULL
        AND resultado_historico IS NOT NULL
        AND resultado_servidor IS DISTINCT FROM resultado_historico
    ) AS diferencias_historicas,
    count(*) FILTER (
      WHERE resultado_servidor IS NOT NULL
        AND resultado_historico IS NULL
    ) AS antes_sin_calificacion
  FROM evaluadas
  GROUP BY tipo
)
SELECT
  tipo,
  respuestas,
  evaluables,
  no_evaluables,
  diferencias_historicas,
  antes_sin_calificacion
FROM resumen
ORDER BY tipo;
