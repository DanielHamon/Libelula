-- Evolución del piloto; conserva tablas, versiones y archivos existentes.
BEGIN;

CREATE TABLE IF NOT EXISTS public.narraciones_libro (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  libro_id text NOT NULL REFERENCES public.libros(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version > 0),
  estado text NOT NULL DEFAULT 'draft' CHECK (estado IN ('draft','published','archived')),
  proveedor text NOT NULL, modelo text NOT NULL, voz_id text NOT NULL,
  idioma text NOT NULL DEFAULT 'es',
  config_hash text NOT NULL CHECK (config_hash ~ '^[0-9a-f]{64}$'),
  creada_en timestamptz NOT NULL DEFAULT now(), publicada_en timestamptz,
  UNIQUE (libro_id,version), UNIQUE (id,libro_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS narraciones_libro_publicada_unica
  ON public.narraciones_libro(libro_id) WHERE estado='published';
CREATE UNIQUE INDEX IF NOT EXISTS narraciones_libro_borrador_unico
  ON public.narraciones_libro(libro_id) WHERE estado='draft';
CREATE TABLE IF NOT EXISTS public.narraciones_pagina (
  narracion_id bigint NOT NULL, libro_id text NOT NULL,
  pagina_pdf integer NOT NULL CHECK (pagina_pdf > 0),
  texto_hash text NOT NULL CHECK (texto_hash ~ '^[0-9a-f]{64}$'),
  storage_path text, estado text NOT NULL DEFAULT 'pending'
    CHECK (estado IN ('pending','processing','ready','failed','skipped','needs_review')),
  duracion_segundos numeric(10,3) CHECK (duracion_segundos > 0),
  tamano_bytes bigint CHECK (tamano_bytes > 0),
  mime_type text CHECK (mime_type IN ('audio/mpeg','audio/wav')),
  pagina_revision bigint NOT NULL DEFAULT 0,
  creada_en timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (narracion_id,pagina_pdf),
  FOREIGN KEY (narracion_id,libro_id) REFERENCES public.narraciones_libro(id,libro_id) ON DELETE CASCADE
);
ALTER TABLE public.narraciones_pagina DROP CONSTRAINT IF EXISTS narraciones_pagina_storage_path_key;
ALTER TABLE public.narraciones_pagina ADD COLUMN IF NOT EXISTS pagina_revision bigint NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS narraciones_pagina_storage_path_idx ON public.narraciones_pagina(storage_path);
CREATE INDEX IF NOT EXISTS narraciones_pagina_libro_estado
  ON public.narraciones_pagina(libro_id,estado,pagina_pdf);
ALTER TABLE public.narraciones_libro
  ADD COLUMN IF NOT EXISTS pdf_path text,
  ADD COLUMN IF NOT EXISTS pdf_object_id uuid,
  ADD COLUMN IF NOT EXISTS pdf_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS pdf_total_pages integer CHECK (pdf_total_pages > 0);
ALTER TABLE public.libros
  ADD COLUMN IF NOT EXISTS narracion_habilitada boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS narracion_revision bigint NOT NULL DEFAULT 0;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES ('audiobooks','audiobooks',false,10485760,ARRAY['audio/mpeg'])
ON CONFLICT (id) DO UPDATE SET file_size_limit=10485760,
  allowed_mime_types=ARRAY['audio/mpeg'];
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM storage.buckets WHERE id='audiobooks' AND public) THEN
    RAISE EXCEPTION 'audiobooks_debe_ser_privado';
  END IF;
END $$;

-- La versión anterior sigue intacta; solo se completa su referencia al PDF.
UPDATE public.narraciones_libro n SET
  pdf_path=l.pdf_url, pdf_object_id=o.id, pdf_updated_at=o.updated_at
FROM public.libros l JOIN storage.objects o ON o.bucket_id='libros' AND o.name=l.pdf_url
WHERE n.libro_id=l.id AND n.pdf_object_id IS NULL;

CREATE TABLE IF NOT EXISTS public.narracion_cargas (
  path text PRIMARY KEY,
  narracion_id bigint NOT NULL REFERENCES public.narraciones_libro(id) ON DELETE CASCADE,
  pagina_pdf integer NOT NULL CHECK (pagina_pdf > 0),
  solicitante_id uuid NOT NULL REFERENCES auth.users(id),
  creada_en timestamptz NOT NULL DEFAULT now(),
  expected_revision bigint NOT NULL DEFAULT -1,
  estado text NOT NULL DEFAULT 'reserved' CHECK (estado IN ('reserved','attached'))
);
ALTER TABLE public.narracion_cargas ADD COLUMN IF NOT EXISTS expected_revision bigint NOT NULL DEFAULT -1;
ALTER TABLE public.narracion_cargas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.narracion_cargas FROM anon,authenticated;

CREATE OR REPLACE FUNCTION public.narracion_version_valida(p_id bigint)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public,storage AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.narraciones_libro n
    JOIN public.libros l ON l.id=n.libro_id
    JOIN storage.objects pdf ON pdf.bucket_id='libros' AND pdf.name=l.pdf_url
    WHERE n.id=p_id AND n.pdf_path=l.pdf_url AND n.pdf_object_id=pdf.id
      AND n.pdf_updated_at=pdf.updated_at AND n.pdf_total_pages > 0
      AND EXISTS (SELECT 1 FROM public.narraciones_pagina p
        WHERE p.narracion_id=n.id AND p.estado='ready')
      AND NOT EXISTS (
        SELECT 1 FROM generate_series(1,n.pdf_total_pages) AS pg(numero)
        LEFT JOIN public.narraciones_pagina p
          ON p.narracion_id=n.id AND p.pagina_pdf=pg.numero
        LEFT JOIN storage.objects audio
          ON audio.bucket_id='audiobooks' AND audio.name=p.storage_path
        WHERE p.narracion_id IS NULL OR p.estado NOT IN ('ready','skipped')
          OR (p.estado='ready' AND (audio.id IS NULL OR p.mime_type <> 'audio/mpeg'
            OR COALESCE((audio.metadata->>'size')::bigint,-1) <> p.tamano_bytes
            OR audio.metadata->>'mimetype' <> 'audio/mpeg'))
          OR (p.estado='skipped' AND p.storage_path IS NOT NULL)
      )
      AND NOT EXISTS (SELECT 1 FROM public.narraciones_pagina p
        WHERE p.narracion_id=n.id AND p.pagina_pdf > n.pdf_total_pages)
  );
