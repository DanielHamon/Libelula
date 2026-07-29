-- ============================================================
-- IAbooks — Diagnóstico agregado de claves visibles por tipo
-- Solo lectura. No devuelve soluciones ni contenido pedagógico.
-- ============================================================

SELECT
  a.tipo,
  count(*) AS actividades,
  count(*) FILTER (
    WHERE jsonb_path_exists(
      public.campos_publicos_actividad(a.tipo, a.campos),
      '$.**.esCorrecta'
    )
  ) AS con_es_correcta_visible,
  count(*) FILTER (
    WHERE jsonb_path_exists(
      public.campos_publicos_actividad(a.tipo, a.campos),
      '$.**.esVerdadero'
    )
  ) AS con_es_verdadero_visible
FROM public.actividades a
GROUP BY a.tipo
HAVING
  count(*) FILTER (
    WHERE jsonb_path_exists(
      public.campos_publicos_actividad(a.tipo, a.campos),
      '$.**.esCorrecta'
    )
  ) > 0
  OR count(*) FILTER (
    WHERE jsonb_path_exists(
      public.campos_publicos_actividad(a.tipo, a.campos),
      '$.**.esVerdadero'
    )
  ) > 0
ORDER BY a.tipo;
