# Evidencia — AUD-001

**Hallazgo:** Consulta de progreso de clase con crecimiento multiplicativo y sin paginación
**Severidad:** Crítica
**Commit:** `070ac28`

---

## Comandos de reproducción

```bash
cd /ruta/al/repositorio
git checkout 070ac28

# 1. Contar filtros .in() en los servicios
grep -rn "\.in(" src/services/*.js | wc -l
# Salida: 11

# 2. Consultas sin límite ni rango
grep -rn "\.select(" src/services/*.js | grep -v "limit\|range\|single\|maybeSingle" | wc -l
# Salida: 41

# 3. Dónde SÍ hay paginación
grep -rn "\.limit(\|\.range(" src/services/*.js
# Salida: 6 coincidencias, todas en admin.service.js
```

## Salida registrada

```
src/services/admin.service.js:68:    .range(offset, offset + limit - 1)
src/services/admin.service.js:136:   .range(offset, offset + limit - 1)
src/services/admin.service.js:352:   .range(offset, offset + limit - 1)
src/services/admin.service.js:505:   .range(offset, offset + limit - 1)
src/services/admin.service.js:540:   .range(offset, offset + limit - 1)
src/services/admin.service.js:552:    supabase.from('admin_logs').select(...).limit(5),
```

El panel administrativo pagina correctamente. El panel docente, no.

---

## Código afectado

`src/services/docente.service.js:45-83` — `getProgresoClaseCompleta`

```js
export async function getProgresoClaseCompleta(claseId, libroId, unidadId = null) {
  const { data: inscripciones, error: ie } = await supabase
    .from('inscripciones')
    .select('estudiante_id, profiles(nombre, email)')
    .eq('clase_id', claseId)              // ← sin límite
  if (ie) throw ie

  const estudiantes = (inscripciones || []).map(i => ({ ... }))

  let q = supabase
    .from('unidades')
    .select('id, titulo, orden, actividades(*)')   // ← actividades(*) completo
    .eq('libro_id', libroId)
    .order('orden')
  if (unidadId) q = q.eq('id', unidadId)

  const { data: unidades, error: ue } = await q
  if (ue) throw ue

  const allActIds     = (unidades || []).flatMap(u => (u.actividades || []).map(a => a.id))
  const estudianteIds = estudiantes.map(e => e.id)

  const [respRes, progRes] = await Promise.all([
    supabase.from('respuestas')
      .select('usuario_id, actividad_id, respuesta, es_correcta')
      .in('usuario_id',   estudianteIds)   // ← N valores
      .in('actividad_id', allActIds),      // ← M valores, sin paginación
    supabase.from('actividad_progreso')
      .select('usuario_id, actividad_id')
      .in('usuario_id',   estudianteIds)
      .in('actividad_id', allActIds),
  ])

  // Agregación completa en el navegador del docente
  const rIdx = {}
  for (const r of (respRes.data || [])) { ... }
}
```

---

## Los cuatro factores concurrentes

### 1. Crecimiento multiplicativo

El conjunto de resultados crece con `N estudiantes × M actividades`.

### 2. Truncamiento silencioso en 1 000 filas

PostgREST aplica un límite máximo por defecto (habitualmente 1 000 filas en
Supabase). Al no solicitarse `.range()`, la respuesta se trunca **sin error**.
El código no verifica la cantidad recibida frente a la esperada.

### 3. Longitud de la URL

Los filtros `.in()` se serializan en la cadena de consulta de una petición GET:

```
?usuario_id=in.(uuid1,uuid2,...)&actividad_id=in.(uuid1,uuid2,...)
```

Con UUID de 36 caracteres más separadores, 120 actividades producen
aproximadamente 4 500 caracteres solo en ese filtro, aproximándose a los límites
habituales de longitud de URL (≈8 KB en muchos servidores y proxies).

### 4. Costo por fila de RLS

Cada fila candidata de `respuestas` se evalúa con
`respuestas_docente_scoped_read`: JOIN de tres tablas más subconsulta a
`profiles` (ver AUD-003).

---

## Proyección de volumen

| Estudiantes | Actividades | Filas solicitadas | Resultado |
|---|---|---|---|
| 10 | 30 | 300 | Funciona |
| 20 | 40 | 800 | Cerca del límite |
| 25 | 60 | 1 500 | **Truncado: datos incorrectos** |
| 35 | 120 | 4 200 | Truncado + URL extensa |
| 40 | 200 | 8 000 | Truncado + URL posiblemente excedida |

**Naturaleza analítica**: proyección derivada de la estructura de la consulta,
no medida empíricamente. Requiere validación con datos reales.

---

## Escenario de fallo concreto

1. Una docente tiene una clase de 25 estudiantes.
2. El libro asignado contiene 60 actividades distribuidas en 6 unidades.
3. Abre el panel de progreso de la clase.
4. La consulta solicita 1 500 filas de `respuestas`.
5. PostgREST devuelve 1 000 y trunca el resto **sin señalar error**.
6. La interfaz muestra la tabla de progreso completa, sin aviso.
7. Aproximadamente un tercio de las actividades aparece como no completada
   cuando sí lo está.
8. La docente concluye que un grupo de estudiantes no ha trabajado.

**El fallo no es una caída ni un mensaje de error: es información incorrecta
presentada como correcta.**

---

## Verificación pendiente

Con acceso a un entorno de pruebas:

1. Poblar una clase con 30 estudiantes y un libro con 50 actividades.
2. Registrar respuestas para todos, comprobando el total en la base:
   `SELECT count(*) FROM respuestas WHERE ...` → debe arrojar 1 500.
3. Abrir el panel docente e inspeccionar la respuesta de red.
4. **Confirmación del hallazgo**: la respuesta contiene 1 000 elementos y la
   interfaz no informa del truncamiento.
