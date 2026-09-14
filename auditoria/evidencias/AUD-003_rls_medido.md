# AUD-003 — Confirmación por medición del costo de las políticas RLS

**Hallazgo original:** AUD-003 (Alta) — fase 1, análisis estático
**Estado tras la fase 2:** **CONFIRMADO por medición**, con corrección de un dato
**Componente:** `supabase/schema.sql` — política `respuestas_docente_scoped_read`
**Fecha de la prueba:** 2026-09-12 (tercer fin de semana: medición con volumen)

---

## Corrección del recuento de la fase 1

El informe afirma «51 reevaluaciones de `auth.uid()` por fila en **46 políticas
RLS**». La consulta directa al catálogo matiza la cifra:

```sql
SELECT count(*) FROM pg_policies WHERE schemaname='public';                -- 46
SELECT count(*) FROM pg_policies
WHERE schemaname='public'
  AND (coalesce(qual,'')||' '||coalesce(with_check,'')) ~* 'auth\.uid\(\)'; -- 33
```

Hay **46 políticas en total**, de las cuales **33 contienen `auth.uid()`**, con
51 ocurrencias en conjunto. **Las 33 carecen de la envoltura `(SELECT ...)`**, de
modo que el hallazgo se sostiene íntegramente; lo que procede corregir es el
titular, que debe decir 33 políticas y no 46.

## Advertencia metodológica

Un primer intento de medición produjo un plan engañoso. `SET LOCAL ROLE` fuera de
un bloque de transacción es ignorado —PostgreSQL emite `WARNING: SET LOCAL can
only be used in transaction blocks`— y la consulta se ejecutó como superusuario,
que **está exento de RLS**. El plan resultante no contenía rastro de las
políticas y habría llevado a concluir que su costo es despreciable.

La medición válida exige envolver la suplantación en `BEGIN … COMMIT` y
verificar el rol efectivo antes de medir:

```sql
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', :docente_id, 'role','authenticated')::text, true);
SELECT current_user, current_setting('request.jwt.claims',true)::json->>'sub';
-- -> authenticated | 4c3876ce-…   (si dice `postgres`, la medición no vale)
```

Se documenta porque es un error fácil de cometer y que invalida silenciosamente
cualquier medición de RLS.

## Medición

Volumen: 25 estudiantes, 60 actividades, **1 500 filas** en `respuestas`.

### Consulta del panel docente

| Condición | Tiempo | Buffers |
|---|---|---|
| Sin RLS (superusuario, medición inválida) | 8,5 ms | 43 |
| **Con RLS aplicado (docente real)** | **483,8 ms** | **92 395** |

**Factor de 57× en tiempo y de 2 149× en lecturas de búfer**, atribuible por
entero a la evaluación de las políticas.

### Dónde está el costo en la consulta real

El plan de la consulta del panel docente —la que efectivamente corre— es un
`Nested Loop` cuyos accesos a tabla **sí usan índice**:

```
Nested Loop (actual time=1.645..483.802 rows=1500 loops=1)
  Buffers: shared hit=92395
  -> Index Only Scan using inscripciones_pkey (rows=25 loops=1)
       Buffers: shared hit=57
  -> Index Scan using respuestas_usuario_id_actividad_id_key
       (actual time=0.360..19.151 rows=60 loops=25)
       Filter: (... OR EXISTS(SubPlan 9) OR es_admin())
       Buffers: shared hit=92338
       SubPlan 9
         -> Nested Loop (actual time=0.314..0.314 rows=1 loops=1500)
              Buffers: shared hit=91506
              InitPlan 1  -> Seq Scan on profiles p   (rows=1 loops=1)
              InitPlan 2  -> Seq Scan on profiles     (rows=1 loops=1)
              -> Index Only Scan on clase_libros cl   (loops=1500)
                   SubPlan 3
                     -> Bitmap Heap Scan on inscripciones i (loops=1500)
                          Heap Blocks: exact=1500
                          Buffers: shared hit=78000
```

El dato decisivo es **`loops=1500` en el `SubPlan 9`**: el JOIN de la política se
evalúa una vez por fila candidata, tal como la fase 1 anticipó leyendo el código.
Aporta **91 506 de los 92 395 buffers — el 99 %**. El bucle exterior son sólo 25
iteraciones (una por alumno) y no contribuye al costo.

