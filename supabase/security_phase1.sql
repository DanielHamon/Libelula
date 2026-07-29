-- ============================================================
-- IAbooks — Fase 1: cierre de vulnerabilidades críticas
-- Aplicar una sola vez en Supabase > SQL Editor.
-- Requiere PostgreSQL 15+ (Supabase) para security_invoker.
-- ============================================================

BEGIN;

-- Las funciones auxiliares centralizan las comprobaciones usadas por RLS.
CREATE OR REPLACE FUNCTION public.es_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid() AND rol = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.puede_acceder_libro(p_libro_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND (
      public.es_admin()
      OR EXISTS (
        SELECT 1
        FROM public.libro_activaciones la
        WHERE la.usuario_id = auth.uid()
          AND la.libro_id = p_libro_id
      )
      OR EXISTS (
        SELECT 1
        FROM public.profiles p
        JOIN public.escuela_libros el ON el.escuela_id = p.escuela_id
        WHERE p.id = auth.uid()
          AND p.rol = 'docente'
          AND el.libro_id = p_libro_id
      )
    );
$$;

REVOKE ALL ON FUNCTION public.es_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.puede_acceder_libro(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.es_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.puede_acceder_libro(TEXT) TO authenticated;

-- Autoriza objetos privados únicamente cuando están relacionados con un
-- libro al que la sesión puede acceder. También cubre recursos referenciados
-- dentro de los JSON de libros y actividades.
CREATE OR REPLACE FUNCTION public.puede_acceder_objeto_libro(p_object_name TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND (
      public.es_admin()
      OR EXISTS (
        SELECT 1
        FROM public.libros l
        WHERE public.puede_acceder_libro(l.id)
          AND (
            l.pdf_url = p_object_name
            OR l.portada_url = p_object_name
            OR COALESCE(l.canciones, '[]'::jsonb)::text
                 LIKE '%' || to_jsonb(p_object_name)::text || '%'
            OR COALESCE(l.videos_animados, '[]'::jsonb)::text
                 LIKE '%' || to_jsonb(p_object_name)::text || '%'
            OR COALESCE(l.hotspots, '[]'::jsonb)::text
                 LIKE '%' || to_jsonb(p_object_name)::text || '%'
            OR EXISTS (
              SELECT 1
              FROM public.unidades u
              JOIN public.actividades a ON a.unidad_id = u.id
              WHERE u.libro_id = l.id
                AND COALESCE(a.campos, '{}'::jsonb)::text
                      LIKE '%' || to_jsonb(p_object_name)::text || '%'
            )
          )
      )
    );
$$;

REVOKE ALL ON FUNCTION public.puede_acceder_objeto_libro(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.puede_acceder_objeto_libro(TEXT) TO authenticated;

-- El bucket puede ser privado y aun así quedar expuesto mediante una policy.
-- Sustituimos la lectura global de authenticated por autorización por objeto.
DROP POLICY IF EXISTS "authenticated read libros" ON storage.objects;
DROP POLICY IF EXISTS "authenticated_read_libros_authorized" ON storage.objects;

CREATE POLICY "authenticated_read_libros_authorized"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'libros'
  AND public.puede_acceder_objeto_libro(name)
);

-- Un registro nunca puede elegir su rol desde user_metadata.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  INSERT INTO public.profiles (id, nombre, email, escuela, rol)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nombre', ''),
    NEW.email,
    NULL,
    'estudiante'
  );
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC;

-- Algunas instalaciones antiguas no tienen todavía la tabla usada por el
-- rate limiting de verificar_token.
CREATE TABLE IF NOT EXISTS public.intentos_token (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uid UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  intentado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_intentos_token_uid_hora
  ON public.intentos_token(uid, intentado_en);

ALTER TABLE public.intentos_token ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON public.intentos_token FROM anon, authenticated;

-- La comprobación previa no revela correo, institución, grado ni estado
-- interno del código. La activación vuelve a validar todo de forma atómica.
CREATE OR REPLACE FUNCTION public.verificar_token(p_token TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_token     public.tokens%ROWTYPE;
  v_uid       UUID := auth.uid();
  v_intentos  INTEGER;
BEGIN
  IF v_uid IS NOT NULL THEN
    SELECT COUNT(*) INTO v_intentos
    FROM public.intentos_token
    WHERE uid = v_uid
      AND intentado_en > now() - interval '1 hour';

    IF v_intentos >= 10 THEN
      RETURN json_build_object('valido', false, 'motivo', 'demasiados_intentos');
    END IF;
  END IF;

  SELECT * INTO v_token
  FROM public.tokens
  WHERE id = upper(trim(p_token))
    AND estado = 'valido'
    AND (expira_en IS NULL OR expira_en >= now());

  IF NOT FOUND THEN
    IF v_uid IS NOT NULL THEN
      INSERT INTO public.intentos_token(uid) VALUES (v_uid);
    END IF;
    RETURN json_build_object('valido', false, 'motivo', 'token_invalido');
  END IF;

  RETURN json_build_object(
    'valido', true,
    'tipo', v_token.tipo,
    'libro_titulo', v_token.libro_titulo
  );
END;
$$;

REVOKE ALL ON FUNCTION public.verificar_token(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verificar_token(TEXT) TO anon, authenticated;

-- El propietario del perfil puede leerlo, pero solo actualizar su nombre.
DROP POLICY IF EXISTS "profiles_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_own_select" ON public.profiles;
DROP POLICY IF EXISTS "profiles_own_update" ON public.profiles;

CREATE POLICY "profiles_own_select" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid());

CREATE POLICY "profiles_own_update" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "profiles_admin_select" ON public.profiles;
CREATE POLICY "profiles_admin_select" ON public.profiles
  FOR SELECT TO authenticated
  USING (public.es_admin());

REVOKE INSERT, UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (nombre) ON public.profiles TO authenticated;

-- Cambio de rol exclusivo del administrador. La RPC evita conceder UPDATE
-- directo sobre las columnas sensibles del perfil.
CREATE OR REPLACE FUNCTION public.admin_cambiar_rol_usuario(
  p_usuario_id UUID,
  p_rol TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT public.es_admin() THEN
    RAISE EXCEPTION 'acceso_denegado' USING ERRCODE = '42501';
  END IF;

  IF p_rol NOT IN ('estudiante', 'docente', 'admin') THEN
    RETURN json_build_object('ok', false, 'motivo', 'rol_invalido');
  END IF;

  IF p_usuario_id = auth.uid() AND p_rol IS DISTINCT FROM 'admin' THEN
    RETURN json_build_object('ok', false, 'motivo', 'no_puedes_cambiar_tu_rol');
  END IF;

  IF p_rol IS DISTINCT FROM 'admin'
     AND EXISTS (
       SELECT 1 FROM public.profiles
       WHERE id = p_usuario_id AND rol = 'admin'
     )
     AND (SELECT COUNT(*) FROM public.profiles WHERE rol = 'admin') <= 1 THEN
    RETURN json_build_object('ok', false, 'motivo', 'ultimo_admin');
  END IF;

  UPDATE public.profiles
  SET rol = p_rol
  WHERE id = p_usuario_id;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'motivo', 'usuario_no_encontrado');
  END IF;

  RETURN json_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_cambiar_rol_usuario(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_cambiar_rol_usuario(UUID, TEXT) TO authenticated;

-- Completar las políticas administrativas que faltaban en el esquema base.
DROP POLICY IF EXISTS "escuelas_admin_write" ON public.escuelas;
CREATE POLICY "escuelas_admin_write" ON public.escuelas
  FOR ALL TO authenticated
  USING (public.es_admin())
  WITH CHECK (public.es_admin());

DROP POLICY IF EXISTS "escuela_libros_admin_all" ON public.escuela_libros;
CREATE POLICY "escuela_libros_admin_all" ON public.escuela_libros
  FOR ALL TO authenticated
  USING (public.es_admin())
  WITH CHECK (public.es_admin());

-- Sustituir las RPC vulnerables: el usuario y el correo se derivan siempre
-- de la sesión autenticada; el navegador ya no puede elegirlos.
REVOKE ALL ON FUNCTION public.activar_token(TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.activar_token_docente(TEXT, UUID, TEXT) FROM PUBLIC;
DROP FUNCTION public.activar_token(TEXT, UUID);
DROP FUNCTION public.activar_token_docente(TEXT, UUID, TEXT);

CREATE FUNCTION public.activar_token(p_token TEXT)
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
  v_updated public.tokens%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'autenticacion_requerida' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_profile
  FROM public.profiles
  WHERE id = v_uid;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'motivo', 'perfil_no_encontrado');
  END IF;

  SELECT * INTO v_token
  FROM public.tokens
  WHERE id = upper(trim(p_token));

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'motivo', 'token_invalido');
  END IF;

  IF v_token.expira_en IS NOT NULL AND now() > v_token.expira_en THEN
    RETURN json_build_object('ok', false, 'motivo', 'expirado');
  END IF;

  IF v_token.tipo IS DISTINCT FROM 'libro' THEN
    RETURN json_build_object('ok', false, 'motivo', 'tipo_incorrecto');
  END IF;

  IF v_token.estado IS DISTINCT FROM 'valido' THEN
    RETURN json_build_object('ok', false, 'motivo', 'token_no_disponible');
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
    SELECT 1
    FROM public.escuela_libros
    WHERE escuela_id = v_token.escuela_id
      AND libro_id = v_token.libro_id
  ) THEN
    RETURN json_build_object('ok', false, 'motivo', 'libro_no_disponible_en_escuela');
  END IF;

  SELECT * INTO v_libro
  FROM public.libros
  WHERE id = v_token.libro_id;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'motivo', 'libro_no_encontrado');
  END IF;

  IF v_libro.grado_id IS NOT NULL
     AND v_libro.grado_id IS DISTINCT FROM v_token.grado_id THEN
    RETURN json_build_object('ok', false, 'motivo', 'grado_no_coincide');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.libro_activaciones
    WHERE usuario_id = v_uid AND libro_id = v_token.libro_id
  ) THEN
    RETURN json_build_object('ok', false, 'motivo', 'ya_tienes_libro');
  END IF;

  UPDATE public.tokens
  SET estado = 'activado',
      usuario_id = v_uid,
      activado_en = now()
  WHERE id = v_token.id
    AND estado = 'valido'
  RETURNING * INTO v_updated;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'motivo', 'token_no_disponible');
  END IF;

  UPDATE public.profiles
  SET escuela_id = COALESCE(escuela_id, v_token.escuela_id),
      grado_id = COALESCE(grado_id, v_token.grado_id)
  WHERE id = v_uid;

  INSERT INTO public.libro_activaciones (usuario_id, libro_id, token_id)
  VALUES (v_uid, v_updated.libro_id, v_updated.id);

  RETURN json_build_object('ok', true, 'libro_id', v_updated.libro_id);
