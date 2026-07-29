# Cierre del endurecimiento de seguridad

Fecha: 2026-07-29.

## Resultado

Las ocho fases del plan de seguridad están completadas y la regresión integral
fue superada con los roles administrador, superadministrador, docente y
estudiante.

## Controles principales activos

- RLS y privilegios mínimos para perfiles, contenido, progreso, clases, tokens,
  aprobaciones, auditoría y Storage.
- Acciones administrativas sensibles con aprobación transaccional,
  superadministrador y MFA `aal2`.
- Activaciones y tokens de un solo uso, limitados y consumidos de forma
  atómica.
- Evaluación académica objetiva en servidor, soluciones redactadas y contador
  transaccional de intentos.
- Códigos de clase nuevos de diez caracteres, búsquedas limitadas y errores no
  enumerables.
- Catálogo interno y RPC privilegiadas bloqueados para sesiones anónimas.
- Funciones `SECURITY DEFINER` con `search_path` endurecido y lista explícita de
  ejecución.
- Bitácora administrativa append-only, con actor derivado de sesión y trigger
  para actividades.
- Límites de payload para respuestas, actividades, logs y aprobaciones.
- Dependencias compatibles actualizadas y cabeceras defensivas configuradas
  para Vercel.

## SQL final aplicado

- `supabase/security_phase7.sql`
- `supabase/security_phase7_class_code_hotfix.sql`
- `supabase/security_phase8.sql`

Las fases anteriores y todos sus complementos permanecen documentados en
`SECURITY_AUDIT_STATUS.md`.

## Validación final superada

- Verificaciones SQL de fases 7 y 8 con todos los indicadores en `true`.
- Bloqueo anónimo confirmado mediante el Data API.
- Registro y activación con tokens válidos e inválidos.
- Creación, búsqueda y unión a clases.
- Lectura autorizada de catálogos.
- Consulta y generación server-side de logs administrativos.
- Solicitudes y resoluciones sensibles con MFA.
- Gestión de usuarios y tokens.
- Actividades y progreso de estudiante.
- Consulta docente de clases y progreso.
- Build de producción correcto.

## Antes del siguiente despliegue

1. Revisar y confirmar los cambios locales pendientes en el repositorio.
2. Desplegar la versión que contiene el frontend de fases 1–8 y `vercel.json`.
3. Comprobar sobre la URL de producción CSP, HSTS, Permissions Policy, COOP,
   X-Content-Type-Options, X-Frame-Options y Referrer-Policy.
4. Ejecutar una prueba breve de login, MFA, libro y panel administrativo.

## Riesgos residuales

- Aviso de React Router limitado a RSC/acciones de servidor no usadas por esta
  SPA.
- Avisos transitivos del entorno de desarrollo de ESLint.
- Optimización pendiente del tamaño del bundle.
- Cuatro clases históricas que requieren asignación manual de ámbito/docente.
