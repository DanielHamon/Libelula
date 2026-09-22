BEGIN READ ONLY;
SELECT jsonb_build_object(
 'relaciones',(SELECT jsonb_agg(jsonb_build_object('nombre',format('%I.%I',n.nspname,c.relname),'tipo',c.relkind,'acl',COALESCE(c.relacl,acldefault(CASE WHEN c.relkind='S' THEN 'S'::"char" ELSE 'r'::"char" END,c.relowner))::text)) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','S')),
 'funciones',(SELECT jsonb_agg(jsonb_build_object('nombre',format('%I.%I(%s)',n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)), 'definicion',pg_get_functiondef(p.oid),'acl',COALESCE(p.proacl,acldefault('f',p.proowner))::text)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind='f'),
 'grants',(SELECT jsonb_agg(to_jsonb(g)) FROM (
 SELECT 'FUNCTION' AS tipo,format('%I.%I(%s)',n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)) AS objeto,CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END AS rol,a.privilege_type,a.is_grantable
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a WHERE n.nspname='public' AND p.prokind='f'
 UNION ALL
 SELECT CASE WHEN c.relkind='S' THEN 'SEQUENCE' ELSE 'TABLE' END,format('%I.%I',n.nspname,c.relname),CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,a.privilege_type,a.is_grantable
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl,acldefault(CASE WHEN c.relkind='S' THEN 'S'::"char" ELSE 'r'::"char" END,c.relowner))) a WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','S')
 ) g WHERE rol IN ('PUBLIC','anon','authenticated','service_role'))
) AS acl;
ROLLBACK;