$$;
REVOKE ALL ON FUNCTION public.narracion_version_valida(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.narracion_version_valida(bigint) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.narracion_carga_autorizada(p_path text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public,auth AS $$
  SELECT public.es_admin() AND EXISTS (
    SELECT 1 FROM public.narracion_cargas c
    JOIN public.narraciones_libro n ON n.id=c.narracion_id
    WHERE c.path=p_path AND c.estado='reserved' AND c.solicitante_id=auth.uid()
      AND c.creada_en > now()-interval '1 hour' AND n.estado='draft');
$$;
REVOKE ALL ON FUNCTION public.narracion_carga_autorizada(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.narracion_carga_autorizada(text) TO authenticated;

ALTER TABLE public.narraciones_libro ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.narraciones_pagina ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.narraciones_libro,public.narraciones_pagina FROM anon,authenticated;
GRANT SELECT ON public.narraciones_libro,public.narraciones_pagina TO authenticated;
DROP POLICY IF EXISTS narraciones_libro_lectura ON public.narraciones_libro;
CREATE POLICY narraciones_libro_lectura ON public.narraciones_libro FOR SELECT TO authenticated
USING (public.es_admin() OR (estado='published' AND public.puede_acceder_libro(libro_id)
  AND EXISTS (SELECT 1 FROM public.libros l WHERE l.id=libro_id AND l.narracion_habilitada)
  AND public.narracion_version_valida(id)));
DROP POLICY IF EXISTS narraciones_pagina_lectura ON public.narraciones_pagina;
CREATE POLICY narraciones_pagina_lectura ON public.narraciones_pagina FOR SELECT TO authenticated
USING (public.es_admin() OR (estado='ready' AND public.puede_acceder_libro(libro_id)
  AND EXISTS (SELECT 1 FROM public.narraciones_libro n JOIN public.libros l ON l.id=n.libro_id
    WHERE n.id=narracion_id AND n.estado='published' AND l.narracion_habilitada
      AND public.narracion_version_valida(n.id))));
DROP POLICY IF EXISTS audiobooks_lectura ON storage.objects;
CREATE POLICY audiobooks_lectura ON storage.objects FOR SELECT TO authenticated
USING (bucket_id='audiobooks' AND (public.es_admin() OR EXISTS (
  SELECT 1 FROM public.narraciones_pagina p
  JOIN public.narraciones_libro n ON n.id=p.narracion_id
  JOIN public.libros l ON l.id=p.libro_id
  WHERE p.storage_path=name AND p.estado='ready' AND n.estado='published'
    AND l.narracion_habilitada AND public.puede_acceder_libro(p.libro_id)
    AND public.narracion_version_valida(n.id))));
DROP POLICY IF EXISTS audiobooks_admin_insert ON storage.objects;
CREATE POLICY audiobooks_admin_insert ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id='audiobooks' AND public.narracion_carga_autorizada(name));
DROP POLICY IF EXISTS audiobooks_admin_delete ON storage.objects;
CREATE POLICY audiobooks_admin_delete ON storage.objects FOR DELETE TO authenticated
USING (bucket_id='audiobooks' AND public.es_admin() AND NOT EXISTS (
  SELECT 1 FROM public.narraciones_pagina p WHERE p.storage_path=name));

ALTER TABLE public.acciones_admin_pendientes DROP CONSTRAINT IF EXISTS acciones_admin_pendientes_tipo_check;
ALTER TABLE public.acciones_admin_pendientes ADD CONSTRAINT acciones_admin_pendientes_tipo_check
CHECK (tipo IN ('conceder_admin','cambiar_rol_usuario','crear_escuela','cambiar_estado_escuela',
  'crear_libro','editar_libro','cambiar_estado_libro','crear_unidad','editar_unidad',
  'eliminar_unidad','reordenar_unidades','desactivar_escuela','desactivar_libro',
  'asignar_libro_escuela','remover_libro_escuela','crear_tokens_libro',
  'crear_tokens_docente','revocar_token','cambiar_narracion_libro'));
CREATE UNIQUE INDEX IF NOT EXISTS acciones_narracion_unica_pendiente
  ON public.acciones_admin_pendientes ((payload->>'libro_id'))
  WHERE tipo='cambiar_narracion_libro' AND estado='pendiente';

COMMIT;
