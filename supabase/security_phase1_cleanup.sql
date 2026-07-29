-- ============================================================
-- IAbooks — Limpieza posterior de permisos heredados
-- Ejecutar una sola vez si security_phase1.sql se aplicó antes de que
-- esta limpieza se incorporara a la migración principal.
-- ============================================================

BEGIN;

-- Estas policies desplegadas anteriormente son redundantes. Las políticas
-- clase_libros_docente_all, clase_libros_estudiante_read y
-- clase_libros_admin_all ya cubren los flujos autorizados.
DROP POLICY IF EXISTS "authenticated_leer_clase_libros"
  ON public.clase_libros;
DROP POLICY IF EXISTS "docentes_eliminar_clase_libros"
  ON public.clase_libros;
DROP POLICY IF EXISTS "docentes_insertar_clase_libros"
  ON public.clase_libros;

-- anon no necesita ningún privilegio directo sobre el contenido pedagógico.
REVOKE ALL PRIVILEGES ON public.unidades, public.actividades FROM anon;

COMMIT;

-- Resultado esperado: tres policies de clase_libros y cero privilegios anon.
SELECT
  'policies_clase_libros' AS comprobacion,
  COUNT(*) = 3 AS correcto,
  jsonb_agg(policyname ORDER BY policyname) AS detalle
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'clase_libros'

UNION ALL

SELECT
  'sin_privilegios_anon_contenido',
  COUNT(*) = 0,
  COALESCE(jsonb_agg(
    jsonb_build_object(
      'tabla', table_name,
      'privilegio', privilege_type
    )
  ), '[]'::jsonb)
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN ('unidades', 'actividades')
  AND grantee = 'anon';
