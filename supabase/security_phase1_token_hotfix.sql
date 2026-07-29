-- ============================================================
-- IAbooks — Hotfix: soporte para rate limiting de tokens
-- Ejecutar una sola vez en instalaciones sin intentos_token.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.intentos_token (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uid UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  intentado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_intentos_token_uid_hora
  ON public.intentos_token(uid, intentado_en);

ALTER TABLE public.intentos_token ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON public.intentos_token FROM anon, authenticated;

COMMIT;

SELECT
  to_regclass('public.intentos_token') IS NOT NULL AS tabla_existe,
  c.relrowsecurity AS rls_activo,
  NOT EXISTS (
    SELECT 1
    FROM information_schema.role_table_grants g
    WHERE g.table_schema = 'public'
      AND g.table_name = 'intentos_token'
      AND g.grantee IN ('anon', 'authenticated')
  ) AS sin_acceso_directo
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'intentos_token';
