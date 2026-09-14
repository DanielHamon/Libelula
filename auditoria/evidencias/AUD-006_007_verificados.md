# AUD-006 y AUD-007 — Verificación en catálogo y medición

**Hallazgos originales:** AUD-006 (Media), AUD-007 (Media) — fase 1
**Estado tras la fase 2:** **AMBOS AGRAVADOS** respecto de lo documentado
**Fecha de la prueba:** 2026-08-30 (primer fin de semana: lectura de privilegios en el catálogo)

---

## AUD-006 — Privilegios del rol anónimo: mucho más extensos de lo documentado

### Lo que decía la fase 1

El informe identifica `GRANT ALL` al rol `anon` sobre **cinco tablas**
(`profiles`, `progreso`, `respuestas`, `actividad_progreso`, `progreso_clase`),
más las concesiones por defecto.

### Lo que muestra el catálogo

Consultando los privilegios efectivamente materializados tras aplicar el
esquema:

```sql
SELECT table_name, string_agg(DISTINCT privilege_type, ',' ORDER BY privilege_type)
FROM information_schema.role_table_grants
WHERE grantee = 'anon' AND table_schema = 'public'
GROUP BY table_name ORDER BY table_name;
```

El resultado no son cinco objetos, sino **los 25 del esquema** —las 24 tablas más
la vista `progreso_clase`, que `information_schema.role_table_grants` enumera
junto a ellas— cada uno con el conjunto completo de privilegios:

```
DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
```

Entre ellas, todas las que la fase 1 no había identificado: `tokens`,
`escuelas`, `clases`, `inscripciones`, `libros`, `unidades`, `actividades`,
`admin_logs`, `superadministradores`, `acciones_admin_pendientes`,
`intentos_token_anonimos`…

El mismo patrón alcanza a las funciones:

```sql
SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname='public' AND has_function_privilege('anon', p.oid, 'EXECUTE');
-- 57
```

**Las 57 funciones son ejecutables por `anon`**, pese a que el esquema contiene
57 sentencias `REVOKE ALL ON FUNCTION … FROM PUBLIC`. La razón es que `REVOKE …
FROM PUBLIC` no retira los privilegios concedidos **nominalmente** al rol
`anon`, que es lo que hacen las `ALTER DEFAULT PRIVILEGES`.

### Por qué el análisis estático no lo vio

El `grep` sobre `schema.sql` localiza las sentencias `GRANT … TO anon`
explícitas, que son cinco. Pero el grueso del privilegio no proviene de esas
sentencias, sino de:

```sql
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES    TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
```

que se aplican a **todo objeto creado después**, sin aparecer nominalmente en
ninguna línea `GRANT`. Sólo consultando el catálogo tras aplicar el esquema se
observa el efecto acumulado. Es el ejemplo más claro de por qué la fase 2 era
necesaria.

### Riesgo real: contenido, no explotación inmediata

Se verificó que **RLS contiene efectivamente el privilegio**. Las pruebas
`RLS-C01` a `RLS-C07` confirman que un cliente anónimo no lee `profiles`,
`respuestas`, `actividad_progreso` ni `progreso`, y que sus intentos de
escritura no surten efecto.

La valoración de la fase 1 era, pues, correcta en lo esencial: el riesgo no es
de explotación presente, sino de **fragilidad estructural**. Lo que cambia es su
magnitud: la superficie que quedaría expuesta ante un fallo de RLS no son cinco
tablas, sino **la totalidad del esquema**, incluidas `tokens` (códigos de
activación), `admin_logs` (registro de auditoría) y `superadministradores`.

### Remediación revisada

La remediación del informe —revocar sobre cinco tablas— es insuficiente. Procede
revocar en bloque:

```sql
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES    FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;
```

Y devolver después, de forma explícita, únicamente lo que la aplicación necesite
del rol anónimo —que tras la verificación de AUD-017 es prácticamente nada, ya
que el único punto legítimamente anónimo es la Edge Function, y ésta opera con
`service_role`.

**Advertencia:** requiere pruebas de regresión sobre los flujos de registro y
activación antes de aplicarse en producción.

---

## AUD-007 — Claves foráneas sin índice: 17, no las tres documentadas

### Lo que decía la fase 1

