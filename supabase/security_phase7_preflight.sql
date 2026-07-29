-- IAbooks — Fase 7: diagnóstico previo
-- Tokens, clases y exposición pública.
--
-- Este script es exclusivamente de lectura. No modifica políticas, funciones
-- ni datos. Ejecutarlo completo en el SQL Editor de Supabase y conservar los
-- resultados antes de aplicar la migración de la fase 7.

-- 1. Funciones expuestas y configuración de seguridad.
SELECT
  p.proname AS funcion,
  pg_get_function_identity_arguments(p.oid) AS argumentos,
  p.prosecdef AS security_definer,
  p.proconfig AS configuracion,
  has_function_privilege(
    'anon',
    p.oid,
    'EXECUTE'
  ) AS anon_puede_ejecutar,
  has_function_privilege(
    'authenticated',
    p.oid,
    'EXECUTE'
  ) AS authenticated_puede_ejecutar
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'verificar_token',
    'activar_token',
    'activar_token_docente',
    'crear_clase',
    'buscar_clase_para_unirse',
    'unirse_clase'
  )
ORDER BY p.proname, argumentos;

-- 2. Indicadores de implementación. No devuelve el cuerpo de las funciones
-- para evitar que resultados compartidos incluyan detalles innecesarios.
SELECT
  p.proname AS funcion,
  pg_get_functiondef(p.oid) ILIKE '%intentos_token%' AS usa_intentos_token,
  pg_get_functiondef(p.oid) ILIKE '%auth.uid()%' AS usa_usuario_autenticado,
  pg_get_functiondef(p.oid) ILIKE '%upper(trim(p_codigo))%' AS normaliza_codigo,
  pg_get_functiondef(p.oid) ILIKE '%upper(trim(p_token))%' AS normaliza_token,
  pg_get_functiondef(p.oid) ILIKE '%FOR UPDATE%' AS bloquea_fila,
  pg_get_functiondef(p.oid) ILIKE '%ON CONFLICT DO NOTHING%'
    AS conflicto_silencioso
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'verificar_token',
    'activar_token',
    'activar_token_docente',
    'crear_clase',
    'buscar_clase_para_unirse',
    'unirse_clase'
  )
ORDER BY p.proname;

-- 3. Privilegios de tabla efectivos para anon y authenticated.
SELECT
  c.relname AS tabla,
  c.relrowsecurity AS rls,
  has_table_privilege('anon', c.oid, 'SELECT') AS anon_select,
  has_table_privilege('anon', c.oid, 'INSERT') AS anon_insert,
  has_table_privilege('authenticated', c.oid, 'SELECT') AS auth_select,
  has_table_privilege('authenticated', c.oid, 'INSERT') AS auth_insert,
  has_table_privilege('authenticated', c.oid, 'UPDATE') AS auth_update,
  has_table_privilege('authenticated', c.oid, 'DELETE') AS auth_delete
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind IN ('r', 'p')
  AND c.relname IN (
    'tokens',
    'intentos_token',
    'clases',
    'clase_libros',
    'inscripciones',
    'escuelas',
    'grados',
    'libros',
    'escuela_libros'
  )
ORDER BY c.relname;

-- 4. Políticas que permiten SELECT y su ámbito. Las expresiones ayudan a
-- detectar USING (true) y políticas no limitadas a un rol concreto.
SELECT
  tablename,
  policyname,
  roles,
  cmd,
  qual
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'tokens',
    'intentos_token',
    'clases',
    'clase_libros',
    'inscripciones',
    'escuelas',
    'grados',
    'libros',
    'escuela_libros'
  )
  AND cmd IN ('SELECT', 'ALL')
ORDER BY tablename, policyname;

-- 5. Exposición anónima real: recuentos únicamente, sin metadatos internos.
SELECT
  (SELECT count(*) FROM public.escuelas) AS escuelas_visibles,
  (SELECT count(*) FROM public.grados) AS grados_visibles,
  (SELECT count(*) FROM public.libros) AS libros_visibles,
  (SELECT count(*) FROM public.escuela_libros) AS asignaciones_visibles;

-- 6. Forma y entropía efectiva de códigos de clase existentes.
SELECT
  count(*) AS clases_total,
  count(*) FILTER (WHERE activa IS TRUE) AS clases_activas,
  min(char_length(codigo)) AS longitud_minima,
  max(char_length(codigo)) AS longitud_maxima,
  count(*) FILTER (WHERE codigo !~ '^[A-Z0-9]+$') AS formato_inesperado,
  count(DISTINCT codigo) AS codigos_unicos
FROM public.clases;

-- 7. Integridad de clases e inscripciones.
SELECT
  count(*) FILTER (
    WHERE c.escuela_id IS NULL OR c.grado_id IS NULL
  ) AS clases_sin_ambito,
  count(*) FILTER (
    WHERE p.id IS NULL
       OR p.rol IS DISTINCT FROM 'docente'
       OR p.escuela_id IS DISTINCT FROM c.escuela_id
  ) AS clases_docente_incompatible
FROM public.clases c
LEFT JOIN public.profiles p ON p.id = c.docente_id;

SELECT
  count(*) AS inscripciones_incompatibles
FROM public.inscripciones i
JOIN public.clases c ON c.id = i.clase_id
JOIN public.profiles p ON p.id = i.estudiante_id
WHERE p.rol IS DISTINCT FROM 'estudiante'
   OR p.escuela_id IS DISTINCT FROM c.escuela_id
   OR p.grado_id IS DISTINCT FROM c.grado_id;

-- 8. Estado agregado de tokens y del limitador. No muestra códigos, correos,
-- usuarios ni identificadores.
SELECT
  tipo,
  estado,
  count(*) AS cantidad,
  count(*) FILTER (WHERE expira_en IS NOT NULL AND expira_en < now())
    AS expirados_por_fecha
FROM public.tokens
GROUP BY tipo, estado
ORDER BY tipo, estado;

SELECT
  count(*) AS intentos_totales,
  count(*) FILTER (WHERE intentado_en > now() - interval '1 hour')
    AS intentos_ultima_hora,
  count(DISTINCT uid) FILTER (
    WHERE intentado_en > now() - interval '1 hour'
  ) AS usuarios_ultima_hora
FROM public.intentos_token;

-- 9. Resumen de riesgos esperados para decidir la migración exacta.
WITH funciones AS (
  SELECT
    bool_or(
      p.proname = 'verificar_token'
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
    ) AS verificacion_anonima,
    bool_or(
      p.proname = 'verificar_token'
      AND pg_get_functiondef(p.oid) ILIKE '%v_uid IS NOT NULL%'
    ) AS limite_solo_con_uid,
    bool_or(
      p.proname = 'crear_clase'
      AND pg_get_functiondef(p.oid)
        ILIKE '%substring(replace(gen_random_uuid()::text, % 1, 6)%'
    ) AS codigo_clase_seis
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
), exposicion AS (
  SELECT
    has_table_privilege('anon', 'public.escuelas', 'SELECT')
      AS anon_escuelas,
    has_table_privilege('anon', 'public.libros', 'SELECT')
      AS anon_libros
)
SELECT
  verificacion_anonima,
  limite_solo_con_uid,
  verificacion_anonima AND limite_solo_con_uid
    AS rate_limit_anonimo_inefectivo,
  codigo_clase_seis,
  anon_escuelas,
  anon_libros
FROM funciones
CROSS JOIN exposicion;
