


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."activar_token"("p_token" "text") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
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


ALTER FUNCTION "public"."activar_token"("p_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."activar_token_docente"("p_token" "text") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'auth'
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


ALTER FUNCTION "public"."activar_token_docente"("p_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_cambiar_rol_usuario"("p_usuario_id" "uuid", "p_rol" "text") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'auth'
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


ALTER FUNCTION "public"."admin_cambiar_rol_usuario"("p_usuario_id" "uuid", "p_rol" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_crear_tokens_docente"("p_escuela_id" "uuid", "p_emails" "text"[], "p_expira_en" timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'auth', 'extensions'
    AS $_$
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
      v_token_id := public.generar_token_128('TD');
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
      'formato', '128_bits'
    )
  );
  RETURN v_ids;
END;
$_$;


ALTER FUNCTION "public"."admin_crear_tokens_docente"("p_escuela_id" "uuid", "p_emails" "text"[], "p_expira_en" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_crear_tokens_libro"("p_escuela_id" "uuid", "p_libro_id" "text", "p_grado_id" integer, "p_cantidad" integer, "p_expira_en" timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'auth', 'extensions'
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
      v_token_id := public.generar_token_128('TL');
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
      'formato', '128_bits'
    )
  );
  RETURN v_ids;
END;
$$;


