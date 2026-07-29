-- IAbooks — Fase 4: contención crítica
-- 1. Cierra la creación directa de activaciones de libros.
-- 2. Obliga a aprobar todos los cambios de rol con superadmin + MFA aal2.
-- Ejecutar después de security_phase3_approval_allowlist.sql.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.libro_activaciones') IS NULL
     OR to_regclass('public.acciones_admin_pendientes') IS NULL
     OR to_regclass('public.superadministradores') IS NULL THEN
    RAISE EXCEPTION 'faltan_prerrequisitos_fase4';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.libro_activaciones
    WHERE token_id IS NULL
  ) THEN
    RAISE EXCEPTION
      'existen_activaciones_sin_token: investigue y corrija esas filas antes de aplicar fase 4';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.libro_activaciones la
    LEFT JOIN public.tokens t ON t.id = la.token_id
    WHERE t.id IS NULL
       OR t.tipo IS DISTINCT FROM 'libro'
       OR t.estado IS DISTINCT FROM 'activado'
       OR t.usuario_id IS DISTINCT FROM la.usuario_id
       OR t.libro_id IS DISTINCT FROM la.libro_id
  ) THEN
    RAISE EXCEPTION
      'existen_activaciones_inconsistentes: investigue esas filas antes de aplicar fase 4';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.superadministradores s
    JOIN public.profiles p ON p.id = s.usuario_id
    WHERE s.activo
      AND p.rol = 'admin'
  ) THEN
    RAISE EXCEPTION 'no_existe_superadministrador_activo';
  END IF;
END;
$$;

-- Una activación válida siempre debe proceder de un token.
ALTER TABLE public.libro_activaciones
  ALTER COLUMN token_id SET NOT NULL;

-- Los clientes conservan lectura de sus activaciones, pero ninguna escritura.
REVOKE INSERT, UPDATE, DELETE ON public.libro_activaciones
  FROM anon, authenticated;

DROP POLICY IF EXISTS "libro_act_own" ON public.libro_activaciones;
DROP POLICY IF EXISTS libro_act_own_select ON public.libro_activaciones;
CREATE POLICY libro_act_own_select
ON public.libro_activaciones
FOR SELECT TO authenticated
USING (usuario_id = auth.uid());

-- Incorporar el cambio de cualquier rol a la lista cerrada de aprobaciones.
ALTER TABLE public.acciones_admin_pendientes
  DROP CONSTRAINT IF EXISTS acciones_admin_pendientes_tipo_check;

