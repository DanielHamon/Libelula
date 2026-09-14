# Evidencia — AUD-007

**Hallazgo:** Claves foráneas sin índice dedicado en tablas de alta cardinalidad
**Severidad:** Media
**Commit:** `070ac28`

---

## Comandos de reproducción

```bash
git checkout 070ac28

# Columnas de clave foránea
grep -oP 'FOREIGN KEY \("?\K[a-z_]+' supabase/schema.sql | sort -u
# 18 columnas distintas

# Índices definidos
grep -oP 'CREATE (UNIQUE )?INDEX "?\K[a-z_0-9]+' supabase/schema.sql | sort
# 25 índices

# Cobertura por columna crítica
for col in clase_id libro_id estudiante_id usuario_id docente_id escuela_id; do
  n=$(grep -c "CREATE \(UNIQUE \)\?INDEX.*($col\b\|, *$col\b" supabase/schema.sql)
  printf "%-16s indices: %s\n" "$col" "$n"
done
```

## Salida registrada

```
clase_id         indices: 0
libro_id         indices: 12
estudiante_id    indices: 2
usuario_id       indices: 2
docente_id       indices: 1
escuela_id       indices: 5
```

`clase_id` no tiene índice dedicado propio.

---

## Caso: tabla `inscripciones`

```bash
grep -n "inscripciones" supabase/schema.sql | grep -i "index\|constraint\|primary key"
```
```
inscripciones_pkey        PRIMARY KEY ("clase_id", "estudiante_id")
idx_inscripciones_est     INDEX ("estudiante_id")
inscripciones_clase_id_fkey    FK → clases(id)     ON DELETE CASCADE
inscripciones_estudiante_id_fkey FK → profiles(id) ON DELETE CASCADE
```

- La clave primaria compuesta `(clase_id, estudiante_id)` cubre `clase_id` **solo
  como prefijo izquierdo**: sirve para buscar por `clase_id`, y para el par, pero
  no de forma óptima para el patrón de unión de la política RLS.
- `estudiante_id` sí tiene índice dedicado.

`inscripciones` participa en `respuestas_docente_scoped_read` (AUD-003), la
política de mayor costo, uniéndose por ambas columnas.

---

## Fundamento

En PostgreSQL, una restricción de clave foránea **no crea índice** sobre la
columna que referencia. Cada `DELETE` o `UPDATE` en la tabla referenciada verifica
filas dependientes; sin índice, ello implica recorrido secuencial. Con
`ON DELETE CASCADE` (presente aquí), el efecto se propaga a las tablas hijas.

---

## Índices recomendados

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_inscripciones_clase
  ON public.inscripciones (clase_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_respuestas_usuario_libro
  ON public.respuestas (usuario_id, libro_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_clase_libros_clase_libro
  ON public.clase_libros (clase_id, libro_id);
```

---

## Advertencia metodológica

Los índices **no deben añadirse sin evidencia de beneficio**: tienen costo de
escritura y almacenamiento. Antes de aplicarlos:

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT ... -- consulta del panel docente, con volumen representativo
-- Confirmar si aparece Seq Scan sobre inscripciones/respuestas.
```

Después de un período de uso, revisar `pg_stat_user_indexes` para detectar
índices sin utilización.
