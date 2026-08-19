# Fase 11 — ejecución controlada

La migración invalida tokens heredados que todavía estén en estado `valido`.
No debe aplicarse sin revisar primero cuántos códigos entregados resultarían
afectados.

## Entorno existente

1. Ejecutar `security_phase11_preflight.sql` en el SQL Editor de Supabase.
2. Guardar el resultado agregado; no copiar IDs, correos ni payloads reales.
3. Confirmar con negocio si los tokens débiles aún utilizables pueden revocarse.
4. Hacer respaldo de las tablas `tokens`, `libro_activaciones`,
   `acciones_admin_pendientes` y `admin_logs`.
5. Ejecutar `security_phase11.sql` una sola vez.
6. Ejecutar `security_phase11_verify.sql`; todos los indicadores booleanos
   deben devolver `true`.
7. Generar un token de libro y uno docente desde el panel. Ambos deben tener el
   formato `TL-`/`TD-` seguido de 32 caracteres hexadecimales.
8. Probar token válido, inexistente, revocado, expirado y reutilizado.

## Garantías de compatibilidad

- Las firmas públicas de las RPC no cambian.
- `verificar_token`, `activar_token` y `activar_token_docente` conservan el
  rate limit, el bloqueo de fila y la derivación del usuario desde la sesión.
- `tokens.id` continúa siendo `TEXT`; las FK históricas no cambian.
- Los tokens ya activados se conservan para auditoría y para
  `libro_activaciones.token_id`.
- Los IDs nuevos solo se devuelven al administrador que los crea; ya no se
  copian dentro del payload de `admin_logs`.

## Instalación nueva y esquema canónico

`schema.sql` es el esquema base histórico y no debe desplegarse solo. Una base
nueva debe aplicar después, en orden, todas las migraciones de seguridad
registradas en `SECURITY_AUDIT_STATUS.md`, terminando con
`security_phase11.sql` y `security_phase11_verify.sql`.

Después de aplicar y verificar la fase 11 en el proyecto real, se debe generar
un dump nuevo con Supabase CLI (`supabase db dump`) y sustituir el esquema base
por ese dump. El dump no debe fabricarse desde los archivos locales porque el
preflight de fases anteriores demostró que el catálogo desplegado contiene el
estado canónico.

Este paso se completó el 19 de agosto de 2026: `supabase/schema.sql` es el dump
de solo esquema del catálogo `public` desplegado. No contiene filas de datos ni
credenciales.