END;
$$;

CREATE FUNCTION public.activar_token_docente(p_token TEXT)
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
  v_updated public.tokens%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'autenticacion_requerida' USING ERRCODE = '42501';
  END IF;

  SELECT lower(email) INTO v_email
  FROM auth.users
  WHERE id = v_uid;

  SELECT * INTO v_profile
  FROM public.profiles
  WHERE id = v_uid;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'motivo', 'perfil_no_encontrado');
  END IF;

  SELECT * INTO v_token
  FROM public.tokens
  WHERE id = upper(trim(p_token));

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'motivo', 'token_invalido');
  END IF;

  IF v_token.expira_en IS NOT NULL AND now() > v_token.expira_en THEN
    RETURN json_build_object('ok', false, 'motivo', 'expirado');
  END IF;

  IF v_token.tipo IS DISTINCT FROM 'docente' THEN
    RETURN json_build_object('ok', false, 'motivo', 'tipo_incorrecto');
  END IF;

  IF v_token.estado IS DISTINCT FROM 'valido' THEN
    RETURN json_build_object('ok', false, 'motivo', 'token_no_disponible');
  END IF;

  IF lower(trim(v_token.email_autorizado)) IS DISTINCT FROM v_email THEN
    RETURN json_build_object('ok', false, 'motivo', 'email_no_autorizado');
  END IF;

  IF v_profile.escuela_id IS NOT NULL
     AND v_profile.escuela_id IS DISTINCT FROM v_token.escuela_id THEN
    RETURN json_build_object('ok', false, 'motivo', 'escuela_incorrecta');
  END IF;

  UPDATE public.tokens
  SET estado = 'activado',
      usuario_id = v_uid,
      activado_en = now()
  WHERE id = v_token.id
    AND estado = 'valido'
  RETURNING * INTO v_updated;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'motivo', 'token_no_disponible');
  END IF;

  UPDATE public.profiles
  SET rol = 'docente',
      escuela_id = COALESCE(escuela_id, v_token.escuela_id)
  WHERE id = v_uid;

  RETURN json_build_object('ok', true, 'escuela_id', v_updated.escuela_id);
