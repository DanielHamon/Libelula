-- IAbooks — Fase 7: hotfix de generación de códigos de clase
-- Sustituye gen_random_bytes, que puede vivir en un esquema de extensiones no
-- incluido en el search_path endurecido, por gen_random_uuid de PostgreSQL.

BEGIN;

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

REVOKE ALL ON FUNCTION public.crear_clase(TEXT, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crear_clase(TEXT, INTEGER) TO authenticated;

COMMIT;

SELECT
  NOT has_function_privilege(
    'anon', 'public.crear_clase(text,integer)', 'EXECUTE'
  ) AS crear_clase_anon_bloqueada,
  has_function_privilege(
    'authenticated', 'public.crear_clase(text,integer)', 'EXECUTE'
  ) AS crear_clase_auth_habilitada,
  (
    SELECT pg_get_functiondef(p.oid) ILIKE '%gen_random_uuid()%'
       AND pg_get_functiondef(p.oid) NOT ILIKE '%gen_random_bytes%'
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'crear_clase'
      AND pg_get_function_identity_arguments(p.oid)
        = 'p_nombre text, p_grado_id integer'
  ) AS generador_compatible_activo;
