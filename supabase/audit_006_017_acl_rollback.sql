-- Reversión de emergencia, basada en preflight de producción 2026-09-16.
-- REABRE los permisos anon anteriores: requiere decisión explícita de reversión.
-- No abre RPC internas: ya estaban cerradas antes de fase 4.
-- No modifica RLS, datos, permisos autenticados ni defaults de supabase_admin.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

GRANT ALL ON TABLE public.actividad_progreso, public.profiles, public.progreso,
  public.progreso_clase, public.respuestas TO anon;
GRANT SELECT, REFERENCES, TRIGGER, TRUNCATE, MAINTAIN
  ON TABLE public.libro_activaciones TO anon;
GRANT ALL ON SEQUENCE public.grados_id_seq,
  public.intentos_token_anonimos_id_seq TO anon;

DO $$ BEGIN
  IF to_regprocedure('public.normalizar_orden_unidad_al_insertar()') IS NOT NULL THEN
    GRANT EXECUTE ON FUNCTION public.normalizar_orden_unidad_al_insertar() TO anon;
  END IF;
END $$;

-- El default global PUBLIC era implícito, no había concesión global a anon.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres GRANT EXECUTE ON FUNCTIONS TO PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
COMMIT;
