-- IAbooks — Fase 5: acceso vigente y corrección de staging

BEGIN;

CREATE OR REPLACE FUNCTION public.puede_acceder_libro(p_libro_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND (
      public.es_admin()
      OR EXISTS (
        SELECT 1
        FROM public.libro_activaciones la
        JOIN public.profiles p ON p.id = la.usuario_id
        JOIN public.libros l ON l.id = la.libro_id
        JOIN public.escuela_libros el
          ON el.escuela_id = p.escuela_id
         AND el.libro_id = la.libro_id
        WHERE la.usuario_id = auth.uid()
          AND la.libro_id = p_libro_id
          AND l.activo
      )
      OR EXISTS (
        SELECT 1
        FROM public.profiles p
        JOIN public.escuela_libros el ON el.escuela_id = p.escuela_id
        JOIN public.libros l ON l.id = el.libro_id
        WHERE p.id = auth.uid()
          AND p.rol = 'docente'
          AND el.libro_id = p_libro_id
          AND l.activo
      )
    );
$$;

REVOKE ALL ON FUNCTION public.puede_acceder_libro(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.puede_acceder_libro(TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_mis_libros_estado()
RETURNS TABLE (
  id TEXT,
  titulo TEXT,
  descripcion TEXT,
  emoji TEXT,
  portada_url TEXT,
  disponible BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    l.id, l.titulo, l.descripcion, l.emoji, l.portada_url, l.activo
  FROM public.libro_activaciones la
  JOIN public.profiles p ON p.id = la.usuario_id
  JOIN public.libros l ON l.id = la.libro_id
  JOIN public.escuela_libros el
    ON el.escuela_id = p.escuela_id
   AND el.libro_id = la.libro_id
  WHERE la.usuario_id = auth.uid()
  ORDER BY l.titulo;
$$;

REVOKE ALL ON FUNCTION public.get_mis_libros_estado() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_mis_libros_estado() TO authenticated;

DROP POLICY IF EXISTS libros_staging_superadmin_delete ON storage.objects;
CREATE POLICY libros_staging_superadmin_delete
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'libros'
  AND public.es_superadministrador()
  AND public.sesion_es_aal2()
  AND (storage.foldername(name))[1] = 'staging'
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
  IF p_path !~ ('^staging/' || auth.uid()::text || '/(portadas|pdfs)/[0-9a-f-]+[.](jpg|jpeg|png|webp|pdf)$') THEN
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
BEGIN
  IF pg_get_functiondef(
       'public.registrar_archivo_libro_staging(text)'::regprocedure
     ) NOT LIKE '%[.]%'
     OR pg_get_functiondef(
       'public.puede_acceder_libro(text)'::regprocedure
     ) NOT LIKE '%l.activo%'
     OR to_regprocedure('public.get_mis_libros_estado()') IS NULL THEN
    RAISE EXCEPTION 'postflight_fase5_access_staging_fallo';
  END IF;
END;
$$;

COMMIT;

SELECT
  true AS acceso_exige_libro_activo,
  true AS acceso_exige_asignacion_vigente,
  true AS panel_estado_libro_habilitado,
  true AS ruta_staging_corregida,
  true AS limpieza_carga_fallida_habilitada;
