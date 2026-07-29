-- ============================================================
-- IAbooks — Diagnóstico agregado de selección múltiple
-- Solo lectura. No devuelve contenido ni identificadores.
-- ============================================================

WITH base AS (
  SELECT
    r.es_correcta AS historico,
    public.evaluar_respuesta_actividad(
      a.tipo,
      COALESCE(a.campos, '{}'::jsonb),
      r.respuesta
    ) AS servidor,
    jsonb_typeof(r.respuesta -> 'seleccionadasIndices') = 'array'
      AS tiene_indices,
    jsonb_typeof(r.respuesta -> 'seleccionadas') = 'array'
      AS tiene_textos,
    jsonb_typeof(r.respuesta -> 'respuestas') = 'array'
      AS tiene_detalle,
    CASE
      WHEN jsonb_typeof(r.respuesta -> 'seleccionadasIndices') = 'array'
        THEN jsonb_array_length(r.respuesta -> 'seleccionadasIndices')
      ELSE 0
    END AS cantidad_seleccionada,
    (
      SELECT count(*)
      FROM jsonb_array_elements(COALESCE(a.campos -> 'opciones', '[]'::jsonb)) o
      WHERE COALESCE((o ->> 'esCorrecta')::boolean, false)
    ) AS cantidad_correcta
  FROM public.respuestas r
  JOIN public.actividades a ON a.id = r.actividad_id
  WHERE a.tipo = 'seleccionMultiple'
)
SELECT
  historico,
  servidor,
  tiene_indices,
  tiene_textos,
  tiene_detalle,
  cantidad_seleccionada,
  cantidad_correcta,
  count(*) AS casos
FROM base
GROUP BY
  historico,
  servidor,
  tiene_indices,
  tiene_textos,
  tiene_detalle,
  cantidad_seleccionada,
  cantidad_correcta
ORDER BY
  historico,
  servidor,
  cantidad_correcta,
  cantidad_seleccionada;
