# AUD-001 — Confirmación empírica del truncamiento silencioso

**Hallazgo original:** AUD-001 (Crítica) — fase 1, análisis estático
**Estado tras la fase 2:** **CONFIRMADO por medición**
**Componente:** `src/services/docente.service.js:45` — `getProgresoClaseCompleta`
**Fecha de la prueba:** 2026-09-12 (tercer fin de semana: medición con volumen)

---

## Qué se sometió a prueba

La fase 1 proyectó de forma analítica que la consulta de progreso de clase
sufriría truncamiento silencioso al superar el límite por defecto de PostgREST,
y situó el umbral de fallo en torno a las 1 000 filas, dentro del rango de uso
normal del producto. La proyección se basaba en la estructura de la consulta,
no en una medición.

La fase 2 reproduce la consulta del servicio auditado contra una instancia real,
con el esquema auditado, una sesión autenticada de docente y el volumen exacto
que el informe señalaba como caso de fallo: **25 estudiantes × 60 actividades**.

## Resultado

```
Estudiantes en la clase: 25
Actividades en el libro: 60
Producto (filas que la vista necesita): 1500

Filas existentes (service_role):  1500
Filas devueltas al docente:       1000
Error devuelto:                   ninguno
Latencia de la consulta:          746 ms
Longitud de la URL:               14725 caracteres

TRUNCAMIENTO SILENCIOSO: CONFIRMADO
  Se perdieron 500 filas sin error alguno.
```

**Se perdió el 33,3 % de los datos y la consulta no devolvió error.**

## Los cuatro factores del hallazgo original, contrastados

| Factor descrito en fase 1 | Verificación en fase 2 |
|---|---|
| Crecimiento multiplicativo `N × M` | **Confirmado**: 25 × 60 = 1 500 filas en una sola petición |
| Truncamiento silencioso en 1 000 filas | **Confirmado**: exactamente 1 000 devueltas, sin error |
| Longitud de URL cercana al límite | **Confirmado**: 14 725 caracteres |
| Costo por fila de RLS | **Confirmado**: 746 ms frente a 13 ms con 20 filas |

Sobre la longitud de URL conviene precisar: 14 725 caracteres superan el límite
por defecto de varios servidores y proxys (8 KB es habitual en nginx). En el
entorno local la petición se cursó, pero **es un punto de fallo dependiente de
la infraestructura**, que en producción podría manifestarse antes que el propio
truncamiento.

La latencia se multiplicó por 57 al pasar de 20 a 1 500 filas, mientras el
volumen se multiplicó por 75. La relación es aproximadamente lineal, lo que
concuerda con la evaluación por fila de las políticas RLS descrita en AUD-003.

## Reproducción

```bash
# 1. Generar el volumen del escenario crítico
N_ESTUDIANTES=23 N_ACTIVIDADES=30 N_UNIDADES=2 \
  node scripts/02_generar_datos.mjs

# 2. Reproducir la consulta del servicio auditado
node scripts/05_truncamiento_aud001.mjs
```

Artefacto: [`resultados/aud001_truncamiento.json`](../pruebas/resultados/aud001_truncamiento.json)

## Consecuencia para el informe

La clasificación **Crítica** queda respaldada por medición, no por proyección.
El modo de falla es el descrito: no hay caída ni error, sino presentación de
datos incompletos como si fueran completos.

Un docente con una clase de 25 alumnos y un libro de 60 actividades ve hoy un
panel de progreso al que le falta un tercio de la información, sin ningún
indicio de ello. La sección 8.1 del informe puede retirar la salvedad de que las
proyecciones de AUD-001 «requieren validación empírica»: ya la tienen.
