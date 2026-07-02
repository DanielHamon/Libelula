-- ============================================================
-- IAbooks — Supabase PostgreSQL Schema (v4, multi-tenant)
-- Ejecutar completo en: Supabase Dashboard > SQL Editor
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── grados ───────────────────────────────────────────────────
-- id INTEGER (SERIAL) — todos los grado_id del sistema son INTEGER, sin excepción
CREATE TABLE grados (
  id     SERIAL PRIMARY KEY,
  nombre TEXT    NOT NULL,
  nivel  TEXT    NOT NULL CHECK (nivel IN ('primaria', 'secundaria')),
  orden  INTEGER NOT NULL,
  UNIQUE (nivel, orden)
);

INSERT INTO grados (nombre, nivel, orden) VALUES
  ('1° primaria', 'primaria', 1),
  ('2° primaria', 'primaria', 2),
  ('3° primaria', 'primaria', 3),
  ('4° primaria', 'primaria', 4),
  ('5° primaria', 'primaria', 5),
  ('6° primaria', 'primaria', 6);

-- ── escuelas ─────────────────────────────────────────────────
CREATE TABLE escuelas (
  id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre  TEXT    NOT NULL,
  ciudad  TEXT,
  activa  BOOLEAN NOT NULL DEFAULT true
);

-- ── profiles ─────────────────────────────────────────────────
CREATE TABLE profiles (
  id             UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre         TEXT NOT NULL,
  email          TEXT,
  escuela        TEXT,                              -- campo legacy, reemplazado por escuela_id
  escuela_id     UUID    REFERENCES escuelas(id),
  grado_id       INTEGER REFERENCES grados(id),    -- nullable: se asigna al activar token
  rol            TEXT NOT NULL DEFAULT 'estudiante'
                   CHECK (rol IN ('estudiante', 'docente', 'admin')),
  fecha_registro TIMESTAMPTZ DEFAULT now()
);

-- ── libros ───────────────────────────────────────────────────
-- pdf_url y portada_url guardan el PATH relativo dentro del bucket,
-- NO la URL completa. La URL firmada se genera en runtime.
CREATE TABLE libros (
  id              TEXT PRIMARY KEY,
  titulo          TEXT NOT NULL,
  descripcion     TEXT,
  emoji           TEXT,
  pdf_url         TEXT,
  portada_url     TEXT,
  grado_id        INTEGER REFERENCES grados(id),   -- nullable para libros existentes
  color_acento    TEXT DEFAULT '#e91e8c',
  canciones       JSONB DEFAULT '[]',
  videos_animados JSONB DEFAULT '[]',
  hotspots        JSONB DEFAULT '[]'
);

-- ── escuela_libros ───────────────────────────────────────────
-- Relación muchos-a-muchos: qué libros ha comprado cada escuela.
-- Esta tabla define qué libros están disponibles para una escuela.
CREATE TABLE escuela_libros (
  escuela_id  UUID REFERENCES escuelas(id) ON DELETE CASCADE,
  libro_id    TEXT REFERENCES libros(id)   ON DELETE CASCADE,
  comprado_en TIMESTAMPTZ DEFAULT now(),
  -- orden_compra_id TEXT  ← reservado para historial futuro
  PRIMARY KEY (escuela_id, libro_id)
);

-- ── unidades ─────────────────────────────────────────────────
CREATE TABLE unidades (
  id        TEXT PRIMARY KEY,
  libro_id  TEXT NOT NULL REFERENCES libros(id) ON DELETE CASCADE,
  titulo    TEXT NOT NULL,
  etiqueta  TEXT,
  subtitulo TEXT,
  emoji     TEXT,
  orden     INTEGER NOT NULL,
  UNIQUE (libro_id, orden)
);