**Importa distinguirlo** porque cambia la remediación: el problema no es falta de
índices en el acceso a `respuestas`, que ya se resuelve por índice, sino la
reevaluación por fila del `EXISTS`.

Las dos subconsultas a `profiles` se resuelven **una sola vez** (`loops=1`,
promovidas a `InitPlan`). Son `Seq Scan` sobre 30 filas: hoy irrelevantes, pero
su costo crece con el padrón de usuarios.

### La política aislada (medición de contraste)

Evaluando directamente el `EXISTS`, sin el Index Scan externo que lo acota:

```
Aggregate (actual time=965.813..965.879 rows=1 loops=1)
  Buffers: shared hit=183053
  -> Seq Scan on respuestas r (actual time=2.196..963.505 rows=1500 loops=1)
       SubPlan 18
         -> Nested Loop (actual time=0.318..0.318 rows=1 loops=1500)
              Buffers: shared hit=91506
```

Reproduce el mismo `SubPlan` con `loops=1500`. Sirve para aislar el costo de la
política —965 ms, 183 053 buffers— **no para describir el plan de la consulta
real**, que es el de arriba.

### La remediación del punto 1 no mejora esta consulta

La misma corrida midió la variante con `(SELECT auth.uid())`:

| Variante | Tiempo | Buffers |
|---|---|---|
| `auth.uid()` sin envolver | 965,8 ms | 183 053 |
| `(SELECT auth.uid())` | **972,8 ms** | **183 054** |

Diferencia nula. Las llamadas ya se promovían a `InitPlan` (`loops=1`), de modo
que no había margen que recuperar. **Lo que cuesta es el JOIN repetido 1 500
veces, y la envoltura no lo toca.** Es un resultado que conviene registrar: la
remediación mecánica y barata no resuelve el hallazgo; hace falta el rediseño.

## Proyección revisada

Las cifras de la fase 1 eran analíticas. Con la medición como base y una
relación aproximadamente lineal en el número de filas:

| Filas en `respuestas` | Tiempo estimado | Situación |
|---|---|---|
| 1 500 (medido) | **965 ms** | Ya perceptible |
| 10 000 | ≈ 6,4 s | Inaceptable para una vista interactiva |
| 100 000 | ≈ 64 s | Tiempo de espera agotado |
| 1 000 000 | ≈ 11 min | Inviable |

La proyección es conservadora: supone linealidad, cuando el recorrido secuencial
sobre `profiles` dentro del bucle tenderá a empeorar la pendiente conforme crezca
el padrón de usuarios.

## Interacción con AUD-001

Ambos hallazgos se amplifican. La consulta de AUD-001 solicita 1 500 filas en una
sola petición, y cada una de ellas paga el JOIN triple aquí medido. Los 746 ms
observados en la prueba de truncamiento son la manifestación conjunta de los dos
defectos.

## Reproducción

```bash
N_ESTUDIANTES=23 N_ACTIVIDADES=30 N_UNIDADES=2 node scripts/02_generar_datos.mjs
psql "$DB_URL" -v docente_id="'<uuid>'" -v clase_id="'<uuid>'" -f scripts/07_explain_rls.sql
```

Artefacto: [`resultados/explain_rls.txt`](../pruebas/resultados/explain_rls.txt)

## Consecuencia para el informe

La nota metodológica de AUD-003 —«estas proyecciones son analíticas […] y no
fueron medidas empíricamente»— puede retirarse.

Lo que la medición **reordena** es la remediación. El punto 1 —envolver en
`(SELECT auth.uid())`— se proponía como la corrección barata y prioritaria, y
resultó **medirse en 972 ms contra 965 ms: sin efecto**. Se mantiene como higiene
sobre las otras 32 políticas, no como corrección de este hallazgo.

El punto 3 —sustituir el JOIN por una función auxiliar `STABLE` o materializar la
relación— pasa a ser **la única remediación con efecto demostrable**, porque
`loops=1500` seguirá siendo `loops=1500` mientras lo que se repita sea el JOIN y
no sólo `auth.uid()`.
