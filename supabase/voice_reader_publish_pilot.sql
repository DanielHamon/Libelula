-- Publicación atómica de la versión 2 del piloto de Roja como un tomate.
-- Aplicar solamente después de voice_reader_pilot.sql.
BEGIN;

CREATE OR REPLACE FUNCTION public.publicar_narracion_piloto(
  p_libro_id TEXT,
  p_version INTEGER,
  p_paginas INTEGER[]
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, storage
AS $$
DECLARE
  v_narracion_id BIGINT;
  v_estado TEXT;
  v_total INTEGER;
  v_listas INTEGER;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'solo_proceso_administrativo' USING ERRCODE = '42501';
  END IF;
  IF p_libro_id IS DISTINCT FROM 'roja_como_un_tomate' OR p_version IS DISTINCT FROM 2
     OR p_paginas IS NULL
     OR cardinality(p_paginas) NOT BETWEEN 3 AND 4
     OR array_position(p_paginas, NULL) IS NOT NULL
     OR (SELECT count(DISTINCT pagina) FROM unnest(p_paginas) AS pagina) <> cardinality(p_paginas)
     OR (SELECT max(pagina) - min(pagina) + 1 FROM unnest(p_paginas) AS pagina) <> cardinality(p_paginas) THEN
    RAISE EXCEPTION 'alcance_piloto_invalido';
  END IF;

  PERFORM 1 FROM public.narraciones_libro
  WHERE libro_id = p_libro_id FOR UPDATE;
  SELECT id, estado INTO v_narracion_id, v_estado
  FROM public.narraciones_libro
  WHERE libro_id = p_libro_id AND version = p_version
    AND proveedor = 'elevenlabs' AND modelo = 'eleven_multilingual_v2';
  IF v_narracion_id IS NULL OR v_estado NOT IN ('draft', 'published') THEN
    RAISE EXCEPTION 'narracion_piloto_no_publicable';
  END IF;

  SELECT count(*) INTO v_total
  FROM public.narraciones_pagina
  WHERE narracion_id = v_narracion_id;
  SELECT count(*) INTO v_listas
  FROM public.narraciones_pagina p
  JOIN storage.objects o ON o.bucket_id = 'audiobooks' AND o.name = p.storage_path
  WHERE p.narracion_id = v_narracion_id
    AND p.pagina_pdf = ANY(p_paginas)
    AND p.estado = 'ready'
    AND p.mime_type = 'audio/mpeg'
    AND p.tamano_bytes > 2048;
  IF v_total <> cardinality(p_paginas) OR v_listas <> v_total THEN
    RAISE EXCEPTION 'paginas_o_archivos_incompletos';
  END IF;

  IF v_estado = 'draft' THEN
    UPDATE public.narraciones_libro
    SET estado = 'archived'
    WHERE libro_id = p_libro_id AND estado = 'published';
    UPDATE public.narraciones_libro
    SET estado = 'published', publicada_en = now()
    WHERE id = v_narracion_id;
  END IF;
  RETURN v_total;
END;
$$;

REVOKE ALL ON FUNCTION public.publicar_narracion_piloto(TEXT, INTEGER, INTEGER[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publicar_narracion_piloto(TEXT, INTEGER, INTEGER[]) TO service_role;

COMMIT;
