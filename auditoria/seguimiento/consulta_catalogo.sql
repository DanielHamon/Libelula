-- Fase 1: solo metadatos, sin filas de usuarios ni contenido educativo.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '15s';
SELECT jsonb_build_object(
  'fecha', now(),
  'policies', (SELECT jsonb_agg(to_jsonb(p)) FROM pg_policies p WHERE schemaname = 'public'),
  'triggers', (SELECT jsonb_agg(jsonb_build_object('schema', n.nspname,
    'table', c.relname, 'name', t.tgname, 'enabled', t.tgenabled,
    'definition', pg_get_triggerdef(t.oid)))
    FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE NOT t.tgisinternal AND n.nspname IN ('auth','public')),
  'tables', (SELECT jsonb_agg(jsonb_build_object('name', c.relname, 'kind', c.relkind,
    'rls', c.relrowsecurity, 'anon_select', has_table_privilege('anon', c.oid, 'SELECT'),
    'anon_insert', has_table_privilege('anon', c.oid, 'INSERT'),
    'anon_update', has_table_privilege('anon', c.oid, 'UPDATE'),
    'anon_delete', has_table_privilege('anon', c.oid, 'DELETE'),
    'anon_truncate', has_table_privilege('anon', c.oid, 'TRUNCATE')))
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p','v')),
  'functions', (SELECT jsonb_agg(jsonb_build_object('name', p.proname,
    'signature', pg_get_function_identity_arguments(p.oid), 'security_definer', p.prosecdef,
    'config', p.proconfig, 'definition_md5', md5(pg_get_functiondef(p.oid)),
    'anon_execute', has_function_privilege('anon', p.oid, 'EXECUTE'),
    'authenticated_execute', has_function_privilege('authenticated', p.oid, 'EXECUTE')))
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prokind='f'),
  'default_privileges', (SELECT jsonb_agg(jsonb_build_object('owner', pg_get_userbyid(d.defaclrole),
    'schema', n.nspname, 'type', d.defaclobjtype, 'acl', d.defaclacl::text))
    FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace
    WHERE n.nspname='public' OR d.defaclnamespace=0),
  'indexes', (SELECT jsonb_agg(to_jsonb(i)) FROM pg_indexes i WHERE schemaname='public'),
  'foreign_keys_without_index_prefix', (SELECT jsonb_agg(jsonb_build_object(
    'table', c.conrelid::regclass::text, 'constraint', c.conname,
    'definition', pg_get_constraintdef(c.oid)))
    FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace
    WHERE c.contype='f' AND n.nspname='public' AND NOT EXISTS (
      SELECT 1 FROM pg_index i WHERE i.indrelid=c.conrelid AND i.indisvalid
        AND i.indisready AND i.indpred IS NULL AND i.indexprs IS NULL
        AND i.indnkeyatts >= cardinality(c.conkey)
        AND ARRAY(SELECT k FROM unnest(i.indkey::smallint[]) WITH ORDINALITY AS x(k,pos)
          WHERE pos <= cardinality(c.conkey) ORDER BY k)
          = ARRAY(SELECT k FROM unnest(c.conkey) AS x(k) ORDER BY k)
    ))
) AS catalogo;
ROLLBACK;
