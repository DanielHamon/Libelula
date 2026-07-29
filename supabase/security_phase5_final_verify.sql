-- IAbooks — Verificación final de la Fase 5
-- Solo lectura: no modifica datos, políticas ni objetos.

WITH checks AS (
  SELECT
    EXISTS (
      SELECT 1
      FROM storage.buckets
      WHERE id = 'libros' AND NOT public
    ) AS bucket_privado,

    EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'storage'
        AND tablename = 'objects'
        AND policyname = 'libros_superadmin_library_insert'
        AND cmd = 'INSERT'
        AND with_check ILIKE '%es_superadministrador%'
        AND with_check ILIKE '%sesion_es_aal2%'
        AND with_check ILIKE '%portada%'
        AND with_check ILIKE '%pdfs%'
    ) AS carga_solo_superadmin_aal2,

    EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'storage'
        AND tablename = 'objects'
        AND policyname = 'libros_superadmin_library_delete'
        AND cmd = 'DELETE'
        AND qual ILIKE '%es_superadministrador%'
        AND qual ILIKE '%sesion_es_aal2%'
        AND qual ILIKE '%portada_url%'
        AND qual ILIKE '%pdf_url%'
    ) AS borrado_protege_archivos_en_uso,

    NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'storage'
        AND tablename = 'objects'
        AND cmd = 'UPDATE'
        AND (
          COALESCE(qual, '') ILIKE '%libros%'
          OR COALESCE(with_check, '') ILIKE '%libros%'
        )
    ) AS sobrescritura_bloqueada,

    NOT EXISTS (
      SELECT 1
      FROM storage.objects
      WHERE bucket_id = 'libros'
        AND name LIKE 'staging/%'
    ) AS staging_limpio,

    pg_get_functiondef(
      'public.puede_acceder_libro(text)'::regprocedure
    ) LIKE '%l.activo%'
    AND pg_get_functiondef(
      'public.puede_acceder_libro(text)'::regprocedure
    ) LIKE '%escuela_libros%' AS acceso_exige_estado_y_escuela,

    to_regprocedure('public.get_mis_libros_estado()') IS NOT NULL
    AND has_function_privilege(
      'authenticated',
      'public.get_mis_libros_estado()',
      'EXECUTE'
    ) AS panel_estado_libro_activo
)
SELECT
  *,
  (
    bucket_privado
    AND carga_solo_superadmin_aal2
    AND borrado_protege_archivos_en_uso
    AND sobrescritura_bloqueada
    AND staging_limpio
    AND acceso_exige_estado_y_escuela
    AND panel_estado_libro_activo
  ) AS fase5_lista_para_cerrar
FROM checks;
