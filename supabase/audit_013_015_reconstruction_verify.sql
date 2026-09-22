BEGIN READ ONLY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='auth.users'::regclass
    AND tgname='on_auth_user_created' AND tgfoid='public.handle_new_user()'::regprocedure
    AND tgtype=5 AND tgenabled='O' AND tgqual IS NULL AND tgnargs=0) THEN
    RAISE EXCEPTION 'Trigger registro ausente o incompatible';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid='public.handle_new_user()'::regprocedure
    AND prosecdef AND proowner='postgres'::regrole
    AND proconfig @> ARRAY['search_path=pg_catalog, public']) THEN
    RAISE EXCEPTION 'Contexto de seguridad de registro incompatible';
  END IF;
  IF has_function_privilege('anon','public.handle_new_user()','EXECUTE')
    OR has_function_privilege('authenticated','public.handle_new_user()','EXECUTE') THEN
    RAISE EXCEPTION 'Función de trigger registro expuesta';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.unidades'::regclass
    AND tgname='normalizar_orden_unidad_al_insertar'
    AND tgfoid='public.normalizar_orden_unidad_al_insertar()'::regprocedure
    AND tgtype=7 AND tgenabled='O' AND tgqual IS NULL AND tgnargs=0) THEN
    RAISE EXCEPTION 'Trigger orden ausente o incompatible';
  END IF;
END $$;
SELECT 'OK: reconstrucción triggers y seguridad registro' AS resultado;
ROLLBACK;
