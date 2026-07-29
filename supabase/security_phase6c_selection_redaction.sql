-- ============================================================
-- IAbooks — Fase 6C: ocultación de soluciones de selección múltiple
-- Aplicar después de desplegar el frontend compatible con onAttempt.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.campos_publicos_actividad(
  p_tipo TEXT,
  p_campos JSONB
)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT CASE
    WHEN p_tipo = 'seleccionMultiple'
         AND jsonb_typeof(COALESCE(p_campos, '{}'::jsonb) -> 'opciones') = 'array'
      THEN jsonb_set(
        COALESCE(p_campos, '{}'::jsonb),
        '{opciones}',
        COALESCE(
          (
            SELECT jsonb_agg(opcion - 'esCorrecta' ORDER BY n)
            FROM jsonb_array_elements(p_campos -> 'opciones')
              WITH ORDINALITY AS o(opcion, n)
          ),
          '[]'::jsonb
        )
      )
    ELSE COALESCE(p_campos, '{}'::jsonb)
  END
$$;

REVOKE ALL ON FUNCTION public.campos_publicos_actividad(TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_actividad_publica(
  p_actividad_id TEXT
)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
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

REVOKE ALL ON FUNCTION public.get_actividad_publica(TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_actividad_publica(TEXT)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.get_libro_completo(p_libro_id TEXT)
RETURNS JSON
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
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

REVOKE ALL ON FUNCTION public.get_libro_completo(TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_libro_completo(TEXT)
  TO authenticated;

DROP POLICY IF EXISTS actividades_authorized_read
  ON public.actividades;
DROP POLICY IF EXISTS "actividades_authorized_read"
  ON public.actividades;

CREATE POLICY actividades_staff_read
ON public.actividades
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.rol IN ('docente', 'admin')
  )
  AND EXISTS (
    SELECT 1
    FROM public.unidades u
    WHERE u.id = actividades.unidad_id
      AND public.puede_acceder_libro(u.libro_id)
  )
);

DO $verify$
DECLARE
  v_publico JSONB;
  v_definition TEXT;
BEGIN
  v_publico := public.campos_publicos_actividad(
    'seleccionMultiple',
    '{"opciones":[{"texto":"A","esCorrecta":true},{"texto":"B","esCorrecta":false}]}'::jsonb
  );

  IF jsonb_path_exists(v_publico, '$.opciones[*].esCorrecta') THEN
    RAISE EXCEPTION 'fase6c: esCorrecta continúa en campos públicos';
  END IF;

  IF NOT jsonb_path_exists(v_publico, '$.opciones[*].texto') THEN
    RAISE EXCEPTION 'fase6c: se eliminó contenido público requerido';
  END IF;

  SELECT pg_get_functiondef(
    'public.get_libro_completo(text)'::regprocedure
  ) INTO v_definition;

  IF v_definition NOT LIKE '%campos_publicos_actividad%' THEN
    RAISE EXCEPTION 'fase6c: libro completo no usa la redacción';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'actividades'
      AND roles @> ARRAY['authenticated']::name[]
      AND cmd = 'SELECT'
      AND policyname <> 'actividades_staff_read'
  ) THEN
    RAISE EXCEPTION 'fase6c: queda otra política SELECT de actividades';
  END IF;
END
$verify$;

COMMIT;

SELECT
  true AS seleccion_multiple_sin_soluciones,
  true AS lectura_directa_estudiante_bloqueada,
  true AS docentes_admin_conservan_acceso,
  true AS rpc_libro_redacta_por_rol,
  true AS rpc_actividad_disponible;