END;
$$;

REVOKE ALL ON FUNCTION public.activar_token(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.activar_token_docente(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.activar_token(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.activar_token_docente(TEXT) TO authenticated;

-- Solo un docente puede crear clases, y únicamente en su escuela.
CREATE OR REPLACE FUNCTION public.crear_clase(p_nombre TEXT, p_grado_id INTEGER)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_profile  public.profiles%ROWTYPE;
  v_codigo   TEXT;
  v_clase_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'autenticacion_requerida' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_profile
  FROM public.profiles
  WHERE id = auth.uid();

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
    v_codigo := upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.clases WHERE codigo = v_codigo);
  END LOOP;

  INSERT INTO public.clases (nombre, grado_id, escuela_id, docente_id, codigo)
  VALUES (trim(p_nombre), p_grado_id, v_profile.escuela_id, auth.uid(), v_codigo)
  RETURNING id INTO v_clase_id;

  RETURN json_build_object(
    'ok', true,
    'clase_id', v_clase_id,
    'codigo', v_codigo,
    'escuela_id', v_profile.escuela_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.crear_clase(TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crear_clase(TEXT, INTEGER) TO authenticated;

-- Buscar y unirse exige un perfil estudiante completamente asignado.
-- Los NULL ya no permiten saltarse las fronteras de escuela o grado.
CREATE OR REPLACE FUNCTION public.buscar_clase_para_unirse(p_codigo TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_clase   public.clases%ROWTYPE;
  v_profile public.profiles%ROWTYPE;
  v_libros  JSON;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'autenticacion_requerida' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_profile
  FROM public.profiles
  WHERE id = auth.uid();

  IF NOT FOUND
     OR v_profile.rol IS DISTINCT FROM 'estudiante'
     OR v_profile.escuela_id IS NULL
     OR v_profile.grado_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'perfil_incompleto');
  END IF;

  SELECT * INTO v_clase
  FROM public.clases
  WHERE codigo = upper(trim(p_codigo))
    AND activa = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'no_encontrada');
  END IF;

  IF v_clase.escuela_id IS DISTINCT FROM v_profile.escuela_id THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'escuela_incorrecta');
  END IF;

  IF v_clase.grado_id IS DISTINCT FROM v_profile.grado_id THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'grado_incorrecto');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.inscripciones
    WHERE clase_id = v_clase.id
      AND estudiante_id = auth.uid()
  ) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'ya_inscrito');
  END IF;

  SELECT json_agg(
    jsonb_build_object('libroId', libro_id, 'libroTitulo', libro_titulo)
  )
  INTO v_libros
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
  v_clase   public.clases%ROWTYPE;
  v_profile public.profiles%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'autenticacion_requerida' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_profile
  FROM public.profiles
  WHERE id = auth.uid();

  IF NOT FOUND
     OR v_profile.rol IS DISTINCT FROM 'estudiante'
     OR v_profile.escuela_id IS NULL
     OR v_profile.grado_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'perfil_incompleto');
  END IF;

  SELECT * INTO v_clase
  FROM public.clases
  WHERE codigo = upper(trim(p_codigo))
    AND activa = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'no_encontrada');
  END IF;

  IF v_clase.escuela_id IS DISTINCT FROM v_profile.escuela_id THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'escuela_incorrecta');
  END IF;

  IF v_clase.grado_id IS DISTINCT FROM v_profile.grado_id THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'grado_incorrecto');
  END IF;

  INSERT INTO public.inscripciones (clase_id, estudiante_id)
  VALUES (v_clase.id, auth.uid())
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.buscar_clase_para_unirse(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.unirse_clase(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.buscar_clase_para_unirse(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unirse_clase(TEXT) TO authenticated;

-- clase_libros estaba expuesta a cualquier usuario autenticado.
ALTER TABLE public.clase_libros ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clase_libros_docente_all" ON public.clase_libros;
DROP POLICY IF EXISTS "clase_libros_estudiante_read" ON public.clase_libros;
DROP POLICY IF EXISTS "clase_libros_admin_all" ON public.clase_libros;
DROP POLICY IF EXISTS "authenticated_leer_clase_libros" ON public.clase_libros;
DROP POLICY IF EXISTS "docentes_eliminar_clase_libros" ON public.clase_libros;
DROP POLICY IF EXISTS "docentes_insertar_clase_libros" ON public.clase_libros;

CREATE POLICY "clase_libros_docente_all" ON public.clase_libros
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.clases c
      WHERE c.id = clase_libros.clase_id
        AND c.docente_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.clases c
      JOIN public.escuela_libros el
        ON el.escuela_id = c.escuela_id
       AND el.libro_id = clase_libros.libro_id
      WHERE c.id = clase_libros.clase_id
        AND c.docente_id = auth.uid()
    )
  );

CREATE POLICY "clase_libros_estudiante_read" ON public.clase_libros
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.inscripciones i
      WHERE i.clase_id = clase_libros.clase_id
        AND i.estudiante_id = auth.uid()
    )
  );

