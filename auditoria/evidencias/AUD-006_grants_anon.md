# Evidencia — AUD-006

**Hallazgo:** `GRANT ALL` al rol anónimo sobre tablas con datos personales
**Severidad:** Media · CVSS 3.1: 6.5 (`AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N`, condicionado)
**Commit:** `070ac28`

---

## Comandos de reproducción

```bash
git checkout 070ac28

# Concesiones al rol anónimo
grep -iP 'GRANT .* TO "?anon"?' supabase/schema.sql | sort -u
```

## Salida registrada

```
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
GRANT ALL ON FUNCTION "public"."sesion_es_aal2"() TO "anon";
GRANT ALL ON TABLE "public"."actividad_progreso" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."progreso" TO "anon";
GRANT ALL ON TABLE "public"."progreso_clase" TO "anon";
GRANT ALL ON TABLE "public"."respuestas" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."libro_activaciones" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "anon";
```

---

## Verificación mitigante: RLS en las 24 tablas

```bash
grep -oP 'CREATE TABLE (IF NOT EXISTS )?"?public"?\."?\K[a-z_]+' \
  supabase/schema.sql | sort -u > all_tables.txt
grep -oP 'ALTER TABLE (ONLY )?"?public"?\."?\K[a-z_]+(?="? ENABLE ROW LEVEL SECURITY)' \
  supabase/schema.sql | sort -u > rls_on.txt

comm -23 all_tables.txt rls_on.txt
# Salida: (vacía) → todas las tablas tienen RLS
```

Las 24 tablas tienen RLS habilitado. Los privilegios **no son explotables en el
estado actual**: RLS filtra las filas con independencia del `GRANT`.

---

## Por qué es un hallazgo pese a estar mitigado

La severidad responde a **fragilidad estructural**, no a explotación presente. Es
una violación del principio de defensa en profundidad: la protección de datos
personales de menores queda sostenida por un único control (RLS).

Cualquiera de estas situaciones produciría exposición inmediata:

1. **Tabla nueva sin RLS.** La concesión por defecto
   (`ALTER DEFAULT PRIVILEGES ... GRANT ALL ON TABLES TO anon`) otorga
   automáticamente privilegios totales al rol anónimo sobre toda tabla futura. El
   privilegio se concede solo; habilitar RLS hay que recordarlo en cada tabla
   nueva.
2. **Política eliminada por error** durante una migración.
3. **Restauración parcial** que reponga privilegios sin reponer políticas.

El patrón es probablemente un artefacto del volcado de esquema de la CLI de
Supabase, no una decisión deliberada. Eso no reduce el riesgo: está en el
catálogo canónico y se reproduce en cualquier instalación nueva.

---

## Comprobación automatizada recomendada

Añadir a la integración continua una consulta que falle si alguna tabla de
`public` carece de RLS:

```sql
SELECT c.relname
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relrowsecurity = false;
-- Debe devolver cero filas.
```

---

## Verificación pendiente

Antes de revocar, confirmar en entorno de pruebas que **ningún flujo legítimo**
(registro anónimo, activación de token) depende del acceso del rol `anon` a estas
tablas. El flujo de registro es el candidato a revisar.
