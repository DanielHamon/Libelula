-- Operaciones de borrador, publicación y aprobación; todas transaccionales.
BEGIN;

CREATE OR REPLACE FUNCTION public.admin_narracion_crear_borrador(p_libro_id text,p_total_paginas integer)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,storage,auth AS $$
DECLARE v_libro public.libros%ROWTYPE; v_pdf storage.objects%ROWTYPE;
  v_previa public.narraciones_libro%ROWTYPE; v_id bigint; v_version integer;
BEGIN
  IF NOT public.es_admin() THEN RAISE EXCEPTION 'permiso_denegado' USING ERRCODE='42501'; END IF;
  IF p_total_paginas NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'paginas_invalidas' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_libro FROM public.libros WHERE id=p_libro_id FOR UPDATE;
  IF NOT FOUND OR v_libro.pdf_url IS NULL THEN RAISE EXCEPTION 'libro_sin_pdf'; END IF;
  SELECT * INTO v_pdf FROM storage.objects WHERE bucket_id='libros' AND name=v_libro.pdf_url;
  IF NOT FOUND THEN RAISE EXCEPTION 'pdf_no_disponible'; END IF;
  SELECT id INTO v_id FROM public.narraciones_libro WHERE libro_id=p_libro_id AND estado='draft';
  IF FOUND THEN
    IF NOT EXISTS (SELECT 1 FROM public.narraciones_libro
      WHERE id=v_id AND pdf_object_id=v_pdf.id AND pdf_updated_at=v_pdf.updated_at
        AND pdf_total_pages=p_total_paginas) THEN
      RAISE EXCEPTION 'borrador_pdf_desactualizado';
    END IF;
    RETURN v_id;
  END IF;
  SELECT * INTO v_previa FROM public.narraciones_libro WHERE libro_id=p_libro_id AND estado='published';
  SELECT coalesce(max(version),0)+1 INTO v_version FROM public.narraciones_libro WHERE libro_id=p_libro_id;
  INSERT INTO public.narraciones_libro(libro_id,version,estado,proveedor,modelo,voz_id,config_hash,
    pdf_path,pdf_object_id,pdf_updated_at,pdf_total_pages)
  VALUES (p_libro_id,v_version,'draft','manual','mp3','administracion',repeat('0',64),
    v_libro.pdf_url,v_pdf.id,v_pdf.updated_at,p_total_paginas) RETURNING id INTO v_id;
  IF v_previa.id IS NOT NULL AND v_previa.pdf_object_id=v_pdf.id
      AND v_previa.pdf_updated_at=v_pdf.updated_at THEN
    INSERT INTO public.narraciones_pagina(narracion_id,libro_id,pagina_pdf,texto_hash,storage_path,
      estado,duracion_segundos,tamano_bytes,mime_type)
    SELECT v_id,libro_id,pagina_pdf,texto_hash,storage_path,estado,duracion_segundos,tamano_bytes,mime_type
    FROM public.narraciones_pagina WHERE narracion_id=v_previa.id AND pagina_pdf<=p_total_paginas;
  END IF;
  INSERT INTO public.admin_logs(admin_id,accion,entidad,entidad_id,payload)
  VALUES(auth.uid(),'creo_borrador_narracion','narracion',v_id::text,
    jsonb_build_object('libro_id',p_libro_id,'version',v_version,'pdf',v_libro.pdf_url));
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_narracion_reservar_carga(p_narracion_id bigint,p_pagina integer)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,auth AS $$
DECLARE v_n public.narraciones_libro%ROWTYPE; v_path text; v_revision bigint;
BEGIN
  IF NOT public.es_admin() THEN RAISE EXCEPTION 'permiso_denegado' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_n FROM public.narraciones_libro WHERE id=p_narracion_id FOR UPDATE;
  IF NOT FOUND OR v_n.estado<>'draft' THEN RAISE EXCEPTION 'borrador_no_disponible'; END IF;
  IF p_pagina NOT BETWEEN 1 AND v_n.pdf_total_pages THEN RAISE EXCEPTION 'pagina_invalida' USING ERRCODE='22023'; END IF;
  v_path:=v_n.libro_id||'/v'||lpad(v_n.version::text,3,'0')||'/pagina_'||
    lpad(p_pagina::text,3,'0')||'-'||replace(gen_random_uuid()::text,'-','')||'.mp3';
  SELECT pagina_revision INTO v_revision FROM public.narraciones_pagina
  WHERE narracion_id=p_narracion_id AND pagina_pdf=p_pagina;
  INSERT INTO public.narracion_cargas(path,narracion_id,pagina_pdf,solicitante_id,expected_revision)
  VALUES(v_path,p_narracion_id,p_pagina,auth.uid(),coalesce(v_revision,-1));
  RETURN v_path;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_narracion_confirmar_carga(p_path text,p_duracion numeric)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,storage,auth AS $$
