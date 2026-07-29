-- IAbooks — Fase 5: administración de Storage exclusiva del superadministrador
-- Ejecutar una vez después de security_phase5.sql.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.archivos_libro') IS NULL
     OR to_regprocedure('public.es_superadministrador()') IS NULL
     OR to_regprocedure('public.sesion_es_aal2()') IS NULL THEN
    RAISE EXCEPTION 'faltan_prerrequisitos_fase5_superadmin_storage';
  END IF;
END;
$$;

DROP POLICY IF EXISTS libros_staging_admin_insert ON storage.objects;
DROP POLICY IF EXISTS libros_staging_admin_select ON storage.objects;
DROP POLICY IF EXISTS libros_staging_admin_delete ON storage.objects;
DROP POLICY IF EXISTS libros_staging_superadmin_insert ON storage.objects;
DROP POLICY IF EXISTS libros_staging_superadmin_select ON storage.objects;
DROP POLICY IF EXISTS libros_staging_superadmin_delete ON storage.objects;

-- La policy general anterior daba lectura de todo el bucket a cualquier admin,
-- incluido staging. Ahora los admins conservan acceso a los archivos
-- disponibles/publicados, pero solo el superadmin aal2 ve temporales.
DROP POLICY IF EXISTS authenticated_read_libros_authorized ON storage.objects;
CREATE POLICY authenticated_read_libros_authorized
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'libros'
  AND (
    (
      public.puede_acceder_objeto_libro(name)
      AND (
        (storage.foldername(name))[1] IS DISTINCT FROM 'staging'
        OR EXISTS (
          SELECT 1
          FROM public.archivos_libro a
          WHERE a.path = name AND a.estado = 'publicado'
        )
      )
    )
    OR (
      public.es_superadministrador()
      AND public.sesion_es_aal2()
      AND (storage.foldername(name))[1] = 'staging'
    )
  )
);

CREATE POLICY libros_staging_superadmin_insert
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'libros'
  AND public.es_superadministrador()
  AND public.sesion_es_aal2()
  AND (storage.foldername(name))[1] = 'staging'
  AND (storage.foldername(name))[2] = auth.uid()::text
  AND (storage.foldername(name))[3] IN ('portadas', 'pdfs')
  AND array_length(storage.foldername(name), 1) = 3
  AND CASE
    WHEN (storage.foldername(name))[3] = 'portadas' THEN
      lower(storage.extension(name)) IN ('jpg', 'jpeg', 'png', 'webp')
      AND lower(COALESCE(metadata ->> 'mimetype', '')) IN
        ('image/jpeg', 'image/png', 'image/webp')
      AND COALESCE((metadata ->> 'size')::bigint, 0) BETWEEN 1 AND 5242880
    WHEN (storage.foldername(name))[3] = 'pdfs' THEN
      lower(storage.extension(name)) = 'pdf'
      AND lower(COALESCE(metadata ->> 'mimetype', '')) = 'application/pdf'
      AND COALESCE((metadata ->> 'size')::bigint, 0) BETWEEN 1 AND 52428800
    ELSE false
  END
);

CREATE POLICY libros_staging_superadmin_select
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'libros'
  AND public.es_superadministrador()
  AND public.sesion_es_aal2()
  AND (storage.foldername(name))[1] = 'staging'
);

CREATE POLICY libros_staging_superadmin_delete
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'libros'
  AND public.es_superadministrador()
  AND public.sesion_es_aal2()
  AND (storage.foldername(name))[1] = 'staging'
  AND EXISTS (
    SELECT 1
    FROM public.archivos_libro a
    WHERE a.path = name
      AND a.estado <> 'publicado'
  )
);

CREATE OR REPLACE FUNCTION public.registrar_archivo_libro_staging(p_path TEXT)
RETURNS public.archivos_libro
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth, storage
AS $$
DECLARE
  v_object storage.objects%ROWTYPE;
  v_tipo TEXT;
  v_result public.archivos_libro%ROWTYPE;
