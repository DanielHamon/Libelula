# Guía de trabajo — IAbooks

Este archivo orienta el trabajo en el repositorio. Para conocer el producto y ejecutarlo, consulta `README.md`. Las fechas, cifras y resultados de pruebas pertenecen a sus informes; no deben tomarse como estado actual sin comprobarlos.

## Producto y código

- Plataforma educativa con cuatro perfiles: estudiante, docente, administrador y superadministrador. Incluye activación por token, Auth/MFA, catálogo y PDF privados, unidades y actividades, progreso, clases, seguimiento docente y administración con aprobaciones para acciones sensibles.
- Frontend: React, React Router y Vite. `src/App.jsx` define rutas; `src/pages/` contiene vistas, `src/components/` mecánicas y componentes compartidos, `src/hooks/` estado reutilizable, `src/services/` acceso a datos y `src/lib/` cliente y utilidades.
- Backend: Supabase Auth, PostgreSQL con RLS y RPC, Storage privado y la Edge Function `prevalidar-token`. `supabase/schema.sql` es una reconstrucción consolidada; `supabase/security_phase*.sql` y `supabase/audit_*.sql` documentan cambios y verificaciones. `vercel.json` configura la SPA y sus cabeceras.
- Las guardas de rutas son interfaz; el acceso a libros, datos de alumnos y operaciones privilegiadas se decide en RLS y funciones del servidor. Las actividades objetivas se evalúan en el servidor; no enviar soluciones al navegador.

## Estado y fuentes de verdad

- Hay **dos planes distintos** con fases numeradas: el endurecimiento de seguridad documentado en `SECURITY_AUDIT_STATUS.md` y `SECURITY_FINAL_HANDOFF.md`, y la auditoría posterior `AUD-001` a `AUD-017` documentada en `auditoria/seguimiento/`. No mezclar sus «fases 4», «fases 6» ni sus conclusiones.
- En la auditoría `AUD`, la fase 5 figura cerrada. La fase 4 conserva en el seguimiento local el pendiente de respuesta de soporte Supabase sobre `supabase_admin`. El paquete de fase 6 se integró mediante el [PR #4](https://github.com/DanielHamon/Libelula/pull/4); las entradas anteriores de `auditoria/seguimiento/FASE6.md` describen el estado previo a esa integración. Comprueba el estado remoto antes de interpretar informes fechados como pendientes actuales.
- El árbol de trabajo principal contiene cambios previos sin commit y difiere de `main`. Antes de publicar, comparar el paquete exacto con la base; no copiar ni incluir todo el árbol de trabajo.
- El seguimiento local `docs/AUDITORIA_MEJORAS_CRITICAS.md` describe un borrador de privacidad y ajustes de carga. El texto de privacidad requiere decisiones del responsable antes de presentarlo como política definitiva. No inferir despliegue a partir de archivos locales.
- `auditoria/seguimiento/AGENTS_HISTORICO.md` conserva las memorias, inventarios y resultados anteriores. Sus entradas son evidencia fechada, no instrucciones vigentes cuando contradicen este archivo o un informe posterior.

## Trabajo y comprobaciones

- Leer `git status` y el archivo de seguimiento pertinente antes de editar. Preservar cambios ajenos y distinguir código local, candidato y producción.
- Para frontend, usar los comandos de `package.json` (`npm run build`, `npm run lint`) y pruebas específicas de `auditoria/pruebas/scripts/` según el cambio. El lint global puede incluir respaldos ignorados y deuda previa: comparar diagnósticos contra la base; no presentar un fallo histórico como regresión nueva.
- Para SQL o Edge, revisar migración, verificador, dependencias y estado del entorno antes de ejecutar. No aplicar `schema.sql` completo ni repetir migraciones históricas sobre producción o fixtures existentes. Usar datos ficticios en pruebas locales y preservar volúmenes y evidencias.
- No imprimir, versionar ni pegar credenciales, tokens, URLs firmadas o datos personales. Los archivos `.env.local`, configuraciones locales de Supabase y resultados ignorados pueden contenerlos.
- Al informar resultados, precisar entorno y alcance: prueba local, candidato, preview o producción; separar lo medido de lo pendiente. Si el usuario debe intervenir, dar pasos concretos.

## Flujo Git y despliegues

- `main` representa la versión estable. Nunca desarrollar, crear commits ni hacer push directo o forzado sobre `main`. No integrar un PR en `main` sin autorización explícita del usuario, aunque se haya autorizado el push. No modificar ni borrar ramas con trabajo sin integrar.
- Antes de editar, comprobar rama y estado. Reutilizar una rama relacionada si no mezcla tareas; en caso contrario, crear una rama nueva desde el `origin/main` vigente y verificado. Usar nombres breves, en minúsculas y con guiones: `feature/`, `fix/`, `refactor/`, `security/`, `hotfix/`, `docs/` o `chore/`. Las ramas antiguas `feat/` pueden reutilizarse si corresponde; no renombrarlas solo por convención.
- Si hay cambios ajenos o el cambio de rama no es seguro, usar un worktree aislado. No emplear `git reset --hard`, `git clean -fd` ni comandos destructivos sin autorización. No incorporar archivos de otra tarea al commit.
- Para cambios pequeños, implementar y verificar directamente. Para funcionalidades grandes, arquitectura, autenticación, seguridad o bases de datos, presentar un plan antes de implementar. Mantener los cambios mínimos y acordes con la arquitectura existente.
- Usar Conventional Commits (`feat:`, `fix:`, `refactor:`, `security:`, `docs:`, `test:` o `chore:`). Antes del commit local, revisar el diff, las pruebas y la ausencia de secretos o cambios ajenos. Informar tanto los éxitos como los fallos y la deuda previa.
- Antes de hacer push, resumir la rama, los cambios y las comprobaciones, y pedir autorización al usuario. Tras esa autorización, publicar solo la rama de la tarea y preparar un PR hacia `main` con descripción, riesgos y pasos de verificación. La autorización de push no autoriza el merge.
- Antes de integrar, comprobar alcance, conflictos, checks obligatorios y Preview disponible; facilitar su enlace y distinguirlo de producción. Confirmar que Preview usa datos de prueba antes de ejecutar operaciones que escriban o borren datos. Nunca usar datos reales para pruebas destructivas.
- Tras un merge autorizado, verificar el despliegue automático de producción si hay acceso. No ejecutar despliegues adicionales sin autorización. Para un error crítico, crear `hotfix/` desde el `origin/main` actualizado, limitar el cambio y seguir el mismo circuito de PR y aprobación.
- Al cerrar una tarea, comunicar brevemente la rama, archivos y cambios, pruebas y resultados, commit, push, PR, Preview y cualquier autorización pendiente.

## Contenido educativo

- Antes de crear actividades, comprobar la estructura real del libro para evitar duplicados. Leer el PDF completo y basar las preguntas en la historia, evitando inconsistencias editoriales.
- Usar únicamente mecánicas compatibles con el contrato actual de `src/components/ActivityCard.jsx` y `src/components/activities/`. No sustituir una actividad por otra que cambie su funcionamiento; registrar las omisiones.
- En los flujos de grados 4.º y 5.º, consultar `FLUJO_ACTIVIDADES_GRADOS_4_5.md`. El título de cada unidad sigue el formato `[emoji] Sección #`. Preparar los cambios, esperar las aprobaciones administrativas requeridas y comprobar cantidad, orden y contenido guardado al finalizar.
