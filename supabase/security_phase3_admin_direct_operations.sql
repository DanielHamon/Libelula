-- IAbooks — Ajuste de alcance de fase 3
-- Los administradores pueden generar tokens sin aprobación del
-- superadministrador. La operación sigue validada y auditada en el servidor.

BEGIN;

CREATE OR REPLACE FUNCTION public.admin_crear_tokens_libro(
  p_escuela_id UUID,
  p_libro_id TEXT,
  p_grado_id INTEGER,
  p_cantidad INTEGER,
  p_expira_en TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_ids JSONB := '[]'::jsonb;
  v_token_id TEXT;
BEGIN
  IF NOT public.es_admin() THEN
    RAISE EXCEPTION 'permiso_denegado' USING ERRCODE = '42501';
  END IF;
  IF p_cantidad NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'cantidad_invalida' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.escuelas WHERE id = p_escuela_id AND activa
  ) THEN
    RAISE EXCEPTION 'escuela_no_encontrada_o_inactiva' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.libros
    WHERE id = p_libro_id
      AND activo
      AND grado_id = p_grado_id
  ) THEN
    RAISE EXCEPTION 'libro_no_encontrado_o_grado_incorrecto' USING ERRCODE = '22023';
  END IF;

  FOR i IN 1..p_cantidad LOOP
    LOOP
      v_token_id := 'TL-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.tokens WHERE id = v_token_id);
    END LOOP;

    INSERT INTO public.tokens (
      id, estado, tipo, libro_id, escuela_id, grado_id, expira_en, usos_maximos
    ) VALUES (
      v_token_id, 'valido', 'libro', p_libro_id, p_escuela_id,
      p_grado_id, p_expira_en, 1
    );
    v_ids := v_ids || jsonb_build_array(v_token_id);
  END LOOP;

  INSERT INTO public.admin_logs (admin_id, accion, entidad, entidad_id, payload)
  VALUES (
    auth.uid(), 'genero_tokens_libro', 'token', p_escuela_id::text,
    jsonb_build_object(
      'cantidad', p_cantidad,
      'libro_id', p_libro_id,
      'grado_id', p_grado_id,
      'expira_en', p_expira_en,
      'ids', v_ids
    )
  );

  RETURN v_ids;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_crear_tokens_docente(
  p_escuela_id UUID,
  p_emails TEXT[],
  p_expira_en TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_ids JSONB := '[]'::jsonb;
  v_token_id TEXT;
  v_email TEXT;
BEGIN
  IF NOT public.es_admin() THEN
    RAISE EXCEPTION 'permiso_denegado' USING ERRCODE = '42501';
  END IF;
  IF COALESCE(array_length(p_emails, 1), 0) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'emails_invalidos' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.escuelas WHERE id = p_escuela_id AND activa
  ) THEN
    RAISE EXCEPTION 'escuela_no_encontrada_o_inactiva' USING ERRCODE = '22023';
  END IF;

  FOREACH v_email IN ARRAY p_emails LOOP
    v_email := lower(trim(v_email));
    IF v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
      RAISE EXCEPTION 'email_invalido: %', v_email USING ERRCODE = '22023';
    END IF;

    LOOP
      v_token_id := 'TD-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.tokens WHERE id = v_token_id);
    END LOOP;

    INSERT INTO public.tokens (
      id, estado, tipo, escuela_id, email_autorizado, expira_en, usos_maximos
    ) VALUES (
      v_token_id, 'valido', 'docente', p_escuela_id, v_email, p_expira_en, 1
    );
    v_ids := v_ids || jsonb_build_array(v_token_id);
  END LOOP;

  INSERT INTO public.admin_logs (admin_id, accion, entidad, entidad_id, payload)
  VALUES (
    auth.uid(), 'genero_tokens_docente', 'token', p_escuela_id::text,
    jsonb_build_object(
      'cantidad', array_length(p_emails, 1),
      'expira_en', p_expira_en,
      'ids', v_ids
    )
  );

  RETURN v_ids;
END;
$$;

-- Resolver por OID evita diferencias de representación de TIMESTAMPTZ/TEXT[]
-- entre versiones de PostgreSQL al escribir la firma en REVOKE/GRANT.
DO $permissions$
DECLARE
  v_function REGPROCEDURE;
  v_count INTEGER := 0;
BEGIN
  FOR v_function IN
    SELECT p.oid::regprocedure
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'admin_crear_tokens_libro',
        'admin_crear_tokens_docente'
      )
  LOOP
    v_count := v_count + 1;
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', v_function);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', v_function);
  END LOOP;

  IF v_count <> 2 THEN
    RAISE EXCEPTION 'Se esperaban 2 RPC de tokens y se encontraron %', v_count;
  END IF;
END;
$permissions$;

-- La concesión a authenticated solo habilita el Data API. La política RLS
-- actividades_admin_write continúa limitando estas operaciones a rol admin.
GRANT INSERT, UPDATE, DELETE ON public.actividades TO authenticated;

COMMIT;