CREATE POLICY "clase_libros_admin_all" ON public.clase_libros
  FOR ALL TO authenticated
  USING (public.es_admin())
  WITH CHECK (public.es_admin());

-- La vista respeta ahora las políticas RLS de las tablas subyacentes.
ALTER VIEW public.progreso_clase SET (security_invoker = true);

-- El contenido pedagógico deja de ser anónimo. El catálogo de libros puede
-- seguir siendo visible, pero unidades y actividades exigen licencia/rol.
DROP POLICY IF EXISTS "unidades_read" ON public.unidades;
DROP POLICY IF EXISTS "actividades_read" ON public.actividades;

CREATE POLICY "unidades_authorized_read" ON public.unidades
  FOR SELECT TO authenticated
  USING (public.puede_acceder_libro(libro_id));

CREATE POLICY "actividades_authorized_read" ON public.actividades
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.unidades u
      WHERE u.id = actividades.unidad_id
        AND public.puede_acceder_libro(u.libro_id)
    )
  );

REVOKE ALL PRIVILEGES ON public.unidades, public.actividades FROM anon;

-- La función desplegada puede devolver JSONB aunque el esquema base indique
-- JSON. PostgreSQL no permite cambiar el retorno con CREATE OR REPLACE.
REVOKE ALL ON FUNCTION public.get_libro_completo(TEXT) FROM PUBLIC;
DROP FUNCTION public.get_libro_completo(TEXT);

CREATE FUNCTION public.get_libro_completo(p_libro_id TEXT)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_result JSON;
BEGIN
  IF NOT public.puede_acceder_libro(p_libro_id) THEN
    RAISE EXCEPTION 'acceso_denegado' USING ERRCODE = '42501';
  END IF;

  SELECT json_build_object(
    'libro', row_to_json(l),
    'unidades', COALESCE(json_agg(
      json_build_object(
        'id', u.id,
        'titulo', u.titulo,
        'etiqueta', u.etiqueta,
        'subtitulo', u.subtitulo,
        'emoji', u.emoji,
        'orden', u.orden,
        'actividades', (
          SELECT COALESCE(json_agg(row_to_json(a) ORDER BY a.orden), '[]')
          FROM public.actividades a
          WHERE a.unidad_id = u.id
        )
      ) ORDER BY u.orden
    ) FILTER (WHERE u.id IS NOT NULL), '[]')
  )
  INTO v_result
  FROM public.libros l
  LEFT JOIN public.unidades u ON u.libro_id = l.id
  WHERE l.id = p_libro_id
  GROUP BY l.id;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_libro_completo(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_libro_completo(TEXT) TO authenticated;

COMMIT;
