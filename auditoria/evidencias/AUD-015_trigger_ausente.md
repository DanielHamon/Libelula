# AUD-015 — Trigger `handle_new_user` ausente: el registro de usuarios no crea perfil

**Dominio:** Corrección funcional / integridad de datos
**Componente:** `supabase/schema.sql` — función `public.handle_new_user()`
**Origen:** Fase 2 (dinámica). No detectable por análisis estático.
**Fecha de la prueba:** 2026-08-29 (primer fin de semana: montaje del entorno y aplicación del esquema)

---

## Descripción

El esquema define la función `public.handle_new_user()`, cuyo propósito es crear
la fila de `public.profiles` correspondiente a cada usuario nuevo de
`auth.users`:

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, nombre, email, escuela, rol)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'nombre', ''),
          NEW.email, NULL, 'estudiante');
  RETURN NEW;
END;
$function$
```

Es una función de tipo `trigger`: **sólo se ejecuta si un trigger la invoca**.
El esquema auditado no crea ninguno.

## Reproducción

Aplicado `schema.sql` sobre una instancia limpia y creados 7 usuarios mediante
la API de administración de GoTrue:

```bash
psql "$DB_URL" -f supabase/schema.sql
node scripts/01_crear_usuarios.mjs      # 7 usuarios creados correctamente
```

Comprobación de triggers sobre el esquema `auth`:

```sql
SELECT t.tgname, c.relname, n.nspname, t.tgenabled
FROM pg_trigger t
JOIN pg_class c     ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE NOT t.tgisinternal AND n.nspname = 'auth';
```

```
(0 filas)
```

Estado resultante de `profiles`:

```sql
SELECT count(*) FROM public.profiles;
```

```
0
```

**Siete usuarios en `auth.users`, cero perfiles en `public.profiles`.**

## Impacto

En una instalación realizada a partir del esquema versionado, todo usuario que
complete el registro queda sin fila en `profiles`. Dado que `profiles` es la
tabla que sostiene el rol, la escuela y el grado, y que las políticas RLS se
apoyan en ella —incluida la subconsulta `SELECT p.escuela_id FROM profiles p
WHERE p.id = auth.uid()` de `respuestas_docente_scoped_read`—, el usuario
quedaría autenticado pero sin autorización efectiva sobre ningún recurso.

Caben dos interpretaciones, y la distinción es importante:

1. **El trigger existe en el proyecto Supabase de producción pero no en el
   esquema versionado.** Es lo más probable, ya que el producto está en uso. En
   tal caso el defecto no es de funcionamiento sino de **reproducibilidad**: el
   esquema versionado no permite reconstruir el sistema, y cualquier entorno
   nuevo —pruebas, recuperación ante desastre, nueva instalación— nacería roto.

2. **El trigger tampoco existe en producción.** Entonces la creación de perfiles
   depende de alguna otra vía (una RPC llamada desde el cliente, creación
   manual), y el registro estándar de Supabase estaría efectivamente roto.

La fase 2 no puede discriminar entre ambas sin acceso al entorno desplegado, que
permanece fuera de alcance por decisión del responsable del sistema.

## Relación con AUD-013

Este hallazgo es la **confirmación empírica del riesgo que AUD-013 describía en
abstracto**. Aquel señalaba que la brecha de trazabilidad impedía verificar qué
se desplegó realmente. Aquí se constata una divergencia concreta y verificable
entre el esquema versionado y el comportamiento que el sistema requiere para
funcionar.

Eleva además la severidad práctica de AUD-013: no se trata sólo de disciplina de
proceso, sino de que **el catálogo canónico está incompleto**.

## Remediación

1. **Determinar cuál de las dos interpretaciones es la correcta**, consultando
   los triggers del proyecto de producción:

```sql
SELECT tgname, tgrelid::regclass, tgenabled
FROM pg_trigger
WHERE NOT tgisinternal AND tgrelid = 'auth.users'::regclass;
```

2. **Incorporar el trigger al esquema versionado**, exista o no en producción:

```sql
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

3. **Verificar la reproducibilidad del esquema de forma automatizada**: aplicar
   `schema.sql` sobre una base limpia en integración continua, registrar un
   usuario y comprobar que se crea su perfil. Es la única forma de impedir que
   la divergencia reaparezca.

4. **Revisar si existen otras divergencias del mismo tipo.** El método de la
   fase 2 —aplicar el esquema a una instancia limpia y ejercitarlo— es el
   procedimiento adecuado para detectarlas.

**Esfuerzo estimado:** Bajo para el punto 2. Medio para el punto 3.