-- ── actividades ──────────────────────────────────────────────
-- Contrato de campos por tipo:
-- sopa_letras:        { palabras: string[], numPalabras: int, espacio: int }
-- video_tiktok:       { url: string, titulo: string }
-- colorear:           { imagenUrl: string, imagenColorUrl: string }
-- completar_oracion:  { oracion: string, respuesta: string }
-- ordenar_palabras:   { palabras: string[], respuestaCorrecta: string[] }
-- seleccionar_imagen: { opciones: [{url, esCorrecta}] }
-- audio:              { url: string, transcripcion?: string }
-- pregunta:           { pregunta: string, opciones: string[], correcta: int }
-- termometroEmocional:{ instruccion: string, label: string, emoji: string, min: int, max: int, minLabel: string, maxLabel: string, estados: [{id,desde,emoji,texto}] }
-- emparejar:          { pares: [{izquierda, derecha}] }
-- arrastrar:          { items: string[], destinos: string[] }
-- galeria:            { imagenes: [{url, caption?}] }
CREATE TABLE actividades (
  id        TEXT PRIMARY KEY,
  unidad_id TEXT NOT NULL REFERENCES unidades(id) ON DELETE CASCADE,
  tipo      TEXT NOT NULL CHECK (tipo IN (
    'sopaLetras','seleccionMultiple','identificar','termometroEmocional','verdaderoFalso','completarPalabras',
    'ordenarEventos','emparejar','completarMapa','escribirCarta','dibujoLibre',
    'video','audio','imagen','colorear'
  )),
  orden     INTEGER NOT NULL,
  campos    JSONB DEFAULT '{}',
  UNIQUE (unidad_id, orden)
);

-- ── tokens ───────────────────────────────────────────────────
-- tipo='libro':   escuela_id + grado_id obligatorios
-- tipo='docente': escuela_id + email_autorizado obligatorios
-- usos_maximos=1 (default) → uso único; >1 → licencia grupal
CREATE TABLE tokens (
  id              TEXT PRIMARY KEY,              -- unicidad garantizada por PK
  estado          TEXT NOT NULL DEFAULT 'valido'
                    CHECK (estado IN ('valido', 'activado', 'desactivado', 'revocado')),
  tipo            TEXT DEFAULT 'libro'
                    CHECK (tipo IN ('libro', 'docente')),
  libro_id        TEXT REFERENCES libros(id),
  libro_titulo    TEXT,
  escuela_id      UUID    REFERENCES escuelas(id),
  grado_id        INTEGER REFERENCES grados(id),
  email_autorizado TEXT,
  usuario_id      UUID REFERENCES profiles(id),
  activado_en     TIMESTAMPTZ,
  expira_en       TIMESTAMPTZ,
  usos_maximos    INTEGER DEFAULT 1,
  fecha_creacion  TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT token_activado_requiere_usuario
    CHECK (estado != 'activado' OR usuario_id IS NOT NULL),
  -- NOT VALID: aplica a tokens nuevos; tokens históricos sin escuela/grado quedan exentos
  CONSTRAINT token_tipo_campos CHECK (
    estado = 'revocado'
    OR tipo IS NULL
    OR (tipo = 'libro'   AND escuela_id IS NOT NULL AND grado_id IS NOT NULL)
    OR (tipo = 'docente' AND escuela_id IS NOT NULL AND email_autorizado IS NOT NULL)
  ) NOT VALID
);

-- ── clases ───────────────────────────────────────────────────
-- escuela_id se deriva del docente autenticado en la RPC crear_clase,
-- nunca viene del frontend.
CREATE TABLE clases (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre     TEXT NOT NULL,
  codigo     TEXT UNIQUE NOT NULL,
  docente_id UUID NOT NULL REFERENCES profiles(id),
  escuela_id UUID    REFERENCES escuelas(id),
  grado_id   INTEGER REFERENCES grados(id),
  activa     BOOLEAN DEFAULT true,
  creada_en  TIMESTAMPTZ DEFAULT now()
);

-- ── clase_libros ─────────────────────────────────────────────
CREATE TABLE clase_libros (
  clase_id     UUID REFERENCES clases(id) ON DELETE CASCADE,
  libro_id     TEXT REFERENCES libros(id) ON DELETE CASCADE,
  libro_titulo TEXT,
  PRIMARY KEY (clase_id, libro_id)
);

-- ── inscripciones ────────────────────────────────────────────
CREATE TABLE inscripciones (
  clase_id      UUID REFERENCES clases(id) ON DELETE CASCADE,
  estudiante_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  inscrito_en   TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (clase_id, estudiante_id)
);

-- ── libro_activaciones ───────────────────────────────────────
-- Fuente de verdad del acceso: un usuario accede a un libro
-- SOLO si existe una fila aquí.
CREATE TABLE libro_activaciones (
  usuario_id  UUID REFERENCES profiles(id) ON DELETE CASCADE,
  libro_id    TEXT REFERENCES libros(id),
  token_id    TEXT REFERENCES tokens(id),
  activado_en TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (usuario_id, libro_id)
);

-- ── progreso ─────────────────────────────────────────────────
CREATE TABLE progreso (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  libro_id         TEXT NOT NULL REFERENCES libros(id) ON DELETE CASCADE,
  ultima_actividad TIMESTAMPTZ,
  UNIQUE (usuario_id, libro_id)
);

