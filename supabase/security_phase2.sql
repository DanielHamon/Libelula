-- ============================================================
-- IAbooks — Fase 2: integridad de progreso y aislamiento
-- Aplicar una sola vez DESPUÉS de security_phase1.sql.
-- Ejecutar primero security_phase2_preflight.sql.
-- ============================================================

BEGIN;

-- Permiten que PostgreSQL garantice que una respuesta no mezcle IDs de
-- actividades, unidades y libros distintos.
ALTER TABLE public.unidades
  ADD CONSTRAINT unidades_id_libro_unique UNIQUE (id, libro_id);

ALTER TABLE public.actividades
  ADD CONSTRAINT actividades_id_unidad_unique UNIQUE (id, unidad_id);

ALTER TABLE public.respuestas
  ADD CONSTRAINT respuestas_actividad_unidad_fk
  FOREIGN KEY (actividad_id, unidad_id)
  REFERENCES public.actividades (id, unidad_id)
  ON DELETE CASCADE;

ALTER TABLE public.respuestas
  ADD CONSTRAINT respuestas_unidad_libro_fk
  FOREIGN KEY (unidad_id, libro_id)
  REFERENCES public.unidades (id, libro_id)
  ON DELETE CASCADE;

-- Única vía de escritura para el estudiante. El UID y libro/unidad se derivan
-- de la sesión y del catálogo; toda la operación comparte una transacción.
CREATE OR REPLACE FUNCTION public.registrar_progreso_actividad(
  p_actividad_id TEXT,
  p_respuesta JSONB DEFAULT NULL,
  p_es_correcta BOOLEAN DEFAULT NULL,
  p_guardar_respuesta BOOLEAN DEFAULT false
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_unidad_id TEXT;
  v_libro_id TEXT;
  v_rol TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'autenticacion_requerida' USING ERRCODE = '42501';
  END IF;

  SELECT rol INTO v_rol
  FROM public.profiles
  WHERE id = v_uid;

  IF v_rol IS DISTINCT FROM 'estudiante' THEN
    RAISE EXCEPTION 'solo_estudiantes_guardan_progreso'
      USING ERRCODE = '42501';
  END IF;

  SELECT a.unidad_id, u.libro_id
  INTO v_unidad_id, v_libro_id
  FROM public.actividades a
  JOIN public.unidades u ON u.id = a.unidad_id
  WHERE a.id = p_actividad_id;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'motivo', 'actividad_no_encontrada');
  END IF;

  IF NOT public.puede_acceder_libro(v_libro_id) THEN
    RAISE EXCEPTION 'licencia_requerida' USING ERRCODE = '42501';
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
      p_respuesta, p_es_correcta, now()
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
    'libro_id', v_libro_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_progreso_actividad(TEXT, JSONB, BOOLEAN, BOOLEAN)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_progreso_actividad(TEXT, JSONB, BOOLEAN, BOOLEAN)
  TO authenticated;

-- Ya no se aceptan INSERT/UPDATE/DELETE directos desde PostgREST.
REVOKE INSERT, UPDATE, DELETE ON public.progreso FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.actividad_progreso FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.respuestas FROM authenticated;
REVOKE INSERT ON public.inscripciones FROM authenticated;

-- Políticas explícitas de solo lectura. El docente solo observa progreso de
-- estudiantes inscritos en una clase suya que además tenga asignado ese libro.
DROP POLICY IF EXISTS "progreso_own" ON public.progreso;
DROP POLICY IF EXISTS "progreso_docente_read" ON public.progreso;
CREATE POLICY "progreso_own_read" ON public.progreso
  FOR SELECT TO authenticated
  USING (usuario_id = auth.uid());
CREATE POLICY "progreso_docente_scoped_read" ON public.progreso
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.inscripciones i
      JOIN public.clases c ON c.id = i.clase_id
      JOIN public.clase_libros cl
        ON cl.clase_id = c.id AND cl.libro_id = progreso.libro_id
      WHERE i.estudiante_id = progreso.usuario_id
        AND c.docente_id = auth.uid()
        AND c.escuela_id = (
          SELECT p.escuela_id FROM public.profiles p WHERE p.id = auth.uid()
        )
    )
  );

DROP POLICY IF EXISTS "act_progreso_own" ON public.actividad_progreso;
DROP POLICY IF EXISTS "act_progreso_docente_read" ON public.actividad_progreso;
CREATE POLICY "act_progreso_own_read" ON public.actividad_progreso
  FOR SELECT TO authenticated
  USING (usuario_id = auth.uid());
CREATE POLICY "act_progreso_docente_scoped_read" ON public.actividad_progreso
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.actividades a
      JOIN public.unidades u ON u.id = a.unidad_id
      JOIN public.inscripciones i
        ON i.estudiante_id = actividad_progreso.usuario_id
      JOIN public.clases c ON c.id = i.clase_id
      JOIN public.clase_libros cl
        ON cl.clase_id = c.id AND cl.libro_id = u.libro_id
      WHERE a.id = actividad_progreso.actividad_id
        AND c.docente_id = auth.uid()
        AND c.escuela_id = (
          SELECT p.escuela_id FROM public.profiles p WHERE p.id = auth.uid()
        )
    )
  );

DROP POLICY IF EXISTS "respuestas_own" ON public.respuestas;
DROP POLICY IF EXISTS "respuestas_docente_read" ON public.respuestas;
DROP POLICY IF EXISTS "respuestas_admin" ON public.respuestas;
CREATE POLICY "respuestas_own_read" ON public.respuestas
  FOR SELECT TO authenticated
  USING (usuario_id = auth.uid());
CREATE POLICY "respuestas_docente_scoped_read" ON public.respuestas
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.inscripciones i
      JOIN public.clases c ON c.id = i.clase_id
      JOIN public.clase_libros cl
        ON cl.clase_id = c.id AND cl.libro_id = respuestas.libro_id
      WHERE i.estudiante_id = respuestas.usuario_id
        AND c.docente_id = auth.uid()
        AND c.escuela_id = (
          SELECT p.escuela_id FROM public.profiles p WHERE p.id = auth.uid()
        )
    )
  );
CREATE POLICY "respuestas_admin_read" ON public.respuestas
  FOR SELECT TO authenticated
  USING (public.es_admin());

-- Inscribirse solo es posible con la RPC endurecida de fase 1.
DROP POLICY IF EXISTS "inscripciones_own_insert" ON public.inscripciones;

COMMIT;