ALTER TABLE public.acciones_admin_pendientes
  ADD CONSTRAINT acciones_admin_pendientes_tipo_check CHECK (tipo IN (
    'conceder_admin', 'cambiar_rol_usuario',
    'crear_escuela', 'cambiar_estado_escuela',
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
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF NOT public.es_admin() THEN
    RAISE EXCEPTION 'permiso_denegado' USING ERRCODE = '42501';
  END IF;
  IF p_tipo NOT IN (
    'conceder_admin', 'cambiar_rol_usuario',
    'crear_escuela', 'cambiar_estado_escuela',
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

-- Toda petición de cambio de rol, incluida una degradación, queda pendiente.
CREATE OR REPLACE FUNCTION public.admin_cambiar_rol_usuario(
  p_usuario_id UUID,
  p_rol TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_rol_actual TEXT;
  v_solicitud JSONB;
BEGIN
  IF NOT public.es_admin() THEN
    RETURN json_build_object('ok', false, 'motivo', 'permiso_denegado');
  END IF;
  IF p_rol NOT IN ('estudiante', 'docente', 'admin') THEN
    RETURN json_build_object('ok', false, 'motivo', 'rol_invalido');
  END IF;

  SELECT rol INTO v_rol_actual
  FROM public.profiles
  WHERE id = p_usuario_id;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'motivo', 'usuario_no_encontrado');
  END IF;
  IF v_rol_actual = p_rol THEN
    RETURN json_build_object('ok', false, 'motivo', 'rol_sin_cambios');
  END IF;
  IF p_usuario_id = auth.uid() THEN
    RETURN json_build_object('ok', false, 'motivo', 'no_puedes_cambiar_tu_rol');
  END IF;

  v_solicitud := public.admin_solicitar_accion_sensible_v2(
    'cambiar_rol_usuario',
    jsonb_build_object(
      'usuario_id', p_usuario_id,
      'rol_anterior', v_rol_actual,
      'rol', p_rol
    )
  );
  RETURN v_solicitud::json;
END;
$$;

-- Defensa en profundidad: ni una RPC antigua ni una concesión accidental de
-- UPDATE pueden alterar profiles.rol sin la acción pendiente exacta.
CREATE OR REPLACE FUNCTION public.proteger_cambio_rol_aprobado()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_accion_id UUID;
BEGIN
  IF NEW.rol IS NOT DISTINCT FROM OLD.rol THEN
    RETURN NEW;
  END IF;

  -- La activación legítima de un token docente cambia estudiante -> docente.
  -- La frontera privilegiada que esta fase protege es cualquier transición
  -- hacia o desde admin.
  IF OLD.rol <> 'admin' AND NEW.rol <> 'admin' THEN
    RETURN NEW;
  END IF;

  BEGIN
    v_accion_id := nullif(
      current_setting('app.fase4_accion_rol_id', true),
      ''
    )::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    v_accion_id := NULL;
  END;

  IF v_accion_id IS NULL
     OR NOT public.es_superadministrador()
     OR NOT public.sesion_es_aal2()
     OR NOT EXISTS (
       SELECT 1
       FROM public.acciones_admin_pendientes a
       WHERE a.id = v_accion_id
         AND a.estado = 'pendiente'
         AND (
           (
             a.tipo = 'cambiar_rol_usuario'
             AND a.payload ->> 'usuario_id' = NEW.id::text
             AND a.payload ->> 'rol' = NEW.rol
           )
           OR (
             a.tipo = 'conceder_admin'
             AND a.payload ->> 'usuario_id' = NEW.id::text
             AND NEW.rol = 'admin'
           )
         )
     ) THEN
    RAISE EXCEPTION 'cambio_rol_requiere_aprobacion_aal2'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS proteger_cambio_rol_aprobado
  ON public.profiles;
CREATE TRIGGER proteger_cambio_rol_aprobado
BEFORE UPDATE OF rol ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.proteger_cambio_rol_aprobado();

-- Conservar una implementación interna de V2 para las acciones no relacionadas
-- con roles. Luego V2 se vuelve un alias compatible de V3, de forma que el
-- frontend ya desplegado y el nuevo pueden convivir durante la publicación.
DO $$
BEGIN
  IF to_regprocedure(
       'public.superadmin_resolver_accion_fase3_interna(uuid,boolean)'
     ) IS NULL THEN
    IF to_regprocedure(
         'public.superadmin_resolver_accion_v2(uuid,boolean)'
       ) IS NULL THEN
      RAISE EXCEPTION 'falta_resolver_v2';
    END IF;
    ALTER FUNCTION public.superadmin_resolver_accion_v2(UUID, BOOLEAN)
      RENAME TO superadmin_resolver_accion_fase3_interna;
  END IF;
END;
$$;

-- V3 encapsula V2 y gestiona de forma segura tanto solicitudes nuevas como
-- solicitudes antiguas de tipo conceder_admin.
CREATE OR REPLACE FUNCTION public.superadmin_resolver_accion_v3(
  p_accion_id UUID,
  p_aprobar BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_accion public.acciones_admin_pendientes%ROWTYPE;
  v_usuario_id UUID;
  v_rol_anterior TEXT;
  v_rol_nuevo TEXT;
  v_es_superadmin BOOLEAN;
  v_resultado JSONB;
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

  IF v_accion.tipo NOT IN ('cambiar_rol_usuario', 'conceder_admin')
     OR NOT p_aprobar THEN
    RETURN public.superadmin_resolver_accion_fase3_interna(
      p_accion_id,
      p_aprobar
    );
  END IF;

  SELECT * INTO v_accion
  FROM public.acciones_admin_pendientes
  WHERE id = p_accion_id
  FOR UPDATE;

  IF v_accion.estado <> 'pendiente' THEN
    RAISE EXCEPTION 'accion_ya_resuelta' USING ERRCODE = '55000';
  END IF;

  BEGIN
    v_usuario_id := (v_accion.payload ->> 'usuario_id')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'usuario_id_invalido' USING ERRCODE = '22023';
  END;

  v_rol_nuevo := CASE
    WHEN v_accion.tipo = 'conceder_admin' THEN 'admin'
    ELSE v_accion.payload ->> 'rol'
  END;

  IF v_rol_nuevo NOT IN ('estudiante', 'docente', 'admin') THEN
    RAISE EXCEPTION 'rol_invalido' USING ERRCODE = '22023';
  END IF;

  SELECT rol INTO v_rol_anterior
  FROM public.profiles
  WHERE id = v_usuario_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'usuario_no_encontrado' USING ERRCODE = 'P0002';
  END IF;
  IF v_rol_anterior = v_rol_nuevo THEN
    RAISE EXCEPTION 'rol_sin_cambios' USING ERRCODE = '22023';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.superadministradores
    WHERE usuario_id = v_usuario_id
      AND activo
  ) INTO v_es_superadmin;

  IF v_rol_anterior = 'admin'
     AND v_rol_nuevo <> 'admin'
     AND (
       SELECT count(*)
       FROM public.profiles
       WHERE rol = 'admin'
     ) <= 1 THEN
    RAISE EXCEPTION 'ultimo_admin' USING ERRCODE = '23514';
  END IF;

  IF v_es_superadmin
     AND v_rol_nuevo <> 'admin'
     AND (
       SELECT count(*)
       FROM public.superadministradores s
       JOIN public.profiles p ON p.id = s.usuario_id
       WHERE s.activo
         AND p.rol = 'admin'
     ) <= 1 THEN
    RAISE EXCEPTION 'ultimo_superadministrador' USING ERRCODE = '23514';
  END IF;

  PERFORM set_config('app.fase4_accion_rol_id', p_accion_id::text, true);

  UPDATE public.profiles
  SET rol = v_rol_nuevo
  WHERE id = v_usuario_id;

  IF v_es_superadmin AND v_rol_nuevo <> 'admin' THEN
    UPDATE public.superadministradores
    SET activo = false
    WHERE usuario_id = v_usuario_id;
  END IF;

  v_resultado := jsonb_build_object(
    'usuario_id', v_usuario_id,
    'rol_anterior', v_rol_anterior,
    'rol', v_rol_nuevo
  );

  UPDATE public.acciones_admin_pendientes
  SET estado = 'aprobada',
      aprobador_id = auth.uid(),
      resuelto_en = now(),
      resultado = jsonb_build_object('ok', true, 'estado_nuevo', v_resultado)
  WHERE id = p_accion_id;

  INSERT INTO public.admin_logs (admin_id, accion, entidad, entidad_id, payload)
  VALUES (
    auth.uid(),
    'aprobo_y_ejecuto_accion_sensible',
    'cambiar_rol_usuario',
    p_accion_id::text,
    jsonb_build_object(
      'solicitante_id', v_accion.solicitante_id,
      'entrada', v_accion.payload,
      'estado_anterior', jsonb_build_object('rol', v_rol_anterior),
      'estado_nuevo', v_resultado
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'aprobada', true,
    'resultado', v_resultado
  );
END;
$$;

-- Alias de compatibilidad. Toda llamada antigua a V2 recibe las protecciones V3.
CREATE OR REPLACE FUNCTION public.superadmin_resolver_accion_v2(
  p_accion_id UUID,
  p_aprobar BOOLEAN
)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
  SELECT public.superadmin_resolver_accion_v3(p_accion_id, p_aprobar);
$$;

REVOKE ALL ON FUNCTION public.proteger_cambio_rol_aprobado() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_cambiar_rol_usuario(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.superadmin_resolver_accion(UUID, BOOLEAN)
  FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.superadmin_resolver_accion_fase3_interna(UUID, BOOLEAN)
  FROM PUBLIC, authenticated;
REVOKE ALL ON FUNCTION public.superadmin_resolver_accion_v2(UUID, BOOLEAN)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.superadmin_resolver_accion_v3(UUID, BOOLEAN)
  FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.admin_cambiar_rol_usuario(UUID, TEXT)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_resolver_accion_v2(UUID, BOOLEAN)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_resolver_accion_v3(UUID, BOOLEAN)
  TO authenticated;

COMMIT;
