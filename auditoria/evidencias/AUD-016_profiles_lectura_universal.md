# AUD-016 — Cualquier usuario autenticado puede leer el perfil de cualquier otro

**Dominio:** Seguridad / control de acceso
**Componente:** `supabase/schema.sql` — política `profiles_authenticated_read`
**CVSS 3.1 (propuesto):** 6.5 — `AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:N/A:N`
**Origen:** Fase 2 (dinámica). No detectable de forma fiable por análisis estático.
**Fecha de la prueba:** 2026-09-05 (segundo fin de semana: matriz de acceso cruzado)

---

## Descripción

La tabla `public.profiles` tiene cuatro políticas de lectura:

```
admin_read_profiles         SELECT  {authenticated}  is_admin(auth.uid())
profiles_admin_select       SELECT  {authenticated}  es_admin()
profiles_authenticated_read SELECT  {public}         (auth.uid() IS NOT NULL)
profiles_own_select         SELECT  {authenticated}  (id = auth.uid())
```

Tres de ellas expresan un control de acceso razonable: el propio perfil, o el de
cualquiera si se es administrador. La cuarta, `profiles_authenticated_read`,
tiene por única condición **estar autenticado**.

En PostgreSQL, las políticas `PERMISSIVE` de un mismo comando **se combinan con
`OR`**. Basta con que una conceda acceso para que la fila sea visible. En
consecuencia, `profiles_authenticated_read` **absorbe y anula** el aislamiento
que las otras tres intentan establecer: mientras exista, `profiles_own_select`
no restringe nada.

Es el motivo por el que este hallazgo no aparece en la fase 1. Leída de forma
aislada, `profiles_own_select` (`id = auth.uid()`) parece correcta. El defecto
sólo emerge al considerar el conjunto de políticas y su semántica de
composición, que es precisamente lo que la sección 8.1 del informe advertía como
límite del análisis estático:

> «Una política sintácticamente correcta puede resultar inefectiva por
> interacción con otras, por el orden de evaluación o por privilegios concedidos
> fuera del esquema versionado.»

## Reproducción

Instancia local con el esquema auditado, dos escuelas sin relación entre sí y
sesiones autenticadas reales de cada rol.

```js
// Estudiante de la escuela A consultando el perfil de un alumno de la escuela B
const { data } = await estudianteA1
  .from('profiles').select('id, email, rol')
  .eq('id', ID_ESTUDIANTE_ESCUELA_B)
```

| Prueba | Esperado | Obtenido |
|---|---|---|
| `RLS-A05` Estudiante lee perfil de otra escuela | vacío | **1 fila** |
| `RLS-B05` Docente lee perfil de alumno ajeno | vacío | **1 fila** |

Comprobación de la política responsable:

```sql
SELECT policyname, roles::text, qual
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'profiles' AND cmd = 'SELECT';
```

```
profiles_authenticated_read | {public} | (auth.uid() IS NOT NULL)
```

## Impacto

Todo usuario con una cuenta —incluido cualquier estudiante— puede leer el
registro completo de `profiles`: **nombre, correo electrónico, rol, escuela y
grado de todos los usuarios del sistema**, entre ellos menores de edad de
instituciones ajenas.

Consecuencias concretas:

1. **Exposición de datos personales de menores** más allá del ámbito de su
   institución. Es el activo más sensible del sistema y el que motiva la
   severidad asignada.
2. **Enumeración de correos electrónicos** de todo el padrón, aprovechable para
   phishing dirigido a la comunidad escolar.
3. **Reconocimiento de la estructura de roles**: identificar quiénes son
   administradores facilita dirigir un ataque hacia las cuentas de mayor
   privilegio.
4. **Ruptura del aislamiento multiescuela**, que es el supuesto sobre el que se
   apoya el modelo de licenciamiento por institución.

La barrera de entrada es mínima: basta una cuenta de estudiante, y la
plataforma las emite mediante tokens de activación impresos.

Se propone severidad **Alta**, no Crítica: exige autenticación previa y el
impacto es de confidencialidad, sin afectar integridad ni disponibilidad. Aun
así, supera a varios hallazgos ya clasificados como altos en la fase 1, y por
tratarse de datos personales de menores merece prioridad inmediata.

## Verificación de lo que sí funciona

Conviene acotar el hallazgo: el aislamiento **sí opera correctamente** en las
tablas de contenido académico. Se verificó en la misma ejecución que un
estudiante no accede a respuestas ni a progreso de otro, y que un docente no
accede a datos de clases ajenas. El defecto está circunscrito a `profiles`.

## Remediación

1. **Eliminar la política permisiva**:

```sql
DROP POLICY "profiles_authenticated_read" ON public.profiles;
```

2. **Verificar qué flujo la requería antes de eliminarla.** Es previsible que
   alguna vista necesite mostrar nombres de terceros —por ejemplo, el listado de
   alumnos de una clase para su docente. Ese caso debe resolverse con una
   política acotada, no con una apertura universal:

```sql
CREATE POLICY "profiles_docente_de_su_clase" ON public.profiles
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1
  FROM public.inscripciones i
  JOIN public.clases c ON c.id = i.clase_id
  WHERE i.estudiante_id = profiles.id
    AND c.docente_id = (SELECT auth.uid())
));
```

3. **Exponer únicamente las columnas necesarias.** Si una vista sólo precisa el
   nombre, conviene una vista o una RPC `SECURITY DEFINER` que devuelva ese
   campo, en lugar de conceder acceso a la fila completa con correo y rol.

4. **Revisar el resto de tablas con varias políticas `PERMISSIVE`** para el mismo
   patrón: una política amplia que anule a las restrictivas.

```sql
SELECT tablename, cmd, count(*) AS politicas
FROM pg_policies
WHERE schemaname = 'public' AND permissive = 'PERMISSIVE'
GROUP BY tablename, cmd
HAVING count(*) > 1
ORDER BY count(*) DESC;
```

5. **Incorporar la matriz de acceso cruzado a la integración continua.** Este
   defecto habría sido detectado por la prueba `RLS-A05` en el momento de
   introducirse.

**Esfuerzo estimado:** Bajo para el punto 1. Medio para el 2, por requerir
identificar los flujos afectados y probar que no se rompen.
