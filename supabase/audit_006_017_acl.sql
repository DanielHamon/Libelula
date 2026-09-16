-- Fase 4: ACL residuales constatados en producción. No modifica RLS ni datos.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

REVOKE ALL ON TABLE public.actividad_progreso, public.libro_activaciones,
  public.profiles, public.progreso, public.progreso_clase, public.respuestas
  FROM anon, PUBLIC;
REVOKE ALL ON SEQUENCE public.grados_id_seq, public.intentos_token_anonimos_id_seq
  FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generar_token_10(), public.generar_token_128(text),
  public.prevalidar_token_anonimo(text,text,text)
  FROM anon, authenticated, PUBLIC;

REVOKE EXECUTE ON FUNCTION public.verificar_token(text), public.activar_token(text),
  public.activar_token_docente(text) FROM anon, PUBLIC;

-- Las funciones de trigger no necesitan concesión al usuario que dispara el trigger.
DO $$ BEGIN
  IF to_regprocedure('public.normalizar_orden_unidad_al_insertar()') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.normalizar_orden_unidad_al_insertar() FROM anon, PUBLIC;
  END IF;
END $$;

-- PUBLIC concede EXECUTE globalmente por defecto: revocar solo IN SCHEMA no basta.
-- Se conserva el acceso explícito de authenticated y service_role.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC, anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM PUBLIC, anon;

-- Los defaults de supabase_admin son administrados por Supabase; se informan
-- separadamente y no se modifica ese rol con una cuenta sin autorización.
COMMIT;
