-- IAbooks — Fase 5: Storage inmutable y publicación segura
-- Archivo unificado: preflight + migración + postflight.
-- Ejecutar una sola vez después de security_phase4.sql.

BEGIN;

DO $$
BEGIN
  IF to_regclass('storage.objects') IS NULL
     OR to_regclass('public.libros') IS NULL
     OR to_regclass('public.acciones_admin_pendientes') IS NULL THEN
    RAISE EXCEPTION 'faltan_prerrequisitos_fase5';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'libros' AND NOT public) THEN
    RAISE EXCEPTION 'bucket_libros_debe_ser_privado';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'es_admin'
  ) THEN
    RAISE EXCEPTION 'falta_funcion_es_admin';
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.archivos_libro (
  path TEXT PRIMARY KEY,
  bucket_id TEXT NOT NULL DEFAULT 'libros' CHECK (bucket_id = 'libros'),
  tipo TEXT NOT NULL CHECK (tipo IN ('portada', 'pdf')),
  estado TEXT NOT NULL DEFAULT 'staging'
    CHECK (estado IN ('staging', 'publicado', 'rechazado')),
  propietario_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  libro_id TEXT REFERENCES public.libros(id) ON DELETE SET NULL,
  mime_type TEXT NOT NULL,
  tamano_bytes BIGINT NOT NULL CHECK (tamano_bytes > 0),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  expira_en TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  publicado_en TIMESTAMPTZ,
  resuelto_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  CHECK (
    (estado = 'publicado' AND libro_id IS NOT NULL AND publicado_en IS NOT NULL)
    OR estado <> 'publicado'
  )
);

ALTER TABLE public.archivos_libro ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.archivos_libro FROM anon, authenticated;
GRANT SELECT ON public.archivos_libro TO authenticated;

DROP POLICY IF EXISTS archivos_libro_admin_select ON public.archivos_libro;
CREATE POLICY archivos_libro_admin_select
ON public.archivos_libro FOR SELECT TO authenticated
USING (public.es_admin());

-- El cliente solo puede crear objetos nuevos en su staging. No se concede
-- UPDATE: Storage implementa upsert como una actualización y queda bloqueado.
DROP POLICY IF EXISTS libros_admin_insert ON storage.objects;
DROP POLICY IF EXISTS libros_admin_update ON storage.objects;
DROP POLICY IF EXISTS libros_admin_delete ON storage.objects;
DROP POLICY IF EXISTS libros_staging_admin_insert ON storage.objects;
DROP POLICY IF EXISTS libros_staging_admin_select ON storage.objects;
DROP POLICY IF EXISTS libros_staging_admin_delete ON storage.objects;

-- Instalaciones anteriores pueden tener esta política con nombres elegidos
-- desde el Dashboard. Se eliminan todas las políticas UPDATE que mencionan
-- específicamente el bucket libros; conservarlas permitiría upsert aunque el
-- cliente nuevo use upsert:false.
DO $$
DECLARE
  v_policy RECORD;
BEGIN
  FOR v_policy IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND cmd = 'UPDATE'
      AND (
        COALESCE(qual, '') ILIKE '%libros%'
        OR COALESCE(with_check, '') ILIKE '%libros%'
      )
  LOOP
    EXECUTE format(
      'DROP POLICY %I ON storage.objects',
      v_policy.policyname
    );
  END LOOP;
END;
$$;

CREATE POLICY libros_staging_admin_insert
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'libros'
  AND public.es_admin()
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

CREATE POLICY libros_staging_admin_select
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'libros'
  AND public.es_admin()
  AND (storage.foldername(name))[1] = 'staging'
);

CREATE POLICY libros_staging_admin_delete
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'libros'
  AND public.es_admin()
  AND (storage.foldername(name))[1] = 'staging'
  AND EXISTS (
    SELECT 1
    FROM public.archivos_libro a
    WHERE a.path = name
      AND a.estado <> 'publicado'
      AND (
        a.propietario_id = auth.uid()
        OR a.estado = 'rechazado'
        OR a.expira_en <= now()
      )
  )
);