-- ── actividad_progreso ───────────────────────────────────────
CREATE TABLE actividad_progreso (
  usuario_id    UUID REFERENCES profiles(id) ON DELETE CASCADE,
  actividad_id  TEXT REFERENCES actividades(id) ON DELETE CASCADE,
  completada_en TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (usuario_id, actividad_id)
);

-- ── respuestas ───────────────────────────────────────────────
-- Guarda la respuesta de cada estudiante por actividad (upsert al completar)
CREATE TABLE respuestas (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  actividad_id TEXT NOT NULL REFERENCES actividades(id) ON DELETE CASCADE,
  libro_id     TEXT NOT NULL REFERENCES libros(id) ON DELETE CASCADE,
  unidad_id    TEXT NOT NULL REFERENCES unidades(id) ON DELETE CASCADE,
  respuesta    JSONB,
  es_correcta  BOOLEAN,
  created_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE(usuario_id, actividad_id)
);

-- ── Índices ──────────────────────────────────────────────────
CREATE INDEX idx_unidades_libro             ON unidades(libro_id, orden);
CREATE INDEX idx_actividades_unidad         ON actividades(unidad_id, orden);
CREATE INDEX idx_clases_docente             ON clases(docente_id);
CREATE INDEX idx_clases_escuela             ON clases(escuela_id);
CREATE INDEX idx_inscripciones_est          ON inscripciones(estudiante_id);
CREATE INDEX idx_progreso_usr_libro         ON progreso(usuario_id, libro_id);
CREATE INDEX idx_act_progreso_usuario       ON actividad_progreso(usuario_id);
CREATE INDEX idx_act_progreso_actividad     ON actividad_progreso(actividad_id);
CREATE INDEX idx_tokens_estado              ON tokens(estado);
CREATE INDEX idx_tokens_libro               ON tokens(libro_id);
CREATE INDEX idx_escuela_libros_escuela     ON escuela_libros(escuela_id, libro_id);
CREATE INDEX idx_escuela_libros_libro       ON escuela_libros(libro_id, escuela_id);
CREATE INDEX idx_libros_grado               ON libros(grado_id);
CREATE INDEX idx_profiles_escuela           ON profiles(escuela_id);

-- ── Trigger: crear profile al registrarse ────────────────────
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, nombre, email, escuela, rol)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nombre', ''),
    NEW.email,
    NEW.raw_user_meta_data->>'escuela',
    COALESCE(NEW.raw_user_meta_data->>'rol', 'estudiante')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE profiles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE progreso           ENABLE ROW LEVEL SECURITY;
ALTER TABLE actividad_progreso ENABLE ROW LEVEL SECURITY;
ALTER TABLE clases             ENABLE ROW LEVEL SECURITY;
ALTER TABLE inscripciones      ENABLE ROW LEVEL SECURITY;
ALTER TABLE tokens             ENABLE ROW LEVEL SECURITY;
ALTER TABLE libro_activaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE escuelas           ENABLE ROW LEVEL SECURITY;
ALTER TABLE grados             ENABLE ROW LEVEL SECURITY;
ALTER TABLE escuela_libros     ENABLE ROW LEVEL SECURITY;
ALTER TABLE respuestas         ENABLE ROW LEVEL SECURITY;
-- Contenido del catálogo: lectura pública, escritura solo admin
ALTER TABLE libros             ENABLE ROW LEVEL SECURITY;
ALTER TABLE unidades           ENABLE ROW LEVEL SECURITY;
ALTER TABLE actividades        ENABLE ROW LEVEL SECURITY;

-- profiles
CREATE POLICY "profiles_own" ON profiles
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY "profiles_docente_read" ON profiles
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM inscripciones i
      JOIN clases c ON c.id = i.clase_id
      WHERE i.estudiante_id = profiles.id
        AND c.docente_id = auth.uid()
    )
  );

-- catálogos: lectura pública
CREATE POLICY "libros_read"      ON libros      FOR SELECT USING (true);
CREATE POLICY "unidades_read"    ON unidades    FOR SELECT USING (true);
CREATE POLICY "actividades_read" ON actividades FOR SELECT USING (true);
CREATE POLICY "grados_read"      ON grados      FOR SELECT USING (true);
CREATE POLICY "escuelas_read"    ON escuelas    FOR SELECT USING (true);

