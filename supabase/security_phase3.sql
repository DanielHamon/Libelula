-- IAbooks — Fase 3
-- Superadministrador, MFA aal2, aprobación explícita y auditoría transaccional.
-- Ejecutar una sola vez después de security_phase1 y security_phase2.

BEGIN;

CREATE TABLE public.superadministradores (
  usuario_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE RESTRICT,
  activo BOOLEAN NOT NULL DEFAULT true,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  creado_por UUID REFERENCES public.profiles(id)
);

CREATE TABLE public.acciones_admin_pendientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo TEXT NOT NULL CHECK (tipo IN (
    'conceder_admin',
    'desactivar_escuela',
    'desactivar_libro',
    'asignar_libro_escuela',
    'remover_libro_escuela',
    'crear_tokens_libro',
    'crear_tokens_docente',
    'revocar_token'
  )),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  estado TEXT NOT NULL DEFAULT 'pendiente'
    CHECK (estado IN ('pendiente', 'aprobada', 'rechazada', 'cancelada', 'fallida')),
  solicitante_id UUID NOT NULL REFERENCES public.profiles(id),
  aprobador_id UUID REFERENCES public.profiles(id),
  solicitado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  resuelto_en TIMESTAMPTZ,
  resultado JSONB,
  error TEXT
);

CREATE INDEX acciones_admin_pendientes_estado_fecha_idx
  ON public.acciones_admin_pendientes (estado, solicitado_en DESC);

ALTER TABLE public.superadministradores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.acciones_admin_pendientes ENABLE ROW LEVEL SECURITY;

-- La cuenta verificada durante el prerrequisito de la fase 3.
INSERT INTO public.superadministradores (usuario_id, creado_por)
SELECT id, id
FROM public.profiles
WHERE lower(email) = 'superlibelulaadmin@gmail.com'
  AND rol = 'admin'
ON CONFLICT (usuario_id) DO UPDATE SET activo = true;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.superadministradores
    WHERE activo
  ) THEN
    RAISE EXCEPTION
      'No existe el perfil admin superlibelulaadmin@gmail.com. Complete los prerrequisitos de fase 3.';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.es_superadministrador()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.superadministradores s
    JOIN public.profiles p ON p.id = s.usuario_id
    WHERE s.usuario_id = auth.uid()
      AND s.activo
      AND p.rol = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.sesion_es_aal2()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, auth
AS $$
  SELECT COALESCE(auth.jwt() ->> 'aal', '') = 'aal2';
$$;

REVOKE ALL ON FUNCTION public.es_superadministrador() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sesion_es_aal2() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.es_superadministrador() TO authenticated;
GRANT EXECUTE ON FUNCTION public.sesion_es_aal2() TO authenticated;

CREATE OR REPLACE FUNCTION public.bloquear_desactivacion_directa()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF TG_TABLE_NAME = 'escuelas'
     AND OLD.activa
     AND NOT NEW.activa
     AND COALESCE(auth.jwt() ->> 'role', '') <> 'service_role'
     AND current_setting('app.fase3_aprobada', true) IS DISTINCT FROM 'si' THEN
    RAISE EXCEPTION 'aprobacion_requerida' USING ERRCODE = '42501';
  END IF;
  IF TG_TABLE_NAME = 'libros'
     AND OLD.activo
     AND NOT NEW.activo
     AND COALESCE(auth.jwt() ->> 'role', '') <> 'service_role'
     AND current_setting('app.fase3_aprobada', true) IS DISTINCT FROM 'si' THEN
    RAISE EXCEPTION 'aprobacion_requerida' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS escuelas_bloquear_desactivacion_directa ON public.escuelas;
CREATE TRIGGER escuelas_bloquear_desactivacion_directa
BEFORE UPDATE OF activa ON public.escuelas
FOR EACH ROW EXECUTE FUNCTION public.bloquear_desactivacion_directa();

DROP TRIGGER IF EXISTS libros_bloquear_desactivacion_directa ON public.libros;
CREATE TRIGGER libros_bloquear_desactivacion_directa
BEFORE UPDATE OF activo ON public.libros
FOR EACH ROW EXECUTE FUNCTION public.bloquear_desactivacion_directa();

REVOKE ALL ON FUNCTION public.bloquear_desactivacion_directa() FROM PUBLIC;

CREATE POLICY superadministradores_admin_read
ON public.superadministradores FOR SELECT TO authenticated
USING (public.es_admin());

CREATE POLICY acciones_admin_admin_read
ON public.acciones_admin_pendientes FOR SELECT TO authenticated
USING (public.es_admin());

