## Pausa solicitada por el usuario — fase 5, 21 de septiembre de 2026

Usuario pidió guardar memoria tras interrumpir el cierre documental de fase 5. Trabajo local implementado y verificado; fase 5 permanece abierta por preparación/versionado/publicación selectiva. No hubo commits, PR ni modificaciones de producción en fase 5. Fase 4 sigue pendiente de respuesta de soporte Supabase (consulta enviada confirmada por usuario); no reanudarla sin respuesta.

- Referencias actuales: auditoria/seguimiento/FASE5.md, EVIDENCIA_FASE5.json y HALLAZGOS_ACTUALES.csv. Evidencias detalladas ignoradas por Git: auditoria/pruebas/resultados/fase5/.
- AUD-009: package-lock.json actualizado con versiones compatibles; package.json intacto. @humanfs/node 0.16.8, core 0.19.2, types 0.15.0, brace-expansion 1.1.21, js-yaml 4.3.2, nanoid 3.3.19. npm audit final 0; build y ESLint completos pasan; advertencia histórica de bundle fase 6.
- AUD-015: schema incluye on_auth_user_created en auth.users; prueba API Auth local crea exactamente un perfil estudiante, conserva nombre/email, rechaza escalada de rol/escuela/superadministrador vía metadatos y permite lectura propia. Producción ya tiene trigger, función y ACL correctos; no recrearlos allí.
- AUD-013: schema incorpora normalizar_orden_unidad_al_insertar y reserva de órdenes pendientes en admin_solicitar_accion_sensible_v2 según definiciones leídas de producción. Referencias public explícitas en tres políticas para restaurar con search_path vacío. ACL de reconstrucción explícitos de 86 objetos al final del schema y en audit_013_reconstruction_acl.sql. No ejecutar schema/snapshot ACL en producción.
- Nueva migración local audit_013_015_reconstruction.sql y verificador asociado; reaplicación pasa. Scripts 22_registro_fase5.mjs, 23_orden_fase5.sql y 24_catalogo_fase5.py. Último script compara metadatos guardados; todos pasan.
- Comparación final local limpio/producción: 9 triggers, 46 políticas, 25 tablas/vistas en atributos consultados, 58 índices, 59 funciones con definiciones completas, 7 defaults y 406 grants de roles de aplicación. Sin diferencias; solo normaliza CRLF/LF. No acredita igualdad completa de columnas/constraints, datos ni configuración de servicios gestionados; supabase_admin conserva residual de fase 4.
- RLS 24/24 en fixtures recuperados; unitarias paginación 6, entorno local 2, Edge 6 y CAPTCHA 9 pasan. Orden duplicado/nulo y reservas consecutivas pasan con ROLLBACK. La prueba de registro limpia elimina únicamente su usuario ficticio.
- Volumen fase3 recuperado conservó 30 usuarios/perfiles y 1500 respuestas; no se regeneraron fixtures. Se creó instancia nueva fase5 para instalación limpia. AMBAS DETENIDAS CON backup:true confirmado. Primer stop fase5 falló por prune; reintento recogido tras solicitud de memoria terminó correctamente. Configuraciones /tmp/iabooks-auditoria-fase3 y /tmp/iabooks-auditoria-fase5; pueden desaparecer. No imprimir status.json ni logs de start: contienen claves exclusivamente locales. Conservar volúmenes.
- README de pruebas actualizado: 01/02 históricos no deben repetirse sobre fixtures; 02 presupone provisión directa de admin y requiere bootstrap específico con trigger nuevo. No debilitar protección de cambio de rol para hacer pasar fixtures.
- Próximo paso: revisar paquete selectivo desde origin/main limpio para versionar/publicar fase 5; mantener cambios ajenos. Schema del árbol contiene cambios previos y NO se debe copiar sin revisar su diff/dependencias. No hay candidato selectivo de fase 5 ni PR preparado todavía. Revalidar solo lo necesario tras cambios; no repetir pruebas ya acreditadas indiscriminadamente.

# Fase 5 — reconstrucción, trazabilidad y dependencias

Estado al 21 de septiembre de 2026: correcciones implementadas y verificadas localmente. Sin commits, PR ni despliegues de esta fase. Producción consultada solo para metadatos. Fase 4 sigue en espera de soporte por AUD-006.

## AUD-015: registro reconstruible

El esquema incluía `handle_new_user()` pero omitía `on_auth_user_created` en auth.users. La nueva prueba 22 reprodujo usuario creado con cero perfiles en el volumen recuperado; tras corregirlo crea exactamente un perfil, conserva nombre/email, fuerza estudiante, ignora escuela/rol privilegiado de metadatos y permite lectura propia. También comprueba ausencia de alta en superadministradores. Se borra únicamente el usuario ficticio creado por la prueba.

Se agregó el trigger al esquema canónico. `audit_013_015_reconstruction.sql` permite incorporar los objetos a instalaciones existentes de prueba; verifica los triggers ya presentes y aborta ante una configuración incompatible. Se explicitan los permisos de handle_new_user para evitar heredar EXECUTE de anon/authenticated en instalaciones locales. Producción ya contiene el trigger y los permisos esperados: no necesita esta migración.

## AUD-013: trazabilidad del esquema

Se recuperó el volumen fase3 con 30 usuarios, 30 perfiles y 1500 respuestas, sin regenerar fixtures. Se creó además una instancia independiente vacía `iabooks-auditoria-fase5`, puertos 5532x. Se aplicó schema.sql únicamente allí.