ALTER FUNCTION "public"."admin_crear_tokens_libro"("p_escuela_id" "uuid", "p_libro_id" "text", "p_grado_id" integer, "p_cantidad" integer, "p_expira_en" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_solicitar_accion_sensible"("p_tipo" "text", "p_payload" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'auth'
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


ALTER FUNCTION "public"."admin_solicitar_accion_sensible"("p_tipo" "text", "p_payload" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_solicitar_accion_sensible_v2"("p_tipo" "text", "p_payload" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'auth'
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


ALTER FUNCTION "public"."admin_solicitar_accion_sensible_v2"("p_tipo" "text", "p_payload" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."auditar_actividad_admin"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
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


ALTER FUNCTION "public"."auditar_actividad_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."bloquear_desactivacion_directa"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'auth'
    AS $$
DECLARE
  v_old JSONB := to_jsonb(OLD);
  v_new JSONB := to_jsonb(NEW);
  v_antes_activo BOOLEAN;
  v_despues_activo BOOLEAN;
BEGIN
  IF TG_TABLE_SCHEMA <> 'public'
     OR TG_TABLE_NAME NOT IN ('escuelas', 'libros') THEN
    RAISE EXCEPTION 'tabla_no_permitida_para_trigger'
      USING ERRCODE = '55000';
  END IF;

  v_antes_activo := CASE TG_TABLE_NAME
    WHEN 'escuelas' THEN (v_old ->> 'activa')::boolean
    WHEN 'libros' THEN (v_old ->> 'activo')::boolean
  END;
  v_despues_activo := CASE TG_TABLE_NAME
    WHEN 'escuelas' THEN (v_new ->> 'activa')::boolean
    WHEN 'libros' THEN (v_new ->> 'activo')::boolean
  END;

  IF v_antes_activo
     AND NOT v_despues_activo
     AND COALESCE(auth.jwt() ->> 'role', '') <> 'service_role'
     AND current_setting('app.fase3_aprobada', true) IS DISTINCT FROM 'si' THEN
    RAISE EXCEPTION 'aprobacion_requerida' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."bloquear_desactivacion_directa"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."buscar_clase_para_unirse"("p_codigo" "text") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
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


ALTER FUNCTION "public"."buscar_clase_para_unirse"("p_codigo" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."campos_publicos_actividad"("p_tipo" "text", "p_campos" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  v_campos JSONB := COALESCE(p_campos, '{}'::jsonb);
  v_evaluable BOOLEAN := false;
  v_lineas JSONB;
BEGIN
  IF p_tipo <> 'acrostico' THEN
    RETURN public.campos_publicos_actividad_pre_acrostic(p_tipo, v_campos);
  END IF;

  IF jsonb_typeof(v_campos -> 'lineas') = 'array' THEN
    SELECT
      COALESCE((v_campos ->> 'modoEvaluable')::boolean, false)
        OR COALESCE(bool_or(
        btrim(COALESCE(linea ->> 'respuesta', linea ->> 'correcta', '')) <> ''
      ), false),
      jsonb_agg(
        linea - 'respuesta' - 'correcta' - 'respuestaCorrecta' - 'esCorrecta'
        ORDER BY n
      )
    INTO v_evaluable, v_lineas
    FROM jsonb_array_elements(v_campos -> 'lineas')
      WITH ORDINALITY AS l(linea, n);

    v_campos := jsonb_set(
      v_campos,
      '{lineas}',
      COALESCE(v_lineas, '[]'::jsonb)
    );
  END IF;

  RETURN v_campos || jsonb_build_object(
    'evaluacionServidor', v_evaluable
  );
END;
$$;


ALTER FUNCTION "public"."campos_publicos_actividad"("p_tipo" "text", "p_campos" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."campos_publicos_actividad_pre_acrostic"("p_tipo" "text", "p_campos" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  v_campos JSONB := COALESCE(p_campos, '{}'::jsonb);
BEGIN
  IF p_tipo <> 'separarSilabas' THEN
    RETURN public.campos_publicos_actividad_pre_syllables(p_tipo, v_campos);
  END IF;

  IF jsonb_typeof(v_campos -> 'palabras') IS DISTINCT FROM 'array' THEN
    RETURN v_campos;
  END IF;

  RETURN jsonb_set(v_campos, '{palabras}', COALESCE((
    SELECT jsonb_agg(
      item
        - 'silabas'
        - 'respuesta'
        - 'correcta'
        - 'cantidad'
        - 'numSilabas'
        - 'numero'
        - 'esCorrecta'
      ORDER BY n
    )
    FROM jsonb_array_elements(v_campos -> 'palabras')
      WITH ORDINALITY AS p(item, n)
  ), '[]'::jsonb));
END;
$$;


ALTER FUNCTION "public"."campos_publicos_actividad_pre_acrostic"("p_tipo" "text", "p_campos" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."campos_publicos_actividad_pre_crossword"("p_tipo" "text", "p_campos" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  v_campos JSONB := COALESCE(p_campos, '{}'::jsonb);
  v_izquierdas JSONB;
  v_derechas JSONB;
  v_total INTEGER;
BEGIN
  IF p_tipo = 'emparejar'
     AND jsonb_typeof(v_campos -> 'pares') = 'array' THEN
    v_total := jsonb_array_length(v_campos -> 'pares');

    -- Publica dos bancos independientes. La derecha se rota para que ni
    -- siquiera la posición entre ambos arreglos permita reconstruir parejas.
    IF v_total > 1 THEN
      SELECT jsonb_agg(par -> 'izquierda' ORDER BY n)
      INTO v_izquierdas
      FROM jsonb_array_elements(v_campos -> 'pares')
        WITH ORDINALITY AS izquierdo(par, n);

      SELECT jsonb_agg(derecho.par -> 'derecha' ORDER BY izquierdo.n)
      INTO v_derechas
      FROM jsonb_array_elements(v_campos -> 'pares')
        WITH ORDINALITY AS izquierdo(par, n)
      JOIN jsonb_array_elements(v_campos -> 'pares')
        WITH ORDINALITY AS derecho(par, n)
        ON derecho.n = (izquierdo.n % v_total) + 1;

      RETURN (v_campos - 'pares') || jsonb_build_object(
        'elementosIzquierda', COALESCE(v_izquierdas, '[]'::jsonb),
        'elementosDerecha', COALESCE(v_derechas, '[]'::jsonb)
      );
    END IF;

    -- Una sola pareja no puede publicarse sin revelar la solución.
    RETURN (v_campos - 'pares') || jsonb_build_object(
      'elementosIzquierda', '[]'::jsonb,
      'elementosDerecha', '[]'::jsonb
    );
  END IF;

  IF p_tipo = 'clasificacionCategorias' THEN
    IF jsonb_typeof(v_campos -> 'items') = 'array' THEN
      v_campos := jsonb_set(v_campos, '{items}', COALESCE((
        SELECT jsonb_agg(
          item
            - 'categoriaId'
            - 'categoria'
            - 'respuesta'
            - 'esCorrecta'
            - 'categoriaCorrecta'
            - 'categoriaCorrectaId'
          ORDER BY n
        )
        FROM jsonb_array_elements(v_campos -> 'items')
          WITH ORDINALITY AS i(item, n)
      ), '[]'::jsonb));
    END IF;

    IF jsonb_typeof(v_campos -> 'elementos') = 'array' THEN
      v_campos := jsonb_set(v_campos, '{elementos}', COALESCE((
        SELECT jsonb_agg(
          item
            - 'categoriaId'
            - 'categoria'
            - 'respuesta'
            - 'esCorrecta'
            - 'categoriaCorrecta'
            - 'categoriaCorrectaId'
          ORDER BY n
        )
        FROM jsonb_array_elements(v_campos -> 'elementos')
          WITH ORDINALITY AS i(item, n)
      ), '[]'::jsonb));
    END IF;

    RETURN v_campos;
  END IF;

  RETURN public.campos_publicos_actividad_pre_matching(p_tipo, v_campos);
END;
$$;


ALTER FUNCTION "public"."campos_publicos_actividad_pre_crossword"("p_tipo" "text", "p_campos" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."campos_publicos_actividad_pre_matching"("p_tipo" "text", "p_campos" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  v_campos JSONB := COALESCE(p_campos, '{}'::jsonb);
  v_texto TEXT;
  v_palabras JSONB;
  v_palabras_originales JSONB;
  v_eventos JSONB;
  v_eventos_originales JSONB;
BEGIN
  IF p_tipo IN (
    'seleccionMultiple', 'identificar', 'selectorEmocionColor'
  ) AND jsonb_typeof(v_campos -> 'opciones') = 'array' THEN
    RETURN jsonb_set(v_campos, '{opciones}', COALESCE((
      SELECT jsonb_agg(opcion - 'esCorrecta' ORDER BY n)
      FROM jsonb_array_elements(v_campos -> 'opciones')
        WITH ORDINALITY AS o(opcion, n)
    ), '[]'::jsonb));
  END IF;

  IF p_tipo = 'verdaderoFalso'
     AND jsonb_typeof(v_campos -> 'afirmaciones') = 'array' THEN
    RETURN jsonb_set(v_campos, '{afirmaciones}', COALESCE((
      SELECT jsonb_agg(afirmacion - 'esVerdadero' ORDER BY n)
      FROM jsonb_array_elements(v_campos -> 'afirmaciones')
        WITH ORDINALITY AS a(afirmacion, n)
    ), '[]'::jsonb));
  END IF;

  IF p_tipo = 'lineaTiempoEmocional'
     AND jsonb_typeof(v_campos -> 'momentos') = 'array' THEN
    RETURN jsonb_set(v_campos, '{momentos}', COALESCE((
      SELECT jsonb_agg(
        momento || jsonb_build_object('opciones', COALESCE((
          SELECT jsonb_agg(opcion - 'esCorrecta' ORDER BY opcion_n)
          FROM jsonb_array_elements(
            COALESCE(momento -> 'opciones', '[]'::jsonb)
          ) WITH ORDINALITY AS o(opcion, opcion_n)
        ), '[]'::jsonb))
        ORDER BY momento_n
      )
      FROM jsonb_array_elements(v_campos -> 'momentos')
        WITH ORDINALITY AS m(momento, momento_n)
    ), '[]'::jsonb));
  END IF;

  IF p_tipo = 'completarPalabras' THEN
    v_texto := regexp_replace(
      COALESCE(v_campos ->> 'texto', ''),
      '\[[^]\n]+\]', '[___]', 'g'
    );
    v_texto := regexp_replace(v_texto, '\{\{[^}\n]+\}\}', '{{___}}', 'g');
    v_campos := jsonb_set(v_campos, '{texto}', to_jsonb(v_texto));
    IF jsonb_typeof(v_campos -> 'respuestas') = 'array' THEN
      v_campos := jsonb_set(v_campos, '{respuestas}', COALESCE((
        SELECT jsonb_agg('___'::text ORDER BY n)
        FROM jsonb_array_elements(v_campos -> 'respuestas')
          WITH ORDINALITY AS r(valor, n)
      ), '[]'::jsonb));
    END IF;
    RETURN v_campos;
  END IF;

  IF p_tipo = 'ordenarEventos'
     AND jsonb_typeof(v_campos -> 'eventos') = 'array' THEN
    SELECT
      jsonb_agg(evento_publico ORDER BY n),
      jsonb_agg(evento_publico ORDER BY md5(evento_publico::text))
    INTO v_eventos_originales, v_eventos
    FROM (
      SELECT evento - 'orden' - 'id' AS evento_publico, n
      FROM jsonb_array_elements(v_campos -> 'eventos')
        WITH ORDINALITY AS e(evento, n)
    ) eventos_publicos;

    IF v_eventos = v_eventos_originales
       AND jsonb_array_length(v_eventos) > 1 THEN
      SELECT jsonb_agg(evento - 'orden' - 'id' ORDER BY n DESC)
      INTO v_eventos
      FROM jsonb_array_elements(v_campos -> 'eventos')
        WITH ORDINALITY AS e(evento, n);
    END IF;

    RETURN jsonb_set(
      v_campos, '{eventos}', COALESCE(v_eventos, '[]'::jsonb)
    );
  END IF;

  IF p_tipo = 'ordenarPalabras' THEN
    IF jsonb_typeof(v_campos -> 'palabras') = 'array' THEN
      SELECT
        jsonb_agg(to_jsonb(palabra) ORDER BY n),
        jsonb_agg(to_jsonb(palabra) ORDER BY md5(palabra))
      INTO v_palabras_originales, v_palabras
      FROM jsonb_array_elements_text(v_campos -> 'palabras')
        WITH ORDINALITY AS p(palabra, n);
    ELSE
      SELECT
        jsonb_agg(to_jsonb(palabra) ORDER BY n),
        jsonb_agg(to_jsonb(palabra) ORDER BY md5(palabra))
      INTO v_palabras_originales, v_palabras
      FROM unnest(
        regexp_split_to_array(trim(COALESCE(v_campos ->> 'fraseCorrecta', '')), '\s+')
      ) WITH ORDINALITY AS p(palabra, n)
      WHERE palabra <> '';
    END IF;

    IF v_palabras = v_palabras_originales
       AND jsonb_array_length(v_palabras) > 1 THEN
      SELECT jsonb_agg(value ORDER BY n DESC)
      INTO v_palabras
      FROM jsonb_array_elements(v_palabras_originales)
        WITH ORDINALITY AS p(value, n);
    END IF;

    RETURN (v_campos - 'fraseCorrecta')
      || jsonb_build_object('palabras', COALESCE(v_palabras, '[]'::jsonb));
  END IF;

  RETURN v_campos;
END;
$$;


ALTER FUNCTION "public"."campos_publicos_actividad_pre_matching"("p_tipo" "text", "p_campos" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."campos_publicos_actividad_pre_syllables"("p_tipo" "text", "p_campos" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  v_campos JSONB := COALESCE(p_campos, '{}'::jsonb);
  v_clave TEXT;
  v_publicas JSONB;
BEGIN
  IF p_tipo <> 'crucigrama' THEN
    RETURN public.campos_publicos_actividad_pre_crossword(p_tipo, v_campos);
  END IF;

  v_clave := CASE
    WHEN jsonb_typeof(v_campos -> 'palabras') = 'array' THEN 'palabras'
    WHEN jsonb_typeof(v_campos -> 'words') = 'array' THEN 'words'
    ELSE NULL
  END;

  IF v_clave IS NULL THEN
    RETURN v_campos;
  END IF;

  SELECT jsonb_agg(
    (palabra - 'w' - 'palabra' - 'texto' - 'respuesta' - 'correcta')
      || jsonb_build_object(
        'id', COALESCE(palabra ->> 'id', 'palabra-' || n::text),
        'longitud', char_length(public.normalizar_crucigrama_texto(COALESCE(
          palabra ->> 'w',
          palabra ->> 'palabra',
          palabra ->> 'texto'
        )))
      )
    ORDER BY n
  )
  INTO v_publicas
  FROM jsonb_array_elements(v_campos -> v_clave)
    WITH ORDINALITY AS p(palabra, n);

  RETURN jsonb_set(
    v_campos - CASE WHEN v_clave = 'palabras' THEN 'words' ELSE 'palabras' END,
    ARRAY[v_clave],
    COALESCE(v_publicas, '[]'::jsonb)
  );
END;
$$;


ALTER FUNCTION "public"."campos_publicos_actividad_pre_syllables"("p_tipo" "text", "p_campos" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."consumir_limite_progreso"("p_usuario_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  v_ahora TIMESTAMPTZ := clock_timestamp();
  v_operaciones INTEGER;
BEGIN
  INSERT INTO public.limites_progreso (
    usuario_id, ventana_inicio, operaciones, actualizado_en
  )
  VALUES (p_usuario_id, v_ahora, 1, v_ahora)
  ON CONFLICT (usuario_id) DO UPDATE
  SET
    ventana_inicio = CASE
      WHEN public.limites_progreso.ventana_inicio <= v_ahora - interval '1 minute'
        THEN v_ahora
      ELSE public.limites_progreso.ventana_inicio
    END,
    operaciones = CASE
      WHEN public.limites_progreso.ventana_inicio <= v_ahora - interval '1 minute'
        THEN 1
      ELSE public.limites_progreso.operaciones + 1
    END,
    actualizado_en = v_ahora
  RETURNING operaciones INTO v_operaciones;

  IF v_operaciones > 30 THEN
    RAISE EXCEPTION 'limite_progreso_excedido'
      USING ERRCODE = 'P0001';
  END IF;
END;
$$;


ALTER FUNCTION "public"."consumir_limite_progreso"("p_usuario_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."crear_clase"("p_nombre" "text", "p_grado_id" integer) RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
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
    -- Diez caracteres hexadecimales = 40 bits de espacio de búsqueda. La
    -- restricción UNIQUE sigue siendo la protección definitiva ante colisión.
    v_codigo := upper(substring(
      replace(gen_random_uuid()::text, '-', ''),
      1,
      10
    ));
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.clases WHERE codigo = v_codigo
    );
  END LOOP;

  INSERT INTO public.clases(nombre, grado_id, escuela_id, docente_id, codigo)
  VALUES (
    trim(p_nombre),
    p_grado_id,
    v_profile.escuela_id,
    auth.uid(),
    v_codigo
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


ALTER FUNCTION "public"."crear_clase"("p_nombre" "text", "p_grado_id" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."es_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid() AND rol = 'admin'
  );
$$;


ALTER FUNCTION "public"."es_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."es_superadministrador"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'auth'
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


ALTER FUNCTION "public"."es_superadministrador"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."evaluar_detalle_separar_silabas"("p_actividad_id" "text", "p_respuesta" "jsonb") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_tipo TEXT;
  v_campos JSONB;
  v_libro_id TEXT;
  v_resultados JSONB;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'autenticacion_requerida' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_uid AND rol = 'estudiante'
  ) THEN
    RAISE EXCEPTION 'solo_estudiantes_evalúan_respuestas'
      USING ERRCODE = '42501';
  END IF;

  PERFORM public.validar_payload_respuesta(p_respuesta);

  SELECT a.tipo, a.campos, u.libro_id
  INTO v_tipo, v_campos, v_libro_id
  FROM public.actividades a
  JOIN public.unidades u ON u.id = a.unidad_id
  WHERE a.id = p_actividad_id;

  IF NOT FOUND OR v_tipo <> 'separarSilabas' THEN
    RAISE EXCEPTION 'actividad_invalida' USING ERRCODE = '22023';
  END IF;

  IF NOT public.puede_acceder_libro(v_libro_id) THEN
    RAISE EXCEPTION 'licencia_requerida' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'id', COALESCE(esperado.item ->> 'id', 'palabra-' || esperado.n::text),
      'separacionValida', EXISTS (
        SELECT 1
        FROM jsonb_array_elements(
          COALESCE(p_respuesta -> 'respuestas', '[]'::jsonb)
        ) recibido(item)
        WHERE recibido.item ->> 'id' = COALESCE(
          esperado.item ->> 'id',
          'palabra-' || esperado.n::text
        )
          AND public.normalizar_separacion_silabas(
            recibido.item ->> 'silabasDadas'
          ) = public.normalizar_separacion_silabas(COALESCE(
            esperado.item ->> 'silabas',
            esperado.item ->> 'respuesta',
            esperado.item ->> 'correcta'
          ))
      ),
      'cantidadValida', EXISTS (
        SELECT 1
        FROM jsonb_array_elements(
          COALESCE(p_respuesta -> 'respuestas', '[]'::jsonb)
        ) recibido(item)
        WHERE recibido.item ->> 'id' = COALESCE(
          esperado.item ->> 'id',
          'palabra-' || esperado.n::text
        )
          AND COALESCE(recibido.item ->> 'cantidadDada', '') = COALESCE(
            esperado.item ->> 'cantidad',
            esperado.item ->> 'numSilabas',
            esperado.item ->> 'numero',
            array_length(string_to_array(
              public.normalizar_separacion_silabas(COALESCE(
                esperado.item ->> 'silabas',
                esperado.item ->> 'respuesta',
                esperado.item ->> 'correcta'
              )),
              '-'
            ), 1)::text
          )
      )
    )
    ORDER BY esperado.n
  )
  INTO v_resultados
  FROM jsonb_array_elements(v_campos -> 'palabras')
    WITH ORDINALITY AS esperado(item, n);

  RETURN json_build_object(
    'ok', true,
    'resultados', COALESCE(v_resultados, '[]'::jsonb)
  );
END;
$$;


ALTER FUNCTION "public"."evaluar_detalle_separar_silabas"("p_actividad_id" "text", "p_respuesta" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."evaluar_intento_actividad"("p_actividad_id" "text", "p_respuesta" "jsonb") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_rol TEXT;
  v_unidad_id TEXT;
  v_libro_id TEXT;
  v_tipo TEXT;
  v_campos JSONB;
  v_es_correcta BOOLEAN;
  v_intentos INTEGER;
  v_max_intentos INTEGER;
  v_completada BOOLEAN;
  v_ya_completada BOOLEAN;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'autenticacion_requerida' USING ERRCODE = '42501';
  END IF;

  SELECT rol INTO v_rol
  FROM public.profiles
  WHERE id = v_uid;

  IF v_rol IS DISTINCT FROM 'estudiante' THEN
    RAISE EXCEPTION 'solo_estudiantes_envian_intentos'
      USING ERRCODE = '42501';
  END IF;

  IF length(COALESCE(p_actividad_id, '')) > 160 THEN
    RAISE EXCEPTION 'actividad_id_invalido' USING ERRCODE = '22023';
  END IF;

  PERFORM public.validar_payload_respuesta(p_respuesta);
  PERFORM public.consumir_limite_progreso(v_uid);

  SELECT
    a.unidad_id,
    u.libro_id,
    a.tipo,
    COALESCE(a.campos, '{}'::jsonb)
  INTO v_unidad_id, v_libro_id, v_tipo, v_campos
  FROM public.actividades a
  JOIN public.unidades u ON u.id = a.unidad_id
  WHERE a.id = p_actividad_id;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'motivo', 'actividad_no_encontrada');
  END IF;

  IF NOT public.puede_acceder_libro(v_libro_id) THEN
    RAISE EXCEPTION 'licencia_requerida' USING ERRCODE = '42501';
  END IF;

  v_es_correcta := public.evaluar_respuesta_actividad(
    v_tipo, v_campos, p_respuesta
  );

  IF v_es_correcta IS NULL THEN
    RETURN json_build_object(
      'ok', false,
      'motivo', 'actividad_no_evaluable',
      'actividad_id', p_actividad_id
    );
  END IF;

  v_max_intentos := LEAST(
    GREATEST(COALESCE((v_campos ->> 'maxIntentos')::integer, 2), 1),
    10
  );

  SELECT completada INTO v_ya_completada
  FROM public.intentos_actividad
  WHERE usuario_id = v_uid
    AND actividad_id = p_actividad_id
  FOR UPDATE;

  IF COALESCE(v_ya_completada, false) THEN
    SELECT intentos, ultimo_resultado
    INTO v_intentos, v_es_correcta
    FROM public.intentos_actividad
    WHERE usuario_id = v_uid
      AND actividad_id = p_actividad_id;

    RETURN json_build_object(
      'ok', true,
      'actividad_id', p_actividad_id,
      'es_correcta', v_es_correcta,
      'intentos', v_intentos,
      'max_intentos', v_max_intentos,
      'agotado', NOT COALESCE(v_es_correcta, false),
      'completada', true,
      'ya_completada', true
    );
  END IF;

  INSERT INTO public.intentos_actividad (
    usuario_id,
    actividad_id,
    intentos,
    ultimo_resultado,
    completada,
    actualizado_en
  )
  VALUES (
    v_uid,
    p_actividad_id,
    1,
    v_es_correcta,
    v_es_correcta,
    now()
  )
  ON CONFLICT (usuario_id, actividad_id)
  DO UPDATE SET
    intentos = public.intentos_actividad.intentos + 1,
    ultimo_resultado = EXCLUDED.ultimo_resultado,
    completada = public.intentos_actividad.completada
      OR EXCLUDED.completada,
    actualizado_en = EXCLUDED.actualizado_en
  RETURNING intentos, completada
  INTO v_intentos, v_completada;

  IF v_intentos >= v_max_intentos THEN
    v_completada := true;
  END IF;

  IF v_completada THEN
    UPDATE public.intentos_actividad
    SET completada = true,
        actualizado_en = now()
    WHERE usuario_id = v_uid
      AND actividad_id = p_actividad_id;

    INSERT INTO public.actividad_progreso (
      usuario_id, actividad_id, completada_en
    )
    VALUES (v_uid, p_actividad_id, now())
    ON CONFLICT (usuario_id, actividad_id)
    DO UPDATE SET completada_en = EXCLUDED.completada_en;

    INSERT INTO public.progreso (usuario_id, libro_id, ultima_actividad)
    VALUES (v_uid, v_libro_id, now())
    ON CONFLICT (usuario_id, libro_id)
    DO UPDATE SET ultima_actividad = EXCLUDED.ultima_actividad;

    INSERT INTO public.respuestas (
      usuario_id,
      actividad_id,
      libro_id,
      unidad_id,
      respuesta,
      es_correcta,
      created_at
    )
    VALUES (
      v_uid,
      p_actividad_id,
      v_libro_id,
      v_unidad_id,
      p_respuesta,
      v_es_correcta,
      now()
    )
    ON CONFLICT (usuario_id, actividad_id)
    DO UPDATE SET
      libro_id = EXCLUDED.libro_id,
      unidad_id = EXCLUDED.unidad_id,
      respuesta = EXCLUDED.respuesta,
      es_correcta = EXCLUDED.es_correcta,
      created_at = EXCLUDED.created_at;
  END IF;

  RETURN json_build_object(
    'ok', true,
    'actividad_id', p_actividad_id,
    'es_correcta', v_es_correcta,
    'intentos', v_intentos,
    'max_intentos', v_max_intentos,
    'agotado', v_intentos >= v_max_intentos AND NOT v_es_correcta,
    'completada', v_completada,
    'ya_completada', false
  );
EXCEPTION
  WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RAISE EXCEPTION 'configuracion_intentos_invalida'
      USING ERRCODE = '22023';
END;
$$;


ALTER FUNCTION "public"."evaluar_intento_actividad"("p_actividad_id" "text", "p_respuesta" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."evaluar_respuesta_actividad"("p_tipo" "text", "p_campos" "jsonb", "p_respuesta" "jsonb") RETURNS boolean
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  v_evaluable BOOLEAN;
  v_esperadas INTEGER;
  v_recibidas INTEGER;
  v_incorrectas INTEGER;
BEGIN
  IF p_tipo <> 'acrostico' THEN
    RETURN public.evaluar_respuesta_actividad_pre_acrostic(
      p_tipo, p_campos, p_respuesta
    );
  END IF;

  IF jsonb_typeof(p_campos -> 'lineas') IS DISTINCT FROM 'array' THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE((p_campos ->> 'modoEvaluable')::boolean, false)
    OR COALESCE(bool_or(
    btrim(COALESCE(linea ->> 'respuesta', linea ->> 'correcta', '')) <> ''
  ), false)
  INTO v_evaluable
  FROM jsonb_array_elements(p_campos -> 'lineas') linea;

  IF NOT v_evaluable THEN
    RETURN NULL;
  END IF;

  IF jsonb_typeof(p_respuesta -> 'respuestas') IS DISTINCT FROM 'array' THEN
    RETURN NULL;
  END IF;

  SELECT count(*) INTO v_esperadas
  FROM jsonb_array_elements(p_campos -> 'lineas');
  SELECT count(*) INTO v_recibidas
  FROM jsonb_array_elements(p_respuesta -> 'respuestas');

  SELECT count(*) INTO v_incorrectas
  FROM jsonb_array_elements(p_campos -> 'lineas')
    WITH ORDINALITY AS esperado(linea, n)
  WHERE NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_respuesta -> 'respuestas') recibido(linea)
    WHERE recibido.linea ->> 'id' = COALESCE(
      esperado.linea ->> 'id',
      'linea-' || esperado.n::text
    )
      AND public.normalizar_crucigrama_texto(
        recibido.linea ->> 'texto'
      ) LIKE public.normalizar_crucigrama_texto(
        esperado.linea ->> 'letra'
      ) || '%'
  );

  RETURN v_esperadas > 0
    AND v_recibidas = v_esperadas
    AND v_incorrectas = 0;
END;
$$;


ALTER FUNCTION "public"."evaluar_respuesta_actividad"("p_tipo" "text", "p_campos" "jsonb", "p_respuesta" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."evaluar_respuesta_actividad_pre_acrostic"("p_tipo" "text", "p_campos" "jsonb", "p_respuesta" "jsonb") RETURNS boolean
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  v_esperadas INTEGER;
  v_recibidas INTEGER;
  v_incorrectas INTEGER;
BEGIN
  IF p_tipo <> 'separarSilabas' THEN
    RETURN public.evaluar_respuesta_actividad_pre_syllables(
      p_tipo, p_campos, p_respuesta
    );
  END IF;

  IF jsonb_typeof(p_campos -> 'palabras') IS DISTINCT FROM 'array'
     OR jsonb_typeof(p_respuesta -> 'respuestas') IS DISTINCT FROM 'array' THEN
    RETURN NULL;
  END IF;

  SELECT count(*) INTO v_esperadas
  FROM jsonb_array_elements(p_campos -> 'palabras');
  SELECT count(*) INTO v_recibidas
  FROM jsonb_array_elements(p_respuesta -> 'respuestas');

  SELECT count(*) INTO v_incorrectas
  FROM jsonb_array_elements(p_campos -> 'palabras')
    WITH ORDINALITY AS esperado(item, n)
  WHERE NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_respuesta -> 'respuestas') recibido(item)
    WHERE recibido.item ->> 'id' = COALESCE(
      esperado.item ->> 'id',
      'palabra-' || esperado.n::text
    )
      AND public.normalizar_separacion_silabas(
        recibido.item ->> 'silabasDadas'
      ) = public.normalizar_separacion_silabas(COALESCE(
        esperado.item ->> 'silabas',
        esperado.item ->> 'respuesta',
        esperado.item ->> 'correcta'
      ))
      AND COALESCE(recibido.item ->> 'cantidadDada', '') = COALESCE(
        esperado.item ->> 'cantidad',
        esperado.item ->> 'numSilabas',
        esperado.item ->> 'numero',
        array_length(string_to_array(
          public.normalizar_separacion_silabas(COALESCE(
            esperado.item ->> 'silabas',
            esperado.item ->> 'respuesta',
            esperado.item ->> 'correcta'
          )),
          '-'
        ), 1)::text
      )
  );

  RETURN v_esperadas > 0
    AND v_recibidas = v_esperadas
    AND v_incorrectas = 0;
END;
$$;


ALTER FUNCTION "public"."evaluar_respuesta_actividad_pre_acrostic"("p_tipo" "text", "p_campos" "jsonb", "p_respuesta" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."evaluar_respuesta_actividad_pre_crossword"("p_tipo" "text", "p_campos" "jsonb", "p_respuesta" "jsonb") RETURNS boolean
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  v_esperadas INTEGER;
  v_recibidas INTEGER;
  v_incorrectas INTEGER;
BEGIN
  IF p_respuesta IS NULL
     OR jsonb_typeof(p_respuesta) IS DISTINCT FROM 'object' THEN
    RETURN NULL;
  END IF;

  CASE p_tipo
    WHEN 'seleccionMultiple' THEN
      IF jsonb_typeof(p_campos -> 'opciones') IS DISTINCT FROM 'array' THEN
        RETURN NULL;
      END IF;

      SELECT count(*) INTO v_esperadas
      FROM jsonb_array_elements(p_campos -> 'opciones') WITH ORDINALITY AS o(item, n)
      WHERE COALESCE((item ->> 'esCorrecta')::boolean, false);

      -- Contrato anterior: una única respuesta se guardaba como texto.
      IF jsonb_typeof(p_respuesta -> 'seleccionadasIndices')
          IS DISTINCT FROM 'array' THEN
        IF COALESCE(p_respuesta ->> 'opcionElegida', '') = '' THEN
          RETURN NULL;
        END IF;

        RETURN v_esperadas = 1 AND EXISTS (
          SELECT 1
          FROM jsonb_array_elements(p_campos -> 'opciones') o
          WHERE COALESCE((o ->> 'esCorrecta')::boolean, false)
            AND public.normalizar_respuesta_texto(
              COALESCE(o ->> 'texto', o #>> '{}')
            ) = public.normalizar_respuesta_texto(
              p_respuesta ->> 'opcionElegida'
            )
        );
      END IF;

      SELECT count(DISTINCT value::integer) INTO v_recibidas
      FROM jsonb_array_elements_text(p_respuesta -> 'seleccionadasIndices');

      SELECT count(*) INTO v_incorrectas
      FROM jsonb_array_elements_text(p_respuesta -> 'seleccionadasIndices') s(value)
      WHERE NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(p_campos -> 'opciones') WITH ORDINALITY AS o(item, n)
        WHERE n - 1 = s.value::integer
          AND COALESCE((item ->> 'esCorrecta')::boolean, false)
      );

      RETURN v_recibidas = v_esperadas AND v_incorrectas = 0;

    WHEN 'verdaderoFalso' THEN
      IF jsonb_typeof(p_campos -> 'afirmaciones') IS DISTINCT FROM 'array'
         OR jsonb_typeof(p_respuesta -> 'respuestas') IS DISTINCT FROM 'array' THEN
        RETURN NULL;
      END IF;

      SELECT count(*) INTO v_esperadas
      FROM jsonb_array_elements(p_campos -> 'afirmaciones');
      SELECT count(*) INTO v_recibidas
      FROM jsonb_array_elements(p_respuesta -> 'respuestas');

      SELECT count(*) INTO v_incorrectas
      FROM jsonb_array_elements(p_campos -> 'afirmaciones')
        WITH ORDINALITY AS a(item, n)
      LEFT JOIN jsonb_array_elements(p_respuesta -> 'respuestas')
        WITH ORDINALITY AS r(item, n) USING (n)
      WHERE r.item IS NULL
         OR (r.item ->> 'respondio')::boolean
            IS DISTINCT FROM (a.item ->> 'esVerdadero')::boolean;

      RETURN v_esperadas > 0
        AND v_recibidas = v_esperadas
        AND v_incorrectas = 0;

    WHEN 'completarPalabras' THEN
      IF jsonb_typeof(p_campos -> 'respuestas') IS DISTINCT FROM 'array'
         OR jsonb_typeof(p_respuesta -> 'respuestas') IS DISTINCT FROM 'array' THEN
        RETURN NULL;
      END IF;

      SELECT count(*) INTO v_esperadas
      FROM jsonb_array_elements(p_campos -> 'respuestas');
      SELECT count(*) INTO v_recibidas
      FROM jsonb_array_elements(p_respuesta -> 'respuestas');

      SELECT count(*) INTO v_incorrectas
      FROM jsonb_array_elements_text(p_campos -> 'respuestas')
        WITH ORDINALITY AS a(valor, n)
      LEFT JOIN jsonb_array_elements(p_respuesta -> 'respuestas')
        WITH ORDINALITY AS r(item, n) USING (n)
      WHERE r.item IS NULL
         OR public.normalizar_respuesta_texto(r.item ->> 'dada')
            <> public.normalizar_respuesta_texto(a.valor);

      RETURN v_esperadas > 0
        AND v_recibidas = v_esperadas
        AND v_incorrectas = 0;

    WHEN 'ordenarPalabras' THEN
      IF COALESCE(p_respuesta ->> 'frase', '') = '' THEN
        RETURN NULL;
      END IF;
      RETURN public.normalizar_respuesta_texto(p_respuesta ->> 'frase')
        = public.normalizar_respuesta_texto(
          COALESCE(
            p_campos ->> 'fraseCorrecta',
            (
              SELECT string_agg(value, ' ' ORDER BY n)
              FROM jsonb_array_elements_text(p_campos -> 'palabras')
                WITH ORDINALITY AS w(value, n)
            )
          )
        );

    WHEN 'ordenarEventos' THEN
      IF jsonb_typeof(p_campos -> 'eventos') IS DISTINCT FROM 'array'
         OR jsonb_typeof(p_respuesta -> 'orden') IS DISTINCT FROM 'array' THEN
        RETURN NULL;
      END IF;

      SELECT count(*) INTO v_esperadas
      FROM jsonb_array_elements(p_campos -> 'eventos');
      SELECT count(*) INTO v_recibidas
      FROM jsonb_array_elements(p_respuesta -> 'orden');

      SELECT count(*) INTO v_incorrectas
      FROM (
        SELECT item ->> 'texto' AS texto,
          row_number() OVER (
            ORDER BY COALESCE((item ->> 'orden')::integer, n::integer)
          ) AS posicion
        FROM jsonb_array_elements(p_campos -> 'eventos')
          WITH ORDINALITY AS e(item, n)
      ) esperado
      LEFT JOIN jsonb_array_elements_text(p_respuesta -> 'orden')
        WITH ORDINALITY AS recibido(texto, posicion)
        USING (posicion)
      WHERE recibido.texto IS NULL
         OR public.normalizar_respuesta_texto(recibido.texto)
            <> public.normalizar_respuesta_texto(esperado.texto);

      RETURN v_esperadas > 0
        AND v_recibidas = v_esperadas
        AND v_incorrectas = 0;

    WHEN 'identificar' THEN
      IF jsonb_typeof(p_campos -> 'opciones') IS DISTINCT FROM 'array'
         OR jsonb_typeof(p_respuesta -> 'seleccionadas') IS DISTINCT FROM 'array' THEN
        RETURN NULL;
      END IF;

      SELECT count(*) INTO v_esperadas
      FROM jsonb_array_elements(p_campos -> 'opciones') o
      WHERE COALESCE((o ->> 'esCorrecta')::boolean, false);
      SELECT count(DISTINCT public.normalizar_respuesta_texto(value))
      INTO v_recibidas
      FROM jsonb_array_elements_text(p_respuesta -> 'seleccionadas');

      SELECT count(*) INTO v_incorrectas
      FROM jsonb_array_elements_text(p_respuesta -> 'seleccionadas') s(value)
      WHERE NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(p_campos -> 'opciones') o
        WHERE COALESCE((o ->> 'esCorrecta')::boolean, false)
          AND public.normalizar_respuesta_texto(o ->> 'texto')
              = public.normalizar_respuesta_texto(s.value)
      );

      RETURN v_recibidas = v_esperadas AND v_incorrectas = 0;

    WHEN 'selectorEmocionColor' THEN
      IF COALESCE(p_respuesta #>> '{seleccion,id}', '') = '' THEN
        RETURN NULL;
      END IF;
      RETURN EXISTS (
        SELECT 1
        FROM jsonb_array_elements(p_campos -> 'opciones') o
        WHERE o ->> 'id' = p_respuesta #>> '{seleccion,id}'
          AND COALESCE((o ->> 'esCorrecta')::boolean, false)
      );

    WHEN 'clasificacionCategorias' THEN
      IF jsonb_typeof(COALESCE(p_campos -> 'items', p_campos -> 'elementos'))
          IS DISTINCT FROM 'array'
         OR jsonb_typeof(p_respuesta -> 'clasificaciones')
          IS DISTINCT FROM 'array' THEN
        RETURN NULL;
      END IF;

      SELECT count(*) INTO v_esperadas
      FROM jsonb_array_elements(
        COALESCE(p_campos -> 'items', p_campos -> 'elementos')
      );
      SELECT count(*) INTO v_recibidas
      FROM jsonb_array_elements(p_respuesta -> 'clasificaciones');

      SELECT count(*) INTO v_incorrectas
      FROM jsonb_array_elements(
        COALESCE(p_campos -> 'items', p_campos -> 'elementos')
      ) esperado
      LEFT JOIN jsonb_array_elements(p_respuesta -> 'clasificaciones') recibido
        ON recibido ->> 'id' = esperado ->> 'id'
      WHERE recibido IS NULL
         OR COALESCE(
              recibido ->> 'categoriaElegidaId',
              recibido ->> 'categoriaElegida'
            ) IS DISTINCT FROM COALESCE(
              esperado ->> 'categoriaId',
              esperado ->> 'categoria',
              esperado ->> 'respuesta'
            );

      RETURN v_esperadas > 0
        AND v_recibidas = v_esperadas
        AND v_incorrectas = 0;

    WHEN 'emparejar' THEN
      IF jsonb_typeof(p_campos -> 'pares') IS DISTINCT FROM 'array'
         OR jsonb_typeof(p_respuesta -> 'parejas') IS DISTINCT FROM 'array' THEN
        RETURN NULL;
      END IF;

      SELECT count(*) INTO v_esperadas
      FROM jsonb_array_elements(p_campos -> 'pares');
      SELECT count(*) INTO v_recibidas
      FROM jsonb_array_elements(p_respuesta -> 'parejas');

      SELECT count(*) INTO v_incorrectas
      FROM jsonb_array_elements(p_campos -> 'pares') esperado
      WHERE NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(p_respuesta -> 'parejas') recibido
        WHERE public.normalizar_respuesta_texto(recibido ->> 'izquierda')
              = public.normalizar_respuesta_texto(esperado ->> 'izquierda')
          AND public.normalizar_respuesta_texto(recibido ->> 'derecha')
              = public.normalizar_respuesta_texto(esperado ->> 'derecha')
      );

      RETURN v_esperadas > 0
        AND v_recibidas = v_esperadas
        AND v_incorrectas = 0;

    WHEN 'sopaLetras' THEN
      IF jsonb_typeof(p_campos -> 'palabras') IS DISTINCT FROM 'array'
         OR jsonb_typeof(p_respuesta -> 'palabrasEncontradas')
          IS DISTINCT FROM 'array' THEN
        RETURN NULL;
      END IF;

      SELECT count(*) INTO v_esperadas
      FROM jsonb_array_elements_text(p_campos -> 'palabras');
      SELECT count(DISTINCT public.normalizar_respuesta_texto(value))
      INTO v_recibidas
      FROM jsonb_array_elements_text(p_respuesta -> 'palabrasEncontradas');

      SELECT count(*) INTO v_incorrectas
      FROM jsonb_array_elements_text(p_campos -> 'palabras') esperado(value)
      WHERE NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(
          p_respuesta -> 'palabrasEncontradas'
        ) recibido(value)
        WHERE public.normalizar_respuesta_texto(recibido.value)
              = public.normalizar_respuesta_texto(esperado.value)
      );

      RETURN v_esperadas > 0
        AND v_recibidas = v_esperadas
        AND v_incorrectas = 0;

    WHEN 'lineaTiempoEmocional' THEN
      IF jsonb_typeof(p_campos -> 'momentos') IS DISTINCT FROM 'array'
         OR jsonb_typeof(p_respuesta -> 'momentos') IS DISTINCT FROM 'array' THEN
        RETURN NULL;
      END IF;

      SELECT count(*) INTO v_esperadas
      FROM jsonb_array_elements(p_campos -> 'momentos');
      SELECT count(*) INTO v_recibidas
      FROM jsonb_array_elements(p_respuesta -> 'momentos');

      SELECT count(*) INTO v_incorrectas
      FROM jsonb_array_elements(p_campos -> 'momentos')
        WITH ORDINALITY AS esperado(momento, n)
      LEFT JOIN jsonb_array_elements(p_respuesta -> 'momentos')
        WITH ORDINALITY AS recibido(momento, n) USING (n)
      WHERE recibido.momento IS NULL
         OR NOT EXISTS (
           SELECT 1
           FROM jsonb_array_elements(
             COALESCE(esperado.momento -> 'opciones', '[]'::jsonb)
           ) opcion
           WHERE COALESCE((opcion ->> 'esCorrecta')::boolean, false)
             AND public.normalizar_respuesta_texto(opcion ->> 'texto')
                 = public.normalizar_respuesta_texto(
                   recibido.momento ->> 'seleccion'
                 )
         );

      RETURN v_esperadas > 0
        AND v_recibidas = v_esperadas
        AND v_incorrectas = 0;

    ELSE
      -- Actividades reflexivas, artísticas o sin una única solución.
      RETURN NULL;
  END CASE;
EXCEPTION
  WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RETURN false;
END;
$$;


ALTER FUNCTION "public"."evaluar_respuesta_actividad_pre_crossword"("p_tipo" "text", "p_campos" "jsonb", "p_respuesta" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."evaluar_respuesta_actividad_pre_syllables"("p_tipo" "text", "p_campos" "jsonb", "p_respuesta" "jsonb") RETURNS boolean
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  v_esperadas INTEGER;
  v_recibidas INTEGER;
  v_incorrectas INTEGER;
BEGIN
  IF p_tipo <> 'crucigrama' THEN
    RETURN public.evaluar_respuesta_actividad_pre_crossword(
      p_tipo, p_campos, p_respuesta
    );
  END IF;

  IF jsonb_typeof(COALESCE(p_campos -> 'palabras', p_campos -> 'words'))
       IS DISTINCT FROM 'array'
     OR jsonb_typeof(p_respuesta -> 'palabras') IS DISTINCT FROM 'array' THEN
    RETURN NULL;
  END IF;

  SELECT count(*) INTO v_esperadas
  FROM jsonb_array_elements(
    COALESCE(p_campos -> 'palabras', p_campos -> 'words')
  );

  SELECT count(*) INTO v_recibidas
  FROM jsonb_array_elements(p_respuesta -> 'palabras');

  SELECT count(*) INTO v_incorrectas
  FROM jsonb_array_elements(
    COALESCE(p_campos -> 'palabras', p_campos -> 'words')
  ) WITH ORDINALITY AS esperado(palabra, n)
  WHERE NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_respuesta -> 'palabras') recibido(palabra)
    WHERE recibido.palabra ->> 'id' = COALESCE(
      esperado.palabra ->> 'id',
      'palabra-' || esperado.n::text
    )
      AND public.normalizar_crucigrama_texto(
        recibido.palabra ->> 'respuestaDada'
      ) = public.normalizar_crucigrama_texto(COALESCE(
        esperado.palabra ->> 'w',
        esperado.palabra ->> 'palabra',
        esperado.palabra ->> 'texto'
      ))
  );

  RETURN v_esperadas > 0
    AND v_recibidas = v_esperadas
    AND v_incorrectas = 0;
END;
$$;


ALTER FUNCTION "public"."evaluar_respuesta_actividad_pre_syllables"("p_tipo" "text", "p_campos" "jsonb", "p_respuesta" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generar_token_128"("p_prefijo" "text") RETURNS "text"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'pg_catalog', 'public', 'extensions'
    AS $$
DECLARE
  v_prefijo TEXT := upper(trim(p_prefijo));
BEGIN
  IF v_prefijo NOT IN ('TL', 'TD') THEN
    RAISE EXCEPTION 'prefijo_token_invalido' USING ERRCODE = '22023';
  END IF;
  RETURN v_prefijo || '-' || upper(encode(extensions.gen_random_bytes(16), 'hex'));
END;
$$;


ALTER FUNCTION "public"."generar_token_128"("p_prefijo" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_actividad_publica"("p_actividad_id" "text") RETURNS json
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  v_result JSON;
  v_libro_id TEXT;
  v_rol TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'autenticacion_requerida' USING ERRCODE = '42501';
  END IF;

  SELECT u.libro_id
  INTO v_libro_id
  FROM public.actividades a
  JOIN public.unidades u ON u.id = a.unidad_id
  WHERE a.id = p_actividad_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF NOT public.puede_acceder_libro(v_libro_id) THEN
    RAISE EXCEPTION 'acceso_denegado' USING ERRCODE = '42501';
  END IF;

  SELECT rol INTO v_rol
  FROM public.profiles
  WHERE id = auth.uid();

  SELECT (
    to_jsonb(a)
    || jsonb_build_object(
      'campos',
      CASE
        WHEN v_rol = 'estudiante'
          THEN public.campos_publicos_actividad(a.tipo, a.campos)
        ELSE COALESCE(a.campos, '{}'::jsonb)
      END
    )
  )::json
  INTO v_result
  FROM public.actividades a
  WHERE a.id = p_actividad_id;

  RETURN v_result;
END;
$$;


ALTER FUNCTION "public"."get_actividad_publica"("p_actividad_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_libro_completo"("p_libro_id" "text") RETURNS json
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  v_result JSON;
  v_rol TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'autenticacion_requerida' USING ERRCODE = '42501';
  END IF;

  IF NOT public.puede_acceder_libro(p_libro_id) THEN
    RAISE EXCEPTION 'acceso_denegado' USING ERRCODE = '42501';
  END IF;

  SELECT rol INTO v_rol
  FROM public.profiles
  WHERE id = auth.uid();

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
          SELECT COALESCE(
            json_agg(
              (
                to_jsonb(a)
                || jsonb_build_object(
                  'campos',
                  CASE
                    WHEN v_rol = 'estudiante'
                      THEN public.campos_publicos_actividad(a.tipo, a.campos)
                    ELSE COALESCE(a.campos, '{}'::jsonb)
                  END
                )
              )
              ORDER BY a.orden
            ),
            '[]'
          )
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


ALTER FUNCTION "public"."get_libro_completo"("p_libro_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_mis_libros_estado"() RETURNS TABLE("id" "text", "titulo" "text", "descripcion" "text", "emoji" "text", "portada_url" "text", "disponible" boolean)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
  SELECT
    l.id, l.titulo, l.descripcion, l.emoji, l.portada_url, l.activo
  FROM public.libro_activaciones la
  JOIN public.profiles p ON p.id = la.usuario_id
  JOIN public.libros l ON l.id = la.libro_id
  JOIN public.escuela_libros el
    ON el.escuela_id = p.escuela_id
   AND el.libro_id = la.libro_id
  WHERE la.usuario_id = auth.uid()
  ORDER BY l.titulo;
$$;


ALTER FUNCTION "public"."get_mis_libros_estado"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
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


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"("uid" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
    SELECT EXISTS (SELECT 1 FROM profiles WHERE id = uid AND rol = 'admin');
  $$;


ALTER FUNCTION "public"."is_admin"("uid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_docente_of"("p_usuario_id" "uuid") RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
    SELECT EXISTS (
      SELECT 1 FROM inscripciones i
      JOIN clases c ON c.id = i.clase_id
      WHERE i.estudiante_id = p_usuario_id AND c.docente_id = auth.uid()
    )
  $$;


ALTER FUNCTION "public"."is_docente_of"("p_usuario_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_docente_of_clase"("p_clase_id" "uuid") RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
    SELECT EXISTS (
      SELECT 1 FROM clases WHERE id = p_clase_id AND docente_id = auth.uid()
    )
  $$;


ALTER FUNCTION "public"."is_docente_of_clase"("p_clase_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_inscrito_en_clase"("p_clase_id" "uuid") RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
    SELECT EXISTS (
      SELECT 1 FROM inscripciones WHERE clase_id = p_clase_id AND estudiante_id = auth.uid()
    )
  $$;


ALTER FUNCTION "public"."is_inscrito_en_clase"("p_clase_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."marcar_archivos_accion_rechazada"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
BEGIN
  IF OLD.estado = 'pendiente' AND NEW.estado = 'rechazada'
     AND NEW.tipo IN ('crear_libro', 'editar_libro') THEN
    UPDATE public.archivos_libro
    SET estado = 'rechazado', resuelto_por = NEW.aprobador_id,
        expira_en = LEAST(expira_en, now() + interval '24 hours')
    WHERE estado = 'staging'
      AND path IN (
        NEW.payload ->> 'portada_url',
        NEW.payload ->> 'pdf_url',
        NEW.payload -> 'campos' ->> 'portada_url',
        NEW.payload -> 'campos' ->> 'pdf_url'
      );
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."marcar_archivos_accion_rechazada"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."normalizar_crucigrama_texto"("p_valor" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO 'pg_catalog'
    AS $$
  SELECT regexp_replace(
    translate(lower(COALESCE(p_valor, '')), 'áéíóúüñ', 'aeiouun'),
    '[^a-z0-9]', '', 'g'
  )
$$;


ALTER FUNCTION "public"."normalizar_crucigrama_texto"("p_valor" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."normalizar_respuesta_texto"("p_valor" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO 'pg_catalog'
    AS $$
  SELECT lower(regexp_replace(trim(COALESCE(p_valor, '')), '\s+', ' ', 'g'))
$$;


ALTER FUNCTION "public"."normalizar_respuesta_texto"("p_valor" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."normalizar_separacion_silabas"("p_valor" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE PARALLEL SAFE
    SET "search_path" TO 'pg_catalog'
    AS $$
  SELECT trim(BOTH '-' FROM regexp_replace(
    regexp_replace(
      regexp_replace(
        translate(lower(COALESCE(p_valor, '')), 'áéíóúüñ‐‑‒–—−', 'aeiouun------'),
        '\s*-\s*', '-', 'g'
      ),
      '\s+', '', 'g'
    ),
    '-+', '-', 'g'
  ))
$$;


ALTER FUNCTION "public"."normalizar_separacion_silabas"("p_valor" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."proteger_cambio_rol_aprobado"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'auth'
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


ALTER FUNCTION "public"."proteger_cambio_rol_aprobado"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."puede_acceder_libro"("p_libro_id" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND (
      public.es_admin()
      OR EXISTS (
        SELECT 1
        FROM public.libro_activaciones la
        JOIN public.profiles p ON p.id = la.usuario_id
        JOIN public.libros l ON l.id = la.libro_id
        JOIN public.escuela_libros el
          ON el.escuela_id = p.escuela_id
         AND el.libro_id = la.libro_id
        WHERE la.usuario_id = auth.uid()
          AND la.libro_id = p_libro_id
          AND l.activo
      )
      OR EXISTS (
        SELECT 1
        FROM public.profiles p
        JOIN public.escuela_libros el ON el.escuela_id = p.escuela_id
        JOIN public.libros l ON l.id = el.libro_id
        WHERE p.id = auth.uid()
          AND p.rol = 'docente'
          AND el.libro_id = p_libro_id
          AND l.activo
      )
    );
$$;


ALTER FUNCTION "public"."puede_acceder_libro"("p_libro_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."puede_acceder_objeto_libro"("p_object_name" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
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


ALTER FUNCTION "public"."puede_acceder_objeto_libro"("p_object_name" "text") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."archivos_libro" (
    "path" "text" NOT NULL,
    "bucket_id" "text" DEFAULT 'libros'::"text" NOT NULL,
    "tipo" "text" NOT NULL,
    "estado" "text" DEFAULT 'staging'::"text" NOT NULL,
    "propietario_id" "uuid" NOT NULL,
    "libro_id" "text",
    "mime_type" "text" NOT NULL,
    "tamano_bytes" bigint NOT NULL,
    "creado_en" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expira_en" timestamp with time zone DEFAULT ("now"() + '7 days'::interval) NOT NULL,
    "publicado_en" timestamp with time zone,
    "resuelto_por" "uuid",
    CONSTRAINT "archivos_libro_bucket_id_check" CHECK (("bucket_id" = 'libros'::"text")),
    CONSTRAINT "archivos_libro_check" CHECK (((("estado" = 'publicado'::"text") AND ("libro_id" IS NOT NULL) AND ("publicado_en" IS NOT NULL)) OR ("estado" <> 'publicado'::"text"))),
    CONSTRAINT "archivos_libro_estado_check" CHECK (("estado" = ANY (ARRAY['staging'::"text", 'publicado'::"text", 'rechazado'::"text"]))),
    CONSTRAINT "archivos_libro_tamano_bytes_check" CHECK (("tamano_bytes" > 0)),
    CONSTRAINT "archivos_libro_tipo_check" CHECK (("tipo" = ANY (ARRAY['portada'::"text", 'pdf'::"text"])))
);


ALTER TABLE "public"."archivos_libro" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."registrar_archivo_libro_staging"("p_path" "text") RETURNS "public"."archivos_libro"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'auth', 'storage'
    AS $_$
DECLARE
  v_object storage.objects%ROWTYPE;
  v_tipo TEXT;
  v_result public.archivos_libro%ROWTYPE;
BEGIN
  IF NOT public.es_superadministrador() OR NOT public.sesion_es_aal2() THEN
    RAISE EXCEPTION 'solo_superadministrador_aal2' USING ERRCODE = '42501';
  END IF;
  IF p_path !~ ('^staging/' || auth.uid()::text || '/(portadas|pdfs)/[0-9a-f-]+[.](jpg|jpeg|png|webp|pdf)$') THEN
    RAISE EXCEPTION 'ruta_staging_invalida' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_object
  FROM storage.objects
  WHERE bucket_id = 'libros' AND name = p_path;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'objeto_no_encontrado' USING ERRCODE = 'P0002';
  END IF;

  v_tipo := CASE WHEN (storage.foldername(p_path))[3] = 'portadas'
    THEN 'portada' ELSE 'pdf' END;
  IF (
    v_tipo = 'portada' AND (
      lower(storage.extension(p_path)) NOT IN ('jpg', 'jpeg', 'png', 'webp')
      OR lower(COALESCE(v_object.metadata ->> 'mimetype', '')) NOT IN
        ('image/jpeg', 'image/png', 'image/webp')
      OR COALESCE((v_object.metadata ->> 'size')::bigint, 0) NOT BETWEEN 1 AND 5242880
    )
  ) OR (
    v_tipo = 'pdf' AND (
      lower(storage.extension(p_path)) <> 'pdf'
      OR lower(COALESCE(v_object.metadata ->> 'mimetype', '')) <> 'application/pdf'
      OR COALESCE((v_object.metadata ->> 'size')::bigint, 0) NOT BETWEEN 1 AND 52428800
    )
  ) THEN
    RAISE EXCEPTION 'archivo_no_permitido' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.archivos_libro (
    path, tipo, propietario_id, mime_type, tamano_bytes
  ) VALUES (
    p_path, v_tipo, auth.uid(), v_object.metadata ->> 'mimetype',
    (v_object.metadata ->> 'size')::bigint
  )
  ON CONFLICT (path) DO NOTHING
  RETURNING * INTO v_result;
  IF NOT FOUND THEN
    SELECT * INTO v_result FROM public.archivos_libro WHERE path = p_path;
  END IF;
  RETURN v_result;
END;
$_$;


ALTER FUNCTION "public"."registrar_archivo_libro_staging"("p_path" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."registrar_progreso_actividad"("p_actividad_id" "text", "p_respuesta" "jsonb" DEFAULT NULL::"jsonb", "p_es_correcta" boolean DEFAULT NULL::boolean, "p_guardar_respuesta" boolean DEFAULT false) RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  v_tipo TEXT;
  v_campos JSONB;
  v_objetiva BOOLEAN := false;
BEGIN
  SELECT tipo, COALESCE(campos, '{}'::jsonb)
  INTO v_tipo, v_campos
  FROM public.actividades
  WHERE id = p_actividad_id;

  IF FOUND THEN
    v_objetiva := v_tipo IN (
      'seleccionMultiple',
      'verdaderoFalso',
      'identificar',
      'selectorEmocionColor',
      'lineaTiempoEmocional',
      'completarPalabras',
      'ordenarPalabras',
      'ordenarEventos',
      'clasificacionCategorias',
      'emparejar',
      'sopaLetras',
      'crucigrama',
      'separarSilabas'
    );

    IF v_tipo = 'acrostico' THEN
      v_objetiva := COALESCE(
        (v_campos ->> 'modoEvaluable')::boolean,
        false
      ) OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements(COALESCE(v_campos -> 'lineas', '[]'::jsonb))
          linea
        WHERE btrim(COALESCE(
          linea ->> 'respuesta',
          linea ->> 'correcta',
          ''
        )) <> ''
      );
    END IF;
  END IF;

  IF v_objetiva THEN
    RAISE EXCEPTION 'actividad_objetiva_requiere_rpc_intentos'
      USING ERRCODE = '42501';
  END IF;

  RETURN public.registrar_progreso_actividad_pre_phase6_final(
    p_actividad_id,
    p_respuesta,
    p_es_correcta,
    p_guardar_respuesta
  );
END;
$$;


ALTER FUNCTION "public"."registrar_progreso_actividad"("p_actividad_id" "text", "p_respuesta" "jsonb", "p_es_correcta" boolean, "p_guardar_respuesta" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."registrar_progreso_actividad_pre_phase6_final"("p_actividad_id" "text", "p_respuesta" "jsonb" DEFAULT NULL::"jsonb", "p_es_correcta" boolean DEFAULT NULL::boolean, "p_guardar_respuesta" boolean DEFAULT false) RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_unidad_id TEXT;
  v_libro_id TEXT;
  v_rol TEXT;
  v_tipo TEXT;
  v_campos JSONB;
  v_es_correcta BOOLEAN;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'autenticacion_requerida' USING ERRCODE = '42501';
  END IF;

  SELECT rol INTO v_rol FROM public.profiles WHERE id = v_uid;
  IF v_rol IS DISTINCT FROM 'estudiante' THEN
    RAISE EXCEPTION 'solo_estudiantes_guardan_progreso'
      USING ERRCODE = '42501';
  END IF;

  IF length(COALESCE(p_actividad_id, '')) > 160 THEN
    RAISE EXCEPTION 'actividad_id_invalido' USING ERRCODE = '22023';
  END IF;

  IF p_guardar_respuesta THEN
    PERFORM public.validar_payload_respuesta(p_respuesta);
  ELSIF p_respuesta IS NOT NULL OR p_es_correcta IS NOT NULL THEN
    RAISE EXCEPTION 'payload_respuesta_inesperado' USING ERRCODE = '22023';
  END IF;

  PERFORM public.consumir_limite_progreso(v_uid);

  SELECT a.unidad_id, u.libro_id, a.tipo, COALESCE(a.campos, '{}'::jsonb)
  INTO v_unidad_id, v_libro_id, v_tipo, v_campos
  FROM public.actividades a
  JOIN public.unidades u ON u.id = a.unidad_id
  WHERE a.id = p_actividad_id;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'motivo', 'actividad_no_encontrada');
  END IF;

  IF NOT public.puede_acceder_libro(v_libro_id) THEN
    RAISE EXCEPTION 'licencia_requerida' USING ERRCODE = '42501';
  END IF;

  IF p_guardar_respuesta THEN
    v_es_correcta := public.evaluar_respuesta_actividad(
      v_tipo, v_campos, p_respuesta
    );
  END IF;

  INSERT INTO public.actividad_progreso (usuario_id, actividad_id, completada_en)
  VALUES (v_uid, p_actividad_id, now())
  ON CONFLICT (usuario_id, actividad_id)
  DO UPDATE SET completada_en = EXCLUDED.completada_en;

  INSERT INTO public.progreso (usuario_id, libro_id, ultima_actividad)
  VALUES (v_uid, v_libro_id, now())
  ON CONFLICT (usuario_id, libro_id)
  DO UPDATE SET ultima_actividad = EXCLUDED.ultima_actividad;

  IF p_guardar_respuesta THEN
    INSERT INTO public.respuestas (
      usuario_id, actividad_id, libro_id, unidad_id,
      respuesta, es_correcta, created_at
    )
    VALUES (
      v_uid, p_actividad_id, v_libro_id, v_unidad_id,
      p_respuesta, v_es_correcta, now()
    )
    ON CONFLICT (usuario_id, actividad_id)
    DO UPDATE SET
      libro_id = EXCLUDED.libro_id,
      unidad_id = EXCLUDED.unidad_id,
      respuesta = EXCLUDED.respuesta,
      es_correcta = EXCLUDED.es_correcta,
      created_at = EXCLUDED.created_at;
  END IF;

  RETURN json_build_object(
    'ok', true,
    'actividad_id', p_actividad_id,
    'unidad_id', v_unidad_id,
    'libro_id', v_libro_id,
    'es_correcta', v_es_correcta
  );
END;
$$;


ALTER FUNCTION "public"."registrar_progreso_actividad_pre_phase6_final"("p_actividad_id" "text", "p_respuesta" "jsonb", "p_es_correcta" boolean, "p_guardar_respuesta" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sesion_es_aal2"() RETURNS boolean
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public', 'auth'
    AS $$
  SELECT COALESCE(auth.jwt() ->> 'aal', '') = 'aal2';
$$;


ALTER FUNCTION "public"."sesion_es_aal2"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."superadmin_resolver_accion"("p_accion_id" "uuid", "p_aprobar" boolean) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'auth'
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


ALTER FUNCTION "public"."superadmin_resolver_accion"("p_accion_id" "uuid", "p_aprobar" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."superadmin_resolver_accion_fase3_interna"("p_accion_id" "uuid", "p_aprobar" boolean) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'auth'
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


ALTER FUNCTION "public"."superadmin_resolver_accion_fase3_interna"("p_accion_id" "uuid", "p_aprobar" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."superadmin_resolver_accion_v2"("p_accion_id" "uuid", "p_aprobar" boolean) RETURNS "jsonb"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'auth'
    AS $$
  SELECT public.superadmin_resolver_accion_v3(p_accion_id, p_aprobar);
$$;


ALTER FUNCTION "public"."superadmin_resolver_accion_v2"("p_accion_id" "uuid", "p_aprobar" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."superadmin_resolver_accion_v3"("p_accion_id" "uuid", "p_aprobar" boolean) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'auth'
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


ALTER FUNCTION "public"."superadmin_resolver_accion_v3"("p_accion_id" "uuid", "p_aprobar" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."unirse_clase"("p_codigo" "text") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
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


ALTER FUNCTION "public"."unirse_clase"("p_codigo" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validar_actividad_identificar"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$
DECLARE
  v_total INTEGER;
  v_distintas INTEGER;
BEGIN
  IF NEW.tipo <> 'identificar' THEN
    RETURN NEW;
  END IF;

  IF jsonb_typeof(NEW.campos -> 'opciones') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'identificar_opciones_invalidas' USING ERRCODE = '23514';
  END IF;

  SELECT
    count(*),
    count(DISTINCT public.normalizar_respuesta_texto(o ->> 'texto'))
  INTO v_total, v_distintas
  FROM jsonb_array_elements(NEW.campos -> 'opciones') o;

  IF v_total < 2 THEN
    RAISE EXCEPTION 'identificar_requiere_dos_opciones'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(NEW.campos -> 'opciones') o
    WHERE trim(COALESCE(o ->> 'texto', '')) = ''
  ) THEN
    RAISE EXCEPTION 'identificar_texto_vacio' USING ERRCODE = '23514';
  END IF;

  IF v_distintas <> v_total THEN
    RAISE EXCEPTION 'identificar_texto_duplicado' USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(NEW.campos -> 'opciones') o
    WHERE COALESCE((o ->> 'esCorrecta')::boolean, false)
  ) THEN
    RAISE EXCEPTION 'identificar_sin_respuesta_correcta'
      USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(NEW.campos -> 'opciones') o
    WHERE NOT COALESCE((o ->> 'esCorrecta')::boolean, false)
  ) THEN
    RAISE EXCEPTION 'identificar_sin_distractor' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."validar_actividad_identificar"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validar_payload_respuesta"("p_respuesta" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  v_texto TEXT;
BEGIN
  IF p_respuesta IS NULL THEN
    RETURN;
  END IF;

  IF pg_column_size(p_respuesta) > 65536 THEN
    RAISE EXCEPTION 'respuesta_demasiado_grande'
      USING ERRCODE = '22023';
  END IF;

  v_texto := p_respuesta::text;

  IF v_texto ~* '"data:[^"]*;base64,' THEN
    RAISE EXCEPTION 'respuesta_base64_no_permitida'
      USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(p_respuesta) NOT IN ('object', 'array') THEN
    RAISE EXCEPTION 'formato_respuesta_invalido'
      USING ERRCODE = '22023';
  END IF;
END;
$$;


ALTER FUNCTION "public"."validar_payload_respuesta"("p_respuesta" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validar_publicacion_archivos_libro"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public', 'auth'
    AS $$
DECLARE
  v_path TEXT;
  v_tipo TEXT;
  v_archivo public.archivos_libro%ROWTYPE;
BEGIN
  FOREACH v_path IN ARRAY ARRAY[NEW.portada_url, NEW.pdf_url] LOOP
    IF v_path IS NULL OR v_path = '' OR v_path NOT LIKE 'staging/%' THEN
      CONTINUE; -- compatibilidad con objetos publicados antes de fase 5
    END IF;
    v_tipo := CASE WHEN v_path = NEW.portada_url THEN 'portada' ELSE 'pdf' END;
    SELECT * INTO v_archivo
    FROM public.archivos_libro
    WHERE path = v_path FOR UPDATE;
    IF FOUND
       AND v_archivo.tipo = v_tipo
       AND v_archivo.estado = 'publicado'
       AND v_archivo.libro_id = NEW.id THEN
      CONTINUE; -- referencia publicada previamente y sin sustitución
    END IF;
    IF NOT FOUND OR v_archivo.tipo <> v_tipo OR v_archivo.estado <> 'staging'
       OR v_archivo.expira_en <= now() THEN
      RAISE EXCEPTION 'archivo_staging_invalido:%', v_path USING ERRCODE = '22023';
    END IF;
    IF current_setting('app.fase3_aprobada', true) IS DISTINCT FROM 'si' THEN
      RAISE EXCEPTION 'publicacion_requiere_aprobacion' USING ERRCODE = '42501';
    END IF;
    UPDATE public.archivos_libro
    SET estado = 'publicado', libro_id = NEW.id, publicado_en = now(),
        resuelto_por = auth.uid(), expira_en = 'infinity'
    WHERE path = v_path;
  END LOOP;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."validar_publicacion_archivos_libro"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."verificar_token"("p_token" "text") RETURNS json
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
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


ALTER FUNCTION "public"."verificar_token"("p_token" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."acciones_admin_pendientes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tipo" "text" NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "estado" "text" DEFAULT 'pendiente'::"text" NOT NULL,
    "solicitante_id" "uuid" NOT NULL,
    "aprobador_id" "uuid",
    "solicitado_en" timestamp with time zone DEFAULT "now"() NOT NULL,
    "resuelto_en" timestamp with time zone,
    "resultado" "jsonb",
    "error" "text",
    CONSTRAINT "acciones_admin_payload_tamano_check" CHECK (("pg_column_size"("payload") <= 524288)),
    CONSTRAINT "acciones_admin_pendientes_estado_check" CHECK (("estado" = ANY (ARRAY['pendiente'::"text", 'aprobada'::"text", 'rechazada'::"text", 'cancelada'::"text", 'fallida'::"text"]))),
    CONSTRAINT "acciones_admin_pendientes_tipo_check" CHECK (("tipo" = ANY (ARRAY['conceder_admin'::"text", 'cambiar_rol_usuario'::"text", 'crear_escuela'::"text", 'cambiar_estado_escuela'::"text", 'crear_libro'::"text", 'editar_libro'::"text", 'cambiar_estado_libro'::"text", 'crear_unidad'::"text", 'editar_unidad'::"text", 'eliminar_unidad'::"text", 'reordenar_unidades'::"text", 'desactivar_escuela'::"text", 'desactivar_libro'::"text", 'asignar_libro_escuela'::"text", 'remover_libro_escuela'::"text", 'crear_tokens_libro'::"text", 'crear_tokens_docente'::"text", 'revocar_token'::"text"])))
);


ALTER TABLE "public"."acciones_admin_pendientes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."actividad_progreso" (
    "usuario_id" "uuid" NOT NULL,
    "actividad_id" "text" NOT NULL,
    "completada_en" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."actividad_progreso" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."actividades" (
    "id" "text" NOT NULL,
    "unidad_id" "text" NOT NULL,
    "tipo" "text" NOT NULL,
    "orden" integer NOT NULL,
    "campos" "jsonb" DEFAULT '{}'::"jsonb",
    CONSTRAINT "actividades_campos_tamano_check" CHECK (("pg_column_size"(COALESCE("campos", '{}'::"jsonb")) <= 262144)),
    CONSTRAINT "actividades_tipo_check" CHECK (("tipo" = ANY (ARRAY['sopaLetras'::"text", 'seleccionMultiple'::"text", 'identificar'::"text", 'reflexionPersonal'::"text", 'lineaTiempoEmocional'::"text", 'termometroEmocional'::"text", 'clasificacionCategorias'::"text", 'separarSilabas'::"text", 'acrostico'::"text", 'crucigrama'::"text", 'respiracionGuiada'::"text", 'miniJuegoConteo'::"text", 'exploracionInteractiva'::"text", 'selectorEmocionColor'::"text", 'mezclaPinturaGuiada'::"text", 'tarjetasVolteables'::"text", 'verdaderoFalso'::"text", 'completarPalabras'::"text", 'ordenarEventos'::"text", 'ordenarPalabras'::"text", 'emparejar'::"text", 'completarMapa'::"text", 'escribirCarta'::"text", 'dibujoLibre'::"text", 'video'::"text", 'audio'::"text", 'imagen'::"text", 'colorear'::"text"])))
);


ALTER TABLE "public"."actividades" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."admin_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "admin_id" "uuid" NOT NULL,
    "accion" "text" NOT NULL,
    "entidad" "text" NOT NULL,
    "entidad_id" "text" NOT NULL,
    "payload" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "admin_logs_payload_tamano_check" CHECK ((("payload" IS NULL) OR ("pg_column_size"("payload") <= 65536)))
);


ALTER TABLE "public"."admin_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."clase_libros" (
    "clase_id" "uuid" NOT NULL,
    "libro_id" "text" NOT NULL,
    "libro_titulo" "text"
);


ALTER TABLE "public"."clase_libros" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."clases" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nombre" "text" NOT NULL,
    "codigo" "text" NOT NULL,
    "docente_id" "uuid" NOT NULL,
    "activa" boolean DEFAULT true,
    "creada_en" timestamp with time zone DEFAULT "now"(),
    "grado_id" integer,
    "escuela_id" "uuid",
    "emoji" "text" DEFAULT '🏫'::"text" NOT NULL,
    CONSTRAINT "clases_emoji_length" CHECK ((("char_length"("emoji") >= 1) AND ("char_length"("emoji") <= 12)))
);


ALTER TABLE "public"."clases" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."escuela_libros" (
    "escuela_id" "uuid" NOT NULL,
    "libro_id" "text" NOT NULL,
    "comprado_en" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."escuela_libros" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."escuelas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "nombre" "text" NOT NULL,
    "ciudad" "text",
    "activa" boolean DEFAULT true NOT NULL,
    "codigo" "text"
);


ALTER TABLE "public"."escuelas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."grados" (
    "id" integer NOT NULL,
    "nombre" "text" NOT NULL,
    "nivel" "text" NOT NULL,
    "orden" integer NOT NULL,
    CONSTRAINT "grados_nivel_check" CHECK (("nivel" = ANY (ARRAY['primaria'::"text", 'secundaria'::"text"])))
);


ALTER TABLE "public"."grados" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."grados_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."grados_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."grados_id_seq" OWNED BY "public"."grados"."id";



CREATE TABLE IF NOT EXISTS "public"."inscripciones" (
    "clase_id" "uuid" NOT NULL,
    "estudiante_id" "uuid" NOT NULL,
    "inscrito_en" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."inscripciones" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."intentos_actividad" (
    "usuario_id" "uuid" NOT NULL,
    "actividad_id" "text" NOT NULL,
    "intentos" integer DEFAULT 0 NOT NULL,
    "ultimo_resultado" boolean,
    "completada" boolean DEFAULT false NOT NULL,
    "actualizado_en" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "intentos_actividad_intentos_check" CHECK (("intentos" >= 0))
);


ALTER TABLE "public"."intentos_actividad" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."intentos_clase" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "uid" "uuid" NOT NULL,
    "intentado_en" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."intentos_clase" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."intentos_token" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "uid" "uuid" NOT NULL,
    "intentado_en" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."intentos_token" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."libro_activaciones" (
    "usuario_id" "uuid" NOT NULL,
    "libro_id" "text" NOT NULL,
    "token_id" "text" NOT NULL,
    "activado_en" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."libro_activaciones" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."libros" (
    "id" "text" NOT NULL,
    "titulo" "text" NOT NULL,
    "descripcion" "text",
    "emoji" "text",
    "pdf_url" "text",
    "portada_url" "text",
    "canciones" "jsonb" DEFAULT '[]'::"jsonb",
    "videos_animados" "jsonb" DEFAULT '[]'::"jsonb",
    "hotspots" "jsonb" DEFAULT '[]'::"jsonb",
    "grado_id" integer,
    "activo" boolean DEFAULT true NOT NULL,
    "color_acento" "text" DEFAULT '#e91e8c'::"text",
    "color_encabezado_inicio" "text",
    "color_encabezado_fin" "text",
    "color_fondo_actividades" "text"
);


ALTER TABLE "public"."libros" OWNER TO "postgres";


COMMENT ON COLUMN "public"."libros"."color_acento" IS 'Color de botones, pestañas y títulos del panel';



COMMENT ON COLUMN "public"."libros"."color_encabezado_inicio" IS 'Primer color del degradado del encabezado';



COMMENT ON COLUMN "public"."libros"."color_encabezado_fin" IS 'Segundo color del degradado del encabezado';



COMMENT ON COLUMN "public"."libros"."color_fondo_actividades" IS 'Color de fondo del panel de actividades';



CREATE TABLE IF NOT EXISTS "public"."limites_progreso" (
    "usuario_id" "uuid" NOT NULL,
    "ventana_inicio" timestamp with time zone NOT NULL,
    "operaciones" integer NOT NULL,
    "actualizado_en" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "limites_progreso_operaciones_check" CHECK (("operaciones" >= 0))
);


ALTER TABLE "public"."limites_progreso" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "nombre" "text" NOT NULL,
    "email" "text",
    "escuela" "text",
    "rol" "text" DEFAULT 'estudiante'::"text" NOT NULL,
    "fecha_registro" timestamp with time zone DEFAULT "now"(),
    "escuela_id" "uuid",
    "grado_id" integer,
    CONSTRAINT "profiles_rol_check" CHECK (("rol" = ANY (ARRAY['estudiante'::"text", 'docente'::"text", 'admin'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."progreso" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "usuario_id" "uuid" NOT NULL,
    "libro_id" "text" NOT NULL,
    "ultima_actividad" timestamp with time zone
);


ALTER TABLE "public"."progreso" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."progreso_clase" WITH ("security_invoker"='true') AS
 SELECT "i"."clase_id",
    "i"."estudiante_id",
    "p"."nombre" AS "estudiante_nombre",
    "l"."titulo" AS "libro_titulo",
    "l"."id" AS "libro_id",
    "count"("ap"."actividad_id") AS "actividades_completadas",
    "max"("ap"."completada_en") AS "ultima_actividad"
   FROM (((("public"."inscripciones" "i"
     JOIN "public"."profiles" "p" ON (("p"."id" = "i"."estudiante_id")))
     JOIN "public"."clase_libros" "cl" ON (("cl"."clase_id" = "i"."clase_id")))
     JOIN "public"."libros" "l" ON (("l"."id" = "cl"."libro_id")))
     LEFT JOIN "public"."actividad_progreso" "ap" ON (("ap"."usuario_id" = "i"."estudiante_id")))
  GROUP BY "i"."clase_id", "i"."estudiante_id", "p"."nombre", "l"."titulo", "l"."id";


ALTER VIEW "public"."progreso_clase" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."respuestas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "usuario_id" "uuid" NOT NULL,
    "actividad_id" "text" NOT NULL,
    "libro_id" "text" NOT NULL,
    "unidad_id" "text" NOT NULL,
    "respuesta" "jsonb",
    "es_correcta" boolean,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "respuestas_payload_tamano_check" CHECK ((("respuesta" IS NULL) OR ("pg_column_size"("respuesta") <= 65536))),
    CONSTRAINT "respuestas_sin_data_url_check" CHECK ((("respuesta" IS NULL) OR (("respuesta")::"text" !~* '"data:[^"]*;base64,'::"text")))
);


ALTER TABLE "public"."respuestas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."superadministradores" (
    "usuario_id" "uuid" NOT NULL,
    "activo" boolean DEFAULT true NOT NULL,
    "creado_en" timestamp with time zone DEFAULT "now"() NOT NULL,
    "creado_por" "uuid"
);


ALTER TABLE "public"."superadministradores" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tokens" (
    "id" "text" NOT NULL,
    "estado" "text" DEFAULT 'valido'::"text" NOT NULL,
    "libro_id" "text",
    "usuario_id" "uuid",
    "libro_titulo" "text",
    "activado_en" timestamp with time zone,
    "fecha_creacion" timestamp with time zone DEFAULT "now"(),
    "tipo" "text" DEFAULT 'libro'::"text",
    "escuela_id" "uuid",
    "grado_id" integer,
    "email_autorizado" "text",
    "expira_en" timestamp with time zone,
    "usos_maximos" integer DEFAULT 1,
    CONSTRAINT "token_activado_requiere_usuario" CHECK ((("estado" <> 'activado'::"text") OR ("usuario_id" IS NOT NULL))),
    CONSTRAINT "token_valido_formato_seguro" CHECK ((("estado" <> 'valido'::"text") OR ("id" ~ '^(TL|TD)-[0-9A-F]{32}$'::"text"))),
    CONSTRAINT "tokens_estado_check" CHECK (("estado" = ANY (ARRAY['valido'::"text", 'activado'::"text", 'desactivado'::"text", 'revocado'::"text"]))),
    CONSTRAINT "tokens_tipo_check" CHECK (("tipo" = ANY (ARRAY['libro'::"text", 'docente'::"text"])))
);


ALTER TABLE "public"."tokens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."unidades" (
    "id" "text" NOT NULL,
    "libro_id" "text" NOT NULL,
    "titulo" "text" NOT NULL,
    "etiqueta" "text",
    "subtitulo" "text",
    "emoji" "text",
    "orden" integer NOT NULL,
    "texto" "text"
);


ALTER TABLE "public"."unidades" OWNER TO "postgres";


ALTER TABLE ONLY "public"."grados" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."grados_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."acciones_admin_pendientes"
    ADD CONSTRAINT "acciones_admin_pendientes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."actividad_progreso"
    ADD CONSTRAINT "actividad_progreso_pkey" PRIMARY KEY ("usuario_id", "actividad_id");



ALTER TABLE ONLY "public"."actividades"
    ADD CONSTRAINT "actividades_id_unidad_unique" UNIQUE ("id", "unidad_id");



ALTER TABLE ONLY "public"."actividades"
    ADD CONSTRAINT "actividades_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."actividades"
    ADD CONSTRAINT "actividades_unidad_id_orden_key" UNIQUE ("unidad_id", "orden");



ALTER TABLE ONLY "public"."admin_logs"
    ADD CONSTRAINT "admin_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."archivos_libro"
    ADD CONSTRAINT "archivos_libro_pkey" PRIMARY KEY ("path");



ALTER TABLE ONLY "public"."clase_libros"
    ADD CONSTRAINT "clase_libros_pkey" PRIMARY KEY ("clase_id", "libro_id");



ALTER TABLE ONLY "public"."clases"
    ADD CONSTRAINT "clases_codigo_key" UNIQUE ("codigo");



ALTER TABLE ONLY "public"."clases"
    ADD CONSTRAINT "clases_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."escuela_libros"
    ADD CONSTRAINT "escuela_libros_pkey" PRIMARY KEY ("escuela_id", "libro_id");



ALTER TABLE ONLY "public"."escuelas"
    ADD CONSTRAINT "escuelas_codigo_key" UNIQUE ("codigo");



ALTER TABLE ONLY "public"."escuelas"
    ADD CONSTRAINT "escuelas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."grados"
    ADD CONSTRAINT "grados_nivel_orden_key" UNIQUE ("nivel", "orden");



ALTER TABLE ONLY "public"."grados"
    ADD CONSTRAINT "grados_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inscripciones"
    ADD CONSTRAINT "inscripciones_pkey" PRIMARY KEY ("clase_id", "estudiante_id");



ALTER TABLE ONLY "public"."intentos_actividad"
    ADD CONSTRAINT "intentos_actividad_pkey" PRIMARY KEY ("usuario_id", "actividad_id");



ALTER TABLE ONLY "public"."intentos_clase"
    ADD CONSTRAINT "intentos_clase_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."intentos_token"
    ADD CONSTRAINT "intentos_token_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."libro_activaciones"
    ADD CONSTRAINT "libro_activaciones_pkey" PRIMARY KEY ("usuario_id", "libro_id");



ALTER TABLE ONLY "public"."libros"
    ADD CONSTRAINT "libros_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."limites_progreso"
    ADD CONSTRAINT "limites_progreso_pkey" PRIMARY KEY ("usuario_id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."progreso"
    ADD CONSTRAINT "progreso_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."progreso"
    ADD CONSTRAINT "progreso_usuario_id_libro_id_key" UNIQUE ("usuario_id", "libro_id");



ALTER TABLE ONLY "public"."respuestas"
    ADD CONSTRAINT "respuestas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."respuestas"
    ADD CONSTRAINT "respuestas_usuario_id_actividad_id_key" UNIQUE ("usuario_id", "actividad_id");



ALTER TABLE ONLY "public"."superadministradores"
    ADD CONSTRAINT "superadministradores_pkey" PRIMARY KEY ("usuario_id");



ALTER TABLE "public"."tokens"
    ADD CONSTRAINT "token_tipo_campos" CHECK ((("estado" = 'revocado'::"text") OR ("tipo" IS NULL) OR (("tipo" = 'libro'::"text") AND ("escuela_id" IS NOT NULL) AND ("grado_id" IS NOT NULL)) OR (("tipo" = 'docente'::"text") AND ("escuela_id" IS NOT NULL) AND ("email_autorizado" IS NOT NULL)))) NOT VALID;



ALTER TABLE ONLY "public"."tokens"
    ADD CONSTRAINT "tokens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."unidades"
    ADD CONSTRAINT "unidades_id_libro_unique" UNIQUE ("id", "libro_id");



ALTER TABLE ONLY "public"."unidades"
    ADD CONSTRAINT "unidades_libro_id_orden_key" UNIQUE ("libro_id", "orden");



ALTER TABLE ONLY "public"."unidades"
    ADD CONSTRAINT "unidades_pkey" PRIMARY KEY ("id");



CREATE INDEX "acciones_admin_pendientes_estado_fecha_idx" ON "public"."acciones_admin_pendientes" USING "btree" ("estado", "solicitado_en" DESC);



CREATE INDEX "idx_act_progreso_actividad" ON "public"."actividad_progreso" USING "btree" ("actividad_id");



CREATE INDEX "idx_act_progreso_usuario" ON "public"."actividad_progreso" USING "btree" ("usuario_id");



CREATE INDEX "idx_actividades_unidad" ON "public"."actividades" USING "btree" ("unidad_id", "orden");



CREATE INDEX "idx_admin_logs_date" ON "public"."admin_logs" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_clases_docente" ON "public"."clases" USING "btree" ("docente_id");



CREATE INDEX "idx_clases_escuela" ON "public"."clases" USING "btree" ("escuela_id");



CREATE INDEX "idx_escuela_libros_escuela" ON "public"."escuela_libros" USING "btree" ("escuela_id", "libro_id");



CREATE INDEX "idx_escuela_libros_libro" ON "public"."escuela_libros" USING "btree" ("libro_id", "escuela_id");



CREATE INDEX "idx_escuela_libros_pair" ON "public"."escuela_libros" USING "btree" ("escuela_id", "libro_id");



CREATE INDEX "idx_inscripciones_est" ON "public"."inscripciones" USING "btree" ("estudiante_id");



CREATE INDEX "idx_intentos_clase_limpieza" ON "public"."intentos_clase" USING "btree" ("intentado_en");



CREATE INDEX "idx_intentos_clase_uid_hora" ON "public"."intentos_clase" USING "btree" ("uid", "intentado_en");



CREATE INDEX "idx_intentos_token_limpieza" ON "public"."intentos_token" USING "btree" ("intentado_en");



CREATE INDEX "idx_intentos_token_uid_hora" ON "public"."intentos_token" USING "btree" ("uid", "intentado_en");



CREATE INDEX "idx_libros_grado" ON "public"."libros" USING "btree" ("grado_id");



CREATE INDEX "idx_profiles_escuela" ON "public"."profiles" USING "btree" ("escuela_id");



CREATE INDEX "idx_progreso_usr_libro" ON "public"."progreso" USING "btree" ("usuario_id", "libro_id");



CREATE INDEX "idx_tokens_escuela_estado" ON "public"."tokens" USING "btree" ("escuela_id", "estado");



CREATE INDEX "idx_tokens_estado" ON "public"."tokens" USING "btree" ("estado");



CREATE INDEX "idx_tokens_libro" ON "public"."tokens" USING "btree" ("libro_id");



CREATE INDEX "idx_unidades_libro" ON "public"."unidades" USING "btree" ("libro_id", "orden");



CREATE OR REPLACE TRIGGER "actividades_auditoria_admin" AFTER INSERT OR DELETE OR UPDATE ON "public"."actividades" FOR EACH ROW EXECUTE FUNCTION "public"."auditar_actividad_admin"();



CREATE OR REPLACE TRIGGER "actividades_identificar_validacion" BEFORE INSERT OR UPDATE OF "tipo", "campos" ON "public"."actividades" FOR EACH ROW EXECUTE FUNCTION "public"."validar_actividad_identificar"();



CREATE OR REPLACE TRIGGER "escuelas_bloquear_desactivacion_directa" BEFORE UPDATE OF "activa" ON "public"."escuelas" FOR EACH ROW EXECUTE FUNCTION "public"."bloquear_desactivacion_directa"();



CREATE OR REPLACE TRIGGER "libros_bloquear_desactivacion_directa" BEFORE UPDATE OF "activo" ON "public"."libros" FOR EACH ROW EXECUTE FUNCTION "public"."bloquear_desactivacion_directa"();



CREATE OR REPLACE TRIGGER "marcar_archivos_accion_rechazada" AFTER UPDATE OF "estado" ON "public"."acciones_admin_pendientes" FOR EACH ROW EXECUTE FUNCTION "public"."marcar_archivos_accion_rechazada"();



CREATE OR REPLACE TRIGGER "proteger_cambio_rol_aprobado" BEFORE UPDATE OF "rol" ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."proteger_cambio_rol_aprobado"();



CREATE OR REPLACE TRIGGER "validar_publicacion_archivos_libro" AFTER INSERT OR UPDATE OF "portada_url", "pdf_url" ON "public"."libros" FOR EACH ROW EXECUTE FUNCTION "public"."validar_publicacion_archivos_libro"();



ALTER TABLE ONLY "public"."acciones_admin_pendientes"
    ADD CONSTRAINT "acciones_admin_pendientes_aprobador_id_fkey" FOREIGN KEY ("aprobador_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."acciones_admin_pendientes"
    ADD CONSTRAINT "acciones_admin_pendientes_solicitante_id_fkey" FOREIGN KEY ("solicitante_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."actividad_progreso"
    ADD CONSTRAINT "actividad_progreso_actividad_id_fkey" FOREIGN KEY ("actividad_id") REFERENCES "public"."actividades"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."actividad_progreso"
    ADD CONSTRAINT "actividad_progreso_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."actividades"
    ADD CONSTRAINT "actividades_unidad_id_fkey" FOREIGN KEY ("unidad_id") REFERENCES "public"."unidades"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."admin_logs"
    ADD CONSTRAINT "admin_logs_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."archivos_libro"
    ADD CONSTRAINT "archivos_libro_libro_id_fkey" FOREIGN KEY ("libro_id") REFERENCES "public"."libros"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."archivos_libro"
    ADD CONSTRAINT "archivos_libro_propietario_id_fkey" FOREIGN KEY ("propietario_id") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."archivos_libro"
    ADD CONSTRAINT "archivos_libro_resuelto_por_fkey" FOREIGN KEY ("resuelto_por") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."clase_libros"
    ADD CONSTRAINT "clase_libros_clase_id_fkey" FOREIGN KEY ("clase_id") REFERENCES "public"."clases"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."clase_libros"
    ADD CONSTRAINT "clase_libros_libro_id_fkey" FOREIGN KEY ("libro_id") REFERENCES "public"."libros"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."clases"
    ADD CONSTRAINT "clases_docente_id_fkey" FOREIGN KEY ("docente_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."clases"
    ADD CONSTRAINT "clases_escuela_id_fkey" FOREIGN KEY ("escuela_id") REFERENCES "public"."escuelas"("id");



ALTER TABLE ONLY "public"."clases"
    ADD CONSTRAINT "clases_grado_id_fkey" FOREIGN KEY ("grado_id") REFERENCES "public"."grados"("id");



ALTER TABLE ONLY "public"."escuela_libros"
    ADD CONSTRAINT "escuela_libros_escuela_id_fkey" FOREIGN KEY ("escuela_id") REFERENCES "public"."escuelas"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."escuela_libros"
    ADD CONSTRAINT "escuela_libros_libro_id_fkey" FOREIGN KEY ("libro_id") REFERENCES "public"."libros"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inscripciones"
    ADD CONSTRAINT "inscripciones_clase_id_fkey" FOREIGN KEY ("clase_id") REFERENCES "public"."clases"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inscripciones"
    ADD CONSTRAINT "inscripciones_estudiante_id_fkey" FOREIGN KEY ("estudiante_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."intentos_actividad"
    ADD CONSTRAINT "intentos_actividad_actividad_id_fkey" FOREIGN KEY ("actividad_id") REFERENCES "public"."actividades"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."intentos_actividad"
    ADD CONSTRAINT "intentos_actividad_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."intentos_clase"
    ADD CONSTRAINT "intentos_clase_uid_fkey" FOREIGN KEY ("uid") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."intentos_token"
    ADD CONSTRAINT "intentos_token_uid_fkey" FOREIGN KEY ("uid") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."libro_activaciones"
    ADD CONSTRAINT "libro_activaciones_libro_id_fkey" FOREIGN KEY ("libro_id") REFERENCES "public"."libros"("id");



ALTER TABLE ONLY "public"."libro_activaciones"
    ADD CONSTRAINT "libro_activaciones_token_id_fkey" FOREIGN KEY ("token_id") REFERENCES "public"."tokens"("id");



ALTER TABLE ONLY "public"."libro_activaciones"
    ADD CONSTRAINT "libro_activaciones_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."libros"
    ADD CONSTRAINT "libros_grado_id_fkey" FOREIGN KEY ("grado_id") REFERENCES "public"."grados"("id");



ALTER TABLE ONLY "public"."limites_progreso"
    ADD CONSTRAINT "limites_progreso_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_escuela_id_fkey" FOREIGN KEY ("escuela_id") REFERENCES "public"."escuelas"("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_grado_id_fkey" FOREIGN KEY ("grado_id") REFERENCES "public"."grados"("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."progreso"
    ADD CONSTRAINT "progreso_libro_id_fkey" FOREIGN KEY ("libro_id") REFERENCES "public"."libros"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."progreso"
    ADD CONSTRAINT "progreso_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."respuestas"
    ADD CONSTRAINT "respuestas_actividad_id_fkey" FOREIGN KEY ("actividad_id") REFERENCES "public"."actividades"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."respuestas"
    ADD CONSTRAINT "respuestas_actividad_unidad_fk" FOREIGN KEY ("actividad_id", "unidad_id") REFERENCES "public"."actividades"("id", "unidad_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."respuestas"
    ADD CONSTRAINT "respuestas_libro_id_fkey" FOREIGN KEY ("libro_id") REFERENCES "public"."libros"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."respuestas"
    ADD CONSTRAINT "respuestas_unidad_id_fkey" FOREIGN KEY ("unidad_id") REFERENCES "public"."unidades"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."respuestas"
    ADD CONSTRAINT "respuestas_unidad_libro_fk" FOREIGN KEY ("unidad_id", "libro_id") REFERENCES "public"."unidades"("id", "libro_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."respuestas"
    ADD CONSTRAINT "respuestas_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."superadministradores"
    ADD CONSTRAINT "superadministradores_creado_por_fkey" FOREIGN KEY ("creado_por") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."superadministradores"
    ADD CONSTRAINT "superadministradores_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."tokens"
    ADD CONSTRAINT "tokens_escuela_id_fkey" FOREIGN KEY ("escuela_id") REFERENCES "public"."escuelas"("id");



ALTER TABLE ONLY "public"."tokens"
    ADD CONSTRAINT "tokens_grado_id_fkey" FOREIGN KEY ("grado_id") REFERENCES "public"."grados"("id");



ALTER TABLE ONLY "public"."tokens"
    ADD CONSTRAINT "tokens_libro_id_fkey" FOREIGN KEY ("libro_id") REFERENCES "public"."libros"("id");



ALTER TABLE ONLY "public"."tokens"
    ADD CONSTRAINT "tokens_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."unidades"
    ADD CONSTRAINT "unidades_libro_id_fkey" FOREIGN KEY ("libro_id") REFERENCES "public"."libros"("id") ON DELETE CASCADE;



CREATE POLICY "acciones_admin_admin_read" ON "public"."acciones_admin_pendientes" FOR SELECT TO "authenticated" USING ("public"."es_admin"());



ALTER TABLE "public"."acciones_admin_pendientes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "act_progreso_docente_scoped_read" ON "public"."actividad_progreso" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM (((("public"."actividades" "a"
     JOIN "public"."unidades" "u" ON (("u"."id" = "a"."unidad_id")))
     JOIN "public"."inscripciones" "i" ON (("i"."estudiante_id" = "actividad_progreso"."usuario_id")))
     JOIN "public"."clases" "c" ON (("c"."id" = "i"."clase_id")))
     JOIN "public"."clase_libros" "cl" ON ((("cl"."clase_id" = "c"."id") AND ("cl"."libro_id" = "u"."libro_id"))))
  WHERE (("a"."id" = "actividad_progreso"."actividad_id") AND ("c"."docente_id" = "auth"."uid"()) AND ("c"."escuela_id" = ( SELECT "p"."escuela_id"
           FROM "public"."profiles" "p"
          WHERE ("p"."id" = "auth"."uid"())))))));



CREATE POLICY "act_progreso_own_read" ON "public"."actividad_progreso" FOR SELECT TO "authenticated" USING (("usuario_id" = "auth"."uid"()));



ALTER TABLE "public"."actividad_progreso" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."actividades" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "actividades_admin_write" ON "public"."actividades" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."rol" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."rol" = 'admin'::"text")))));



CREATE POLICY "actividades_staff_read" ON "public"."actividades" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."rol" = ANY (ARRAY['docente'::"text", 'admin'::"text"]))))) AND (EXISTS ( SELECT 1
   FROM "public"."unidades" "u"
  WHERE (("u"."id" = "actividades"."unidad_id") AND "public"."puede_acceder_libro"("u"."libro_id"))))));



CREATE POLICY "admin_all" ON "public"."actividades" USING ("public"."is_admin"("auth"."uid"())) WITH CHECK ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "admin_all" ON "public"."escuela_libros" USING ("public"."is_admin"("auth"."uid"())) WITH CHECK ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "admin_all" ON "public"."escuelas" USING ("public"."is_admin"("auth"."uid"())) WITH CHECK ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "admin_all" ON "public"."libros" USING ("public"."is_admin"("auth"."uid"())) WITH CHECK ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "admin_all" ON "public"."tokens" USING ("public"."is_admin"("auth"."uid"())) WITH CHECK ("public"."is_admin"("auth"."uid"()));



CREATE POLICY "admin_all" ON "public"."unidades" USING ("public"."is_admin"("auth"."uid"())) WITH CHECK ("public"."is_admin"("auth"."uid"()));



ALTER TABLE "public"."admin_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "admin_logs_admin_read" ON "public"."admin_logs" FOR SELECT TO "authenticated" USING ("public"."es_admin"());



CREATE POLICY "admin_read_profiles" ON "public"."profiles" FOR SELECT TO "authenticated" USING ("public"."is_admin"("auth"."uid"()));



ALTER TABLE "public"."archivos_libro" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "archivos_libro_admin_select" ON "public"."archivos_libro" FOR SELECT TO "authenticated" USING ("public"."es_admin"());



ALTER TABLE "public"."clase_libros" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "clase_libros_admin_all" ON "public"."clase_libros" TO "authenticated" USING ("public"."es_admin"()) WITH CHECK ("public"."es_admin"());



CREATE POLICY "clase_libros_docente_all" ON "public"."clase_libros" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."clases" "c"
  WHERE (("c"."id" = "clase_libros"."clase_id") AND ("c"."docente_id" = "auth"."uid"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."clases" "c"
     JOIN "public"."escuela_libros" "el" ON ((("el"."escuela_id" = "c"."escuela_id") AND ("el"."libro_id" = "clase_libros"."libro_id"))))
  WHERE (("c"."id" = "clase_libros"."clase_id") AND ("c"."docente_id" = "auth"."uid"())))));



CREATE POLICY "clase_libros_estudiante_read" ON "public"."clase_libros" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."inscripciones" "i"
  WHERE (("i"."clase_id" = "clase_libros"."clase_id") AND ("i"."estudiante_id" = "auth"."uid"())))));



ALTER TABLE "public"."clases" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "clases_docente_delete" ON "public"."clases" FOR DELETE USING ((("docente_id" = "auth"."uid"()) AND ("escuela_id" = ( SELECT "profiles"."escuela_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())))));



CREATE POLICY "clases_docente_select" ON "public"."clases" FOR SELECT USING ((("docente_id" = "auth"."uid"()) AND ("escuela_id" = ( SELECT "profiles"."escuela_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())))));



CREATE POLICY "clases_docente_update" ON "public"."clases" FOR UPDATE USING ((("docente_id" = "auth"."uid"()) AND ("escuela_id" = ( SELECT "profiles"."escuela_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"())))));



CREATE POLICY "clases_estudiante_read" ON "public"."clases" FOR SELECT USING ("public"."is_inscrito_en_clase"("id"));



ALTER TABLE "public"."escuela_libros" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "escuela_libros_admin_all" ON "public"."escuela_libros" TO "authenticated" USING ("public"."es_admin"()) WITH CHECK ("public"."es_admin"());



CREATE POLICY "escuela_libros_docente" ON "public"."escuela_libros" FOR SELECT USING (("escuela_id" = ( SELECT "profiles"."escuela_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));



ALTER TABLE "public"."escuelas" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "escuelas_admin_write" ON "public"."escuelas" TO "authenticated" USING ("public"."es_admin"()) WITH CHECK ("public"."es_admin"());



CREATE POLICY "escuelas_authenticated_read" ON "public"."escuelas" FOR SELECT TO "authenticated" USING (("public"."es_admin"() OR ("id" = ( SELECT "p"."escuela_id"
   FROM "public"."profiles" "p"
  WHERE ("p"."id" = "auth"."uid"())))));



ALTER TABLE "public"."grados" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "grados_authenticated_read" ON "public"."grados" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."inscripciones" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "inscripciones_docente" ON "public"."inscripciones" USING ("public"."is_docente_of_clase"("clase_id")) WITH CHECK ("public"."is_docente_of_clase"("clase_id"));



CREATE POLICY "inscripciones_own_read" ON "public"."inscripciones" FOR SELECT USING (("estudiante_id" = "auth"."uid"()));



ALTER TABLE "public"."intentos_actividad" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "intentos_actividad_own_read" ON "public"."intentos_actividad" FOR SELECT TO "authenticated" USING (("usuario_id" = "auth"."uid"()));



ALTER TABLE "public"."intentos_clase" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."intentos_token" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "libro_act_own_select" ON "public"."libro_activaciones" FOR SELECT TO "authenticated" USING (("usuario_id" = "auth"."uid"()));



ALTER TABLE "public"."libro_activaciones" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."libros" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "libros_admin_write" ON "public"."libros" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."rol" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."rol" = 'admin'::"text")))));



CREATE POLICY "libros_authenticated_authorized_read" ON "public"."libros" FOR SELECT TO "authenticated" USING (("public"."es_admin"() OR "public"."puede_acceder_libro"("id") OR (EXISTS ( SELECT 1
   FROM ("public"."profiles" "p"
     JOIN "public"."escuela_libros" "el" ON (("el"."escuela_id" = "p"."escuela_id")))
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."rol" = 'docente'::"text") AND ("el"."libro_id" = "libros"."id"))))));



ALTER TABLE "public"."limites_progreso" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_admin_select" ON "public"."profiles" FOR SELECT TO "authenticated" USING ("public"."es_admin"());



CREATE POLICY "profiles_authenticated_read" ON "public"."profiles" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "profiles_own_select" ON "public"."profiles" FOR SELECT TO "authenticated" USING (("id" = "auth"."uid"()));



CREATE POLICY "profiles_own_update" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("id" = "auth"."uid"())) WITH CHECK (("id" = "auth"."uid"()));



ALTER TABLE "public"."progreso" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "progreso_docente_scoped_read" ON "public"."progreso" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM (("public"."inscripciones" "i"
     JOIN "public"."clases" "c" ON (("c"."id" = "i"."clase_id")))
     JOIN "public"."clase_libros" "cl" ON ((("cl"."clase_id" = "c"."id") AND ("cl"."libro_id" = "progreso"."libro_id"))))
  WHERE (("i"."estudiante_id" = "progreso"."usuario_id") AND ("c"."docente_id" = "auth"."uid"()) AND ("c"."escuela_id" = ( SELECT "p"."escuela_id"
           FROM "public"."profiles" "p"
          WHERE ("p"."id" = "auth"."uid"())))))));



CREATE POLICY "progreso_own_read" ON "public"."progreso" FOR SELECT TO "authenticated" USING (("usuario_id" = "auth"."uid"()));



ALTER TABLE "public"."respuestas" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "respuestas_admin_read" ON "public"."respuestas" FOR SELECT TO "authenticated" USING ("public"."es_admin"());



CREATE POLICY "respuestas_docente_scoped_read" ON "public"."respuestas" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM (("public"."inscripciones" "i"
     JOIN "public"."clases" "c" ON (("c"."id" = "i"."clase_id")))
     JOIN "public"."clase_libros" "cl" ON ((("cl"."clase_id" = "c"."id") AND ("cl"."libro_id" = "respuestas"."libro_id"))))
  WHERE (("i"."estudiante_id" = "respuestas"."usuario_id") AND ("c"."docente_id" = "auth"."uid"()) AND ("c"."escuela_id" = ( SELECT "p"."escuela_id"
           FROM "public"."profiles" "p"
          WHERE ("p"."id" = "auth"."uid"())))))));



CREATE POLICY "respuestas_own_read" ON "public"."respuestas" FOR SELECT TO "authenticated" USING (("usuario_id" = "auth"."uid"()));



ALTER TABLE "public"."superadministradores" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "superadministradores_admin_read" ON "public"."superadministradores" FOR SELECT TO "authenticated" USING ("public"."es_admin"());



ALTER TABLE "public"."tokens" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tokens_admin_all" ON "public"."tokens" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."rol" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."rol" = 'admin'::"text")))));



CREATE POLICY "tokens_own_read" ON "public"."tokens" FOR SELECT USING (("usuario_id" = "auth"."uid"()));



ALTER TABLE "public"."unidades" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "unidades_admin_write" ON "public"."unidades" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."rol" = 'admin'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."rol" = 'admin'::"text")))));



CREATE POLICY "unidades_authorized_read" ON "public"."unidades" FOR SELECT TO "authenticated" USING ("public"."puede_acceder_libro"("libro_id"));



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "public"."activar_token"("p_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."activar_token"("p_token" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."activar_token"("p_token" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."activar_token_docente"("p_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."activar_token_docente"("p_token" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."activar_token_docente"("p_token" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."admin_cambiar_rol_usuario"("p_usuario_id" "uuid", "p_rol" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_cambiar_rol_usuario"("p_usuario_id" "uuid", "p_rol" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."admin_cambiar_rol_usuario"("p_usuario_id" "uuid", "p_rol" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."admin_crear_tokens_docente"("p_escuela_id" "uuid", "p_emails" "text"[], "p_expira_en" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_crear_tokens_docente"("p_escuela_id" "uuid", "p_emails" "text"[], "p_expira_en" timestamp with time zone) TO "service_role";
GRANT ALL ON FUNCTION "public"."admin_crear_tokens_docente"("p_escuela_id" "uuid", "p_emails" "text"[], "p_expira_en" timestamp with time zone) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."admin_crear_tokens_libro"("p_escuela_id" "uuid", "p_libro_id" "text", "p_grado_id" integer, "p_cantidad" integer, "p_expira_en" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_crear_tokens_libro"("p_escuela_id" "uuid", "p_libro_id" "text", "p_grado_id" integer, "p_cantidad" integer, "p_expira_en" timestamp with time zone) TO "service_role";
GRANT ALL ON FUNCTION "public"."admin_crear_tokens_libro"("p_escuela_id" "uuid", "p_libro_id" "text", "p_grado_id" integer, "p_cantidad" integer, "p_expira_en" timestamp with time zone) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."admin_solicitar_accion_sensible"("p_tipo" "text", "p_payload" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_solicitar_accion_sensible"("p_tipo" "text", "p_payload" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_solicitar_accion_sensible_v2"("p_tipo" "text", "p_payload" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_solicitar_accion_sensible_v2"("p_tipo" "text", "p_payload" "jsonb") TO "service_role";
GRANT ALL ON FUNCTION "public"."admin_solicitar_accion_sensible_v2"("p_tipo" "text", "p_payload" "jsonb") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."auditar_actividad_admin"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."auditar_actividad_admin"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."bloquear_desactivacion_directa"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."bloquear_desactivacion_directa"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."buscar_clase_para_unirse"("p_codigo" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."buscar_clase_para_unirse"("p_codigo" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."buscar_clase_para_unirse"("p_codigo" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."campos_publicos_actividad"("p_tipo" "text", "p_campos" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."campos_publicos_actividad"("p_tipo" "text", "p_campos" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."campos_publicos_actividad_pre_acrostic"("p_tipo" "text", "p_campos" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."campos_publicos_actividad_pre_acrostic"("p_tipo" "text", "p_campos" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."campos_publicos_actividad_pre_crossword"("p_tipo" "text", "p_campos" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."campos_publicos_actividad_pre_crossword"("p_tipo" "text", "p_campos" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."campos_publicos_actividad_pre_matching"("p_tipo" "text", "p_campos" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."campos_publicos_actividad_pre_matching"("p_tipo" "text", "p_campos" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."campos_publicos_actividad_pre_syllables"("p_tipo" "text", "p_campos" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."campos_publicos_actividad_pre_syllables"("p_tipo" "text", "p_campos" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."consumir_limite_progreso"("p_usuario_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."consumir_limite_progreso"("p_usuario_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."crear_clase"("p_nombre" "text", "p_grado_id" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."crear_clase"("p_nombre" "text", "p_grado_id" integer) TO "service_role";
GRANT ALL ON FUNCTION "public"."crear_clase"("p_nombre" "text", "p_grado_id" integer) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."es_admin"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."es_admin"() TO "service_role";
GRANT ALL ON FUNCTION "public"."es_admin"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."es_superadministrador"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."es_superadministrador"() TO "service_role";
GRANT ALL ON FUNCTION "public"."es_superadministrador"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."evaluar_detalle_separar_silabas"("p_actividad_id" "text", "p_respuesta" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."evaluar_detalle_separar_silabas"("p_actividad_id" "text", "p_respuesta" "jsonb") TO "service_role";
GRANT ALL ON FUNCTION "public"."evaluar_detalle_separar_silabas"("p_actividad_id" "text", "p_respuesta" "jsonb") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."evaluar_intento_actividad"("p_actividad_id" "text", "p_respuesta" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."evaluar_intento_actividad"("p_actividad_id" "text", "p_respuesta" "jsonb") TO "service_role";
GRANT ALL ON FUNCTION "public"."evaluar_intento_actividad"("p_actividad_id" "text", "p_respuesta" "jsonb") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."evaluar_respuesta_actividad"("p_tipo" "text", "p_campos" "jsonb", "p_respuesta" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."evaluar_respuesta_actividad"("p_tipo" "text", "p_campos" "jsonb", "p_respuesta" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."evaluar_respuesta_actividad_pre_acrostic"("p_tipo" "text", "p_campos" "jsonb", "p_respuesta" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."evaluar_respuesta_actividad_pre_acrostic"("p_tipo" "text", "p_campos" "jsonb", "p_respuesta" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."evaluar_respuesta_actividad_pre_crossword"("p_tipo" "text", "p_campos" "jsonb", "p_respuesta" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."evaluar_respuesta_actividad_pre_crossword"("p_tipo" "text", "p_campos" "jsonb", "p_respuesta" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."evaluar_respuesta_actividad_pre_syllables"("p_tipo" "text", "p_campos" "jsonb", "p_respuesta" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."evaluar_respuesta_actividad_pre_syllables"("p_tipo" "text", "p_campos" "jsonb", "p_respuesta" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."generar_token_128"("p_prefijo" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."generar_token_128"("p_prefijo" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_actividad_publica"("p_actividad_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_actividad_publica"("p_actividad_id" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."get_actividad_publica"("p_actividad_id" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_libro_completo"("p_libro_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_libro_completo"("p_libro_id" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."get_libro_completo"("p_libro_id" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."get_mis_libros_estado"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_mis_libros_estado"() TO "service_role";
GRANT ALL ON FUNCTION "public"."get_mis_libros_estado"() TO "authenticated";



REVOKE ALL ON FUNCTION "public"."handle_new_user"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_admin"("uid" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_admin"("uid" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."is_admin"("uid" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."is_docente_of"("p_usuario_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_docente_of"("p_usuario_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."is_docente_of"("p_usuario_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."is_docente_of_clase"("p_clase_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_docente_of_clase"("p_clase_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."is_docente_of_clase"("p_clase_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."is_inscrito_en_clase"("p_clase_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_inscrito_en_clase"("p_clase_id" "uuid") TO "service_role";
GRANT ALL ON FUNCTION "public"."is_inscrito_en_clase"("p_clase_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."marcar_archivos_accion_rechazada"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."marcar_archivos_accion_rechazada"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."normalizar_crucigrama_texto"("p_valor" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."normalizar_crucigrama_texto"("p_valor" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."normalizar_respuesta_texto"("p_valor" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."normalizar_respuesta_texto"("p_valor" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."normalizar_separacion_silabas"("p_valor" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."normalizar_separacion_silabas"("p_valor" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."proteger_cambio_rol_aprobado"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."proteger_cambio_rol_aprobado"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."puede_acceder_libro"("p_libro_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."puede_acceder_libro"("p_libro_id" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."puede_acceder_libro"("p_libro_id" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."puede_acceder_objeto_libro"("p_object_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."puede_acceder_objeto_libro"("p_object_name" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."puede_acceder_objeto_libro"("p_object_name" "text") TO "authenticated";



GRANT ALL ON TABLE "public"."archivos_libro" TO "service_role";
GRANT SELECT ON TABLE "public"."archivos_libro" TO "authenticated";



REVOKE ALL ON FUNCTION "public"."registrar_archivo_libro_staging"("p_path" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."registrar_archivo_libro_staging"("p_path" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."registrar_progreso_actividad"("p_actividad_id" "text", "p_respuesta" "jsonb", "p_es_correcta" boolean, "p_guardar_respuesta" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."registrar_progreso_actividad"("p_actividad_id" "text", "p_respuesta" "jsonb", "p_es_correcta" boolean, "p_guardar_respuesta" boolean) TO "service_role";
GRANT ALL ON FUNCTION "public"."registrar_progreso_actividad"("p_actividad_id" "text", "p_respuesta" "jsonb", "p_es_correcta" boolean, "p_guardar_respuesta" boolean) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."registrar_progreso_actividad_pre_phase6_final"("p_actividad_id" "text", "p_respuesta" "jsonb", "p_es_correcta" boolean, "p_guardar_respuesta" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."registrar_progreso_actividad_pre_phase6_final"("p_actividad_id" "text", "p_respuesta" "jsonb", "p_es_correcta" boolean, "p_guardar_respuesta" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."rls_auto_enable"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."sesion_es_aal2"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sesion_es_aal2"() TO "anon";
GRANT ALL ON FUNCTION "public"."sesion_es_aal2"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sesion_es_aal2"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."superadmin_resolver_accion"("p_accion_id" "uuid", "p_aprobar" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."superadmin_resolver_accion"("p_accion_id" "uuid", "p_aprobar" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."superadmin_resolver_accion_fase3_interna"("p_accion_id" "uuid", "p_aprobar" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."superadmin_resolver_accion_fase3_interna"("p_accion_id" "uuid", "p_aprobar" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."superadmin_resolver_accion_v2"("p_accion_id" "uuid", "p_aprobar" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."superadmin_resolver_accion_v2"("p_accion_id" "uuid", "p_aprobar" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."superadmin_resolver_accion_v3"("p_accion_id" "uuid", "p_aprobar" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."superadmin_resolver_accion_v3"("p_accion_id" "uuid", "p_aprobar" boolean) TO "service_role";
GRANT ALL ON FUNCTION "public"."superadmin_resolver_accion_v3"("p_accion_id" "uuid", "p_aprobar" boolean) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."unirse_clase"("p_codigo" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."unirse_clase"("p_codigo" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."unirse_clase"("p_codigo" "text") TO "authenticated";



REVOKE ALL ON FUNCTION "public"."validar_actividad_identificar"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."validar_actividad_identificar"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."validar_payload_respuesta"("p_respuesta" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."validar_payload_respuesta"("p_respuesta" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."validar_publicacion_archivos_libro"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."validar_publicacion_archivos_libro"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."verificar_token"("p_token" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."verificar_token"("p_token" "text") TO "service_role";
GRANT ALL ON FUNCTION "public"."verificar_token"("p_token" "text") TO "authenticated";



GRANT ALL ON TABLE "public"."acciones_admin_pendientes" TO "service_role";
GRANT SELECT ON TABLE "public"."acciones_admin_pendientes" TO "authenticated";



GRANT ALL ON TABLE "public"."actividad_progreso" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."actividad_progreso" TO "authenticated";
GRANT ALL ON TABLE "public"."actividad_progreso" TO "service_role";



GRANT ALL ON TABLE "public"."actividades" TO "authenticated";
GRANT ALL ON TABLE "public"."actividades" TO "service_role";



GRANT ALL ON TABLE "public"."admin_logs" TO "service_role";
GRANT SELECT ON TABLE "public"."admin_logs" TO "authenticated";



GRANT ALL ON TABLE "public"."clase_libros" TO "authenticated";
GRANT ALL ON TABLE "public"."clase_libros" TO "service_role";



GRANT ALL ON TABLE "public"."clases" TO "authenticated";
GRANT ALL ON TABLE "public"."clases" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."escuela_libros" TO "authenticated";
GRANT ALL ON TABLE "public"."escuela_libros" TO "service_role";



GRANT SELECT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."escuelas" TO "authenticated";
GRANT ALL ON TABLE "public"."escuelas" TO "service_role";



GRANT ALL ON TABLE "public"."grados" TO "authenticated";
GRANT ALL ON TABLE "public"."grados" TO "service_role";



GRANT ALL ON SEQUENCE "public"."grados_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."grados_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."grados_id_seq" TO "service_role";



GRANT SELECT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN,UPDATE ON TABLE "public"."inscripciones" TO "authenticated";
GRANT ALL ON TABLE "public"."inscripciones" TO "service_role";



GRANT ALL ON TABLE "public"."intentos_actividad" TO "service_role";



GRANT SELECT("actividad_id") ON TABLE "public"."intentos_actividad" TO "authenticated";



GRANT SELECT("intentos") ON TABLE "public"."intentos_actividad" TO "authenticated";



GRANT SELECT("ultimo_resultado") ON TABLE "public"."intentos_actividad" TO "authenticated";



GRANT SELECT("completada") ON TABLE "public"."intentos_actividad" TO "authenticated";



GRANT SELECT("actualizado_en") ON TABLE "public"."intentos_actividad" TO "authenticated";



GRANT ALL ON TABLE "public"."intentos_clase" TO "service_role";



GRANT ALL ON TABLE "public"."intentos_token" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."libro_activaciones" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."libro_activaciones" TO "authenticated";
GRANT ALL ON TABLE "public"."libro_activaciones" TO "service_role";



GRANT SELECT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."libros" TO "authenticated";
GRANT ALL ON TABLE "public"."libros" TO "service_role";



GRANT ALL ON TABLE "public"."limites_progreso" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT SELECT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT UPDATE("nombre") ON TABLE "public"."profiles" TO "authenticated";



GRANT ALL ON TABLE "public"."progreso" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."progreso" TO "authenticated";
GRANT ALL ON TABLE "public"."progreso" TO "service_role";



GRANT ALL ON TABLE "public"."progreso_clase" TO "anon";
GRANT ALL ON TABLE "public"."progreso_clase" TO "authenticated";
GRANT ALL ON TABLE "public"."progreso_clase" TO "service_role";



GRANT ALL ON TABLE "public"."respuestas" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."respuestas" TO "authenticated";
GRANT ALL ON TABLE "public"."respuestas" TO "service_role";



GRANT ALL ON TABLE "public"."superadministradores" TO "service_role";
GRANT SELECT ON TABLE "public"."superadministradores" TO "authenticated";



GRANT SELECT,REFERENCES,DELETE,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."tokens" TO "authenticated";
GRANT ALL ON TABLE "public"."tokens" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."unidades" TO "authenticated";
GRANT ALL ON TABLE "public"."unidades" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";
