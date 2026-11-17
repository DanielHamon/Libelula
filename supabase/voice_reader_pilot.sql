-- Piloto de narración por página. Aplicar una vez en la réplica local.
-- No modifica libros, activaciones ni el bucket privado de PDF.
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.libros') IS NULL
     OR to_regclass('storage.objects') IS NULL
     OR to_regprocedure('public.puede_acceder_libro(text)') IS NULL THEN
    RAISE EXCEPTION 'faltan_prerrequisitos_narracion';
  END IF;
  IF EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'audiobooks' AND public) THEN
    RAISE EXCEPTION 'audiobooks_debe_ser_privado';
  END IF;
END;
$$;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('audiobooks', 'audiobooks', false, 10485760, ARRAY['audio/mpeg', 'audio/wav'])
ON CONFLICT (id) DO NOTHING;

CREATE TABLE public.narraciones_libro (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  libro_id TEXT NOT NULL REFERENCES public.libros(id) ON DELETE CASCADE,
  version INTEGER NOT NULL CHECK (version > 0),
  estado TEXT NOT NULL DEFAULT 'draft' CHECK (estado IN ('draft', 'published', 'archived')),
  proveedor TEXT NOT NULL,
  modelo TEXT NOT NULL,
  voz_id TEXT NOT NULL,
  idioma TEXT NOT NULL DEFAULT 'es',
  config_hash TEXT NOT NULL CHECK (config_hash ~ '^[0-9a-f]{64}$'),
  creada_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  publicada_en TIMESTAMPTZ,
  UNIQUE (libro_id, version),
  UNIQUE (id, libro_id),
  CHECK (estado <> 'published' OR publicada_en IS NOT NULL)
);

CREATE UNIQUE INDEX narraciones_libro_publicada_unica
  ON public.narraciones_libro (libro_id) WHERE estado = 'published';

CREATE TABLE public.narraciones_pagina (
  narracion_id BIGINT NOT NULL,
  libro_id TEXT NOT NULL,
  pagina_pdf INTEGER NOT NULL CHECK (pagina_pdf > 0),
  texto_hash TEXT NOT NULL CHECK (texto_hash ~ '^[0-9a-f]{64}$'),
  storage_path TEXT UNIQUE,
  estado TEXT NOT NULL DEFAULT 'pending'
    CHECK (estado IN ('pending', 'processing', 'ready', 'failed', 'skipped', 'needs_review')),
  duracion_segundos NUMERIC(10, 3) CHECK (duracion_segundos > 0),
  tamano_bytes BIGINT CHECK (tamano_bytes > 0),
  mime_type TEXT CHECK (mime_type IN ('audio/mpeg', 'audio/wav')),
  creada_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (narracion_id, pagina_pdf),
  FOREIGN KEY (narracion_id, libro_id)
    REFERENCES public.narraciones_libro(id, libro_id) ON DELETE CASCADE,
  CHECK (
    estado <> 'ready'
    OR (storage_path IS NOT NULL AND duracion_segundos IS NOT NULL
        AND tamano_bytes IS NOT NULL AND mime_type IS NOT NULL)
  ),
  CHECK (storage_path IS NULL OR storage_path LIKE libro_id || '/v%/pagina\_%' ESCAPE '\')
);

CREATE INDEX narraciones_pagina_libro_estado
  ON public.narraciones_pagina (libro_id, estado, pagina_pdf);

ALTER TABLE public.narraciones_libro ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.narraciones_pagina ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.narraciones_libro, public.narraciones_pagina FROM anon, authenticated;
GRANT SELECT ON public.narraciones_libro, public.narraciones_pagina TO authenticated;

CREATE POLICY narraciones_libro_lectura ON public.narraciones_libro
  FOR SELECT TO authenticated
  USING (estado = 'published' AND public.puede_acceder_libro(libro_id));

CREATE POLICY narraciones_pagina_lectura ON public.narraciones_pagina
  FOR SELECT TO authenticated
  USING (
    estado = 'ready'
    AND public.puede_acceder_libro(libro_id)
    AND EXISTS (
      SELECT 1 FROM public.narraciones_libro n
      WHERE n.id = narracion_id AND n.estado = 'published'
    )
  );

CREATE POLICY audiobooks_lectura ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'audiobooks'
    AND EXISTS (
      SELECT 1 FROM public.narraciones_pagina p
      WHERE p.storage_path = name AND p.estado = 'ready'
    )
  );

COMMIT;
