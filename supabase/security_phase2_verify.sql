-- Verificación estructural posterior a security_phase2.sql.

SELECT 'rpc_existe' AS prueba,
       to_regprocedure(
         'public.registrar_progreso_actividad(text,jsonb,boolean,boolean)'
       ) IS NOT NULL AS ok;

SELECT 'sin_escritura_directa_progreso' AS prueba,
       NOT has_table_privilege('authenticated', 'public.progreso', 'INSERT,UPDATE,DELETE') AS ok
UNION ALL
SELECT 'sin_escritura_directa_actividad_progreso',
       NOT has_table_privilege('authenticated', 'public.actividad_progreso', 'INSERT,UPDATE,DELETE')
UNION ALL
SELECT 'sin_escritura_directa_respuestas',
       NOT has_table_privilege('authenticated', 'public.respuestas', 'INSERT,UPDATE,DELETE')
UNION ALL
SELECT 'sin_inscripcion_directa',
       NOT has_table_privilege('authenticated', 'public.inscripciones', 'INSERT');

SELECT conname AS restriccion, convalidated AS validada
FROM pg_constraint
WHERE conrelid = 'public.respuestas'::regclass
  AND conname IN (
    'respuestas_actividad_unidad_fk',
    'respuestas_unidad_libro_fk'
  );

SELECT proname, prosecdef AS security_definer,
       proconfig @> ARRAY['search_path=pg_catalog, public'] AS search_path_seguro
FROM pg_proc
WHERE oid = 'public.registrar_progreso_actividad(text,jsonb,boolean,boolean)'::regprocedure;