El informe identifica ausencias en columnas de alta cardinalidad y propone tres
índices: `inscripciones(clase_id)`, `respuestas(usuario_id, libro_id)` y
`clase_libros(clase_id, libro_id)`.

### Lo que muestra el catálogo

```sql
SELECT t.relname, a.attname,
       EXISTS (SELECT 1 FROM pg_index i
               WHERE i.indrelid = t.oid AND a.attnum = ANY (i.indkey)) AS tiene_indice
FROM pg_constraint c
JOIN pg_class t     ON t.oid = c.conrelid
JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY (c.conkey)
WHERE c.contype = 'f' AND t.relnamespace = 'public'::regnamespace
ORDER BY tiene_indice;
```

**17 columnas de clave foránea carecen de índice**:

| Tabla | Columna | Relevancia |
|---|---|---|
| `respuestas` | `libro_id` | **Usada en la política más costosa** (AUD-003) |
| `respuestas` | `unidad_id` | Tabla de mayor crecimiento |
| `acciones_admin_pendientes` | `aprobador_id`, `solicitante_id` | Flujo de aprobación |
| `admin_logs` | `admin_id` | Registro de auditoría |
| `archivos_libro` | `libro_id`, `propietario_id`, `resuelto_por` | |
| `clases` | `grado_id` | |
| `libro_activaciones` | `token_id` | |
| `profiles` | `grado_id` | |
| `superadministradores` | `creado_por` | |
| `tokens` | `grado_id`, `usuario_id` | |

Las dos primeras son las importantes: `respuestas.libro_id` participa en el
`JOIN` de `respuestas_docente_scoped_read`, la política medida en AUD-003 con
`loops=1500`.

### Confirmación en el plan de ejecución

El plan medido muestra recorridos secuenciales donde debería haber acceso por
índice:

```
-> Seq Scan on respuestas r  (actual time=2.196..963.505 rows=1500 loops=1)
-> Seq Scan on profiles p_1  (actual time=0.036..0.119 rows=1 loops=1)
-> Seq Scan on profiles profiles_2 (actual time=0.019..0.101 rows=1 loops=1)
```

`profiles` se recorre secuencialmente **pese a filtrarse por clave primaria**,
efecto de las políticas RLS que pesan sobre esa tabla.

### Dato adicional: 22 índices sin uso alguno

Tras la carga de 1 500 filas, 22 de los 58 índices registran `idx_scan = 0`,
entre ellos `idx_inscripciones_est`, `idx_clases_docente` e
`idx_escuela_libros_pair`. El volumen es pequeño y el planificador prefiere
recorridos secuenciales, de modo que **no cabe concluir que sobren**: es un dato
a reevaluar con volumen de producción, no una recomendación de eliminarlos.

### Remediación revisada

A los tres índices propuestos por la fase 1 conviene añadir, en orden de
prioridad medida:

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_respuestas_libro
  ON public.respuestas (libro_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_respuestas_unidad
  ON public.respuestas (unidad_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tokens_usuario
  ON public.tokens (usuario_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_libro_activaciones_token
  ON public.libro_activaciones (token_id);
```

Se mantiene el criterio de la fase 1: verificar con `EXPLAIN (ANALYZE, BUFFERS)`
y volumen representativo antes de fijarlos, ya que todo índice tiene costo de
escritura.

---

## Hallazgo adicional: cuatro tablas con RLS activo y ninguna política

```sql
SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity
  AND NOT EXISTS (SELECT 1 FROM pg_policies p
                  WHERE p.schemaname='public' AND p.tablename = c.relname);
```

```
intentos_clase
intentos_token
intentos_token_anonimos
limites_progreso
```

En PostgreSQL, RLS activo sin políticas equivale a **denegación total** para
todo rol que no sea el propietario o una función `SECURITY DEFINER`. Es un
comportamiento correcto y probablemente deliberado: las cuatro son tablas de
control de tasa y de límites, manipuladas exclusivamente desde funciones
`SECURITY DEFINER`.

Se registra por dos motivos. Primero, porque es **frágil**: el aislamiento de
estas tablas depende de la ausencia de políticas, y cualquier política añadida
por descuido —combinada con el `GRANT ALL` a `anon` de AUD-006— abriría de
inmediato las tablas que sostienen los límites de intentos. Segundo, porque
conviene que la decisión quede **documentada como deliberada** en el esquema,
mediante un comentario, en lugar de deducirse de la ausencia de código.
