-- ============================================================
-- IAbooks — Diagnóstico de evaluadores objetivos de Fase 6
-- Solo lectura. No devuelve soluciones ni respuestas.
-- ============================================================

WITH objetivas AS (
  SELECT
    a.id,
    a.tipo,
    COALESCE(a.campos ->> 'titulo', '(sin título)') AS titulo,
    CASE a.tipo
      WHEN 'seleccionMultiple' THEN '{"seleccionadasIndices":[]}'::jsonb
      WHEN 'verdaderoFalso' THEN '{"respuestas":[]}'::jsonb
      WHEN 'identificar' THEN '{"seleccionadas":[]}'::jsonb
      WHEN 'selectorEmocionColor'
        THEN '{"seleccion":{"id":"__inexistente__"}}'::jsonb
      WHEN 'lineaTiempoEmocional' THEN '{"momentos":[]}'::jsonb
      WHEN 'completarPalabras' THEN '{"respuestas":[]}'::jsonb
      WHEN 'ordenarPalabras'
        THEN '{"frase":"__diagnostico_respuesta_no_vacia__"}'::jsonb
      WHEN 'ordenarEventos' THEN '{"orden":[]}'::jsonb
      WHEN 'clasificacionCategorias' THEN '{"clasificaciones":[]}'::jsonb
      WHEN 'emparejar' THEN '{"parejas":[]}'::jsonb
      WHEN 'sopaLetras' THEN '{"palabrasEncontradas":[]}'::jsonb
      WHEN 'crucigrama' THEN '{"palabras":[]}'::jsonb
      WHEN 'separarSilabas' THEN '{"respuestas":[]}'::jsonb
    END AS respuesta_prueba,
    a.campos
  FROM public.actividades a
  WHERE a.tipo IN (
    'seleccionMultiple', 'verdaderoFalso', 'identificar',
    'selectorEmocionColor', 'lineaTiempoEmocional',
    'completarPalabras', 'ordenarPalabras', 'ordenarEventos',
    'clasificacionCategorias', 'emparejar', 'sopaLetras',
    'crucigrama', 'separarSilabas'
  )
),
resultado AS (
  SELECT
    id,
    tipo,
    titulo,
    public.evaluar_respuesta_actividad(
      tipo, campos, respuesta_prueba
    ) AS resultado_evaluador,
    CASE tipo
      WHEN 'seleccionMultiple' THEN jsonb_typeof(campos -> 'opciones') = 'array'
      WHEN 'verdaderoFalso' THEN jsonb_typeof(campos -> 'afirmaciones') = 'array'
      WHEN 'identificar' THEN jsonb_typeof(campos -> 'opciones') = 'array'
      WHEN 'selectorEmocionColor' THEN jsonb_typeof(campos -> 'opciones') = 'array'
      WHEN 'lineaTiempoEmocional' THEN jsonb_typeof(campos -> 'momentos') = 'array'
      WHEN 'completarPalabras' THEN
        COALESCE(jsonb_typeof(campos -> 'respuestas') = 'array', false)
        OR COALESCE(campos ->> 'texto', '') <> ''
      WHEN 'ordenarPalabras' THEN
        COALESCE(campos ->> 'fraseCorrecta', '') <> ''
        OR jsonb_typeof(campos -> 'palabras') = 'array'
      WHEN 'ordenarEventos' THEN jsonb_typeof(campos -> 'eventos') = 'array'
      WHEN 'clasificacionCategorias' THEN jsonb_typeof(
        COALESCE(campos -> 'items', campos -> 'elementos')
      ) = 'array'
      WHEN 'emparejar' THEN jsonb_typeof(campos -> 'pares') = 'array'
      WHEN 'sopaLetras' THEN jsonb_typeof(campos -> 'palabras') = 'array'
      WHEN 'crucigrama' THEN jsonb_typeof(
        COALESCE(campos -> 'palabras', campos -> 'words')
      ) = 'array'
      WHEN 'separarSilabas' THEN jsonb_typeof(campos -> 'palabras') = 'array'
      ELSE false
    END AS estructura_reconocible
  FROM objetivas
)
SELECT
  id AS actividad_id,
  tipo,
  titulo,
  estructura_reconocible,
  CASE
    WHEN NOT estructura_reconocible
      THEN 'CONFIGURACIÓN INCOMPATIBLE'
    WHEN resultado_evaluador IS NULL
      THEN 'EVALUADOR DEVOLVIÓ NULL'
    ELSE 'OK'
  END AS diagnostico
FROM resultado
WHERE resultado_evaluador IS NULL
   OR NOT estructura_reconocible
ORDER BY tipo, id;