-- catálogos: escritura exclusiva del admin (el service_role ya tiene acceso total)
CREATE POLICY "libros_admin_write" ON libros
  FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rol = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rol = 'admin'));

CREATE POLICY "unidades_admin_write" ON unidades
  FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rol = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rol = 'admin'));

CREATE POLICY "actividades_admin_write" ON actividades
  FOR ALL USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rol = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rol = 'admin'));

-- escuela_libros: docente solo ve libros de su escuela
CREATE POLICY "escuela_libros_docente" ON escuela_libros
  FOR SELECT USING (
    escuela_id = (SELECT escuela_id FROM profiles WHERE id = auth.uid())
  );

-- progreso
CREATE POLICY "progreso_own" ON progreso
  USING (usuario_id = auth.uid())
  WITH CHECK (usuario_id = auth.uid());

CREATE POLICY "act_progreso_own" ON actividad_progreso
  USING (usuario_id = auth.uid())
  WITH CHECK (usuario_id = auth.uid());

CREATE POLICY "progreso_docente_read" ON progreso
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM inscripciones i
      JOIN clases c ON c.id = i.clase_id
      WHERE i.estudiante_id = progreso.usuario_id
        AND c.docente_id = auth.uid()
    )
  );

CREATE POLICY "act_progreso_docente_read" ON actividad_progreso
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM inscripciones i
      JOIN clases c ON c.id = i.clase_id
      WHERE i.estudiante_id = actividad_progreso.usuario_id
        AND c.docente_id = auth.uid()
    )
  );

-- clases: INSERT lo maneja crear_clase (SECURITY DEFINER), sin política de INSERT
CREATE POLICY "clases_docente_select" ON clases
  FOR SELECT
  USING (
    docente_id = auth.uid()
    AND escuela_id = (SELECT escuela_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "clases_docente_update" ON clases
  FOR UPDATE
  USING (
    docente_id = auth.uid()
    AND escuela_id = (SELECT escuela_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "clases_docente_delete" ON clases
  FOR DELETE
  USING (
    docente_id = auth.uid()
    AND escuela_id = (SELECT escuela_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "clases_estudiante_read" ON clases
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM inscripciones
      WHERE clase_id = clases.id AND estudiante_id = auth.uid()
    )
  );

-- inscripciones
CREATE POLICY "inscripciones_docente" ON inscripciones
  USING (
    EXISTS (SELECT 1 FROM clases WHERE id = inscripciones.clase_id AND docente_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM clases WHERE id = inscripciones.clase_id AND docente_id = auth.uid())
  );

CREATE POLICY "inscripciones_own_read" ON inscripciones
  FOR SELECT USING (estudiante_id = auth.uid());

CREATE POLICY "inscripciones_own_insert" ON inscripciones
  FOR INSERT WITH CHECK (
    estudiante_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM clases c
      JOIN profiles p ON p.id = auth.uid()
      WHERE c.id = inscripciones.clase_id
        AND c.escuela_id = p.escuela_id
    )
  );

-- tokens: solo validación vía RPC SECURITY DEFINER, nunca exponer la tabla
CREATE POLICY "tokens_own_read" ON tokens
  FOR SELECT USING (usuario_id = auth.uid());

CREATE POLICY "tokens_admin_all" ON tokens
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rol = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rol = 'admin')
  );

-- libro_activaciones
CREATE POLICY "libro_act_own" ON libro_activaciones
  USING (usuario_id = auth.uid())
  WITH CHECK (usuario_id = auth.uid());

-- respuestas
CREATE POLICY "respuestas_own" ON respuestas
  FOR ALL USING (usuario_id = auth.uid());

CREATE POLICY "respuestas_docente_read" ON respuestas
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM inscripciones i
      JOIN clases c ON c.id = i.clase_id
      WHERE i.estudiante_id = respuestas.usuario_id
        AND c.docente_id = auth.uid()
    )
  );

CREATE POLICY "respuestas_admin" ON respuestas
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rol = 'admin')
  );

