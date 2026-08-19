-- IAbooks — Fase 11: preflight de tokens seguros y esquema reproducible.
-- Solo lectura. No muestra IDs de tokens, correos ni otros secretos.

-- 1. Implementación criptográfica disponible y esquema que la contiene.
SELECT
  n.nspname AS esquema,
  p.oid::regprocedure AS funcion
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.proname = 'gen_random_bytes'
  AND p.pronargs = 1
  AND p.proargtypes = '23'::oidvector;

-- 2. Generadores desplegados: identifica aleatoriedad débil sin revelar datos.
SELECT
  p.oid::regprocedure AS funcion,
  p.prosecdef AS security_definer,
  coalesce(array_to_string(p.proconfig, ', '), '') AS configuracion,
  pg_get_functiondef(p.oid) ILIKE '%md5(random()%' AS usa_generador_debil,
  pg_get_functiondef(p.oid) ILIKE '%gen_random_bytes(16)%' AS usa_128_bits
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('admin_crear_tokens_libro', 'admin_crear_tokens_docente')
ORDER BY p.proname;

-- 3. Inventario agregado por estado y fortaleza. Un token seguro tiene prefijo
-- TL-/TD- y 32 dígitos hexadecimales (16 bytes = 128 bits).
SELECT
  estado,
  count(*) AS total,
  count(*) FILTER (WHERE id ~ '^(TL|TD)-[0-9A-F]{32}$') AS formato_128_bits,
  count(*) FILTER (WHERE id !~ '^(TL|TD)-[0-9A-F]{32}$') AS formato_heredado
FROM public.tokens
GROUP BY estado
ORDER BY estado;

-- 4. Tokens débiles que aún podrían utilizarse y que la migración revocará.
SELECT
  count(*) AS debiles_validos,
  count(*) FILTER (WHERE expira_en IS NULL OR expira_en >= now()) AS debiles_utilizables,
  count(*) FILTER (WHERE expira_en < now()) AS debiles_expirados
FROM public.tokens
WHERE estado = 'valido'
  AND id !~ '^(TL|TD)-[0-9A-F]{32}$';

-- 5. Acciones antiguas capaces de pasar por el generador heredado.
SELECT tipo, estado, count(*) AS total
FROM public.acciones_admin_pendientes
WHERE tipo IN ('crear_tokens_libro', 'crear_tokens_docente')
GROUP BY tipo, estado
ORDER BY tipo, estado;

-- 6. Dependencias del ID del token: deben conservar TEXT y FK.
SELECT
  c.conname,
  c.conrelid::regclass AS tabla,
  pg_get_constraintdef(c.oid) AS definicion
FROM pg_constraint c
WHERE c.confrelid = 'public.tokens'::regclass
ORDER BY c.conrelid::regclass::text, c.conname;

-- 7. Privilegios efectivos relevantes.
SELECT
  NOT has_table_privilege('authenticated', 'public.tokens', 'INSERT') AS insert_directo_cerrado,
  NOT has_table_privilege('authenticated', 'public.tokens', 'UPDATE') AS update_directo_cerrado,
  NOT has_function_privilege('anon', 'public.admin_crear_tokens_libro(uuid,text,integer,integer,timestamp with time zone)', 'EXECUTE') AS libro_anon_cerrado,
  NOT has_function_privilege('anon', 'public.admin_crear_tokens_docente(uuid,text[],timestamp with time zone)', 'EXECUTE') AS docente_anon_cerrado;
