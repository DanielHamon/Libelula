# Auditoría técnica — Plataforma Libélula

Auditoría independiente de seguridad, rendimiento, escalabilidad y arquitectura
sobre el commit `070ac28`, realizada entre el 2026-08-29 y el 2026-09-13, a lo
largo de tres fines de semana.

Se revisó el código y el esquema, y además se probó el sistema corriendo contra
una instancia local de Supabase con datos inventados. **No se dirigió tráfico de
ningún tipo a producción.**

Esta carpeta es autocontenida y no modifica ningún archivo del repositorio. La
documentación de seguridad previa del equipo (`SECURITY_AUDIT_STATUS.md` y los
handoff de la raíz) se trata como objeto auditado y como afirmación a verificar,
nunca como conclusión adoptada.

## Contenido

| Documento | Qué es |
|---|---|
| [`INFORME_AUDITORIA.md`](INFORME_AUDITORIA.md) | **El informe completo.** Resumen, alcance, los 17 hallazgos, plan de acción, cómo reproducirlo, referencia del sistema y pendientes. |
| [`HALLAZGOS.csv`](HALLAZGOS.csv) | Los hallazgos en tabla, para importar a un gestor de incidencias. |
| [`evidencias/`](evidencias/) | Un archivo por hallazgo, con el comando de reproducción y la salida registrada. |

## Los hallazgos

| Severidad | Cantidad |
|---|---|
| Crítica | 1 |
| Alta | 5 |
| Media | 6 |
| Baja | 5 |

**Lo primero que hay que mirar:**

1. **AUD-016** — Cualquier usuario logueado lee el perfil de cualquier otro,
   incluidos alumnos de otras escuelas. Son datos personales de menores.
2. **AUD-001** — El panel de progreso del docente muestra datos incompletos sin
   ningún aviso. Con 25 alumnos y 60 actividades se pierde un tercio.
3. **AUD-002** — El límite de intentos de la función anónima se esquiva
   cambiando una cabecera HTTP.

## La verificación más urgente

Confirmar si la infraestructura de producción sobrescribe `x-real-ip` y
`cf-connecting-ip` en el borde. De eso depende que AUD-002 sea Alto o Crítico, y
sólo puede comprobarse sobre el entorno desplegado.

## Cómo leer esto

- **Para decidir qué hacer primero**: sección 6 del informe (plan de acción).
- **Para implementar una corrección**: el hallazgo en el informe, más su archivo
  en `evidencias/`.
- **Para reproducir un hallazgo**: sección 7 del informe, más el comando del
  archivo de evidencia.
- **Para ubicarse en el sistema**: sección 8 (referencia del sistema).

## Una advertencia

Las pruebas corrieron sobre el `schema.sql` versionado aplicado a una base
limpia. No hay garantía de que producción tenga exactamente ese esquema — de
hecho AUD-015 muestra una divergencia concreta. Conviene contrastar los hallazgos
de base de datos contra el entorno real antes de darlos por definitivos.