-- ── RPC: get_libro_completo ───────────────────────────────────
-- Evita N+1: trae libro + unidades + actividades en una sola query.
CREATE OR REPLACE FUNCTION get_libro_completo(p_libro_id TEXT)
RETURNS JSON AS $$
  SELECT json_build_object(
    'libro', row_to_json(l),
    'unidades', COALESCE(json_agg(
      json_build_object(
        'id',          u.id,
        'titulo',      u.titulo,
        'etiqueta',    u.etiqueta,
        'subtitulo',   u.subtitulo,
        'emoji',       u.emoji,
        'orden',       u.orden,
        'actividades', (
          SELECT COALESCE(json_agg(row_to_json(a) ORDER BY a.orden), '[]')
          FROM actividades a WHERE a.unidad_id = u.id
        )
      ) ORDER BY u.orden
    ) FILTER (WHERE u.id IS NOT NULL), '[]')
  )
  FROM libros l
  LEFT JOIN unidades u ON u.libro_id = l.id
  WHERE l.id = p_libro_id
  GROUP BY l.id;
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- ── RPC: verificar_token ─────────────────────────────────────
-- Valida token sin exponer la tabla al cliente.
-- Devuelve tipo, escuela_id, grado_id para que el frontend bifurque el flujo.
-- Rate limiting: usuarios autenticados máximo 10 intentos fallidos por hora.
-- Para anon (auth.uid() IS NULL) no hay rate limiting en DB; usar Edge Function
-- con IP si se necesita proteger también ese caso.
CREATE OR REPLACE FUNCTION verificar_token(p_token TEXT)
RETURNS JSON AS $$
DECLARE
  v_token   tokens%ROWTYPE;
  v_uid     UUID := auth.uid();
  v_intentos INTEGER;
