-- IAbooks — Fase 12: códigos de activación legibles de 10 caracteres.
-- Conserva los tokens largos ya emitidos; solo cambia la generación futura.

BEGIN;

DO $preflight$
BEGIN
  IF to_regprocedure('extensions.gen_random_bytes(integer)') IS NULL THEN
    RAISE EXCEPTION 'falta_extensions.gen_random_bytes(integer)';
  END IF;
END;
$preflight$;

-- Diez símbolos Crockford Base32: 32^10 combinaciones = 50 bits.
-- Se excluyen I, L, O y U para reducir errores de transcripción.
CREATE OR REPLACE FUNCTION public.generar_token_10()
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = pg_catalog, extensions
AS $$
DECLARE
  v_alfabeto CONSTANT TEXT := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  v_bytes BYTEA := extensions.gen_random_bytes(10);
  v_token TEXT := '';
BEGIN
  FOR i IN 0..9 LOOP
    -- 256 es múltiplo de 32, por lo que este mapeo no introduce sesgo.
    v_token := v_token || substr(v_alfabeto, get_byte(v_bytes, i) % 32 + 1, 1);
  END LOOP;
  RETURN v_token;
END;
$$;

REVOKE ALL ON FUNCTION public.generar_token_10()
FROM PUBLIC, anon, authenticated;

-- Acepta el formato nuevo y los tokens largos válidos que ya estén impresos.
ALTER TABLE public.tokens
  DROP CONSTRAINT IF EXISTS token_valido_formato_seguro;
ALTER TABLE public.tokens
  ADD CONSTRAINT token_valido_formato_seguro
  CHECK (
    estado <> 'valido'
    OR id ~ '^[0-9A-HJKMNP-TV-Z]{10}$'
    OR id ~ '^(TL|TD)-[0-9A-F]{32}$'
  ) NOT VALID;
ALTER TABLE public.tokens
  VALIDATE CONSTRAINT token_valido_formato_seguro;

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
SET search_path = pg_catalog, public, auth, extensions
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
  IF p_expira_en IS NOT NULL AND p_expira_en <= now() THEN
    RAISE EXCEPTION 'expiracion_invalida' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.escuelas WHERE id = p_escuela_id AND activa
  ) THEN
    RAISE EXCEPTION 'escuela_no_encontrada_o_inactiva' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.libros
    WHERE id = p_libro_id AND activo AND grado_id = p_grado_id
  ) THEN
    RAISE EXCEPTION 'libro_no_encontrado_o_grado_incorrecto' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.escuela_libros
    WHERE escuela_id = p_escuela_id AND libro_id = p_libro_id
  ) THEN
    RAISE EXCEPTION 'libro_no_asignado_a_escuela' USING ERRCODE = '22023';
  END IF;

  FOR i IN 1..p_cantidad LOOP
    LOOP
      v_token_id := public.generar_token_10();
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

  INSERT INTO public.admin_logs(admin_id, accion, entidad, entidad_id, payload)
  VALUES (
    auth.uid(), 'genero_tokens_libro', 'token', p_escuela_id::text,
    jsonb_build_object(
      'cantidad', p_cantidad, 'libro_id', p_libro_id,
      'grado_id', p_grado_id, 'expira_en', p_expira_en,
      'formato', 'base32_10_chars_50_bits'
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
SET search_path = pg_catalog, public, auth, extensions
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
  IF p_expira_en IS NOT NULL AND p_expira_en <= now() THEN
    RAISE EXCEPTION 'expiracion_invalida' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.escuelas WHERE id = p_escuela_id AND activa
  ) THEN
    RAISE EXCEPTION 'escuela_no_encontrada_o_inactiva' USING ERRCODE = '22023';
  END IF;

  FOREACH v_email IN ARRAY p_emails LOOP
    v_email := lower(trim(v_email));
    IF v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
       OR char_length(v_email) > 254 THEN
      RAISE EXCEPTION 'email_invalido' USING ERRCODE = '22023';
    END IF;
    LOOP
      v_token_id := public.generar_token_10();
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.tokens WHERE id = v_token_id);
    END LOOP;
    INSERT INTO public.tokens (
      id, estado, tipo, escuela_id, email_autorizado, expira_en, usos_maximos
    ) VALUES (
      v_token_id, 'valido', 'docente', p_escuela_id, v_email, p_expira_en, 1
    );
    v_ids := v_ids || jsonb_build_array(v_token_id);
  END LOOP;

  INSERT INTO public.admin_logs(admin_id, accion, entidad, entidad_id, payload)
  VALUES (
    auth.uid(), 'genero_tokens_docente', 'token', p_escuela_id::text,
    jsonb_build_object(
      'cantidad', array_length(p_emails, 1), 'expira_en', p_expira_en,
      'formato', 'base32_10_chars_50_bits'
    )
  );
  RETURN v_ids;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_crear_tokens_libro(
  UUID, TEXT, INTEGER, INTEGER, TIMESTAMPTZ
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_crear_tokens_docente(
  UUID, TEXT[], TIMESTAMPTZ
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_crear_tokens_libro(
  UUID, TEXT, INTEGER, INTEGER, TIMESTAMPTZ
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_crear_tokens_docente(
  UUID, TEXT[], TIMESTAMPTZ
) TO authenticated;

COMMIT;
