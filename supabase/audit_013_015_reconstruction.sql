-- Reconstrucción local o instalación sin los objetos. Producción ya los tiene.
-- No aplicar schema completo a una base existente.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
CREATE OR REPLACE FUNCTION public.admin_solicitar_accion_sensible_v2(p_tipo text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE
  v_id UUID;
  v_payload JSONB := p_payload;
  v_libro_id TEXT;
  v_orden INTEGER;
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

  IF p_tipo = 'crear_unidad' THEN
    v_libro_id := nullif(trim(p_payload ->> 'libro_id'), '');
    IF v_libro_id IS NULL THEN
      RAISE EXCEPTION 'libro_id_invalido' USING ERRCODE = '22023';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended('crear_unidad:' || v_libro_id, 0));

    SELECT COALESCE(MAX(orden), 0) + 1
    INTO v_orden
    FROM (
      SELECT u.orden
      FROM public.unidades u
      WHERE u.libro_id = v_libro_id
      UNION ALL
      SELECT (a.payload ->> 'orden')::integer
      FROM public.acciones_admin_pendientes a
      WHERE a.tipo = 'crear_unidad'
        AND a.estado = 'pendiente'
        AND a.payload ->> 'libro_id' = v_libro_id
        AND (a.payload ->> 'orden') ~ '^[0-9]+$'
    ) ordenes_reservados;

    v_payload := jsonb_set(v_payload, '{orden}', to_jsonb(v_orden), true);
  END IF;

  INSERT INTO public.acciones_admin_pendientes (tipo, payload, solicitante_id)
  VALUES (p_tipo, v_payload, auth.uid())
  RETURNING id INTO v_id;

  INSERT INTO public.admin_logs (admin_id, accion, entidad, entidad_id, payload)
  VALUES (
    auth.uid(), 'solicito_accion_sensible', 'accion_admin', v_id::text,
    jsonb_build_object('tipo', p_tipo, 'payload', v_payload)
  );
  RETURN jsonb_build_object('ok', true, 'pendiente', true, 'id', v_id);
END;
$function$
;
ALTER FUNCTION public.admin_solicitar_accion_sensible_v2(text,jsonb) OWNER TO postgres;
CREATE OR REPLACE FUNCTION public.normalizar_orden_unidad_al_insertar()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('crear_unidad:' || NEW.libro_id, 0));
  IF NEW.orden IS NULL OR EXISTS (
    SELECT 1
    FROM public.unidades u
    WHERE u.libro_id = NEW.libro_id
      AND u.orden = NEW.orden
  ) THEN
    SELECT COALESCE(MAX(u.orden), 0) + 1
    INTO NEW.orden
    FROM public.unidades u
    WHERE u.libro_id = NEW.libro_id;
  END IF;
  RETURN NEW;
END;
$function$
;
ALTER FUNCTION public.normalizar_orden_unidad_al_insertar() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.normalizar_orden_unidad_al_insertar() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.normalizar_orden_unidad_al_insertar() TO authenticated, service_role;
DO $$
DECLARE item record; existing record;
BEGIN
  FOR item IN SELECT * FROM (VALUES
    ('auth.users', 'on_auth_user_created', 'public.handle_new_user()', 5,
     'CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user()'),
    ('public.unidades', 'normalizar_orden_unidad_al_insertar', 'public.normalizar_orden_unidad_al_insertar()', 7,
     'CREATE TRIGGER normalizar_orden_unidad_al_insertar BEFORE INSERT ON public.unidades FOR EACH ROW EXECUTE FUNCTION public.normalizar_orden_unidad_al_insertar()')
  ) AS v(relation_name, trigger_name, function_name, trigger_type, ddl)
  LOOP
    SELECT * INTO existing FROM pg_trigger
      WHERE tgrelid=item.relation_name::regclass AND tgname=item.trigger_name;
    IF NOT FOUND THEN
      EXECUTE item.ddl;
    ELSIF existing.tgfoid <> item.function_name::regprocedure OR existing.tgtype <> item.trigger_type
      OR existing.tgenabled <> 'O' OR existing.tgnargs <> 0 OR existing.tgqual IS NOT NULL THEN
      RAISE EXCEPTION 'Trigger existente incompatible: %; revisar antes de migrar', item.trigger_name;
    END IF;
  END LOOP;
END $$;
COMMIT;
