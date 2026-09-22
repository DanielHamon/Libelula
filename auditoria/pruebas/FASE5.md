# Pruebas de reconstrucción de fase 5

Usar exclusivamente Supabase local independiente y vacío, PostgreSQL 17 (el snapshot incluye MAINTAIN). Aplicar `supabase/schema.sql` con psql y `ON_ERROR_STOP=1`. No aplicar sobre producción ni sobre los fixtures conservados de fase3.

Con `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` de esa instancia local, ejecutar desde la raíz:

```sh
node auditoria/pruebas/scripts/22_registro_fase5.mjs
node --test auditoria/pruebas/scripts/entorno-local.test.mjs
```

La instancia local debe permitir sesión después de signup sin confirmación por correo. La prueba 22 crea un usuario ficticio, comprueba su perfil y elimina únicamente ese usuario. No imprimir claves ni archivos de estado de la CLI.

Ejecutar por psql local `supabase/audit_013_015_reconstruction_verify.sql`, `supabase/audit_006_017_acl_verify.sql` y `auditoria/pruebas/scripts/23_orden_fase5.sql`. La prueba de orden prepara sus propios datos en una transacción y hace ROLLBACK. La migración `audit_013_015_reconstruction.sql` sirve para instalaciones locales existentes; el snapshot ACL está reservado a reconstrucción y no se necesita repetir después de cargar schema.sql.

`24_catalogo_fase5.py` compara metadatos ya guardados, sin conexiones. Requiere en `auditoria/pruebas/resultados/fase5/`:

- `catalogo-produccion.json`: respuesta CLI con `rows[0].catalogo`, obtenida con consulta_catalogo.sql.
- `iabooks-auditoria-fase5-catalogo.json`: objeto catálogo local de esa consulta.
- `acl-produccion.json`: respuesta CLI con `rows[0].acl`, obtenida con consulta_acl_fase5.sql.
- `iabooks-auditoria-fase5-acl-completo.json`: objeto ACL local de esa consulta.

Las consultas de seguimiento solo leen metadatos; su salida detallada no se publica. El script escribe comparacion-final.json y falla si hay diferencias. Los metadatos históricos no prueban el estado cloud futuro.

No ejecutar los generadores históricos 01/02 sobre fixtures recuperados. Con el trigger de registro, el bootstrap de administradores necesita preparación local explícita; no debilitar la protección de roles. Detener instancias locales conservando sus volúmenes y confirmar backup:true.
