# Evidencia — AUD-003

**Hallazgo:** 51 reevaluaciones de `auth.uid()` por fila en 46 políticas RLS
**Severidad:** Alta
**Commit:** `070ac28`

---

## Comandos de reproducción

```bash
git checkout 070ac28

# Total de llamadas a auth.uid() en políticas
awk '/CREATE POLICY/,/;/' supabase/schema.sql | grep -o 'auth"\."uid"()' | wc -l
# Salida: 51

# Cuántas están envueltas en (SELECT auth.uid())
awk '/CREATE POLICY/,/;/' supabase/schema.sql | grep -oiP '\(\s*select\s+auth' | wc -l
# Salida: 0

# Políticas totales
awk '/CREATE POLICY/,/;/' supabase/schema.sql | grep -c "CREATE POLICY"
# Salida: 46

# Subconsultas y EXISTS
awk '/CREATE POLICY/,/;/' supabase/schema.sql | grep -c "SELECT"   # 44
awk '/CREATE POLICY/,/;/' supabase/schema.sql | grep -c "EXISTS"   # 17
```

---

## Resumen cuantitativo

| Métrica | Valor |
|---|---|
| Llamadas a `auth.uid()` en políticas | 51 |
| Envueltas en `(SELECT auth.uid())` | **0** |
| Políticas RLS totales | 46 |
| Subconsultas en políticas | 44 |
| Cláusulas `EXISTS` | 17 |
| Invocaciones de `es_admin()` | 14 |

---

## El antipatrón

En PostgreSQL, una función invocada en una cláusula `USING` se evalúa por cada
fila examinada. La documentación de Supabase recomienda envolverla en una
subconsulta escalar para que el planificador la promueva a `InitPlan`
(evaluación única por consulta):

```sql
-- Reevaluada por fila
USING ("usuario_id" = "auth"."uid"())

-- Evaluada una vez (InitPlan)
USING ("usuario_id" = (SELECT "auth"."uid"()))
```

Referencia: documentación oficial de rendimiento de RLS de Supabase, sección
"Call functions with select".

> **Corregido tras la medición de fase 2.** Este análisis de fase 1 identificó
> bien el antipatrón, pero **erró al anticipar su peso**. La medición
> (`AUD-003_rls_medido.md`) muestra que en la política más costosa las llamadas a
> `auth.uid()` **ya se promovían a `InitPlan`** (`loops=1`) sin necesidad de
> envolverlas, y que aplicar la envoltura no cambia el tiempo: 972,8 ms contra
> 965,8 ms. El costo real está en el JOIN de tres tablas del `EXISTS`, que se
> reevalúa una vez por fila candidata (`loops=1500`). Lo que sigue conserva su
> valor como inventario del antipatrón en las 33 políticas —vale como higiene—,
> no como explicación del costo medido.

---

## Caso de mayor costo

`respuestas_docente_scoped_read` (extraído de `supabase/schema.sql`):

```sql
CREATE POLICY "respuestas_docente_scoped_read" ON "public"."respuestas"
FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM (("public"."inscripciones" "i"
     JOIN "public"."clases" "c" ON (("c"."id" = "i"."clase_id")))
     JOIN "public"."clase_libros" "cl" ON ((("cl"."clase_id" = "c"."id")
       AND ("cl"."libro_id" = "respuestas"."libro_id"))))
  WHERE (("i"."estudiante_id" = "respuestas"."usuario_id")
     AND ("c"."docente_id" = "auth"."uid"())            -- auth.uid() #1
     AND ("c"."escuela_id" = ( SELECT "p"."escuela_id"
           FROM "public"."profiles" "p"
          WHERE ("p"."id" = "auth"."uid"())))))));       -- auth.uid() #2
```

Trabajo ejecutado **por cada fila candidata** de `respuestas`:
- JOIN de tres tablas (`inscripciones` × `clases` × `clase_libros`)
- Subconsulta a `profiles`
- Dos llamadas a `auth.uid()`

---

## Amplificación con AUD-001

La consulta de progreso de clase (AUD-001) solicita miles de filas de
`respuestas`. Cada una atraviesa esta política. Los dos hallazgos se multiplican.

---

## Proyección de costo sobre `respuestas`

| Filas | Evaluaciones de política | Situación |
|---|---|---|
| 10 000 | 10 000 × (JOIN triple + 2 `auth.uid()`) | Latencia perceptible |
| 100 000 | 100 000 × ídem | Degradación severa |
| 1 000 000 | 1 000 000 × ídem | Tiempos de espera agotados |

`respuestas` crece con una fila por estudiante, por actividad, por intento: es la
tabla de mayor crecimiento previsto.

**Naturaleza analítica**: proyección derivada de la estructura de la política.
No medida. Requiere `EXPLAIN (ANALYZE, BUFFERS)` con volumen representativo.

---

## Aspecto correcto: `es_admin()` es STABLE

```bash
grep -A6 'FUNCTION "public"."es_admin"' supabase/schema.sql
```

```sql
CREATE OR REPLACE FUNCTION "public"."es_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'pg_catalog', 'public'
    AS $$ SELECT EXISTS ( SELECT 1 FROM public.profiles ... ) $$;
```

La declaración `STABLE` permite al planificador almacenar en caché el resultado
dentro de la consulta. Es correcto. Sus 14 invocaciones, sin embargo, tampoco
están envueltas, por lo que no se garantiza la promoción a `InitPlan`.

---

## Verificación de la remediación

```sql
-- Antes y después del cambio, con volumen representativo:
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM respuestas WHERE usuario_id = '<uuid>' AND libro_id = '<uuid>';

-- Confirmar en el plan: auth.uid() aparece como InitPlan (una vez),
-- no reevaluado en el filtro por fila.
```

**Este criterio de verificación resultó insuficiente.** La fase 2 comprobó que el
plan ya mostraba `InitPlan` antes de aplicar cambio alguno, de modo que el
criterio se cumplía con el defecto presente. La verificación que sí discrimina es
mirar el `loops` del `SubPlan` del `EXISTS`: mientras siga siendo igual al número
de filas candidatas, el problema persiste por más que `auth.uid()` esté envuelta.
