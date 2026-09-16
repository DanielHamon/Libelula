BEGIN READ ONLY;
DO $$
DECLARE obj text; priv text;
BEGIN
  FOREACH obj IN ARRAY ARRAY['actividad_progreso','libro_activaciones','profiles','progreso','progreso_clase','respuestas'] LOOP
    FOREACH priv IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] LOOP
      IF has_table_privilege('anon', 'public.' || obj, priv) THEN RAISE EXCEPTION 'anon conserva % sobre %', priv, obj; END IF;
    END LOOP;
    IF NOT has_table_privilege('authenticated','public.' || obj,'SELECT') THEN RAISE EXCEPTION 'lectura autenticada perdida: %',obj; END IF;
  END LOOP;
  FOREACH obj IN ARRAY ARRAY['grados_id_seq','intentos_token_anonimos_id_seq'] LOOP
    IF has_sequence_privilege('anon','public.' || obj,'USAGE,SELECT,UPDATE') THEN RAISE EXCEPTION 'secuencia anon: %',obj; END IF;
  END LOOP;
  FOREACH obj IN ARRAY ARRAY['generar_token_10()','generar_token_128(text)','prevalidar_token_anonimo(text,text,text)'] LOOP
    IF has_function_privilege('anon','public.' || obj,'EXECUTE') OR has_function_privilege('authenticated','public.' || obj,'EXECUTE') THEN RAISE EXCEPTION 'RPC interna abierta: %',obj; END IF;
    IF NOT has_function_privilege('service_role','public.' || obj,'EXECUTE') THEN RAISE EXCEPTION 'RPC interna inaccesible: %',obj; END IF;
  END LOOP;
  FOREACH obj IN ARRAY ARRAY['verificar_token(text)','activar_token(text)','activar_token_docente(text)'] LOOP
    IF has_function_privilege('anon','public.' || obj,'EXECUTE') OR NOT has_function_privilege('authenticated','public.' || obj,'EXECUTE') THEN RAISE EXCEPTION 'ACL activacion incorrecto: %',obj; END IF;
  END LOOP;
  IF EXISTS (
    SELECT 1 FROM pg_default_acl d CROSS JOIN LATERAL aclexplode(d.defaclacl) a
    WHERE d.defaclrole='postgres'::regrole AND d.defaclobjtype IN ('r','f','S')
      AND d.defaclnamespace IN (0,'public'::regnamespace)
      AND a.grantee IN (0,'anon'::regrole)
  ) THEN RAISE EXCEPTION 'defaults postgres public/anon abiertos'; END IF;
END $$;
SELECT 'OK: ACL de aplicación; defaults supabase_admin requieren tratamiento separado' AS resultado;
ROLLBACK;