CREATE OR REPLACE FUNCTION public.admin_solicitar_accion_sensible(
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
    'conceder_admin', 'desactivar_escuela', 'desactivar_libro',
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

CREATE OR REPLACE FUNCTION public.superadmin_resolver_accion(
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
  v_resultado JSONB := '{}'::jsonb;
  v_anterior JSONB := '{}'::jsonb;
  v_usuario_id UUID;
  v_escuela_id UUID;
  v_libro_id TEXT;
  v_token_id TEXT;
  v_cantidad INTEGER;
  v_email TEXT;
  v_ids JSONB := '[]'::jsonb;
  v_nuevo_token TEXT;
BEGIN
  IF NOT public.es_superadministrador() THEN
    RAISE EXCEPTION 'solo_superadministrador' USING ERRCODE = '42501';
  END IF;
  IF NOT public.sesion_es_aal2() THEN
    RAISE EXCEPTION 'mfa_aal2_requerido' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_accion
  FROM public.acciones_admin_pendientes
  WHERE id = p_accion_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'accion_no_encontrada' USING ERRCODE = 'P0002';
  END IF;
  IF v_accion.estado <> 'pendiente' THEN
    RAISE EXCEPTION 'accion_ya_resuelta' USING ERRCODE = '55000';
  END IF;

  IF NOT p_aprobar THEN
    UPDATE public.acciones_admin_pendientes
    SET estado = 'rechazada', aprobador_id = auth.uid(), resuelto_en = now(),
        resultado = jsonb_build_object('ok', true, 'aprobada', false)
    WHERE id = p_accion_id;

    INSERT INTO public.admin_logs (admin_id, accion, entidad, entidad_id, payload)
    VALUES (
      auth.uid(), 'rechazo_accion_sensible', 'accion_admin', p_accion_id::text,
      jsonb_build_object('tipo', v_accion.tipo, 'solicitante_id', v_accion.solicitante_id)
    );
    RETURN jsonb_build_object('ok', true, 'aprobada', false);
  END IF;

  PERFORM set_config('app.fase3_aprobada', 'si', true);

  CASE v_accion.tipo
    WHEN 'conceder_admin' THEN
      v_usuario_id := (v_accion.payload ->> 'usuario_id')::uuid;
      SELECT jsonb_build_object('usuario_id', id, 'rol', rol)
      INTO v_anterior
      FROM public.profiles
      WHERE id = v_usuario_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'usuario_no_encontrado';
      END IF;
      UPDATE public.profiles SET rol = 'admin' WHERE id = v_usuario_id;
      v_resultado := jsonb_build_object('usuario_id', v_usuario_id, 'rol', 'admin');

    WHEN 'desactivar_escuela' THEN
      v_escuela_id := (v_accion.payload ->> 'escuela_id')::uuid;
      SELECT jsonb_build_object('escuela_id', id, 'activa', activa)
      INTO v_anterior FROM public.escuelas WHERE id = v_escuela_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'escuela_no_encontrada'; END IF;
      UPDATE public.escuelas SET activa = false WHERE id = v_escuela_id;
      v_resultado := jsonb_build_object('escuela_id', v_escuela_id, 'activa', false);

    WHEN 'desactivar_libro' THEN
      v_libro_id := v_accion.payload ->> 'libro_id';
      SELECT jsonb_build_object('libro_id', id, 'activo', activo)
      INTO v_anterior FROM public.libros WHERE id = v_libro_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'libro_no_encontrado'; END IF;
      UPDATE public.libros SET activo = false WHERE id = v_libro_id;
      v_resultado := jsonb_build_object('libro_id', v_libro_id, 'activo', false);

    WHEN 'asignar_libro_escuela' THEN
      v_escuela_id := (v_accion.payload ->> 'escuela_id')::uuid;
      v_libro_id := v_accion.payload ->> 'libro_id';
      v_anterior := jsonb_build_object('asignada', false);
      INSERT INTO public.escuela_libros (escuela_id, libro_id)
      VALUES (v_escuela_id, v_libro_id);
      v_resultado := v_accion.payload;

    WHEN 'remover_libro_escuela' THEN
      v_escuela_id := (v_accion.payload ->> 'escuela_id')::uuid;
      v_libro_id := v_accion.payload ->> 'libro_id';
      v_anterior := jsonb_build_object('asignada', true);
      DELETE FROM public.escuela_libros
      WHERE escuela_id = v_escuela_id AND libro_id = v_libro_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'relacion_no_encontrada'; END IF;
      v_resultado := v_accion.payload;

    WHEN 'revocar_token' THEN
      v_token_id := v_accion.payload ->> 'token_id';
      SELECT jsonb_build_object('token_id', id, 'estado', estado)
      INTO v_anterior FROM public.tokens WHERE id = v_token_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'token_no_encontrado'; END IF;
      UPDATE public.tokens SET estado = 'revocado' WHERE id = v_token_id;
      v_resultado := jsonb_build_object('token_id', v_token_id, 'estado', 'revocado');

    WHEN 'crear_tokens_libro' THEN
      v_anterior := jsonb_build_object('tokens', 0);
      v_cantidad := (v_accion.payload ->> 'cantidad')::integer;
      IF v_cantidad NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'cantidad_invalida'; END IF;
      FOR i IN 1..v_cantidad LOOP
        v_nuevo_token := 'TL-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
        INSERT INTO public.tokens (
          id, estado, tipo, libro_id, escuela_id, grado_id, expira_en, usos_maximos
        ) VALUES (
          v_nuevo_token, 'valido', 'libro',
          v_accion.payload ->> 'libro_id',
          (v_accion.payload ->> 'escuela_id')::uuid,
          (v_accion.payload ->> 'grado_id')::integer,
          nullif(v_accion.payload ->> 'expira_en', '')::timestamptz,
          1
        );
        v_ids := v_ids || jsonb_build_array(v_nuevo_token);
      END LOOP;
      v_resultado := jsonb_build_object('ids', v_ids, 'cantidad', v_cantidad);

    WHEN 'crear_tokens_docente' THEN
      v_anterior := jsonb_build_object('tokens', 0);
      IF jsonb_typeof(v_accion.payload -> 'emails') <> 'array'
         OR jsonb_array_length(v_accion.payload -> 'emails') NOT BETWEEN 1 AND 500 THEN
        RAISE EXCEPTION 'emails_invalidos';
      END IF;
      FOR v_email IN SELECT jsonb_array_elements_text(v_accion.payload -> 'emails') LOOP
        v_nuevo_token := 'TD-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
        INSERT INTO public.tokens (
          id, estado, tipo, escuela_id, email_autorizado, expira_en, usos_maximos
        ) VALUES (
          v_nuevo_token, 'valido', 'docente',
          (v_accion.payload ->> 'escuela_id')::uuid,
          lower(trim(v_email)),
          nullif(v_accion.payload ->> 'expira_en', '')::timestamptz,
          1
        );
        v_ids := v_ids || jsonb_build_array(v_nuevo_token);
      END LOOP;
      v_resultado := jsonb_build_object(
        'ids', v_ids, 'cantidad', jsonb_array_length(v_accion.payload -> 'emails')
      );
  END CASE;

  UPDATE public.acciones_admin_pendientes
  SET estado = 'aprobada', aprobador_id = auth.uid(), resuelto_en = now(),
      resultado = jsonb_build_object('ok', true) || v_resultado
  WHERE id = p_accion_id;

  INSERT INTO public.admin_logs (admin_id, accion, entidad, entidad_id, payload)
  VALUES (
    auth.uid(), 'aprobo_y_ejecuto_accion_sensible', v_accion.tipo, p_accion_id::text,
    jsonb_build_object(
      'solicitante_id', v_accion.solicitante_id,
      'entrada', v_accion.payload,
      'estado_anterior', v_anterior,
      'estado_nuevo', v_resultado
    )
  );

  RETURN jsonb_build_object('ok', true, 'aprobada', true, 'resultado', v_resultado);
EXCEPTION WHEN OTHERS THEN
  -- La excepción revierte toda la llamada, evitando acciones parcialmente aplicadas.
  RAISE;
END;
$$;

-- El cambio ordinario de rol permanece disponible, pero conceder admin
-- siempre pasa por aprobación. La degradación propia sigue prohibida.
CREATE OR REPLACE FUNCTION public.admin_cambiar_rol_usuario(
  p_usuario_id UUID,
  p_rol TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_solicitud JSONB;
BEGIN
  IF NOT public.es_admin() THEN
    RETURN json_build_object('ok', false, 'motivo', 'permiso_denegado');
  END IF;
  IF p_rol NOT IN ('estudiante', 'docente', 'admin') THEN
    RETURN json_build_object('ok', false, 'motivo', 'rol_invalido');
  END IF;
  IF p_usuario_id = auth.uid() AND p_rol IS DISTINCT FROM 'admin' THEN
    RETURN json_build_object('ok', false, 'motivo', 'no_puedes_cambiar_tu_rol');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_usuario_id) THEN
    RETURN json_build_object('ok', false, 'motivo', 'usuario_no_encontrado');
  END IF;

  IF p_rol = 'admin' THEN
    v_solicitud := public.admin_solicitar_accion_sensible(
      'conceder_admin',
      jsonb_build_object('usuario_id', p_usuario_id)
    );
    RETURN v_solicitud::json;
  END IF;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = p_usuario_id AND rol = 'admin')
     AND (SELECT count(*) FROM public.profiles WHERE rol = 'admin') <= 1 THEN
    RETURN json_build_object('ok', false, 'motivo', 'ultimo_admin');
  END IF;

  UPDATE public.profiles SET rol = p_rol WHERE id = p_usuario_id;
  INSERT INTO public.admin_logs (admin_id, accion, entidad, entidad_id, payload)
  VALUES (
    auth.uid(), 'cambio_rol', 'usuario', p_usuario_id::text,
    jsonb_build_object('rol', p_rol)
  );
  RETURN json_build_object('ok', true, 'pendiente', false);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_solicitar_accion_sensible(TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.superadmin_resolver_accion(UUID, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_cambiar_rol_usuario(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_solicitar_accion_sensible(TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_resolver_accion(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_cambiar_rol_usuario(UUID, TEXT) TO authenticated;

GRANT SELECT ON public.superadministradores TO authenticated;
GRANT SELECT ON public.acciones_admin_pendientes TO authenticated;

-- Las relaciones comerciales y las licencias dejan de aceptar escrituras
-- directas del cliente. Solo las RPC SECURITY DEFINER anteriores las realizan.
REVOKE INSERT, DELETE ON public.escuela_libros FROM authenticated;
REVOKE INSERT, UPDATE ON public.tokens FROM authenticated;

COMMIT;
