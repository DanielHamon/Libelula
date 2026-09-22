-- Solo metadatos; no consulta usuarios ni contenido.
BEGIN READ ONLY;
SELECT jsonb_agg(jsonb_build_object('nombre', p.proname,
  'definicion', pg_get_functiondef(p.oid), 'propietario', pg_get_userbyid(p.proowner),
  'acl', p.proacl::text)) AS funciones
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN ('handle_new_user','normalizar_orden_unidad_al_insertar');
ROLLBACK;
