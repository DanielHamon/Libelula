-- IAbooks — Fase 5: biblioteca de archivos administrada por superadmin
-- Carga directa e inmutable conservando el nombre original.

BEGIN;

DROP POLICY IF EXISTS libros_superadmin_library_insert ON storage.objects;
DROP POLICY IF EXISTS libros_superadmin_library_delete ON storage.objects;
DROP POLICY IF EXISTS libros_staging_superadmin_insert ON storage.objects;

CREATE POLICY libros_superadmin_library_insert
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'libros'
  AND public.es_superadministrador()
  AND public.sesion_es_aal2()
  AND (storage.foldername(name))[1] IN ('portada', 'pdfs')
  AND array_length(storage.foldername(name), 1) = 1
  AND length(storage.filename(name)) BETWEEN 1 AND 180
  AND storage.filename(name) NOT LIKE '.%'
  AND CASE
    WHEN (storage.foldername(name))[1] = 'portada' THEN
      lower(storage.extension(name)) IN ('jpg', 'jpeg', 'png', 'webp')
      AND lower(COALESCE(metadata ->> 'mimetype', '')) IN
        ('image/jpeg', 'image/png', 'image/webp')
      AND COALESCE((metadata ->> 'size')::bigint, 0) BETWEEN 1 AND 5242880
    WHEN (storage.foldername(name))[1] = 'pdfs' THEN
      lower(storage.extension(name)) = 'pdf'
      AND lower(COALESCE(metadata ->> 'mimetype', '')) = 'application/pdf'
      AND COALESCE((metadata ->> 'size')::bigint, 0) BETWEEN 1 AND 52428800
    ELSE false
  END
);

-- El borrado físico solo se permite si ninguna portada o PDF publicado usa la
-- ruta. Storage API realiza la eliminación del objeto, nunca SQL directo.
CREATE POLICY libros_superadmin_library_delete
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'libros'
  AND public.es_superadministrador()
  AND public.sesion_es_aal2()
  AND (storage.foldername(name))[1] IN ('portada', 'pdfs')
  AND array_length(storage.foldername(name), 1) = 1
  AND NOT EXISTS (
    SELECT 1
    FROM public.libros l
    WHERE l.portada_url = name OR l.pdf_url = name
  )
);

DO $$
DECLARE
  v_insert_ok BOOLEAN;
  v_delete_ok BOOLEAN;
BEGIN
  SELECT
    EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'storage' AND tablename = 'objects'
        AND policyname = 'libros_superadmin_library_insert'
        AND with_check ILIKE '%es_superadministrador%'
        AND with_check ILIKE '%sesion_es_aal2%'
        AND with_check ILIKE '%portada%'
        AND with_check ILIKE '%pdfs%'
    ),
    EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'storage' AND tablename = 'objects'
        AND policyname = 'libros_superadmin_library_delete'
        AND qual ILIKE '%es_superadministrador%'
        AND qual ILIKE '%sesion_es_aal2%'
        AND qual ILIKE '%libros%'
        AND qual ILIKE '%portada_url%'
        AND qual ILIKE '%pdf_url%'
    )
  INTO v_insert_ok, v_delete_ok;

  IF NOT (v_insert_ok AND v_delete_ok) THEN
    RAISE EXCEPTION
      'postflight_biblioteca_archivos_fallo: insert=%, delete=%',
      v_insert_ok, v_delete_ok;
  END IF;
END;
$$;

COMMIT;

SELECT
  true AS biblioteca_aplicada,
  true AS nombres_originales_habilitados,
  true AS duplicados_bloqueados,
  true AS borrado_superadmin_habilitado,
  true AS archivos_en_uso_protegidos;