La reconstrucción detectó y corrigió:
- Función y trigger `normalizar_orden_unidad_al_insertar` ausentes.
- Reserva de órdenes pendientes ausente en `admin_solicitar_accion_sensible_v2`, ya presente en producción y en el archivo histórico fix_pending_unit_order_collisions.sql.
- Referencias sin `public.` en las tres políticas docentes de progreso/respuestas, incompatibles con search_path vacío al restaurar. Las condiciones de acceso no cambian.
- Permisos heredados de la inicialización local: 19 relaciones y numerosas funciones eran más accesibles que en producción. Se incorporó al final del esquema una instantánea explícita de ACL para 86 objetos (27 relaciones/secuencias y 59 funciones), también disponible en `audit_013_reconstruction_acl.sql`. Es un recurso de reconstrucción, no una migración para publicar sobre producción.
- Diferencias de formato de cinco funciones: finales de línea y un comentario; normalizados al sincronizar sus definiciones. La comparación completa solo normaliza CRLF/LF.

Comparación final de metadatos guardados, script 24: sin diferencias en 9 triggers auth/public, 46 políticas públicas, 25 tablas/vistas (campos consultados), 58 índices, 59 funciones (definiciones completas, seguridad/configuración y acceso anon/authenticated), 7 entradas de defaults y 406 concesiones explícitas consultadas para PUBLIC/anon/authenticated/service_role. Se preserva el residual gestionado supabase_admin; equivalencia no significa que esté corregido.

Límites: no es un dump completo del proyecto. No acredita igualdad de datos, configuración Auth/Storage/Edge, todos los atributos de columnas/constraints o todos los roles. La trazabilidad de una nueva publicación todavía requiere un paquete selectivo revisado y su commit/PR. Los archivos históricos de fases 12 y 13 sí estaban versionados: no se sostiene la afirmación histórica de ausencia total de versionado.

## AUD-009: dependencias

Actualización compatible solo de package-lock.json; package.json no cambia:
- @humanfs/node 0.16.7 → 0.16.8; @humanfs/core 0.19.1 → 0.19.2; añade @humanfs/types 0.15.0.
- brace-expansion 1.1.17 → 1.1.21.
- js-yaml 4.3.0 → 4.3.2.
- nanoid 3.3.16 → 3.3.19.

Auditoría inicial: tres altas y una moderada. Auditoría final: cero vulnerabilidades reportadas. Se ejecutó actualización sin scripts de instalación ni force. Build y ESLint completos pasan. Permanece la advertencia histórica de bundle grande (fase 6). La corrección aún no está versionada/publicada.

## Verificación

- Esquema cargado desde cero con ON_ERROR_STOP=1: pasa tras corregir referencias.
- Registro vía API Auth local en instalación limpia: pasa, sin privilegios derivados de metadatos.
- Reaplicación de migración sobre volumen recuperado: pasa.
- Metadatos/ACL de fase 5 y verificador ACL de fase 4: pasan en ambas bases.
- Orden duplicado/nulo y reservas administrativas consecutivas: pasan en transacciones con ROLLBACK.
- Matriz RLS sobre fixtures recuperados: 24/24. No se regeneraron ni se sobrescribieron sus credenciales.
- Pruebas existentes de paginación, guardas de entorno local, Edge y CAPTCHA: pasan.
- Comparación de catálogos/ACL/definiciones: pasa en el alcance descrito.
- Build y ESLint: pasan; npm audit final: 0.

Las primeras cargas fallidas de schema se reiniciaron exclusivamente en la base descartable nueva. Se conserva el volumen fase3. No se configura CAPTCHA localhost ni se repiten las pruebas manuales de producción.

Evidencias ignoradas por Git: `auditoria/pruebas/resultados/fase5/`. Resumen versionable: EVIDENCIA_FASE5.json. Las consultas consulta_fase5.sql y consulta_acl_fase5.sql solo leen metadatos.

## Pendiente para cerrar

Preparar/publicar un paquete selectivo desde main limpio y verificar su trazabilidad; no incluir el resto del árbol del usuario ni ejecutar schema.sql/instantánea ACL contra producción. El esquema local contiene cambios anteriores ya contrastados: no copiarlo indiscriminadamente a un PR sin revisar el diff contra main. No se necesita modificar la base de producción para corregir el trigger de registro: ya existe allí.

La reversión de dependencias debe restaurar únicamente el lockfile del paquete, sin revertir otros cambios del usuario. Eliminar triggers de producción no es una reversión apropiada de esta fase: no se añadieron allí.

## Reanudación: candidato selectivo revisado

Preparado sobre origin/main `2e7e549` en `/tmp/iabooks-fase5-publicacion`. Ver REVISION_PAQUETE_FASE5.md y PAQUETE_FASE5.json. Se revisaron los 14 bloques del esquema y sus dependencias; ocho hashes de implementación coinciden con las pruebas previas. Build del candidato pasa. ESLint del candidato: 35 errores y 24 advertencias, idénticos a main; no hay diagnósticos nuevos. La afirmación anterior de ESLint completo aprobado corresponde al árbol local con otros cambios, no a main ni al candidato. Bases locales permanecen detenidas; no se repitieron pruebas SQL ni se modificó producción. Publicación/integración todavía pendiente.
