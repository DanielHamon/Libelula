-- IAbooks — Fase 8: auditoría y funciones privilegiadas

BEGIN;

DROP POLICY IF EXISTS admin_logs_all ON public.admin_logs;
DROP POLICY IF EXISTS admin_logs_admin_all ON public.admin_logs;
CREATE POLICY admin_logs_admin_read ON public.admin_logs
  FOR SELECT TO authenticated USING (public.es_admin());

REVOKE ALL PRIVILEGES ON public.admin_logs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.admin_logs TO authenticated;

REVOKE ALL PRIVILEGES
  ON public.acciones_admin_pendientes, public.superadministradores
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.acciones_admin_pendientes, public.superadministradores
  TO authenticated;

ALTER TABLE public.admin_logs
  DROP CONSTRAINT IF EXISTS admin_logs_payload_tamano_check;
ALTER TABLE public.admin_logs
  ADD CONSTRAINT admin_logs_payload_tamano_check
  CHECK (payload IS NULL OR pg_column_size(payload) <= 65536);

ALTER TABLE public.acciones_admin_pendientes
  DROP CONSTRAINT IF EXISTS acciones_admin_payload_tamano_check;
ALTER TABLE public.acciones_admin_pendientes
  ADD CONSTRAINT acciones_admin_payload_tamano_check
  CHECK (pg_column_size(payload) <= 524288);

-- Las actividades son mutaciones directas permitidas. Su auditoría se deriva
-- en la base de auth.uid() y no de campos enviados por el navegador.
CREATE OR REPLACE FUNCTION public.auditar_actividad_admin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_fila public.actividades%ROWTYPE;
  v_accion TEXT;
BEGIN
  IF v_actor IS NULL OR NOT public.es_admin() THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  v_fila := COALESCE(NEW, OLD);
  v_accion := CASE TG_OP
    WHEN 'INSERT' THEN 'creo_actividad'
    WHEN 'UPDATE' THEN 'edito_actividad'
    WHEN 'DELETE' THEN 'elimino_actividad'
  END;

  INSERT INTO public.admin_logs(
    admin_id, accion, entidad, entidad_id, payload
  ) VALUES (
    v_actor, v_accion, 'actividad', v_fila.id,
    jsonb_strip_nulls(jsonb_build_object(
      'unidad_id', v_fila.unidad_id,
      'tipo', v_fila.tipo,
      'operacion', lower(TG_OP)
    ))
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE ALL ON FUNCTION public.auditar_actividad_admin()
  FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS actividades_auditoria_admin ON public.actividades;
CREATE TRIGGER actividades_auditoria_admin
AFTER INSERT OR UPDATE OR DELETE ON public.actividades
FOR EACH ROW EXECUTE FUNCTION public.auditar_actividad_admin();

-- Cerrar primero todas las funciones privilegiadas y reabrir exclusivamente
-- la API vigente y los helpers requeridos por RLS.
DO $$
DECLARE
  v_func REGPROCEDURE;
BEGIN
  FOR v_func IN
    SELECT p.oid::regprocedure
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef AND p.prokind = 'f'
  LOOP
    EXECUTE format(
      'REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated',
      v_func
    );
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_admin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.es_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.es_superadministrador() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_docente_of(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_docente_of_clase(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_inscrito_en_clase(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.puede_acceder_libro(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.puede_acceder_objeto_libro(TEXT)
  TO authenticated;

GRANT EXECUTE ON FUNCTION public.verificar_token(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.activar_token(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.activar_token_docente(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crear_clase(TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.buscar_clase_para_unirse(TEXT)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.unirse_clase(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_mis_libros_estado() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_libro_completo(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_actividad_publica(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_progreso_actividad(
  TEXT, JSONB, BOOLEAN, BOOLEAN
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.evaluar_intento_actividad(TEXT, JSONB)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.evaluar_detalle_separar_silabas(TEXT, JSONB)
  TO authenticated;

GRANT EXECUTE ON FUNCTION public.admin_solicitar_accion_sensible_v2(
  TEXT, JSONB
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.superadmin_resolver_accion_v3(
  UUID, BOOLEAN
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_crear_tokens_libro(
  UUID, TEXT, INTEGER, INTEGER, TIMESTAMPTZ
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_crear_tokens_docente(
  UUID, TEXT[], TIMESTAMPTZ
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_cambiar_rol_usuario(UUID, TEXT)
  TO authenticated;

-- Ajustar configuración sin reemplazar cuerpos ni contratos.
ALTER FUNCTION public.is_admin(UUID)
  SET search_path = pg_catalog, public;
ALTER FUNCTION public.admin_crear_tokens_docente(UUID, TEXT[], TIMESTAMPTZ)
  SET search_path = pg_catalog, public, auth;
ALTER FUNCTION public.admin_crear_tokens_libro(
  UUID, TEXT, INTEGER, INTEGER, TIMESTAMPTZ
) SET search_path = pg_catalog, public, auth;
ALTER FUNCTION public.admin_solicitar_accion_sensible(TEXT, JSONB)
  SET search_path = pg_catalog, public, auth;
ALTER FUNCTION public.es_superadministrador()
  SET search_path = pg_catalog, public, auth;
ALTER FUNCTION public.is_docente_of(UUID)
  SET search_path = pg_catalog, public;
ALTER FUNCTION public.is_docente_of_clase(UUID)
  SET search_path = pg_catalog, public;
ALTER FUNCTION public.is_inscrito_en_clase(UUID)
  SET search_path = pg_catalog, public;
ALTER FUNCTION public.superadmin_resolver_accion(UUID, BOOLEAN)
  SET search_path = pg_catalog, public, auth;
ALTER FUNCTION public.superadmin_resolver_accion_fase3_interna(UUID, BOOLEAN)
  SET search_path = pg_catalog, public, auth;

COMMIT;

SELECT
  NOT has_table_privilege('authenticated', 'public.admin_logs', 'INSERT')
    AS logs_insert_directo_bloqueado,
  NOT has_table_privilege('authenticated', 'public.admin_logs', 'UPDATE')
    AS logs_update_directo_bloqueado,
  NOT has_table_privilege('authenticated', 'public.admin_logs', 'DELETE')
    AS logs_delete_directo_bloqueado,
  NOT has_table_privilege(
    'authenticated', 'public.acciones_admin_pendientes', 'INSERT'
  ) AS aprobaciones_insert_directo_bloqueado,
  NOT has_function_privilege('anon', 'public.es_admin()', 'EXECUTE')
    AS helpers_anon_bloqueados,
  has_function_privilege(
    'authenticated',
    'public.admin_solicitar_accion_sensible_v2(text,jsonb)',
    'EXECUTE'
  ) AS solicitud_admin_habilitada,
  EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.actividades'::regclass
      AND tgname = 'actividades_auditoria_admin' AND NOT tgisinternal
  ) AS auditoria_actividad_activa;
