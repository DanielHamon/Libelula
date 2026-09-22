# Revisión del paquete selectivo de fase 5

Base: `2e7e5497b7a7892963dab41d2d9e1ca4aff73505` (`origin/main`, comprobado mediante fetch el 21 de septiembre de 2026).
Candidato aislado: `/tmp/iabooks-fase5-publicacion`, rama `auditoria-fase5-reconstruccion`.

## Revisión del esquema contra main

Se revisaron los 14 bloques del diff de `supabase/schema.sql`. Se incluye el esquema verificado completo después de clasificar sus diferencias:

| Diferencia | Justificación y dependencia |
| --- | --- |
| Reserva de órdenes en `admin_solicitar_accion_sensible_v2` | AUD-013; definición ya presente en producción, incluida en migración local fase 5. |
| `generar_token_10` | Formato de definición y comentario sobre distribución sin sesgo; no cambia la lógica. |
| `get_libro_completo`: `texto` de unidad | Cambio previo confirmado en la definición completa guardada de producción. La columna ya existe en main. Se conserva para reconstruir el catálogo acreditado. |
| `is_admin`, `is_docente_of`, `is_docente_of_clase`, `is_inscrito_en_clase` | Formato de definiciones sincronizado; no cambia la lógica. |
| Helper y política de perfiles | AUD-016, fase 2 ya aplicada; evita reconstruir la política universal antigua. |
| Cuota de prevalidación | AUD-002, fase 4 ya publicada; conserva cuota 100/red/h. |
| Triggers de registro y orden | AUD-015/AUD-013, fase 5; ya existen en producción. |
| Seis políticas de progreso/respuestas | AUD-003, fase 3 ya aplicada; tres referencias de relaciones cualificadas para restaurar con search_path vacío. |
| Permisos de `handle_new_user` | AUD-015; revoca ejecución cliente innecesaria. |
| Cierre ACL/defaults y snapshot de reconstrucción | Correcciones de aplicación de fase 4 y equivalencia de ACL de fase 5. El residual gestionado supabase_admin sigue pendiente. |

Los ocho hashes de implementación de EVIDENCIA_FASE5.json coinciden con los archivos preparados; no se cambió el SQL probado. Se conserva la evidencia previa de carga limpia, registro, orden, RLS y catálogos sin repetir las bases de datos detenidas. La equivalencia está limitada a las categorías documentadas, no a datos, todos los atributos de columnas/constraints ni servicios gestionados.

## Alcance de publicación

Lockfile, esquema de reconstrucción, migración local/verificador/snapshot, pruebas 22–24 y su guarda local, consultas de metadatos y documentación de fase 5. `package.json`, frontend, Edge, configuración Vercel, contenido y otros cambios locales se conservan exactamente desde main.

No ejecutar schema.sql, la migración local ni el snapshot ACL en producción. No hay migración cloud necesaria para esta fase. Los archivos SQL no están en un directorio de migraciones automáticas.

## Validación del candidato

Build pasa usando node_modules local compartido; es verificación de compilación, no instalación limpia ni prueba de configuración de despliegue. Continúa la advertencia histórica de bundle grande. Guarda local y sintaxis del registro pasan. El lint completo falla con 35 errores y 24 advertencias, idénticos mensaje por mensaje a main con las mismas dependencias; cero diagnósticos nuevos. El resultado local anterior no se extrapola a este paquete selectivo.

Las evidencias detalladas permanecen fuera de Git. Antes de integrar, comprobar que el diff se limita al manifiesto PAQUETE_FASE5.json. La integración/publicación y su verificación permanecen pendientes; fase 5 no se declara cerrada.
