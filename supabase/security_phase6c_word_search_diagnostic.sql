-- ============================================================
-- IAbooks — Diagnóstico de configuraciones sopaLetras
-- Solo lectura. Devuelve únicamente las actividades incompatibles.
-- ============================================================

WITH sopas AS (
  SELECT
    a.id,
    COALESCE(a.campos ->> 'titulo', '(sin título)') AS titulo,
    CASE
      WHEN COALESCE(a.campos ->> 'espacio', '') ~ '^[0-9]+$'
        THEN (a.campos ->> 'espacio')::integer
      ELSE NULL
    END AS espacio,
    a.campos -> 'palabras' AS palabras
  FROM public.actividades a
  WHERE a.tipo = 'sopaLetras'
),
estadisticas AS (
  SELECT
    s.*,
    count(p.valor) AS cantidad,
    count(*) FILTER (
      WHERE p.valor IS NOT NULL AND btrim(p.valor) = ''
    ) AS vacias,
    count(DISTINCT public.normalizar_respuesta_texto(p.valor))
      FILTER (WHERE btrim(COALESCE(p.valor, '')) <> '') AS distintas,
    max(char_length(p.valor)) AS longitud_maxima
  FROM sopas s
  LEFT JOIN LATERAL jsonb_array_elements_text(
    CASE
      WHEN jsonb_typeof(s.palabras) = 'array' THEN s.palabras
      ELSE '[]'::jsonb
    END
  ) p(valor) ON true
  GROUP BY s.id, s.titulo, s.espacio, s.palabras
)
SELECT
  id AS actividad_id,
  titulo,
  espacio,
  palabras,
  concat_ws(
    '; ',
    CASE WHEN jsonb_typeof(palabras) IS DISTINCT FROM 'array'
      THEN 'palabras no es un arreglo' END,
    CASE WHEN cantidad = 0
      THEN 'no contiene palabras' END,
    CASE WHEN vacias > 0
      THEN format('%s entrada(s) vacía(s)', vacias) END,
    CASE WHEN distintas < cantidad - vacias
      THEN 'contiene palabras duplicadas' END,
    CASE WHEN espacio IS NULL OR espacio < 5 OR espacio > 20
      THEN 'tamaño fuera del rango 5–20' END,
    CASE WHEN longitud_maxima > espacio
      THEN format(
        'palabra de %s letras no cabe en cuadrícula %sx%s',
        longitud_maxima, espacio, espacio
      ) END
  ) AS problema
FROM estadisticas
WHERE jsonb_typeof(palabras) IS DISTINCT FROM 'array'
   OR cantidad = 0
   OR vacias > 0
   OR distintas < cantidad - vacias
   OR espacio IS NULL
   OR espacio < 5
   OR espacio > 20
   OR longitud_maxima > espacio
ORDER BY id;
