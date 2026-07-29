-- IAbooks — Fase 3: política de lista permitida
-- Sin aprobación: generación de tokens y CRUD/reordenamiento de actividades.
-- Toda otra mutación administrativa se solicita y resuelve por superadmin aal2.

BEGIN;

ALTER TABLE public.acciones_admin_pendientes
  DROP CONSTRAINT IF EXISTS acciones_admin_pendientes_tipo_check;

ALTER TABLE public.acciones_admin_pendientes
  ADD CONSTRAINT acciones_admin_pendientes_tipo_check CHECK (tipo IN (
    'conceder_admin', 'crear_escuela', 'cambiar_estado_escuela',
    'crear_libro', 'editar_libro', 'cambiar_estado_libro',
    'crear_unidad', 'editar_unidad', 'eliminar_unidad', 'reordenar_unidades',
    'desactivar_escuela', 'desactivar_libro',
    'asignar_libro_escuela', 'remover_libro_escuela',
    'crear_tokens_libro', 'crear_tokens_docente', 'revocar_token'
  ));

CREATE OR REPLACE FUNCTION public.admin_solicitar_accion_sensible_v2(
  p_tipo TEXT,
  p_payload JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF NOT public.es_admin() THEN
    RAISE EXCEPTION 'permiso_denegado' USING ERRCODE = '42501';
  END IF;
  IF p_tipo NOT IN (
    'conceder_admin', 'crear_escuela', 'cambiar_estado_escuela',
    'crear_libro', 'editar_libro', 'cambiar_estado_libro',
    'crear_unidad', 'editar_unidad', 'eliminar_unidad', 'reordenar_unidades',
    'desactivar_escuela', 'desactivar_libro',
    'asignar_libro_escuela', 'remover_libro_escuela',
    'crear_tokens_libro', 'crear_tokens_docente', 'revocar_token'
  ) THEN
    RAISE EXCEPTION 'tipo_no_permitido' USING ERRCODE = '22023';
  END IF;
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'payload_invalido' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.acciones_admin_pendientes (tipo, payload, solicitante_id)
  VALUES (p_tipo, p_payload, auth.uid())
  RETURNING id INTO v_id;

  INSERT INTO public.admin_logs (admin_id, accion, entidad, entidad_id, payload)
  VALUES (
    auth.uid(), 'solicito_accion_sensible', 'accion_admin', v_id::text,
    jsonb_build_object('tipo', p_tipo, 'payload', p_payload)
  );
  RETURN jsonb_build_object('ok', true, 'pendiente', true, 'id', v_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.superadmin_resolver_accion_v2(
  p_accion_id UUID,
  p_aprobar BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_accion public.acciones_admin_pendientes%ROWTYPE;
  v_anterior JSONB := '{}'::jsonb;
  v_nuevo JSONB := '{}'::jsonb;
  v_id UUID;
  v_text_id TEXT;
  v_item JSONB;
  v_index INTEGER := 0;
BEGIN
  IF NOT public.es_superadministrador() THEN
    RAISE EXCEPTION 'solo_superadministrador' USING ERRCODE = '42501';
  END IF;
  IF NOT public.sesion_es_aal2() THEN
    RAISE EXCEPTION 'mfa_aal2_requerido' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_accion
  FROM public.acciones_admin_pendientes
  WHERE id = p_accion_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'accion_no_encontrada' USING ERRCODE = 'P0002';
  END IF;

  -- El resolver original conserva las acciones previamente desplegadas y
  -- también gestiona cualquier rechazo antes de ejecutar su CASE.
  IF NOT p_aprobar OR v_accion.tipo IN (
    'conceder_admin', 'desactivar_escuela', 'desactivar_libro',
    'asignar_libro_escuela', 'remover_libro_escuela',
    'crear_tokens_libro', 'crear_tokens_docente', 'revocar_token'
  ) THEN
    RETURN public.superadmin_resolver_accion(p_accion_id, p_aprobar);
  END IF;

  SELECT * INTO v_accion
  FROM public.acciones_admin_pendientes
  WHERE id = p_accion_id
  FOR UPDATE;
  IF v_accion.estado <> 'pendiente' THEN
    RAISE EXCEPTION 'accion_ya_resuelta' USING ERRCODE = '55000';
  END IF;

  PERFORM set_config('app.fase3_aprobada', 'si', true);

  CASE v_accion.tipo
    WHEN 'crear_escuela' THEN
      INSERT INTO public.escuelas (nombre, ciudad, codigo, activa)
      VALUES (
        trim(v_accion.payload ->> 'nombre'),
        nullif(trim(v_accion.payload ->> 'ciudad'), ''),
        upper(trim(v_accion.payload ->> 'codigo')),
        true
      )
      RETURNING id INTO v_id;
      v_anterior := jsonb_build_object('existe', false);
      v_nuevo := jsonb_build_object('escuela_id', v_id, 'activa', true);

    WHEN 'cambiar_estado_escuela' THEN
      v_id := (v_accion.payload ->> 'escuela_id')::uuid;
      SELECT to_jsonb(e) INTO v_anterior FROM public.escuelas e WHERE e.id = v_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'escuela_no_encontrada'; END IF;
      UPDATE public.escuelas
      SET activa = (v_accion.payload ->> 'activa')::boolean
      WHERE id = v_id;
      SELECT to_jsonb(e) INTO v_nuevo FROM public.escuelas e WHERE e.id = v_id;

    WHEN 'crear_libro' THEN
      v_text_id := v_accion.payload ->> 'id';
      INSERT INTO public.libros (
        id, titulo, descripcion, emoji, grado_id, portada_url, pdf_url,
        color_acento, color_encabezado_inicio, color_encabezado_fin,
        color_fondo_actividades, activo
      ) VALUES (
        v_text_id, trim(v_accion.payload ->> 'titulo'),
        nullif(v_accion.payload ->> 'descripcion', ''),
        nullif(v_accion.payload ->> 'emoji', ''),
        (v_accion.payload ->> 'grado_id')::integer,
        nullif(v_accion.payload ->> 'portada_url', ''),
        nullif(v_accion.payload ->> 'pdf_url', ''),
        nullif(v_accion.payload ->> 'color_acento', ''),
        nullif(v_accion.payload ->> 'color_encabezado_inicio', ''),
        nullif(v_accion.payload ->> 'color_encabezado_fin', ''),
        nullif(v_accion.payload ->> 'color_fondo_actividades', ''),
        true
      );
      v_anterior := jsonb_build_object('existe', false);
      SELECT to_jsonb(l) INTO v_nuevo FROM public.libros l WHERE l.id = v_text_id;

    WHEN 'editar_libro' THEN
      v_text_id := v_accion.payload ->> 'libro_id';
      SELECT to_jsonb(l) INTO v_anterior FROM public.libros l WHERE l.id = v_text_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'libro_no_encontrado'; END IF;
      UPDATE public.libros SET
        titulo = trim(v_accion.payload -> 'campos' ->> 'titulo'),
        descripcion = nullif(v_accion.payload -> 'campos' ->> 'descripcion', ''),
        emoji = nullif(v_accion.payload -> 'campos' ->> 'emoji', ''),
        grado_id = (v_accion.payload -> 'campos' ->> 'grado_id')::integer,
        portada_url = nullif(v_accion.payload -> 'campos' ->> 'portada_url', ''),
        pdf_url = nullif(v_accion.payload -> 'campos' ->> 'pdf_url', ''),
        color_acento = nullif(v_accion.payload -> 'campos' ->> 'color_acento', ''),
        color_encabezado_inicio = nullif(v_accion.payload -> 'campos' ->> 'color_encabezado_inicio', ''),
        color_encabezado_fin = nullif(v_accion.payload -> 'campos' ->> 'color_encabezado_fin', ''),
        color_fondo_actividades = nullif(v_accion.payload -> 'campos' ->> 'color_fondo_actividades', '')
      WHERE id = v_text_id;
      SELECT to_jsonb(l) INTO v_nuevo FROM public.libros l WHERE l.id = v_text_id;

    WHEN 'cambiar_estado_libro' THEN
      v_text_id := v_accion.payload ->> 'libro_id';
      SELECT to_jsonb(l) INTO v_anterior FROM public.libros l WHERE l.id = v_text_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'libro_no_encontrado'; END IF;
      UPDATE public.libros
      SET activo = (v_accion.payload ->> 'activo')::boolean
      WHERE id = v_text_id;
      SELECT to_jsonb(l) INTO v_nuevo FROM public.libros l WHERE l.id = v_text_id;

    WHEN 'crear_unidad' THEN
      v_text_id := v_accion.payload ->> 'id';
      INSERT INTO public.unidades (id, libro_id, titulo, subtitulo, texto, orden)
      VALUES (
        v_text_id, v_accion.payload ->> 'libro_id',
        trim(v_accion.payload ->> 'titulo'),
        nullif(v_accion.payload ->> 'subtitulo', ''),
        nullif(v_accion.payload ->> 'texto', ''),
        (v_accion.payload ->> 'orden')::integer
      );
      v_anterior := jsonb_build_object('existe', false);
      SELECT to_jsonb(u) INTO v_nuevo FROM public.unidades u WHERE u.id = v_text_id;

    WHEN 'editar_unidad' THEN
      v_text_id := v_accion.payload ->> 'unidad_id';
      SELECT to_jsonb(u) INTO v_anterior FROM public.unidades u WHERE u.id = v_text_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'unidad_no_encontrada'; END IF;
      UPDATE public.unidades SET
        titulo = trim(v_accion.payload ->> 'titulo'),
        subtitulo = nullif(v_accion.payload ->> 'subtitulo', ''),
        texto = nullif(v_accion.payload ->> 'texto', '')
      WHERE id = v_text_id;
      SELECT to_jsonb(u) INTO v_nuevo FROM public.unidades u WHERE u.id = v_text_id;

    WHEN 'eliminar_unidad' THEN
      v_text_id := v_accion.payload ->> 'unidad_id';
      SELECT to_jsonb(u) INTO v_anterior FROM public.unidades u WHERE u.id = v_text_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'unidad_no_encontrada'; END IF;
      DELETE FROM public.unidades WHERE id = v_text_id;
      v_nuevo := jsonb_build_object('existe', false, 'unidad_id', v_text_id);

    WHEN 'reordenar_unidades' THEN
      IF jsonb_typeof(v_accion.payload -> 'unidades') <> 'array' THEN
        RAISE EXCEPTION 'unidades_invalidas';
      END IF;
      v_anterior := '[]'::jsonb;
      FOR v_item IN SELECT value FROM jsonb_array_elements(v_accion.payload -> 'unidades') LOOP
        SELECT v_anterior || jsonb_build_array(jsonb_build_object('id', id, 'orden', orden))
        INTO v_anterior
        FROM public.unidades
        WHERE id = v_item ->> 'id';
        IF NOT FOUND THEN RAISE EXCEPTION 'unidad_no_encontrada'; END IF;
        v_index := v_index + 1;
        UPDATE public.unidades SET orden = -100000 - v_index WHERE id = v_item ->> 'id';
      END LOOP;
      FOR v_item IN SELECT value FROM jsonb_array_elements(v_accion.payload -> 'unidades') LOOP
        UPDATE public.unidades
        SET orden = (v_item ->> 'orden')::integer
        WHERE id = v_item ->> 'id';
      END LOOP;
      v_nuevo := v_accion.payload -> 'unidades';
  END CASE;

  UPDATE public.acciones_admin_pendientes
  SET estado = 'aprobada', aprobador_id = auth.uid(), resuelto_en = now(),
      resultado = jsonb_build_object('ok', true, 'estado_nuevo', v_nuevo)
  WHERE id = p_accion_id;

  INSERT INTO public.admin_logs (admin_id, accion, entidad, entidad_id, payload)
  VALUES (
    auth.uid(), 'aprobo_y_ejecuto_accion_sensible', v_accion.tipo, p_accion_id::text,
    jsonb_build_object(
      'solicitante_id', v_accion.solicitante_id,
      'entrada', v_accion.payload,
      'estado_anterior', v_anterior,
      'estado_nuevo', v_nuevo
    )
  );
  RETURN jsonb_build_object('ok', true, 'aprobada', true, 'resultado', v_nuevo);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_solicitar_accion_sensible_v2(TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.superadmin_resolver_accion_v2(UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_solicitar_accion_sensible_v2(TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_resolver_accion_v2(UUID, BOOLEAN) TO authenticated;

-- El cliente solo conserva escritura directa sobre actividades.
REVOKE INSERT, UPDATE ON public.escuelas FROM authenticated;
REVOKE INSERT, UPDATE ON public.libros FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.unidades FROM authenticated;
GRANT INSERT, UPDATE, DELETE ON public.actividades TO authenticated;

COMMIT;