DECLARE v_c public.narracion_cargas%ROWTYPE; v_n public.narraciones_libro%ROWTYPE;
  v_obj storage.objects%ROWTYPE; v_anterior text; v_size bigint; v_revision bigint;
BEGIN
  IF NOT public.es_admin() THEN RAISE EXCEPTION 'permiso_denegado' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_c FROM public.narracion_cargas WHERE path=p_path FOR UPDATE;
  IF NOT FOUND OR v_c.estado<>'reserved' OR v_c.solicitante_id<>auth.uid()
      OR v_c.creada_en<now()-interval '1 hour' THEN RAISE EXCEPTION 'carga_no_reservada'; END IF;
  SELECT * INTO v_n FROM public.narraciones_libro WHERE id=v_c.narracion_id FOR UPDATE;
  IF v_n.estado<>'draft' THEN RAISE EXCEPTION 'borrador_no_disponible'; END IF;
  SELECT * INTO v_obj FROM storage.objects WHERE bucket_id='audiobooks' AND name=p_path;
  IF NOT FOUND THEN RAISE EXCEPTION 'archivo_no_encontrado'; END IF;
  v_size:=coalesce((v_obj.metadata->>'size')::bigint,0);
  IF v_size NOT BETWEEN 2049 AND 10485760 OR v_obj.metadata->>'mimetype'<>'audio/mpeg'
      OR p_duracion<=0 OR p_duracion>7200 THEN RAISE EXCEPTION 'mp3_invalido' USING ERRCODE='22023'; END IF;
  SELECT storage_path,pagina_revision INTO v_anterior,v_revision FROM public.narraciones_pagina
  WHERE narracion_id=v_n.id AND pagina_pdf=v_c.pagina_pdf;
  IF coalesce(v_revision,-1)<>v_c.expected_revision THEN
    RAISE EXCEPTION 'pagina_modificada_por_otro_admin' USING ERRCODE='40001';
  END IF;
  INSERT INTO public.narraciones_pagina(narracion_id,libro_id,pagina_pdf,texto_hash,storage_path,
    estado,duracion_segundos,tamano_bytes,mime_type)
  VALUES(v_n.id,v_n.libro_id,v_c.pagina_pdf,repeat('0',64),p_path,'ready',p_duracion,v_size,'audio/mpeg')
  ON CONFLICT (narracion_id,pagina_pdf) DO UPDATE SET storage_path=excluded.storage_path,
    estado='ready',duracion_segundos=excluded.duracion_segundos,
    tamano_bytes=excluded.tamano_bytes,mime_type='audio/mpeg',
    pagina_revision=public.narraciones_pagina.pagina_revision+1;
  UPDATE public.narracion_cargas SET estado='attached' WHERE path=p_path;
  INSERT INTO public.admin_logs(admin_id,accion,entidad,entidad_id,payload)
  VALUES(auth.uid(),'cargo_audio_narracion','narracion',v_n.id::text,
    jsonb_build_object('pagina',v_c.pagina_pdf,'path',p_path,'anterior',v_anterior));
  RETURN v_anterior;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_narracion_cambiar_pagina(p_narracion_id bigint,p_pagina integer,p_estado text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,auth AS $$
DECLARE v_n public.narraciones_libro%ROWTYPE; v_anterior text;
BEGIN
  IF NOT public.es_admin() THEN RAISE EXCEPTION 'permiso_denegado' USING ERRCODE='42501'; END IF;
  IF p_estado NOT IN ('pending','skipped') THEN RAISE EXCEPTION 'estado_invalido' USING ERRCODE='22023'; END IF;
  SELECT * INTO v_n FROM public.narraciones_libro WHERE id=p_narracion_id FOR UPDATE;
  IF NOT FOUND OR v_n.estado<>'draft' THEN RAISE EXCEPTION 'borrador_no_disponible'; END IF;
  IF p_pagina NOT BETWEEN 1 AND v_n.pdf_total_pages THEN RAISE EXCEPTION 'pagina_invalida' USING ERRCODE='22023'; END IF;
  SELECT storage_path INTO v_anterior FROM public.narraciones_pagina
  WHERE narracion_id=v_n.id AND pagina_pdf=p_pagina;
  INSERT INTO public.narraciones_pagina(narracion_id,libro_id,pagina_pdf,texto_hash,estado)
  VALUES(v_n.id,v_n.libro_id,p_pagina,repeat('0',64),p_estado)
  ON CONFLICT (narracion_id,pagina_pdf) DO UPDATE SET estado=excluded.estado,
    storage_path=NULL,duracion_segundos=NULL,tamano_bytes=NULL,mime_type=NULL,
    pagina_revision=public.narraciones_pagina.pagina_revision+1;
  INSERT INTO public.admin_logs(admin_id,accion,entidad,entidad_id,payload)
  VALUES(auth.uid(),'cambio_pagina_narracion','narracion',v_n.id::text,
    jsonb_build_object('pagina',p_pagina,'estado',p_estado,'anterior',v_anterior));
  RETURN v_anterior;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_narracion_publicar(p_narracion_id bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,auth AS $$
DECLARE v_n public.narraciones_libro%ROWTYPE;
BEGIN
  IF NOT public.es_admin() THEN RAISE EXCEPTION 'permiso_denegado' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_n FROM public.narraciones_libro WHERE id=p_narracion_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'version_no_encontrada'; END IF;
  PERFORM 1 FROM public.libros WHERE id=v_n.libro_id FOR UPDATE;
  SELECT * INTO v_n FROM public.narraciones_libro WHERE id=p_narracion_id FOR UPDATE;
  IF v_n.estado<>'draft' OR NOT public.narracion_version_valida(p_narracion_id) THEN
    RAISE EXCEPTION 'version_incompleta_o_pdf_cambiado'; END IF;
  UPDATE public.narraciones_libro SET estado='archived'
  WHERE libro_id=v_n.libro_id AND estado='published';
  UPDATE public.narraciones_libro SET estado='published',publicada_en=now()
  WHERE id=p_narracion_id;
  INSERT INTO public.admin_logs(admin_id,accion,entidad,entidad_id,payload)
  VALUES(auth.uid(),'publico_narracion','narracion',p_narracion_id::text,
    jsonb_build_object('libro_id',v_n.libro_id,'version',v_n.version));
  RETURN jsonb_build_object('ok',true,'libro_id',v_n.libro_id,'version',v_n.version);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_narracion_solicitar_estado(p_libro_id text,p_habilitar boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,auth AS $$
DECLARE v_l public.libros%ROWTYPE; v_n public.narraciones_libro%ROWTYPE; v_id uuid;
  v_listas integer := 0; v_omitidas integer := 0;
BEGIN
  IF NOT public.es_admin() THEN RAISE EXCEPTION 'permiso_denegado' USING ERRCODE='42501'; END IF;
  IF p_habilitar IS NULL THEN RAISE EXCEPTION 'estado_invalido'; END IF;
  SELECT * INTO v_l FROM public.libros WHERE id=p_libro_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'libro_no_encontrado'; END IF;
  IF v_l.narracion_habilitada=p_habilitar THEN RAISE EXCEPTION 'estado_sin_cambios'; END IF;
  SELECT * INTO v_n FROM public.narraciones_libro WHERE libro_id=p_libro_id AND estado='published';
  IF FOUND THEN
    SELECT count(*) FILTER (WHERE estado='ready'),count(*) FILTER (WHERE estado='skipped')
      INTO v_listas,v_omitidas FROM public.narraciones_pagina WHERE narracion_id=v_n.id;
  END IF;
  IF p_habilitar THEN
    IF NOT FOUND OR NOT public.narracion_version_valida(v_n.id) THEN
      RAISE EXCEPTION 'narracion_publicada_incompleta'; END IF;
  END IF;
  INSERT INTO public.acciones_admin_pendientes(tipo,payload,solicitante_id)
  VALUES('cambiar_narracion_libro',jsonb_build_object('libro_id',p_libro_id,
    'libro_titulo',v_l.titulo,
    'habilitar',p_habilitar,'estado_anterior',v_l.narracion_habilitada,
    'revision',v_l.narracion_revision,'version_publicada',v_n.version,
    'version_id',v_n.id,'pdf_total_paginas',v_n.pdf_total_pages,
    'audios_listos',v_listas,'paginas_omitidas',v_omitidas),auth.uid())
  RETURNING id INTO v_id;
  INSERT INTO public.admin_logs(admin_id,accion,entidad,entidad_id,payload)
  VALUES(auth.uid(),'solicito_accion_sensible','accion_admin',v_id::text,
    jsonb_build_object('tipo','cambiar_narracion_libro','libro_id',p_libro_id,
      'habilitar',p_habilitar));
  RETURN jsonb_build_object('ok',true,'pendiente',true,'id',v_id);
END; $$;

CREATE OR REPLACE FUNCTION public.superadmin_resolver_narracion(p_accion_id uuid,p_aprobar boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,auth AS $$
DECLARE v_a public.acciones_admin_pendientes%ROWTYPE; v_l public.libros%ROWTYPE;
  v_n public.narraciones_libro%ROWTYPE; v_nuevo boolean;
BEGIN
  IF NOT public.es_superadministrador() OR NOT public.sesion_es_aal2() THEN
    RAISE EXCEPTION 'solo_superadministrador_aal2' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_a FROM public.acciones_admin_pendientes WHERE id=p_accion_id FOR UPDATE;
  IF NOT FOUND OR v_a.tipo<>'cambiar_narracion_libro' THEN RAISE EXCEPTION 'solicitud_no_encontrada'; END IF;
  IF v_a.estado<>'pendiente' THEN RAISE EXCEPTION 'accion_ya_resuelta'; END IF;
  IF p_aprobar IS NULL THEN RAISE EXCEPTION 'decision_invalida'; END IF;
  IF p_aprobar THEN
    SELECT * INTO v_l FROM public.libros WHERE id=v_a.payload->>'libro_id' FOR UPDATE;
    IF NOT FOUND OR v_l.narracion_revision<>(v_a.payload->>'revision')::bigint
      OR v_l.narracion_habilitada<>(v_a.payload->>'estado_anterior')::boolean THEN
      RAISE EXCEPTION 'solicitud_obsoleta'; END IF;
    v_nuevo:=(v_a.payload->>'habilitar')::boolean;
    IF v_nuevo THEN
      SELECT * INTO v_n FROM public.narraciones_libro WHERE libro_id=v_l.id AND estado='published';
      IF NOT FOUND OR v_n.id IS DISTINCT FROM (v_a.payload->>'version_id')::bigint
          OR NOT public.narracion_version_valida(v_n.id) THEN
        RAISE EXCEPTION 'narracion_publicada_incompleta'; END IF;
    END IF;
    UPDATE public.libros SET narracion_habilitada=v_nuevo,
      narracion_revision=narracion_revision+1 WHERE id=v_l.id;
  END IF;
  UPDATE public.acciones_admin_pendientes SET estado=CASE WHEN p_aprobar THEN 'aprobada' ELSE 'rechazada' END,
    aprobador_id=auth.uid(),resuelto_en=now(),
    resultado=jsonb_build_object('ok',true,'estado_anterior',v_a.payload->'estado_anterior',
      'estado_nuevo',CASE WHEN p_aprobar THEN v_a.payload->'habilitar' ELSE v_a.payload->'estado_anterior' END)
  WHERE id=p_accion_id;
  INSERT INTO public.admin_logs(admin_id,accion,entidad,entidad_id,payload)
  VALUES(auth.uid(),CASE WHEN p_aprobar THEN 'aprobo_y_ejecuto_accion_sensible' ELSE 'rechazo_accion_sensible' END,
    'cambiar_narracion_libro',p_accion_id::text,
    jsonb_build_object('solicitante_id',v_a.solicitante_id,'entrada',v_a.payload));
  RETURN jsonb_build_object('ok',true,'aprobada',p_aprobar);
END; $$;

DO $$ DECLARE v_f text; BEGIN
  FOREACH v_f IN ARRAY ARRAY['admin_narracion_crear_borrador(text,integer)',
    'admin_narracion_reservar_carga(bigint,integer)','admin_narracion_confirmar_carga(text,numeric)',
    'admin_narracion_cambiar_pagina(bigint,integer,text)','admin_narracion_publicar(bigint)',
    'admin_narracion_solicitar_estado(text,boolean)','superadmin_resolver_narracion(uuid,boolean)'] LOOP
    EXECUTE 'REVOKE ALL ON FUNCTION public.'||v_f||' FROM PUBLIC,anon,authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.'||v_f||' TO authenticated';
  END LOOP;
END $$;

COMMIT;