-- Registra cada objeto staging después de que Storage haya validado la carga.
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
  IF NOT public.es_admin() THEN
    RAISE EXCEPTION 'permiso_denegado' USING ERRCODE = '42501';
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
GRANT EXECUTE ON FUNCTION public.registrar_archivo_libro_staging(TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.validar_publicacion_archivos_libro()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_path TEXT;
  v_tipo TEXT;
  v_archivo public.archivos_libro%ROWTYPE;
BEGIN
  FOREACH v_path IN ARRAY ARRAY[NEW.portada_url, NEW.pdf_url] LOOP
    IF v_path IS NULL OR v_path = '' OR v_path NOT LIKE 'staging/%' THEN
      CONTINUE; -- compatibilidad con objetos publicados antes de fase 5
    END IF;
    v_tipo := CASE WHEN v_path = NEW.portada_url THEN 'portada' ELSE 'pdf' END;
    SELECT * INTO v_archivo
    FROM public.archivos_libro
    WHERE path = v_path FOR UPDATE;
    IF FOUND
       AND v_archivo.tipo = v_tipo
       AND v_archivo.estado = 'publicado'
       AND v_archivo.libro_id = NEW.id THEN
      CONTINUE; -- referencia publicada previamente y sin sustitución
    END IF;
    IF NOT FOUND OR v_archivo.tipo <> v_tipo OR v_archivo.estado <> 'staging'
       OR v_archivo.expira_en <= now() THEN
      RAISE EXCEPTION 'archivo_staging_invalido:%', v_path USING ERRCODE = '22023';
    END IF;
    IF current_setting('app.fase3_aprobada', true) IS DISTINCT FROM 'si' THEN
      RAISE EXCEPTION 'publicacion_requiere_aprobacion' USING ERRCODE = '42501';
    END IF;
    UPDATE public.archivos_libro
    SET estado = 'publicado', libro_id = NEW.id, publicado_en = now(),
        resuelto_por = auth.uid(), expira_en = 'infinity'
    WHERE path = v_path;
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validar_publicacion_archivos_libro ON public.libros;
CREATE TRIGGER validar_publicacion_archivos_libro
AFTER INSERT OR UPDATE OF portada_url, pdf_url ON public.libros
FOR EACH ROW EXECUTE FUNCTION public.validar_publicacion_archivos_libro();

CREATE OR REPLACE FUNCTION public.marcar_archivos_accion_rechazada()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF OLD.estado = 'pendiente' AND NEW.estado = 'rechazada'
     AND NEW.tipo IN ('crear_libro', 'editar_libro') THEN
    UPDATE public.archivos_libro
    SET estado = 'rechazado', resuelto_por = NEW.aprobador_id,
        expira_en = LEAST(expira_en, now() + interval '24 hours')
    WHERE estado = 'staging'
      AND path IN (
        NEW.payload ->> 'portada_url',
        NEW.payload ->> 'pdf_url',
        NEW.payload -> 'campos' ->> 'portada_url',
        NEW.payload -> 'campos' ->> 'pdf_url'
      );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS marcar_archivos_accion_rechazada
  ON public.acciones_admin_pendientes;
CREATE TRIGGER marcar_archivos_accion_rechazada
AFTER UPDATE OF estado ON public.acciones_admin_pendientes
FOR EACH ROW EXECUTE FUNCTION public.marcar_archivos_accion_rechazada();

-- Conserva la lectura autorizada de fase 1. Staging no publicado solo es
-- visible para administradores; cuando libros referencia la ruta, la función
-- puede_acceder_objeto_libro aplica licencia/rol.
DROP POLICY IF EXISTS authenticated_read_libros_authorized ON storage.objects;
CREATE POLICY authenticated_read_libros_authorized
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'libros'
  AND (
    public.puede_acceder_objeto_libro(name)
    OR (
      public.es_admin()
      AND (storage.foldername(name))[1] = 'staging'
    )
  )
);

DO $$
DECLARE
  v_insert_ok BOOLEAN;
  v_update_ok BOOLEAN;
  v_trigger_ok BOOLEAN;
BEGIN
  SELECT
    EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'storage' AND tablename = 'objects'
        AND policyname = 'libros_staging_admin_insert' AND cmd = 'INSERT'
    ),
    NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'storage' AND tablename = 'objects'
        AND cmd = 'UPDATE'
        AND (
          COALESCE(qual, '') ILIKE '%libros%'
          OR COALESCE(with_check, '') ILIKE '%libros%'
        )
    ),
    EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgname = 'validar_publicacion_archivos_libro' AND NOT tgisinternal
    )
  INTO v_insert_ok, v_update_ok, v_trigger_ok;
  IF NOT (v_insert_ok AND v_update_ok AND v_trigger_ok) THEN
    RAISE EXCEPTION
      'postflight_fase5_fallo: staging_insert=%, update_bloqueado=%, trigger_publicacion=%',
      v_insert_ok, v_update_ok, v_trigger_ok;
  END IF;
END;
$$;

COMMIT;

SELECT
  true AS fase5_aplicada,
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'libros_staging_admin_insert'
  ) AS staging_insert_restringido,
  NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND cmd = 'UPDATE'
      AND (
        COALESCE(qual, '') ILIKE '%libros%'
        OR COALESCE(with_check, '') ILIKE '%libros%'
      )
  ) AS sobrescritura_cliente_bloqueada,
  to_regclass('public.archivos_libro') IS NOT NULL AS registro_archivos_activo,
  EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'validar_publicacion_archivos_libro' AND NOT tgisinternal
  ) AS publicacion_solo_aprobada;
