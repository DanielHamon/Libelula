-- Integra las solicitudes de narración con el mismo RPC de aprobaciones.
BEGIN;

DO $$ BEGIN
  IF to_regprocedure('public.superadmin_resolver_accion_v3_anterior(uuid,boolean)') IS NULL THEN
    ALTER FUNCTION public.superadmin_resolver_accion_v3(uuid,boolean)
      RENAME TO superadmin_resolver_accion_v3_anterior;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.superadmin_resolver_accion_v3_anterior(uuid,boolean)
  FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.superadmin_resolver_accion_v3(p_accion_id uuid,p_aprobar boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.acciones_admin_pendientes
    WHERE id=p_accion_id AND tipo='cambiar_narracion_libro') THEN
    RETURN public.superadmin_resolver_narracion(p_accion_id,p_aprobar);
  END IF;
  RETURN public.superadmin_resolver_accion_v3_anterior(p_accion_id,p_aprobar);
END; $$;
REVOKE ALL ON FUNCTION public.superadmin_resolver_accion_v3(uuid,boolean)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_resolver_accion_v3(uuid,boolean)
  TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.admin_narracion_descartar_borrador(p_narracion_id bigint)
RETURNS text[] LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,auth AS $$
DECLARE v_n public.narraciones_libro%ROWTYPE; v_paths text[];
BEGIN
  IF NOT public.es_admin() THEN RAISE EXCEPTION 'permiso_denegado' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_n FROM public.narraciones_libro WHERE id=p_narracion_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'borrador_no_encontrado'; END IF;
  PERFORM 1 FROM public.libros WHERE id=v_n.libro_id FOR UPDATE;
  SELECT * INTO v_n FROM public.narraciones_libro WHERE id=p_narracion_id FOR UPDATE;
  IF v_n.estado<>'draft' THEN RAISE EXCEPTION 'solo_borrador'; END IF;
  SELECT coalesce(array_agg(DISTINCT p.storage_path),ARRAY[]::text[]) INTO v_paths
  FROM public.narraciones_pagina p WHERE p.narracion_id=p_narracion_id
    AND p.storage_path IS NOT NULL;
  DELETE FROM public.narraciones_libro WHERE id=p_narracion_id;
  INSERT INTO public.admin_logs(admin_id,accion,entidad,entidad_id,payload)
  VALUES(auth.uid(),'descarto_borrador_narracion','narracion',p_narracion_id::text,
    jsonb_build_object('libro_id',v_n.libro_id,'version',v_n.version));
  RETURN v_paths;
END; $$;
REVOKE ALL ON FUNCTION public.admin_narracion_descartar_borrador(bigint)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_narracion_descartar_borrador(bigint)
  TO authenticated;

-- Si se sustituye el PDF, la narración antigua deja de ser utilizable.
CREATE OR REPLACE FUNCTION public.narracion_pdf_cambio_desactivar()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  IF NEW.pdf_url IS DISTINCT FROM OLD.pdf_url AND OLD.narracion_habilitada THEN
    NEW.narracion_habilitada:=false;
    NEW.narracion_revision:=OLD.narracion_revision+1;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS narracion_pdf_cambio_desactivar ON public.libros;
CREATE TRIGGER narracion_pdf_cambio_desactivar BEFORE UPDATE OF pdf_url ON public.libros
FOR EACH ROW EXECUTE FUNCTION public.narracion_pdf_cambio_desactivar();

-- Permite recuperar cargas cortadas sin tocar archivos que usa alguna versión.
CREATE OR REPLACE FUNCTION public.admin_narracion_archivos_huerfanos(p_libro_id text)
RETURNS text[] LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_paths text[];
BEGIN
  IF NOT public.es_admin() THEN RAISE EXCEPTION 'permiso_denegado' USING ERRCODE='42501'; END IF;
  SELECT coalesce(array_agg(path),ARRAY[]::text[]) INTO v_paths FROM (
    SELECT o.name AS path FROM storage.objects o
    LEFT JOIN public.narracion_cargas c ON c.path=o.name
    WHERE o.bucket_id='audiobooks'
      AND left(o.name,length(p_libro_id)+1)=p_libro_id||'/'
      AND (c.path IS NULL OR c.estado='attached' OR c.creada_en<now()-interval '1 hour')
      AND NOT EXISTS (SELECT 1 FROM public.narraciones_pagina p WHERE p.storage_path=o.name)
    UNION
    SELECT c.path FROM public.narracion_cargas c
    JOIN public.narraciones_libro n ON n.id=c.narracion_id
    WHERE n.libro_id=p_libro_id AND c.creada_en<now()-interval '1 hour'
      AND NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id='audiobooks' AND o.name=c.path)
  ) archivos;
  RETURN v_paths;
END; $$;
CREATE OR REPLACE FUNCTION public.admin_narracion_olvidar_carga(p_path text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,storage AS $$
BEGIN
  IF NOT public.es_admin() THEN RAISE EXCEPTION 'permiso_denegado' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.narracion_cargas WHERE path=p_path FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.narraciones_pagina WHERE storage_path=p_path)
    OR EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id='audiobooks' AND name=p_path) THEN
    RAISE EXCEPTION 'archivo_aun_referenciado_o_existente';
  END IF;
  DELETE FROM public.narracion_cargas WHERE path=p_path;
END; $$;
REVOKE ALL ON FUNCTION public.admin_narracion_archivos_huerfanos(text),
  public.admin_narracion_olvidar_carga(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_narracion_archivos_huerfanos(text),
  public.admin_narracion_olvidar_carga(text) TO authenticated;

COMMIT;