BEGIN
  IF NOT public.es_superadministrador() OR NOT public.sesion_es_aal2() THEN
    RAISE EXCEPTION 'solo_superadministrador_aal2' USING ERRCODE = '42501';
  END IF;
  IF p_path !~ ('^staging/' || auth.uid()::text || '/(portadas|pdfs)/[0-9a-f-]+\\.(jpg|jpeg|png|webp|pdf)$') THEN
    RAISE EXCEPTION 'ruta_staging_invalida' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_object
  FROM storage.objects
  WHERE bucket_id = 'libros' AND name = p_path;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'objeto_no_encontrado' USING ERRCODE = 'P0002';
  END IF;

  v_tipo := CASE WHEN (storage.foldername(p_path))[3] = 'portadas'
    THEN 'portada' ELSE 'pdf' END;
  IF (
    v_tipo = 'portada' AND (
      lower(storage.extension(p_path)) NOT IN ('jpg', 'jpeg', 'png', 'webp')
      OR lower(COALESCE(v_object.metadata ->> 'mimetype', '')) NOT IN
        ('image/jpeg', 'image/png', 'image/webp')
      OR COALESCE((v_object.metadata ->> 'size')::bigint, 0) NOT BETWEEN 1 AND 5242880
    )
  ) OR (
    v_tipo = 'pdf' AND (
      lower(storage.extension(p_path)) <> 'pdf'
      OR lower(COALESCE(v_object.metadata ->> 'mimetype', '')) <> 'application/pdf'
      OR COALESCE((v_object.metadata ->> 'size')::bigint, 0) NOT BETWEEN 1 AND 52428800
    )
  ) THEN
    RAISE EXCEPTION 'archivo_no_permitido' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.archivos_libro (
    path, tipo, propietario_id, mime_type, tamano_bytes
  ) VALUES (
    p_path, v_tipo, auth.uid(), v_object.metadata ->> 'mimetype',
    (v_object.metadata ->> 'size')::bigint
  )
  ON CONFLICT (path) DO NOTHING
  RETURNING * INTO v_result;
  IF NOT FOUND THEN
    SELECT * INTO v_result FROM public.archivos_libro WHERE path = p_path;
  END IF;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_archivo_libro_staging(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_archivo_libro_staging(TEXT)
  TO authenticated;

DO $$
DECLARE
  v_insert_ok BOOLEAN;
  v_select_ok BOOLEAN;
  v_delete_ok BOOLEAN;
BEGIN
  SELECT
    EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'storage' AND tablename = 'objects'
        AND policyname = 'libros_staging_superadmin_insert'
        AND with_check ILIKE '%es_superadministrador%'
        AND with_check ILIKE '%sesion_es_aal2%'
    ),
    EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'storage' AND tablename = 'objects'
        AND policyname = 'libros_staging_superadmin_select'
        AND qual ILIKE '%es_superadministrador%'
        AND qual ILIKE '%sesion_es_aal2%'
    ),
    EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'storage' AND tablename = 'objects'
        AND policyname = 'libros_staging_superadmin_delete'
        AND qual ILIKE '%es_superadministrador%'
        AND qual ILIKE '%sesion_es_aal2%'
    )
  INTO v_insert_ok, v_select_ok, v_delete_ok;
  IF NOT (v_insert_ok AND v_select_ok AND v_delete_ok) THEN
    RAISE EXCEPTION
      'postflight_fase5_superadmin_fallo: insert=%, select=%, delete=%',
      v_insert_ok, v_select_ok, v_delete_ok;
  END IF;
END;
$$;

COMMIT;

SELECT
  true AS ajuste_aplicado,
  true AS carga_solo_superadmin_aal2,
  true AS staging_solo_superadmin_aal2,
  true AS borrado_solo_superadmin_aal2;
