-- IAbooks — Fase 7: tokens, clases y exposición pública
-- Ejecutar después de security_phase7_preflight.sql.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Los RPC privilegiados no deben heredar EXECUTE desde PUBLIC.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.verificar_token(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.activar_token(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.activar_token_docente(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.crear_clase(TEXT, INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.buscar_clase_para_unirse(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.unirse_clase(TEXT) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.verificar_token(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.activar_token(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.activar_token_docente(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crear_clase(TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.buscar_clase_para_unirse(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unirse_clase(TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Rate limiting autenticado de tokens. Se registra cada comprobación, no
-- solo los fallos, para que un código válido no permita consultas ilimitadas.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_intentos_token_limpieza
  ON public.intentos_token(intentado_en);

CREATE OR REPLACE FUNCTION public.verificar_token(p_token TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_token     public.tokens%ROWTYPE;
  v_profile   public.profiles%ROWTYPE;
  v_uid       UUID := auth.uid();
  v_intentos  INTEGER;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'autenticacion_requerida' USING ERRCODE = '42501';
  END IF;

  IF p_token IS NULL OR char_length(trim(p_token)) NOT BETWEEN 6 AND 128 THEN
    RETURN json_build_object('valido', false, 'motivo', 'token_invalido');
  END IF;

  SELECT count(*) INTO v_intentos
  FROM public.intentos_token
  WHERE uid = v_uid
    AND intentado_en > now() - interval '1 hour';

  IF v_intentos >= 10 THEN
    RETURN json_build_object('valido', false, 'motivo', 'demasiados_intentos');
  END IF;

  INSERT INTO public.intentos_token(uid) VALUES (v_uid);

  SELECT * INTO v_token
  FROM public.tokens
  WHERE id = upper(trim(p_token))
    AND estado = 'valido'
    AND (expira_en IS NULL OR expira_en >= now());

  IF NOT FOUND THEN
    RETURN json_build_object('valido', false, 'motivo', 'token_invalido');
  END IF;

  IF v_token.tipo = 'libro' THEN
    SELECT * INTO v_profile
    FROM public.profiles
    WHERE id = v_uid;

    IF FOUND
       AND v_profile.escuela_id IS NOT NULL
       AND v_profile.escuela_id IS DISTINCT FROM v_token.escuela_id THEN
      RETURN json_build_object('valido', false, 'motivo', 'escuela_incorrecta');
    END IF;

    IF FOUND
       AND v_profile.grado_id IS NOT NULL
       AND v_profile.grado_id IS DISTINCT FROM v_token.grado_id THEN
      RETURN json_build_object('valido', false, 'motivo', 'grado_incorrecto');
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.escuela_libros el
      WHERE el.escuela_id = v_token.escuela_id
        AND el.libro_id = v_token.libro_id
    ) THEN
      RETURN json_build_object(
        'valido', false, 'motivo', 'libro_no_disponible_en_escuela'
      );
    END IF;
  END IF;

  RETURN json_build_object(
    'valido', true,
    'tipo', v_token.tipo,
    'libro_titulo', v_token.libro_titulo
  );
END;
$$;

REVOKE ALL ON FUNCTION public.verificar_token(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verificar_token(TEXT) TO authenticated;

-- Las activaciones bloquean el token antes de comprobar y consumir su estado.
-- Esto hace explícita la exclusión mutua incluso si llegan dos solicitudes a
-- la vez. Las validaciones de pertenencia existentes se conservan.
CREATE OR REPLACE FUNCTION public.activar_token(p_token TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_uid     UUID := auth.uid();
  v_token   public.tokens%ROWTYPE;
  v_profile public.profiles%ROWTYPE;
  v_libro   public.libros%ROWTYPE;
  v_intentos INTEGER;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'autenticacion_requerida' USING ERRCODE = '42501';
  END IF;

  IF p_token IS NULL OR char_length(trim(p_token)) NOT BETWEEN 6 AND 128 THEN
    RETURN json_build_object('ok', false, 'motivo', 'token_invalido');
  END IF;

  SELECT count(*) INTO v_intentos
  FROM public.intentos_token
  WHERE uid = v_uid
    AND intentado_en > now() - interval '1 hour';
  IF v_intentos >= 10 THEN
    RETURN json_build_object('ok', false, 'motivo', 'demasiados_intentos');
  END IF;
  INSERT INTO public.intentos_token(uid) VALUES (v_uid);

  SELECT * INTO v_profile FROM public.profiles WHERE id = v_uid;
  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'motivo', 'perfil_no_encontrado');
  END IF;

  SELECT * INTO v_token
  FROM public.tokens
  WHERE id = upper(trim(p_token))
  FOR UPDATE;

  IF NOT FOUND
     OR v_token.estado IS DISTINCT FROM 'valido'
     OR (v_token.expira_en IS NOT NULL AND now() > v_token.expira_en) THEN
    RETURN json_build_object('ok', false, 'motivo', 'token_invalido');
  END IF;
  IF v_token.tipo IS DISTINCT FROM 'libro' THEN
    RETURN json_build_object('ok', false, 'motivo', 'tipo_incorrecto');
  END IF;
  IF v_profile.escuela_id IS NOT NULL
     AND v_profile.escuela_id IS DISTINCT FROM v_token.escuela_id THEN
    RETURN json_build_object('ok', false, 'motivo', 'escuela_incorrecta');
  END IF;
  IF v_profile.grado_id IS NOT NULL
     AND v_profile.grado_id IS DISTINCT FROM v_token.grado_id THEN
    RETURN json_build_object('ok', false, 'motivo', 'grado_incorrecto');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.escuela_libros
    WHERE escuela_id = v_token.escuela_id AND libro_id = v_token.libro_id
  ) THEN
    RETURN json_build_object(
      'ok', false, 'motivo', 'libro_no_disponible_en_escuela'
    );
  END IF;

  SELECT * INTO v_libro FROM public.libros WHERE id = v_token.libro_id;
  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'motivo', 'libro_no_encontrado');
  END IF;
  IF v_libro.grado_id IS NOT NULL
     AND v_libro.grado_id IS DISTINCT FROM v_token.grado_id THEN
    RETURN json_build_object('ok', false, 'motivo', 'grado_no_coincide');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.libro_activaciones
    WHERE usuario_id = v_uid AND libro_id = v_token.libro_id
  ) THEN
    RETURN json_build_object('ok', false, 'motivo', 'ya_tienes_libro');
  END IF;

  UPDATE public.tokens
  SET estado = 'activado', usuario_id = v_uid, activado_en = now()
  WHERE id = v_token.id;

  UPDATE public.profiles
  SET escuela_id = COALESCE(escuela_id, v_token.escuela_id),
      grado_id = COALESCE(grado_id, v_token.grado_id)
  WHERE id = v_uid;

  INSERT INTO public.libro_activaciones(usuario_id, libro_id, token_id)
  VALUES (v_uid, v_token.libro_id, v_token.id);

  RETURN json_build_object('ok', true, 'libro_id', v_token.libro_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.activar_token_docente(p_token TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_uid     UUID := auth.uid();
  v_email   TEXT;
  v_token   public.tokens%ROWTYPE;
  v_profile public.profiles%ROWTYPE;
  v_intentos INTEGER;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'autenticacion_requerida' USING ERRCODE = '42501';
  END IF;

  IF p_token IS NULL OR char_length(trim(p_token)) NOT BETWEEN 6 AND 128 THEN
    RETURN json_build_object('ok', false, 'motivo', 'token_invalido');
  END IF;

  SELECT count(*) INTO v_intentos
  FROM public.intentos_token
  WHERE uid = v_uid
    AND intentado_en > now() - interval '1 hour';
  IF v_intentos >= 10 THEN
    RETURN json_build_object('ok', false, 'motivo', 'demasiados_intentos');
  END IF;
  INSERT INTO public.intentos_token(uid) VALUES (v_uid);

  SELECT lower(email) INTO v_email FROM auth.users WHERE id = v_uid;
  SELECT * INTO v_profile FROM public.profiles WHERE id = v_uid;
  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'motivo', 'perfil_no_encontrado');
  END IF;

  SELECT * INTO v_token
  FROM public.tokens
  WHERE id = upper(trim(p_token))
  FOR UPDATE;

  IF NOT FOUND
     OR v_token.estado IS DISTINCT FROM 'valido'
     OR (v_token.expira_en IS NOT NULL AND now() > v_token.expira_en) THEN
    RETURN json_build_object('ok', false, 'motivo', 'token_invalido');
  END IF;
  IF v_token.tipo IS DISTINCT FROM 'docente' THEN
    RETURN json_build_object('ok', false, 'motivo', 'tipo_incorrecto');
  END IF;
  IF lower(trim(v_token.email_autorizado)) IS DISTINCT FROM v_email THEN
    RETURN json_build_object('ok', false, 'motivo', 'email_no_autorizado');
  END IF;
  IF v_profile.escuela_id IS NOT NULL
     AND v_profile.escuela_id IS DISTINCT FROM v_token.escuela_id THEN
    RETURN json_build_object('ok', false, 'motivo', 'escuela_incorrecta');
  END IF;

  UPDATE public.tokens
  SET estado = 'activado', usuario_id = v_uid, activado_en = now()
  WHERE id = v_token.id;

  UPDATE public.profiles
  SET rol = 'docente',
      escuela_id = COALESCE(escuela_id, v_token.escuela_id)
  WHERE id = v_uid;

  RETURN json_build_object('ok', true, 'escuela_id', v_token.escuela_id);
END;
$$;

REVOKE ALL ON FUNCTION public.activar_token(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.activar_token_docente(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.activar_token(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.activar_token_docente(TEXT) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Clases: códigos nuevos de 10 caracteres y rate limiting por usuario.
-- No se rotan códigos históricos para no expulsar estudiantes ni invalidar
-- material ya entregado por docentes.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.intentos_clase (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uid UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  intentado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_intentos_clase_uid_hora
  ON public.intentos_clase(uid, intentado_en);
CREATE INDEX IF NOT EXISTS idx_intentos_clase_limpieza
  ON public.intentos_clase(intentado_en);

ALTER TABLE public.intentos_clase ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON public.intentos_clase FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.crear_clase(
  p_nombre TEXT,
  p_grado_id INTEGER
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_profile  public.profiles%ROWTYPE;
  v_codigo   TEXT;
  v_clase_id UUID;
  v_alfabeto CONSTANT TEXT := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  v_bytes    BYTEA;
  v_i        INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'autenticacion_requerida' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = auth.uid();
  IF NOT FOUND OR v_profile.rol IS DISTINCT FROM 'docente' THEN
    RAISE EXCEPTION 'acceso_denegado' USING ERRCODE = '42501';
  END IF;
  IF v_profile.escuela_id IS NULL THEN
    RETURN json_build_object('ok', false, 'motivo', 'docente_sin_escuela');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.grados WHERE id = p_grado_id) THEN
    RETURN json_build_object('ok', false, 'motivo', 'grado_invalido');
  END IF;
  IF char_length(trim(p_nombre)) NOT BETWEEN 1 AND 120 THEN
    RETURN json_build_object('ok', false, 'motivo', 'nombre_invalido');
  END IF;

  LOOP
    v_bytes := gen_random_bytes(10);
    v_codigo := '';
    FOR v_i IN 0..9 LOOP
      v_codigo := v_codigo || substr(
        v_alfabeto,
        (get_byte(v_bytes, v_i) % char_length(v_alfabeto)) + 1,
        1
      );
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.clases WHERE codigo = v_codigo);
  END LOOP;

  INSERT INTO public.clases(nombre, grado_id, escuela_id, docente_id, codigo)
  VALUES (
    trim(p_nombre), p_grado_id, v_profile.escuela_id, auth.uid(), v_codigo
  )
  RETURNING id INTO v_clase_id;

  RETURN json_build_object(
    'ok', true,
    'clase_id', v_clase_id,
    'codigo', v_codigo,
    'escuela_id', v_profile.escuela_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.buscar_clase_para_unirse(p_codigo TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_uid      UUID := auth.uid();
  v_clase    public.clases%ROWTYPE;
  v_profile  public.profiles%ROWTYPE;
  v_libros   JSON;
  v_intentos INTEGER;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'autenticacion_requerida' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = v_uid;
  IF NOT FOUND
     OR v_profile.rol IS DISTINCT FROM 'estudiante'
     OR v_profile.escuela_id IS NULL
     OR v_profile.grado_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'perfil_incompleto');
  END IF;

  SELECT count(*) INTO v_intentos
  FROM public.intentos_clase
  WHERE uid = v_uid AND intentado_en > now() - interval '1 hour';
  IF v_intentos >= 20 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'demasiados_intentos');
  END IF;
  INSERT INTO public.intentos_clase(uid) VALUES (v_uid);

  IF p_codigo IS NULL OR char_length(trim(p_codigo)) NOT BETWEEN 6 AND 32 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'no_encontrada');
  END IF;

  SELECT * INTO v_clase
  FROM public.clases
  WHERE codigo = upper(trim(p_codigo))
    AND activa = true
    AND escuela_id = v_profile.escuela_id
    AND grado_id = v_profile.grado_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'no_encontrada');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.inscripciones
    WHERE clase_id = v_clase.id AND estudiante_id = v_uid
  ) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'ya_inscrito');
  END IF;

  SELECT json_agg(
    jsonb_build_object('libroId', libro_id, 'libroTitulo', libro_titulo)
  ) INTO v_libros
  FROM public.clase_libros
  WHERE clase_id = v_clase.id;

  RETURN jsonb_build_object(
    'ok', true,
    'clase', jsonb_build_object(
      'id', v_clase.id,
      'nombre', v_clase.nombre,
      'codigo', v_clase.codigo,
      'libros', COALESCE(v_libros, '[]'::json)
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.unirse_clase(p_codigo TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_uid      UUID := auth.uid();
  v_clase    public.clases%ROWTYPE;
  v_profile  public.profiles%ROWTYPE;
  v_intentos INTEGER;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'autenticacion_requerida' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = v_uid;
  IF NOT FOUND
     OR v_profile.rol IS DISTINCT FROM 'estudiante'
     OR v_profile.escuela_id IS NULL
     OR v_profile.grado_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'perfil_incompleto');
  END IF;

  SELECT count(*) INTO v_intentos
  FROM public.intentos_clase
  WHERE uid = v_uid AND intentado_en > now() - interval '1 hour';
  IF v_intentos >= 20 THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'demasiados_intentos');
  END IF;
  INSERT INTO public.intentos_clase(uid) VALUES (v_uid);

  SELECT * INTO v_clase
  FROM public.clases
  WHERE codigo = upper(trim(p_codigo))
    AND activa = true
    AND escuela_id = v_profile.escuela_id
    AND grado_id = v_profile.grado_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'no_encontrada');
  END IF;

  INSERT INTO public.inscripciones(clase_id, estudiante_id)
  VALUES (v_clase.id, v_uid)
  ON CONFLICT (clase_id, estudiante_id) DO NOTHING;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.crear_clase(TEXT, INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.buscar_clase_para_unirse(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.unirse_clase(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crear_clase(TEXT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.buscar_clase_para_unirse(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unirse_clase(TEXT) TO authenticated;

-- La búsqueda directa de clases no es necesaria: los RPC SECURITY DEFINER
-- realizan la búsqueda sin abrir todas las clases activas al cliente.
DROP POLICY IF EXISTS clases_activas_buscar ON public.clases;

-- ---------------------------------------------------------------------------
-- 4. El catálogo interno deja de ser anónimo. Grados, escuelas y libros se
-- consumen después de autenticar; libros se limitan a licencia, escuela o rol.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS escuelas_read ON public.escuelas;
DROP POLICY IF EXISTS grados_read ON public.grados;
DROP POLICY IF EXISTS libros_read ON public.libros;

CREATE POLICY escuelas_authenticated_read
ON public.escuelas
FOR SELECT TO authenticated
USING (
  public.es_admin()
  OR id = (SELECT p.escuela_id FROM public.profiles p WHERE p.id = auth.uid())
);

CREATE POLICY grados_authenticated_read
ON public.grados
FOR SELECT TO authenticated
USING (true);

CREATE POLICY libros_authenticated_authorized_read
ON public.libros
FOR SELECT TO authenticated
USING (
  public.es_admin()
  OR public.puede_acceder_libro(id)
  OR EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.escuela_libros el ON el.escuela_id = p.escuela_id
    WHERE p.id = auth.uid()
      AND p.rol = 'docente'
      AND el.libro_id = libros.id
  )
);

REVOKE ALL PRIVILEGES
ON public.tokens,
   public.clases,
   public.clase_libros,
   public.inscripciones,
   public.escuelas,
   public.grados,
   public.libros,
   public.escuela_libros
FROM PUBLIC, anon;

-- Conservar únicamente SELECT público a través de usuarios autenticados; las
-- escrituras existentes siguen sujetas a sus políticas y grants específicos.
GRANT SELECT
ON public.tokens,
   public.clases,
   public.clase_libros,
   public.inscripciones,
   public.escuelas,
   public.grados,
   public.libros,
   public.escuela_libros
TO authenticated;

GRANT UPDATE, DELETE ON public.clases TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.clase_libros TO authenticated;
GRANT DELETE ON public.inscripciones TO authenticated;

-- Evita acumulación ilimitada sin requerir cron: cada ejecución elimina solo
-- registros antiguos, que ya no influyen en ningún límite.
DELETE FROM public.intentos_token
WHERE intentado_en < now() - interval '7 days';
DELETE FROM public.intentos_clase
WHERE intentado_en < now() - interval '7 days';

COMMIT;

-- Resumen posterior inmediato.
SELECT
  NOT has_function_privilege(
    'anon', 'public.verificar_token(text)', 'EXECUTE'
  ) AS token_anon_bloqueado,
  has_function_privilege(
    'authenticated', 'public.verificar_token(text)', 'EXECUTE'
  ) AS token_auth_habilitado,
  NOT has_table_privilege('anon', 'public.escuelas', 'SELECT')
    AS escuelas_anon_bloqueadas,
  NOT has_table_privilege('anon', 'public.libros', 'SELECT')
    AS libros_anon_bloqueados,
  to_regclass('public.intentos_clase') IS NOT NULL
    AS limite_clases_instalado;