BEGIN
  -- Rate limiting por UID (solo usuarios autenticados)
  IF v_uid IS NOT NULL THEN
    SELECT COUNT(*) INTO v_intentos
    FROM intentos_token
    WHERE uid = v_uid AND intentado_en > now() - interval '1 hour';

    IF v_intentos >= 10 THEN
      RETURN json_build_object('valido', false, 'motivo', 'demasiados_intentos');
    END IF;
  END IF;

  SELECT * INTO v_token FROM tokens WHERE id = p_token;

  IF NOT FOUND THEN
    IF v_uid IS NOT NULL THEN
      INSERT INTO intentos_token(uid) VALUES (v_uid);
      DELETE FROM intentos_token WHERE intentado_en < now() - interval '24 hours';
    END IF;
    RETURN json_build_object('valido', false, 'motivo', 'no_existe');
  END IF;

  IF v_token.expira_en IS NOT NULL AND now() > v_token.expira_en THEN
    RETURN json_build_object('valido', false, 'motivo', 'expirado');
  END IF;

  IF v_token.estado = 'activado' THEN
    RETURN json_build_object('valido', false, 'motivo', 'ya_activado');
  END IF;

  IF v_token.estado IN ('desactivado', 'revocado') THEN
    IF v_uid IS NOT NULL THEN
      INSERT INTO intentos_token(uid) VALUES (v_uid);
      DELETE FROM intentos_token WHERE intentado_en < now() - interval '24 hours';
    END IF;
    RETURN json_build_object('valido', false, 'motivo', 'desactivado');
  END IF;

  RETURN json_build_object(
    'valido',           true,
    'tipo',             v_token.tipo,
    'libro_id',         v_token.libro_id,
    'libro_titulo',     v_token.libro_titulo,
    'escuela_id',       v_token.escuela_id,
    'grado_id',         v_token.grado_id,
    'email_autorizado', v_token.email_autorizado
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── RPC: activar_token ───────────────────────────────────────
-- Solo para tokens de tipo 'libro'.
-- Valida expiración, coherencia libro↔escuela/grado,
-- asigna escuela y grado al profile SOLO si son NULL (nunca sobrescribe).
CREATE OR REPLACE FUNCTION activar_token(p_token TEXT, p_usuario_id UUID)
RETURNS JSON AS $$
DECLARE
  v_token   tokens%ROWTYPE;
  v_profile profiles%ROWTYPE;
  v_libro   libros%ROWTYPE;
  v_updated tokens%ROWTYPE;
BEGIN
  SELECT * INTO v_token FROM tokens WHERE id = p_token;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'motivo', 'no_existe');
  END IF;

  IF v_token.expira_en IS NOT NULL AND now() > v_token.expira_en THEN
    RETURN json_build_object('ok', false, 'motivo', 'expirado');
  END IF;

  IF v_token.tipo = 'docente' THEN
    RETURN json_build_object('ok', false, 'motivo', 'usar_activar_token_docente');
  END IF;

  -- Validar que el libro pertenece a la escuela del token
  IF NOT EXISTS (
    SELECT 1 FROM escuela_libros
    WHERE escuela_id = v_token.escuela_id AND libro_id = v_token.libro_id
  ) THEN
    RETURN json_build_object('ok', false, 'motivo', 'libro_no_disponible_en_escuela');
  END IF;

  -- Validar que el grado del libro coincide con el grado del token (si aplica)
  SELECT * INTO v_libro FROM libros WHERE id = v_token.libro_id;
  IF v_libro.grado_id IS NOT NULL AND v_libro.grado_id != v_token.grado_id THEN
    RETURN json_build_object('ok', false, 'motivo', 'grado_no_coincide');
  END IF;

  -- Activación atómica: race condition imposible con WHERE estado='valido'
  UPDATE tokens
  SET estado = 'activado', usuario_id = p_usuario_id, activado_en = now()
  WHERE id = p_token AND estado = 'valido'
  RETURNING * INTO v_updated;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'motivo', 'token_no_disponible');
  END IF;

  -- Asignar escuela y grado al profile SOLO si son NULL (nunca sobrescribir)
  SELECT * INTO v_profile FROM profiles WHERE id = p_usuario_id;
  IF v_profile.escuela_id IS NULL THEN
    UPDATE profiles SET escuela_id = v_token.escuela_id WHERE id = p_usuario_id;
  END IF;
  IF v_profile.grado_id IS NULL THEN
    UPDATE profiles SET grado_id = v_token.grado_id WHERE id = p_usuario_id;
  END IF;

  INSERT INTO libro_activaciones (usuario_id, libro_id, token_id)
  VALUES (p_usuario_id, v_updated.libro_id, p_token)
  ON CONFLICT (usuario_id, libro_id) DO NOTHING;

  RETURN json_build_object('ok', true, 'libro_id', v_updated.libro_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── RPC: activar_token_docente ───────────────────────────────
-- Solo para tokens de tipo 'docente'.
-- Valida email dentro de la RPC — nunca confiar en el frontend.
-- Asigna rol='docente' y escuela_id al profile SOLO si escuela_id es NULL.
CREATE OR REPLACE FUNCTION activar_token_docente(p_token TEXT, p_usuario_id UUID, p_email TEXT)
RETURNS JSON AS $$
DECLARE
  v_token   tokens%ROWTYPE;
  v_profile profiles%ROWTYPE;
  v_updated tokens%ROWTYPE;
BEGIN
  SELECT * INTO v_token FROM tokens WHERE id = p_token;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'motivo', 'no_existe');
  END IF;

  IF v_token.expira_en IS NOT NULL AND now() > v_token.expira_en THEN
    RETURN json_build_object('ok', false, 'motivo', 'expirado');
  END IF;

  IF v_token.estado != 'valido' THEN
    RETURN json_build_object('ok', false, 'motivo', 'token_no_disponible');
  END IF;

  IF v_token.tipo != 'docente' THEN
    RETURN json_build_object('ok', false, 'motivo', 'tipo_incorrecto');
  END IF;

  -- Validación de email en RPC — un usuario puede llamar la RPC directo sin pasar por el frontend
  IF v_token.email_autorizado != p_email THEN
    RETURN json_build_object('ok', false, 'motivo', 'email_no_autorizado');
  END IF;

  -- Activación atómica
  UPDATE tokens
  SET estado = 'activado', usuario_id = p_usuario_id, activado_en = now()
  WHERE id = p_token AND estado = 'valido'
  RETURNING * INTO v_updated;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'motivo', 'token_no_disponible');
  END IF;

  -- Asignar rol docente y escuela SOLO si escuela_id es NULL (nunca sobrescribir)
  SELECT * INTO v_profile FROM profiles WHERE id = p_usuario_id;
  IF v_profile.escuela_id IS NULL THEN
    UPDATE profiles
    SET rol = 'docente', escuela_id = v_token.escuela_id
    WHERE id = p_usuario_id;
  END IF;

  RETURN json_build_object('ok', true, 'escuela_id', v_token.escuela_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── RPC: buscar_clase_para_unirse ───────────────────────────
-- Valida servidor-side que la clase existe, está activa, pertenece a la
-- misma escuela y grado del estudiante autenticado, y que no esté inscrito.
-- Devuelve info de la clase para mostrar preview antes de confirmar.
CREATE OR REPLACE FUNCTION buscar_clase_para_unirse(p_codigo TEXT)
RETURNS JSON AS $$
DECLARE
  v_clase   clases%ROWTYPE;
  v_profile profiles%ROWTYPE;
  v_libros  JSON;
BEGIN
  SELECT * INTO v_profile FROM profiles WHERE id = auth.uid();

  SELECT * INTO v_clase
  FROM clases WHERE codigo = upper(trim(p_codigo)) AND activa = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'no_encontrada');
  END IF;

  IF v_clase.escuela_id IS NOT NULL AND v_profile.escuela_id IS NOT NULL
     AND v_clase.escuela_id != v_profile.escuela_id THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'escuela_incorrecta');
  END IF;

  IF v_clase.grado_id IS NOT NULL AND v_profile.grado_id IS NOT NULL
     AND v_clase.grado_id != v_profile.grado_id THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'grado_incorrecto');
  END IF;

  IF EXISTS (
    SELECT 1 FROM inscripciones
    WHERE clase_id = v_clase.id AND estudiante_id = auth.uid()
  ) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'ya_inscrito');
  END IF;

  SELECT json_agg(jsonb_build_object('libroId', libro_id, 'libroTitulo', libro_titulo))
  INTO v_libros
  FROM clase_libros WHERE clase_id = v_clase.id;

  RETURN jsonb_build_object(
    'ok',    true,
    'clase', jsonb_build_object(
      'id',     v_clase.id,
      'nombre', v_clase.nombre,
      'codigo', v_clase.codigo,
      'libros', COALESCE(v_libros, '[]'::json)
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── RPC: unirse_clase ─────────────────────────────────────────
-- Valida y ejecuta la inscripción usando el CODIGO (no el ID) para evitar
-- enumeración de UUIDs. Re-valida escuela y grado en el servidor aunque
-- buscar_clase_para_unirse ya los haya validado en el paso anterior.
CREATE OR REPLACE FUNCTION unirse_clase(p_codigo TEXT)
RETURNS JSON AS $$
DECLARE
  v_clase   clases%ROWTYPE;
  v_profile profiles%ROWTYPE;
BEGIN
  SELECT * INTO v_profile FROM profiles WHERE id = auth.uid();

  SELECT * INTO v_clase
  FROM clases WHERE codigo = upper(trim(p_codigo)) AND activa = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'no_encontrada');
  END IF;

  IF v_clase.escuela_id IS NOT NULL AND v_profile.escuela_id IS NOT NULL
     AND v_clase.escuela_id != v_profile.escuela_id THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'escuela_incorrecta');
  END IF;

  IF v_clase.grado_id IS NOT NULL AND v_profile.grado_id IS NOT NULL
     AND v_clase.grado_id != v_profile.grado_id THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'grado_incorrecto');
  END IF;

  INSERT INTO inscripciones (clase_id, estudiante_id)
  VALUES (v_clase.id, auth.uid())
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object('ok', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── RPC: crear_clase ─────────────────────────────────────────
-- escuela_id se deriva del docente autenticado, NUNCA viene del frontend.
-- Esto elimina el riesgo de que un docente cree clases en otra escuela.
CREATE OR REPLACE FUNCTION crear_clase(p_nombre TEXT, p_grado_id INTEGER)
RETURNS JSON AS $$
DECLARE
  v_escuela_id UUID;
  v_codigo     TEXT;
  v_clase_id   UUID;
BEGIN
  SELECT escuela_id INTO v_escuela_id
  FROM profiles WHERE id = auth.uid();

  IF v_escuela_id IS NULL THEN
    RETURN json_build_object('ok', false, 'motivo', 'docente_sin_escuela');
  END IF;

  -- Generar código único de 6 caracteres
  LOOP
    v_codigo := upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM clases WHERE codigo = v_codigo);
  END LOOP;

  INSERT INTO clases (nombre, grado_id, escuela_id, docente_id, codigo)
  VALUES (p_nombre, p_grado_id, v_escuela_id, auth.uid(), v_codigo)
  RETURNING id INTO v_clase_id;

  RETURN json_build_object(
    'ok',         true,
    'clase_id',   v_clase_id,
    'codigo',     v_codigo,
    'escuela_id', v_escuela_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── intentos_token ───────────────────────────────────────────
-- Registra intentos FALLIDOS de verificar_token para usuarios autenticados.
-- Para anon el UID es NULL y no se puede identificar sin una Edge Function
-- que acceda a la IP del request (pendiente si se necesita mayor seguridad).
CREATE TABLE intentos_token (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uid          UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  intentado_en TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_intentos_token_uid_hora ON intentos_token(uid, intentado_en);

ALTER TABLE intentos_token ENABLE ROW LEVEL SECURITY;
-- Sin policies: solo accesible por SECURITY DEFINER (verificar_token).

-- ── admin_logs ───────────────────────────────────────────────
-- Auditoría de acciones del administrador. No tiene RLS: solo accesible
-- via service_role o por el usuario admin autenticado (políticas abajo).
CREATE TABLE admin_logs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id   UUID REFERENCES profiles(id),
  accion     TEXT NOT NULL,
  entidad    TEXT,
  entidad_id TEXT,
  payload    JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_admin_logs_created ON admin_logs(created_at DESC);

ALTER TABLE admin_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_logs_admin_all" ON admin_logs
  FOR ALL
  USING  (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rol = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND rol = 'admin'));

-- ── Vista: progreso_clase (para dashboard docente) ────────────
CREATE VIEW progreso_clase AS
SELECT
  i.clase_id,
  i.estudiante_id,
  p.nombre              AS estudiante_nombre,
  l.titulo              AS libro_titulo,
  l.id                  AS libro_id,
  COUNT(ap.actividad_id) AS actividades_completadas,
  MAX(ap.completada_en)  AS ultima_actividad
FROM inscripciones i
JOIN profiles p        ON p.id = i.estudiante_id
JOIN clase_libros cl   ON cl.clase_id = i.clase_id
JOIN libros l          ON l.id = cl.libro_id
LEFT JOIN actividad_progreso ap ON ap.usuario_id = i.estudiante_id
GROUP BY i.clase_id, i.estudiante_id, p.nombre, l.titulo, l.id;

-- ── GRANTs — Data API (PostgREST / supabase-js) ───────────────
-- REQUERIDO desde Oct 30 2026: sin estos grants, todas las consultas
-- de supabase-js devuelven error 42501 ("permission denied for table …").
-- Las RLS policies siguen siendo la capa de seguridad; los grants solo
-- habilitan que PostgREST pueda ver las tablas.

-- Catálogos de solo lectura (accesibles sin sesión)
GRANT SELECT ON public.grados      TO anon, authenticated;
GRANT SELECT ON public.escuelas    TO anon, authenticated;
GRANT SELECT ON public.libros      TO anon, authenticated;
GRANT SELECT ON public.unidades    TO anon, authenticated;
GRANT SELECT ON public.actividades TO anon, authenticated;

-- Profiles: cada usuario gestiona su propio registro
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;

-- Escuelas y libros: admin crea/edita vía authenticated + RLS admin
GRANT INSERT, UPDATE ON public.escuelas TO authenticated;
GRANT INSERT, UPDATE ON public.libros   TO authenticated;

-- Relaciones escuela-libro
GRANT SELECT, INSERT, DELETE ON public.escuela_libros TO authenticated;

-- Tokens: lectura propia + admin crea y revoca
GRANT SELECT, INSERT, UPDATE ON public.tokens TO authenticated;

-- Clases y su catálogo de libros
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clases      TO authenticated;
GRANT SELECT, INSERT, DELETE         ON public.clase_libros TO authenticated;

-- Inscripciones de estudiantes
GRANT SELECT, INSERT, DELETE ON public.inscripciones TO authenticated;

-- Activaciones de libros
GRANT SELECT, INSERT ON public.libro_activaciones TO authenticated;

-- Progreso y respuestas
GRANT SELECT, INSERT, UPDATE ON public.progreso           TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.actividad_progreso TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.respuestas TO authenticated;

-- Logs de auditoría admin
GRANT SELECT, INSERT ON public.admin_logs TO authenticated;

-- Vista docente (solo lectura)
GRANT SELECT ON public.progreso_clase TO authenticated;

-- Sequences (tablas con SERIAL necesitan USAGE para INSERT)
GRANT USAGE, SELECT ON SEQUENCE public.grados_id_seq TO authenticated;

-- RPCs: EXECUTE es suficiente (corren como SECURITY DEFINER)
GRANT EXECUTE ON FUNCTION public.get_libro_completo(TEXT)                 TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verificar_token(TEXT)                    TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activar_token(TEXT, UUID)                TO authenticated;
GRANT EXECUTE ON FUNCTION public.activar_token_docente(TEXT, UUID, TEXT)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.crear_clase(TEXT, INTEGER)               TO authenticated;
GRANT EXECUTE ON FUNCTION public.buscar_clase_para_unirse(TEXT)           TO authenticated;
GRANT EXECUTE ON FUNCTION public.unirse_clase(TEXT)                       TO authenticated;

-- service_role: acceso total sin RLS (usado por el panel admin en producción)
GRANT ALL ON ALL TABLES    IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO service_role;
