# Auditoría técnica — Plataforma Libélula

|                          |                                                                                                          |
| ------------------------ | -------------------------------------------------------------------------------------------------------- |
| **Commit auditado**      | `070ac28b94542685fa55689ef88c71b733b92272`                                                               |
| **Fecha del commit**     | 2026-08-22                                                                                               |
| **Rama**                 | `main`                                                                                                   |
| **Período de auditoría** | 2026-08-29 a 2026-09-13 (tres fines de semana)                                                           |
| **Qué se revisó**        | Seguridad, rendimiento, escalabilidad y arquitectura                                                     |
| **Cómo se revisó**       | Lectura del código y del esquema, más pruebas ejecutadas contra una instancia local con datos inventados |
| **Para quién**           | Equipo técnico de desarrollo                                                                             |

---

## 1. Resumen

Libélula es una aplicación web (React 19 + Vite) montada sobre Supabase
—PostgreSQL, Auth, Storage y una Edge Function— para gestionar lectura y
actividades escolares. Tiene cuatro roles: estudiante, docente, administrador y
superadministrador.

**La base de seguridad es buena.** Las 24 tablas tienen RLS activo (Row Level
Security: el mecanismo de PostgreSQL que filtra qué filas puede ver cada
usuario), la CSP del despliegue está bien armada, y no hay ni un solo punto de
inyección en el cliente: cero usos de `dangerouslySetInnerHTML`, `eval` o
`innerHTML` en 17 450 líneas. Tampoco hay credenciales reales en el historial de
Git. Eso está por encima de lo habitual en proyectos de esta escala.

Los problemas serios no están en la lógica de permisos, sino en tres frentes
distintos: **un dato personal que se filtra entre escuelas, consultas que
devuelven datos incompletos sin avisar, y la ausencia de cualquier estrategia
de escalabilidad en el cliente.**

Se encontraron **17 problemas**: 1 crítico, 5 altos, 6 medios y 5 bajos.

### Lo que hay que mirar primero

1. **Cualquier usuario logueado puede leer el perfil de cualquier otro.** Una
   política de RLS deja ver la tabla `profiles` entera —nombre, email, rol,
   escuela— a todo el que tenga cuenta, incluidos alumnos de otras
   instituciones. Se comprobó: un estudiante lista los 30 perfiles del sistema.
   Son datos personales de menores. (AUD-016)

2. **El panel de progreso del docente muestra datos incompletos sin avisar.**
   Con 25 alumnos y 60 actividades se piden 1 500 filas y la base devuelve 1 000,
   sin error. Se pierde un tercio de la información y la pantalla se ve normal.
   Medido, no estimado. (AUD-001)

3. **El límite de intentos de la función anónima se esquiva cambiando una
   cabecera.** Con identificador fijo bloquea al intento 11; rotándolo, 25
   intentos sin un solo bloqueo. Como los códigos de activación se redujeron a
   50 bits en la fase 12, toda la defensa descansaba justamente en ese límite.
   (AUD-002)

También hay un **problema de trazabilidad**: las fases 12 y 13 del endurecimiento
no tienen commit propio, así que no se puede verificar qué se desplegó ni
cuándo. Y no es teórico: falta un trigger en el esquema versionado, de modo que
una instalación nueva nacería sin crear perfiles de usuario (AUD-015).

### Cómo se reparten los hallazgos

| Severidad | Cantidad | Dónde se concentran                                              |
| --------- | -------- | ---------------------------------------------------------------- |
| Crítica   | 1        | Escalabilidad                                                    |
| Alta      | 5        | Seguridad (3), Rendimiento (2)                                   |
| Media     | 6        | Seguridad (3), Arquitectura (1), Integridad (1), Rendimiento (1) |
| Baja      | 5        | Rendimiento, proceso, operación                                  |

---

## 2. Alcance

### 2.1 Qué se revisó

| Componente                  | Detalle                                       | Volumen                      |
| --------------------------- | --------------------------------------------- | ---------------------------- |
| Frontend                    | React 19.2, React Router 7.14, Tailwind 4.2   | 17 450 líneas / 54 archivos  |
| Esquema de base de datos    | `supabase/schema.sql`                         | 5 217 líneas / 24 tablas     |
| Migraciones de seguridad    | `supabase/security_phase*.sql`                | ~10 800 líneas               |
| Edge Function               | `prevalidar-token` (Deno)                     | 1 archivo                    |
| Configuración de despliegue | `vercel.json`, `vite.config.js`, `.gitignore` | —                            |
| Dependencias                | `package.json`, `package-lock.json`           | 6 directas, 12 de desarrollo |
| Historial                   | 7 commits desde 2026-07-02                    | —                            |

### 2.2 Cómo se probó

La revisión tuvo dos partes y conviene distinguirlas, porque no dan el mismo
tipo de certeza.

**Lectura de código y esquema.** Sirve para encontrar lo que está escrito: una
consulta sin paginar, una cabecera CORS abierta, un `GRANT` de más.

**Pruebas sobre una instancia local.** Se levantó Supabase en Docker
(PostgreSQL 17), se aplicó el `schema.sql` auditado sobre una base limpia, se
crearon 7 usuarios reales —uno por rol— y dos escuelas sin relación entre sí, y
se ejercitó el sistema con sesiones autenticadas de verdad. Todos los datos son
inventados.

Esa segunda parte es la que dio los hallazgos que la lectura no podía ver:
AUD-015 y AUD-016 sólo aparecen cuando el sistema corre. Y confirmó con números
lo que antes eran proyecciones: el truncamiento de AUD-001, los 965 ms de
AUD-003, la evasión del límite de AUD-002.

> **Nada de esto tocó producción.** Ni una petición. Los scripts que emiten
> tráfico verifican el destino antes de arrancar y abortan si no es `localhost`.

### 2.3 Qué quedó fuera

Tres cosas, y las tres por el mismo motivo: exigirían tocar el entorno
desplegado, que está fuera de alcance por decisión del responsable del sistema.

- **El entorno de producción.** No se hicieron pruebas activas contra él ni se
  verificaron sus ajustes de Auth, Storage o secretos.
- **Las cabeceras HTTP reales.** El `vercel.json` está bien escrito, pero no se
  comprobó que el despliegue las aplique efectivamente.
- **Las dependencias transitivas**, más allá de lo que reporta `npm audit`.

Queda además un punto abierto que **es la verificación más importante para el
equipo**: si la infraestructura de producción sobrescribe las cabeceras
`x-real-ip` y `cf-connecting-ip` en el borde. Si no lo hiciera, el límite por red
también sería evadible y AUD-002 pasaría de Alto a Crítico. Sólo puede
comprobarse sobre el entorno desplegado.

Tampoco se evaluó accesibilidad, usabilidad ni corrección funcional del
producto.

### 2.4 Una advertencia sobre lo que se probó

Las pruebas corrieron sobre el `schema.sql` versionado aplicado a una base
limpia. **No hay garantía de que producción tenga exactamente ese esquema** — de
hecho AUD-015 muestra una divergencia concreta: falta un trigger que el sistema
necesita para funcionar, y como el producto está en uso, es probable que en
producción sí exista. Conviene contrastar los hallazgos de base de datos contra
el entorno real antes de darlos por definitivos.

### 2.5 Sobre la documentación previa del equipo

El repositorio trae documentación de un endurecimiento en trece fases
(`SECURITY_AUDIT_STATUS.md`, `SECURITY_FINAL_HANDOFF.md` y los archivos de
handoff). **No se modificaron y no forman parte de esta entrega.**

Se trataron de dos maneras: como objeto auditado —el proceso también se
evalúa, ver AUD-013— y como afirmaciones a verificar, nunca como hechos dados.
Ninguna conclusión de este informe se apoya en lo que dicen esos documentos.
Cuando se los menciona, se atribuye la afirmación al equipo y se contrasta
con evidencia propia.

---

## 3. Tabla de hallazgos

| ID                  | Severidad   | CVSS | Área          | Problema                                                                                   | Dónde                          |
| ------------------- | ----------- | ---- | ------------- | ------------------------------------------------------------------------------------------ | ------------------------------ |
| [AUD-001](#aud-001) | **Crítica** | —    | Escalabilidad | El progreso de clase pide más filas de las que la base devuelve, y pierde datos sin avisar | `docente.service.js:45`        |
| [AUD-016](#aud-016) | **Alta**    | 6.5  | Seguridad     | Cualquier usuario logueado lee el perfil de cualquier otro                                 | `schema.sql`                   |
| [AUD-002](#aud-002) | **Alta**    | 7.5  | Seguridad     | El límite de intentos se esquiva cambiando una cabecera                                    | `prevalidar-token/index.ts:59` |
| [AUD-003](#aud-003) | **Alta**    | —    | Rendimiento   | La política de `respuestas` reevalúa un JOIN de tres tablas en cada fila                   | `schema.sql`                   |
| [AUD-004](#aud-004) | **Alta**    | 5.3  | Seguridad     | CORS abierto (`*`) en el único endpoint sin autenticación                                  | `prevalidar-token/index.ts:2`  |
| [AUD-005](#aud-005) | **Alta**    | —    | Rendimiento   | Todo el JS en un solo archivo de 1,38 MB                                                   | `vite.config.js`               |
| [AUD-006](#aud-006) | Media       | 6.5  | Seguridad     | El rol anónimo tiene permisos totales sobre los 25 objetos del esquema                     | `schema.sql`                   |
| [AUD-015](#aud-015) | Media       | —    | Integridad    | Falta el trigger que crea los perfiles al registrarse                                      | `schema.sql`                   |
| [AUD-007](#aud-007) | Media       | —    | Rendimiento   | 17 claves foráneas sin índice                                                              | `schema.sql`                   |
| [AUD-008](#aud-008) | Media       | 5.3  | Seguridad     | La URL firmada del PDF dura una hora y se puede repartir                                   | `libros.service.js:32`         |
| [AUD-009](#aud-009) | Media       | 7.5  | Seguridad     | Tres vulnerabilidades altas en dependencias de build                                       | `package-lock.json`            |
| [AUD-010](#aud-010) | Media       | —    | Arquitectura  | Un componente de 3 814 líneas con 28 tipos de actividad                                    | `ActivityCard.jsx`             |
| [AUD-017](#aud-017) | Baja        | 3.7  | Seguridad     | `generar_token_10` es invocable sin autenticarse                                           | `schema.sql`                   |
| [AUD-011](#aud-011) | Baja        | —    | Rendimiento   | Escribe en `localStorage` en cada `mousemove`                                              | `useInactivityTimeout.js:25`   |
| [AUD-012](#aud-012) | Baja        | —    | Rendimiento   | 73 efectos y casi ninguna memorización                                                     | `src/`                         |
| [AUD-013](#aud-013) | Baja        | —    | Proceso       | Las fases 12 y 13 no tienen commit propio                                                  | Historial de Git               |
| [AUD-014](#aud-014) | Baja        | —    | Operación     | 46 `console.*` activos en producción                                                       | `src/`                         |

---

## 4. Los hallazgos en detalle

<a id="aud-001"></a>

### AUD-001 — [CRÍTICA] El progreso de clase pierde datos sin avisar

**Área:** Escalabilidad
**Dónde:** [`src/services/docente.service.js:45`](../src/services/docente.service.js#L45) — `getProgresoClaseCompleta`
**Evidencia:** [`evidencias/AUD-001_progreso_clase.md`](evidencias/AUD-001_progreso_clase.md), [`evidencias/AUD-001_truncamiento_confirmado.md`](evidencias/AUD-001_truncamiento_confirmado.md)

#### Qué pasa

La función que llena la vista de progreso del docente arma dos consultas con
filtros `.in()` sobre todos los alumnos por todas las actividades, sin paginar
ni limitar nada, y hace toda la suma en el navegador:

```js
const [respRes, progRes] = await Promise.all([
  supabase
    .from("respuestas")
    .select("usuario_id, actividad_id, respuesta, es_correcta")
    .in("usuario_id", estudianteIds) // N estudiantes
    .in("actividad_id", allActIds), // M actividades
  supabase
    .from("actividad_progreso")
    .select("usuario_id, actividad_id")
    .in("usuario_id", estudianteIds)
    .in("actividad_id", allActIds),
]);
```

Hay cuatro problemas que se suman entre sí:

1. **La cantidad de filas crece multiplicando.** Son `N × M`: alumnos por
   actividades.
2. **No hay paginación.** Sin `.range()` ni `.limit()`, el techo lo pone
   PostgREST: 1 000 filas. Y cuando lo alcanza **no devuelve error, devuelve
   menos datos**.
3. **La URL se vuelve enorme.** Los filtros `.in()` viajan en la query string de
   un GET. Con UUIDs de 36 caracteres, sólo la lista de actividades ya se acerca
   a los límites habituales de longitud de URL.
4. **Cada fila paga el costo de RLS.** La política `respuestas_docente_scoped_read`
   hace un JOIN de tres tablas por cada fila candidata (ver AUD-003).

#### Qué tan grave es

Se probó el escenario exacto que la lectura del código señalaba como caso de
fallo — 25 alumnos, 60 actividades — contra la instancia local:

```
Filas que existen:      1500
Filas que llegan:       1000
Error devuelto:         ninguno
Latencia:               746 ms
Longitud de la URL:     14 725 caracteres
```

**Se pierde el 33 % de los datos y nadie se entera.** No es una caída ni un
error: la pantalla muestra información incompleta como si estuviera completa. Un
docente con 25 alumnos y un libro de 60 actividades ve hoy un panel al que le
falta un tercio, sin ningún indicio. Las decisiones pedagógicas se toman sobre
eso.

Proyección por volumen:

| Alumnos | Actividades | Filas pedidas | Resultado                              |
| ------- | ----------- | ------------- | -------------------------------------- |
| 10      | 30          | 300           | Funciona                               |
| 25      | 60          | 1 500         | **Medido: se pierden 500 filas**       |
| 35      | 120         | 4 200         | Se trunca + URL cerca del límite       |
| 40      | 200         | 8 000         | Se trunca + URL probablemente excedida |

Sobre los 14 725 caracteres de URL conviene precisar: superan el límite por
defecto de varios servidores y proxys (nginx suele cortar en 8 KB). En local la
petición pasó, pero **en producción puede fallar antes incluso que el
truncamiento**, y eso depende de la infraestructura.

Es crítico porque el umbral de fallo (≈1 000 filas) cae dentro del uso normal
previsto, y porque el fallo no se ve desde la interfaz.

#### Cómo arreglarlo

Reemplazar la suma en el cliente por una función RPC que agregue en el servidor
y devuelva resultados paginados:

```sql
CREATE OR REPLACE FUNCTION public.get_progreso_clase_paginado(
  p_clase_id   uuid,
  p_libro_id   uuid,
  p_unidad_id  uuid DEFAULT NULL,
  p_limite     int  DEFAULT 50,
  p_desplaz    int  DEFAULT 0
) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $$
  -- Verificar que el docente pertenece a la clase antes de agregar.
  -- Devolver { estudiantes: [...], total: n } con los totales ya calculados.
$$;
```

Por orden de prioridad:

1. **Paginar por alumno** (20–25 por página), no por fila de respuesta.
2. **Sumar en el servidor**: devolver contadores (`completadas`, `correctas`,
   `total`) en vez del texto completo de cada respuesta. El detalle se pide al
   abrir un alumno concreto.
3. **Si hace falta una solución provisional**, agregar `.range()` explícito y
   detectar el truncamiento comparando lo recibido con lo pedido, avisando al
   docente cuando falten datos.

**Esfuerzo:** Medio (1–2 días).

---

<a id="aud-016"></a>

### AUD-016 — [ALTA] Cualquier usuario logueado lee el perfil de cualquier otro

**Área:** Seguridad / control de acceso
**Dónde:** [`supabase/schema.sql`](../supabase/schema.sql) — política `profiles_authenticated_read`
**CVSS 3.1:** 6.5 — `AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:N/A:N`
**Evidencia:** [`evidencias/AUD-016_profiles_lectura_universal.md`](evidencias/AUD-016_profiles_lectura_universal.md)

#### Qué pasa

La tabla `profiles` tiene cuatro políticas de lectura:

```
admin_read_profiles         SELECT  {authenticated}  is_admin(auth.uid())
profiles_admin_select       SELECT  {authenticated}  es_admin()
profiles_authenticated_read SELECT  {public}         (auth.uid() IS NOT NULL)
profiles_own_select         SELECT  {authenticated}  (id = auth.uid())
```

Tres son razonables: tu propio perfil, o cualquiera si sos admin. La cuarta,
`profiles_authenticated_read`, pide una sola cosa: **estar logueado**.

Y acá está el detalle que hace daño: en PostgreSQL las políticas `PERMISSIVE` de
un mismo comando **se combinan con `OR`**. Alcanza con que una deje pasar la fila
para que sea visible. O sea que `profiles_authenticated_read` **anula** a las
otras tres: mientras exista, `profiles_own_select` no restringe absolutamente
nada.

Por eso este problema no se ve leyendo el código. Mirada sola,
`profiles_own_select` (`id = auth.uid()`) parece correcta. El defecto sólo
aparece al considerar el conjunto y cómo se combinan — exactamente lo que sólo
se detecta ejecutando.

#### Qué tan grave es

Comprobado con sesiones reales, dos escuelas sin relación entre sí:

| Prueba                                             | Esperado | Obtenido     |
| -------------------------------------------------- | -------- | ------------ |
| `RLS-A05` Estudiante lee perfil de otra escuela    | vacío    | **1 fila**   |
| `RLS-A06` Estudiante lista todos los perfiles      | vacío    | **30 filas** |
| `RLS-B06` Docente B lista perfiles de la escuela A | vacío    | **28 filas** |

Cualquiera con una cuenta —incluido cualquier alumno— lee la tabla entera:
**nombre, email, rol, escuela y grado de todos los usuarios**, entre ellos
menores de edad de instituciones ajenas.

Lo que eso habilita:

1. **Exposición de datos personales de menores** fuera de su institución. Es el
   activo más sensible del sistema.
2. **Listado de todos los emails**, servido en bandeja para phishing dirigido a
   la comunidad escolar.
3. **Ver quiénes son administradores**, lo que facilita apuntar a las cuentas de
   más privilegio.
4. **Rompe el aislamiento entre escuelas**, que es el supuesto sobre el que se
   apoya el licenciamiento por institución.

La barrera de entrada es mínima: alcanza una cuenta de estudiante, y la
plataforma las emite con tokens impresos.

Se clasifica **Alta** y no Crítica porque hace falta estar autenticado y el
impacto es sólo de confidencialidad — no se altera ni se borra nada. Aun así
supera a varios hallazgos altos, y por tratarse de datos de menores merece
atención inmediata.

**Conviene acotarlo:** el aislamiento **sí funciona** en el contenido académico.
Se verificó en la misma corrida que un alumno no accede a respuestas ni progreso
de otro, y que un docente no ve datos de clases ajenas. El defecto está
circunscrito a `profiles`.

#### Cómo arreglarlo

1. **Eliminar la política permisiva:**

```sql
DROP POLICY "profiles_authenticated_read" ON public.profiles;
```

2. **Antes de borrarla, ver qué flujo la necesitaba.** Es previsible que alguna
   vista muestre nombres de terceros —el listado de alumnos de una clase para su
   docente, por ejemplo. Eso se resuelve con una política acotada, no abriendo
   todo:

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

3. **Devolver sólo las columnas necesarias.** Si una vista sólo necesita el
   nombre, conviene una RPC `SECURITY DEFINER` que devuelva ese campo, en lugar
   de dar acceso a la fila completa con email y rol.

4. **Revisar las demás tablas con varias políticas `PERMISSIVE`** buscando el
   mismo patrón — una política amplia que anule a las estrictas:

```sql
SELECT tablename, cmd, count(*) AS politicas
FROM pg_policies
WHERE schemaname = 'public' AND permissive = 'PERMISSIVE'
GROUP BY tablename, cmd
HAVING count(*) > 1
ORDER BY count(*) DESC;
```

5. **Meter la matriz de acceso cruzado en CI.** Este defecto lo habría cazado la
   prueba `RLS-A05` el día que se introdujo.

**Esfuerzo:** Bajo el punto 1. Medio el punto 2, porque hay que identificar los
flujos afectados y probar que no se rompen.

---

<a id="aud-002"></a>

### AUD-002 — [ALTA] El límite de intentos se esquiva cambiando una cabecera

**Área:** Seguridad
**Dónde:** [`supabase/functions/prevalidar-token/index.ts:59`](../supabase/functions/prevalidar-token/index.ts#L59)
**CVSS 3.1:** 7.5 — `AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N`
**Evidencia:** [`evidencias/AUD-002_rate_limit_evadible.md`](evidencias/AUD-002_rate_limit_evadible.md), [`evidencias/AUD-002_evasion_confirmada.md`](evidencias/AUD-002_evasion_confirmada.md)

#### Qué pasa

`prevalidar-token` es **el único punto del sistema al que se llega sin
autenticación**. Su protección contra fuerza bruta son dos límites: 100 intentos
por red y 10 por dispositivo, cada hora. Los dos identificadores salen de
cabeceras HTTP:

```ts
const forwardedFor = request.headers
  .get("x-forwarded-for")
  ?.split(",")[0]
  ?.trim();
const ip =
  request.headers.get("x-real-ip") ||
  request.headers.get("cf-connecting-ip") ||
  forwardedFor ||
  "ip-desconocida";
const device =
  request.headers.get("x-device-id")?.slice(0, 128) || "sin-dispositivo";
const userAgent =
  request.headers.get("user-agent")?.slice(0, 256) || "sin-agente";
const [networkHash, deviceHash] = await Promise.all([
  hmac(`red\n${ip}`, hashSecret),
  hmac(`dispositivo\n${device}\n${userAgent}`, hashSecret),
]);
```

El problema es de diseño, no de implementación:

- **`x-device-id` la manda el cliente y puede poner lo que quiera.** Con un valor
  nuevo en cada petición, el límite de 10 por hora no se alcanza nunca. El HMAC
  no ayuda: protege la confidencialidad del identificador guardado, no su
  autenticidad. No hay ningún secreto del lado del cliente que impida fabricar
  identificadores.
- **`user-agent` también lo controla el cliente** y entra en el mismo hash, así
  que es un segundo eje de evasión.
- **El orden de precedencia de la IP prioriza cabeceras falsificables.**
  `x-real-ip` y `cf-connecting-ip` se leen antes que `x-forwarded-for`. Que sean
  confiables depende enteramente de que la infraestructura las sobrescriba en el
  borde.

#### Qué tan grave es

Se probó con grupo de control: mismo endpoint, misma ventana, misma IP. Lo único
que cambia es una cabecera que el cliente elige:

```
A. device-id FIJO (control):     bloqueados 15/25   primer bloqueo: intento 11
B. device-id ROTATIVO:           bloqueados  0/25   primer bloqueo: NINGUNO
C. user-agent ROTATIVO:          bloqueados  0/25   primer bloqueo: NINGUNO
```

Con identificador fijo bloquea en el intento 11, justo donde declara el límite de 10. Rotándolo: **25 intentos seguidos sin un solo bloqueo.**

La tabla de contadores lo muestra todavía más claro:

```
total | hashes_red | hashes_dispositivo
------+------------+-------------------
   60 |          1 |                 51
```

60 intentos desde **una sola red**, repartidos en 51 identificadores de
dispositivo. Un hash acumula 10 —el escenario A, detenido en el límite— y los
otros 50 tienen uno cada uno. **El contador nunca acumula porque cada petición
estrena identificador.**

Se verificó además, leyendo el cuerpo de `prevalidar_token_anonimo` en la base y
no la documentación del equipo, que los límites son efectivamente 100/red y
10/dispositivo por hora, y que **la fila de intento se inserta antes de validar
el token**. Eso significa que el límite por red sí registra todo: es el único
control que queda en pie.

El impacto se multiplica por dos cosas:

- **El CORS abierto de AUD-004**, que permite repartir la enumeración entre los
  navegadores de los visitantes de un sitio cualquiera — cada uno con su IP,
  neutralizando también el límite por red.
- **Los tokens de 50 bits.** La fase 12 bajó la entropía de 128 a 50 bits
  (Crockford Base32, 10 caracteres) para poder imprimirlos. Es una decisión
  legítima entre usabilidad y seguridad, pero **traslada toda la defensa al
  control de tasa**, que es justamente el que acá se demuestra evadible.

Un token válido permite crear una cuenta asociada a una escuela y acceder al
contenido licenciado. Lo que hace viable el ataque no es el espacio teórico de
2⁵⁰, sino la **densidad de tokens activos**: con muchos códigos vivos a la vez
—como al inicio de un ciclo lectivo, con los lotes ya impresos y repartidos— la
enumeración se vuelve práctica.

La función responde con un booleano y un motivo genérico, sin filtrar metadatos
del token. Eso está bien resuelto. Pero la distinción entre válido e inválido ya
es, por sí sola, el oráculo que habilita la enumeración.

**Punto abierto:** si producción sobrescribe `x-real-ip` y `cf-connecting-ip` en
el borde. Sólo se puede comprobar sobre el entorno desplegado. **Si no lo
hiciera, esto pasa de Alto a Crítico.**

#### Cómo arreglarlo

1. **Sacar `x-device-id` como base del control de tasa.** Un identificador que
   provee el cliente no puede sostener un límite de seguridad. Por orden de
   preferencia:
   - Prueba de trabajo o CAPTCHA (hCaptcha/Turnstile) antes de prevalidar.
   - Cookie firmada por el servidor, emitida en la primera visita.
   - Sacar el límite por dispositivo y reforzar el de red.
2. **Confirmar que la infraestructura sobrescribe las cabeceras de IP** en el
   borde. Si no lo hace, usar solamente la fuente que el proveedor garantice.
3. **Agregar demora progresiva** por red: ir retrasando la respuesta a partir de
   cierto número de intentos, en vez de rechazar en seco.
4. **Poner un límite global** de prevalidaciones fallidas por hora, con alerta
   cuando se supere.
5. **Revisar los 50 bits de entropía** una vez arreglado el control de tasa. Si
   el formato impreso es innegociable, documentar el riesgo residual como
   aceptado y acotar la ventana de validez de los lotes.

**Esfuerzo:** Medio (2–3 días, incluyendo la verificación en el entorno real).

---

<a id="aud-003"></a>

### AUD-003 — [ALTA] La política de `respuestas` reevalúa un JOIN de tres tablas en cada fila

**Área:** Rendimiento
**Dónde:** [`supabase/schema.sql`](../supabase/schema.sql)
**Evidencia:** [`evidencias/AUD-003_rls_auth_uid.md`](evidencias/AUD-003_rls_auth_uid.md), [`evidencias/AUD-003_rls_medido.md`](evidencias/AUD-003_rls_medido.md)

#### Qué pasa

De las 46 políticas RLS del esquema, **33 usan `auth.uid()`** —51 veces en
total— y **ninguna la envuelve en `(SELECT auth.uid())`**.

En PostgreSQL, una llamada a función dentro de un `USING` se evalúa **una vez por
cada fila que se examina**. Envolverla en una subconsulta escalar deja que el
planificador la trate como `InitPlan`: la calcula una sola vez para toda la
consulta y reutiliza el resultado. Es una optimización que Supabase documenta
explícitamente.

La peor es `respuestas_docente_scoped_read`:

```sql
CREATE POLICY "respuestas_docente_scoped_read" ON "public"."respuestas"
FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM (("public"."inscripciones" "i"
     JOIN "public"."clases" "c" ON (("c"."id" = "i"."clase_id")))
     JOIN "public"."clase_libros" "cl" ON ((("cl"."clase_id" = "c"."id")
       AND ("cl"."libro_id" = "respuestas"."libro_id"))))
  WHERE (("i"."estudiante_id" = "respuestas"."usuario_id")
     AND ("c"."docente_id" = "auth"."uid"())
     AND ("c"."escuela_id" = ( SELECT "p"."escuela_id"
           FROM "public"."profiles" "p"
          WHERE ("p"."id" = "auth"."uid"())))))));
```

Por **cada fila candidata** de `respuestas` se ejecuta un JOIN de tres tablas,
una subconsulta a `profiles` y dos llamadas a `auth.uid()`. En el conjunto de
políticas hay 44 subconsultas y 17 cláusulas `EXISTS`.

La función `es_admin()` está bien declarada como `STABLE`, lo que permite al
planificador cachear su resultado dentro de la consulta — eso es un acierto del
equipo. Pero sus 14 invocaciones tampoco están envueltas, así que la promoción a
`InitPlan` no está garantizada.

#### Qué tan grave es

Medido con 25 alumnos, 60 actividades y 1 500 filas en `respuestas`:

| Condición                  | Tiempo       | Buffers     |
| -------------------------- | ------------ | ----------- |
| Sin RLS                    | 8,5 ms       | 43          |
| **Con RLS (docente real)** | **483,8 ms** | **92 395**  |
| La política aislada        | **965,8 ms** | **183 053** |

**57 veces más lento y 2 149 veces más lecturas de buffer**, todo atribuible a
evaluar las políticas.

Conviene ser preciso sobre **dónde** está el costo, porque determina cuál
remediación sirve. Éste es el plan de la consulta del panel docente, la que
corre de verdad:

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
              InitPlan 1
                -> Seq Scan on profiles p           (rows=1 loops=1)
              InitPlan 2
                -> Seq Scan on profiles             (rows=1 loops=1)
              -> Index Only Scan on clase_libros cl (loops=1500)
                   SubPlan 3
                     -> Bitmap Heap Scan on inscripciones i (loops=1500)
                          Heap Blocks: exact=1500
                          Buffers: shared hit=78000
```

El acceso a las tablas **no** es el problema: los scans externos usan índice y
el bucle exterior son 25 iteraciones, una por alumno. El costo está entero en el
`SubPlan 9` del filtro de RLS: **`loops=1500`**, o sea el JOIN de la política
evaluado una vez por cada fila candidata, que aporta **91 506 de los 92 395
buffers** — el 99 %. Dentro de él, `SubPlan 3` vuelve a recorrer
`inscripciones` otras 1 500 veces, con 78 000 buffers de bloques de montón.

Las dos subconsultas a `profiles` sí se resuelven una sola vez (`loops=1`,
promovidas a `InitPlan`), y son recorridos secuenciales sobre 30 filas: hoy no
pesan, pero su costo crece con el padrón de usuarios.

La medición del `EXISTS` aislado —965,8 ms, 183 053 buffers— reproduce el mismo
`SubPlan` con `loops=1500` sin el Index Scan externo que lo acota. Sirve para
aislar el costo de la política, no para describir el plan de la consulta real.

Proyección a partir de la medición, suponiendo relación lineal:

| Filas en `respuestas` | Tiempo estimado | Situación                              |
| --------------------- | --------------- | -------------------------------------- |
| 1 500 (medido)        | **965 ms**      | Ya se nota                             |
| 10 000                | ≈ 6,4 s         | Inaceptable para una vista interactiva |
| 100 000               | ≈ 64 s          | Timeout                                |
| 1 000 000             | ≈ 11 min        | Inviable                               |

La proyección es conservadora: asume linealidad, cuando el recorrido secuencial
sobre `profiles` dentro del bucle va a empeorar la pendiente a medida que crezca
el padrón de usuarios.

Esto **amplifica AUD-001**: la consulta de progreso pide 1 500 filas y cada una
paga este JOIN. Los 746 ms de aquella prueba son los dos defectos actuando
juntos.

#### Cómo arreglarlo

1. **Envolver todas las llamadas** en las 33 políticas:

```sql
-- Antes
USING ("usuario_id" = "auth"."uid"())

-- Después
USING ("usuario_id" = (SELECT "auth"."uid"()))
```

2. **Lo mismo con `es_admin()`**: `(SELECT public.es_admin())`.

3. **Rediseñar `respuestas_docente_scoped_read`. Esto es lo único que resuelve el
   problema medido**, y conviene no confundirlo con los puntos 1 y 2.

   La misma corrida midió la consulta con `(SELECT auth.uid())` ya aplicado:

   | Variante                                           | Tiempo       | Buffers     |
   | -------------------------------------------------- | ------------ | ----------- |
   | `auth.uid()` sin envolver                          | 965,8 ms     | 183 053     |
   | `(SELECT auth.uid())` — la remediación del punto 1 | **972,8 ms** | **183 054** |

   **No mejora nada.** Las llamadas a `auth.uid()` ya se estaban promoviendo a
   `InitPlan` (`loops=1`), así que envolverlas no tenía margen que recuperar. Lo
   que se repite 1 500 veces es el JOIN de la política, y eso no lo toca la
   envoltura.

   La salida es sustituir el `EXISTS` por una función auxiliar `STABLE` que
   resuelva la relación docente–estudiante–libro de una sola vez, o materializar
   esa relación en una tabla mantenida por trigger.

4. **Medir antes y después** con `EXPLAIN (ANALYZE, BUFFERS)` sobre las consultas
   del panel docente.

5. **Revisar los índices** de las columnas que usan las políticas (ver AUD-007),
   teniendo presente que el plan medido ya accede por índice: el margen está en
   el `SubPlan 3` que recorre `inscripciones` 1 500 veces, no en el scan externo.

**Esfuerzo:** Bajo los puntos 1–2, pero **su beneficio medido es nulo en esta
consulta**: se justifican como higiene sobre las otras 32 políticas, no como
corrección de AUD-003. Medio el punto 3, que es el que rinde.

> **Nota metodológica que vale la pena conservar.** Un primer intento de medición
> dio un plan engañoso: `SET LOCAL ROLE` fuera de un bloque de transacción se
> ignora, y la consulta corrió como superusuario, que **está exento de RLS**. El
> plan no tenía rastro de las políticas y habría llevado a concluir que su costo
> es despreciable. Para medir RLS hay que envolver la suplantación en
> `BEGIN … COMMIT` y verificar el rol efectivo antes de medir. Es un error fácil
> de cometer y que invalida la medición en silencio.

---

<a id="aud-004"></a>

### AUD-004 — [ALTA] CORS abierto en el único endpoint sin autenticación

**Área:** Seguridad
**Dónde:** [`supabase/functions/prevalidar-token/index.ts:2`](../supabase/functions/prevalidar-token/index.ts#L2)
**CVSS 3.1:** 5.3 — `AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:N`
**Evidencia:** [`evidencias/AUD-004_cors_wildcard.md`](evidencias/AUD-004_cors_wildcard.md)

#### Qué pasa

```ts
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-client-info, x-device-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
```

El comodín está en el único endpoint desplegado sin verificación de JWT.
Cualquier sitio web puede invocarlo desde el navegador de sus visitantes.

Llama la atención la inconsistencia: el [`vercel.json`](../vercel.json) define
una CSP estricta con `frame-ancestors 'none'`, `object-src 'none'` y
`script-src 'self'` — hay criterio defensivo en el frontend. Ese mismo criterio
no llegó a la Edge Function.

#### Qué tan grave es

1. **Permite distribuir el ataque de AUD-002.** Un sitio de terceros reparte la
   enumeración de tokens entre los navegadores de sus visitantes: cada uno pone
   una IP distinta y el límite por red deja de servir.
2. **Consume cuota** de ejecución de Edge Functions desde orígenes arbitrarios.
3. **Deja el validador disponible** como oráculo para integraciones ajenas.

Por sí solo es moderado. Su importancia real es como **multiplicador de
AUD-002** — los dos se arreglan juntos.

#### Cómo arreglarlo

Restringir a una lista explícita:

```ts
const ORIGENES_PERMITIDOS = new Set([
  "https://libelula.example.com",
  "https://www.libelula.example.com",
]);

function corsHeaders(origin: string | null) {
  const permitido = origin && ORIGENES_PERMITIDOS.has(origin);
  return {
    "Access-Control-Allow-Origin": permitido ? origin : "null",
    "Access-Control-Allow-Headers":
      "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}
```

Tres detalles:

- `Vary: Origin` es necesario para que no se envenene la caché.
- Sacar `x-device-id` de `Allow-Headers` al aplicar la corrección de AUD-002.
- **CORS es un control del navegador, no del servidor.** No impide peticiones
  hechas fuera de un navegador. Corregirlo elimina el vector de distribución
  masiva, pero **no reemplaza** un control de tasa que funcione.

**Esfuerzo:** Bajo (menos de 1 día).

---

<a id="aud-005"></a>

### AUD-005 — [ALTA] Todo el JavaScript en un solo archivo

**Área:** Rendimiento
**Dónde:** [`vite.config.js`](../vite.config.js), [`src/App.jsx`](../src/App.jsx)
**Evidencia:** [`evidencias/AUD-005_bundle.md`](evidencias/AUD-005_bundle.md)

#### Qué pasa

Build de producción ejecutado durante la auditoría:

```
dist/assets/pdf.worker.min-qwK7q_zL.mjs  1 046,21 kB
dist/assets/index-CVk49nnR.js            1 378,45 kB │ gzip: 361,95 kB
dist/assets/index-B0Ui3h9i.css               26,03 kB │ gzip:   6,04 kB
```

Buscar `React.lazy`, `lazy(` o `Suspense` en todo el árbol de fuentes **no
devuelve ni una coincidencia**. Los 26 imports de `App.jsx` son estáticos y
`vite.config.js` no define ninguna estrategia de fragmentación.

Resultado: **todos descargan la aplicación entera al iniciar sesión**, incluido:

- Las 9 vistas del panel de administración, que el 95 % de los usuarios no puede
  ni abrir.
- `AdminLibroDetalle.jsx` (2 675 líneas) y `ActivityCard.jsx` (3 814 líneas).
- El worker de PDF de 1,05 MB, que sólo hace falta al abrir un libro.

#### Qué tan grave es

El público son escuelas, donde las redes limitadas y los dispositivos de gama
baja son la norma. Descarga inicial estimada (362 KB comprimidos, más CSS):

| Conexión            | Tiempo estimado |
| ------------------- | --------------- |
| Fibra (50 Mbps)     | < 1 s           |
| 4G típico (5 Mbps)  | ≈ 3,5 s         |
| 3G (1,5 Mbps)       | ≈ 12 s          |
| 3G lento (400 kbps) | ≈ 45 s          |

A eso hay que sumarle parsear y ejecutar el JavaScript, que en dispositivos
lentos puede tardar tanto o más que la descarga. El propio build emite una
advertencia al respecto.

Un alumno que sólo quiere leer un libro se descarga el panel de administración
completo.

#### Cómo arreglarlo

1. **Dividir por rutas** — es lo que más rinde por esfuerzo:

```jsx
import { lazy, Suspense } from 'react'

const PanelAdmin        = lazy(() => import('./pages/admin/PanelAdmin'))
const AdminLibroDetalle = lazy(() => import('./pages/admin/AdminLibroDetalle'))
const AdminUsuarios     = lazy(() => import('./pages/admin/AdminUsuarios'))
// … resto del panel de administración

<Suspense fallback={<Cargando />}>
  <Routes>{/* … */}</Routes>
</Suspense>
```

Sólo con sacar el panel de administración el bundle inicial debería bajar entre
un 30 % y un 40 %.

2. **Cargar el lector de PDF sólo cuando hace falta**: importar `react-pdf` y su
   worker al abrir un libro, no antes.

3. **Dividir `ActivityCard`**: los 28 tipos de actividad pueden cargarse bajo
   demanda con un registro de imports dinámicos (ver AUD-010).

4. **Separar las dependencias grandes**:

```js
build: {
  rollupOptions: {
    output: {
      manualChunks: {
        'react-vendor':    ['react', 'react-dom', 'react-router-dom'],
        'supabase-vendor': ['@supabase/supabase-js'],
      },
    },
  },
}
```

5. **Poner un presupuesto de tamaño en CI** que falle si el bundle inicial supera
   el umbral acordado (por ejemplo, 250 KB comprimidos).

**Esfuerzo:** Bajo los puntos 1, 2 y 4 (1–2 días, mucho impacto).

---

<a id="aud-006"></a>

### AUD-006 — [MEDIA] El rol anónimo tiene permisos totales sobre los 25 objetos del esquema

**Área:** Seguridad
**Dónde:** [`supabase/schema.sql`](../supabase/schema.sql)
**CVSS 3.1:** 6.5 — `AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N` (condicionado)
**Evidencia:** [`evidencias/AUD-006_grants_anon.md`](evidencias/AUD-006_grants_anon.md), [`evidencias/AUD-006_007_verificados.md`](evidencias/AUD-006_007_verificados.md)

#### Qué pasa

Leyendo el esquema aparecen cinco `GRANT ALL` al rol `anon` sobre tablas con
datos personales:

```sql
GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."progreso" TO "anon";
GRANT ALL ON TABLE "public"."respuestas" TO "anon";
GRANT ALL ON TABLE "public"."actividad_progreso" TO "anon";
GRANT ALL ON TABLE "public"."progreso_clase" TO "anon";
```

Pero el problema real es más grande, y sólo se ve consultando el catálogo después
de aplicar el esquema. **No son 5 objetos: son los 25** —las 24 tablas del
esquema más la vista `progreso_clase`— cada uno con
`DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE`. Incluidas
`tokens`, `admin_logs`, `superadministradores` e `intentos_token_anonimos`.

> **Sobre el recuento 24 / 25.** El esquema define **24 tablas**, que son las que
> llevan RLS, y una vista, `progreso_clase`. `information_schema.role_table_grants`
> las cuenta juntas: de ahí los 25 objetos con `GRANT ALL`. La vista se declara
> `WITH (security_invoker='true')`, de modo que **no lleva RLS propia sino que
> aplica la del usuario que la consulta** — hereda las políticas de
> `inscripciones`, `profiles`, `clase_libros`, `libros` y `actividad_progreso`.
> Es la opción correcta (sin `security_invoker` la vista correría con los
> permisos del propietario y saltearía RLS por completo), y significa que el
> `GRANT ALL` sobre ella queda contenido por las mismas políticas que protegen
> las tablas subyacentes. Donde el informe dice «24 tablas» habla de RLS; donde
> dice «25» habla de objetos con privilegios concedidos.

Y **las 57 funciones son ejecutables por `anon`**, pese a que el esquema tiene 57
sentencias `REVOKE ALL ON FUNCTION … FROM PUBLIC`.

La causa son estas dos líneas:

```sql
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public"
  GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public"
  GRANT ALL ON FUNCTIONS TO "anon";
```

**Todo objeto que se cree de ahora en adelante le da permisos totales al rol
anónimo automáticamente.** Y `REVOKE … FROM PUBLIC` no retira lo que se concedió
nominalmente a `anon`, así que los 57 `REVOKE` del esquema no alcanzan.

Es un buen ejemplo de por qué hacía falta probar el sistema corriendo: un `grep`
sobre el archivo encuentra cinco `GRANT`; el catálogo muestra el efecto real.

#### Qué tan grave es

Se verificó que **RLS contiene el privilegio**: las pruebas `RLS-C01` a `RLS-C07`
confirman que un cliente anónimo no lee `profiles`, `respuestas`,
`actividad_progreso` ni `progreso`, y que sus intentos de escritura no tienen
efecto.

Así que no es un problema de explotación presente, sino de **fragilidad
estructural**: la protección de datos personales de menores queda sostenida por
un solo control. Cualquiera de estas tres situaciones la rompe de inmediato:

- Una tabla nueva creada sin `ENABLE ROW LEVEL SECURITY` — el permiso se concede
  solo, la protección hay que acordarse de ponerla.
- Una política borrada o modificada por error en una migración.
- Una restauración parcial que reponga permisos sin reponer políticas.

Lo que cambia respecto de la primera lectura es la magnitud: lo que quedaría
expuesto ante un fallo de RLS no son cinco tablas, es **el esquema completo**.

Probablemente sea un artefacto del volcado que genera la CLI de Supabase y no una
decisión deliberada. Eso no lo hace menos riesgoso: está en el archivo canónico y
se va a reproducir en toda instalación nueva.

#### Cómo arreglarlo

Revocar en bloque, no tabla por tabla:

```sql
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES    FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;
```

Y después devolver explícitamente sólo lo que la aplicación necesite del rol
anónimo — que tras la verificación de AUD-017 es prácticamente nada, porque el
único punto legítimamente anónimo es la Edge Function, y esa opera con
`service_role`.

Conviene además **agregar un chequeo automático en CI** que falle si alguna tabla
de `public` se queda sin RLS:

```sql
SELECT tablename FROM pg_tables
WHERE schemaname = 'public'
  AND tablename NOT IN (
    SELECT tablename FROM pg_tables t
    JOIN pg_class c ON c.relname = t.tablename
    WHERE c.relrowsecurity = true
  );
-- Debe devolver cero filas.
```

**Esfuerzo:** Bajo, pero **requiere pruebas de regresión**: hay que confirmar que
ningún flujo legítimo (registro, activación) depende del acceso anónimo a estas
tablas antes de aplicarlo en producción.

> **Dato relacionado.** Cuatro tablas tienen RLS activo y **ninguna política**:
> `intentos_clase`, `intentos_token`, `intentos_token_anonimos` y
> `limites_progreso`. En PostgreSQL eso equivale a denegación total salvo para el
> propietario o una función `SECURITY DEFINER`, y es correcto — son tablas de
> control de tasa manipuladas sólo desde funciones. Se menciona por dos motivos:
> es frágil (su aislamiento depende de que nadie agregue una política por
> descuido, lo que combinado con el `GRANT ALL` abriría justo las tablas que
> sostienen los límites), y conviene dejar la decisión documentada con un
> comentario en el esquema en lugar de que haya que deducirla de la ausencia de
> código.

---

<a id="aud-015"></a>

### AUD-015 — [MEDIA] Falta el trigger que crea los perfiles al registrarse

**Área:** Integridad de datos / reproducibilidad
**Dónde:** [`supabase/schema.sql`](../supabase/schema.sql) — función `public.handle_new_user()`
**Evidencia:** [`evidencias/AUD-015_trigger_ausente.md`](evidencias/AUD-015_trigger_ausente.md)

#### Qué pasa

El esquema define `handle_new_user()`, cuyo trabajo es crear la fila de
`public.profiles` para cada usuario nuevo de `auth.users`:

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

Es una función de tipo `trigger`, o sea que **sólo corre si un trigger la
invoca**. El esquema auditado no crea ninguno.

Se comprobó: aplicado `schema.sql` sobre una base limpia y creados 7 usuarios
por la API de administración, `auth.users` tiene 7 filas y `public.profiles`
tiene **0**. Los triggers del esquema `auth` son 0 filas.

Es la única función de tipo trigger huérfana del esquema — los otros 7 triggers
están correctamente instalados, lo que descarta que sea un defecto general del
volcado.

#### Qué tan grave es

En una instalación hecha a partir del esquema versionado, todo el que se registre
queda sin fila en `profiles`. Y como `profiles` es la tabla que sostiene el rol,
la escuela y el grado —y las políticas RLS se apoyan en ella, incluida la
subconsulta de `respuestas_docente_scoped_read`— el usuario quedaría autenticado
pero sin autorización sobre nada.

Hay dos interpretaciones posibles y la diferencia importa:

1. **El trigger existe en producción pero no en el esquema versionado.** Es lo
   más probable, porque el producto está en uso. En ese caso el problema no es de
   funcionamiento sino de **reproducibilidad**: el esquema versionado no permite
   reconstruir el sistema, y cualquier entorno nuevo —pruebas, recuperación ante
   desastre, instalación nueva— nacería roto.

2. **Tampoco existe en producción.** Entonces la creación de perfiles depende de
   otra vía (una RPC desde el cliente, creación manual) y el registro estándar de
   Supabase está efectivamente roto.

No se puede distinguir entre las dos sin acceso al entorno desplegado.

Esto es **la confirmación concreta del riesgo que AUD-013 describía en
abstracto**: la falta de trazabilidad impide saber qué se desplegó realmente.
Acá hay una divergencia verificable entre el esquema versionado y lo que el
sistema necesita para andar. Y eleva la severidad práctica de AUD-013: no es
sólo disciplina de proceso, es que **el archivo canónico está incompleto**.

#### Cómo arreglarlo

1. **Averiguar cuál de las dos interpretaciones es la correcta**, consultando los
   triggers de producción:

```sql
SELECT tgname, tgrelid::regclass, tgenabled
FROM pg_trigger
WHERE NOT tgisinternal AND tgrelid = 'auth.users'::regclass;
```

2. **Agregar el trigger al esquema versionado**, exista o no en producción:

```sql
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

3. **Verificar la reproducibilidad automáticamente**: aplicar `schema.sql` sobre
   una base limpia en CI, registrar un usuario y comprobar que se crea el perfil.
   Es la única forma de que la divergencia no vuelva a aparecer.

4. **Buscar si hay otras divergencias del mismo tipo.** El método que encontró
   esta —aplicar el esquema a una instancia limpia y ejercitarlo— es el adecuado.

**Esfuerzo:** Bajo el punto 2. Medio el punto 3.

---

<a id="aud-007"></a>

### AUD-007 — [MEDIA] 17 claves foráneas sin índice

**Área:** Rendimiento
**Dónde:** [`supabase/schema.sql`](../supabase/schema.sql)
**Evidencia:** [`evidencias/AUD-007_indices.md`](evidencias/AUD-007_indices.md), [`evidencias/AUD-006_007_verificados.md`](evidencias/AUD-006_007_verificados.md)

#### Qué pasa

En PostgreSQL **las claves foráneas no crean índices automáticamente**. Cada
`DELETE` o `UPDATE` en la tabla referenciada tiene que verificar si hay filas
dependientes, y sin índice eso es un recorrido secuencial completo. Con
`ON DELETE CASCADE` —que `inscripciones` tiene— el efecto se propaga.

Consultando el catálogo: **17 columnas de clave foránea no tienen índice.**

| Tabla                       | Columna                                      | Relevancia                                         |
| --------------------------- | -------------------------------------------- | -------------------------------------------------- |
| `respuestas`                | `libro_id`                                   | **Participa en la política más costosa** (AUD-003) |
| `respuestas`                | `unidad_id`                                  | La tabla que más va a crecer                       |
| `acciones_admin_pendientes` | `aprobador_id`, `solicitante_id`             | Flujo de aprobación                                |
| `admin_logs`                | `admin_id`                                   | Registro de auditoría                              |
| `archivos_libro`            | `libro_id`, `propietario_id`, `resuelto_por` |                                                    |
| `clases`                    | `grado_id`                                   |                                                    |
| `libro_activaciones`        | `token_id`                                   |                                                    |
| `profiles`                  | `grado_id`                                   |                                                    |
| `superadministradores`      | `creado_por`                                 |                                                    |
| `tokens`                    | `grado_id`, `usuario_id`                     |                                                    |

Las dos primeras son las que importan: `respuestas.libro_id` participa en el
JOIN de `respuestas_docente_scoped_read`, la política medida en AUD-003 con
`loops=1500`.

El plan de ejecución lo confirma — hay recorridos secuenciales donde debería
haber acceso por índice:

```
-> Seq Scan on respuestas r  (actual time=2.196..963.505 rows=1500 loops=1)
-> Seq Scan on profiles p_1  (actual time=0.036..0.119 rows=1 loops=1)
```

#### Qué tan grave es

1. **Degrada las políticas RLS** que se apoyan en estos JOINs, junto con AUD-003.
2. **Hace caros los borrados**: eliminar una clase o un libro obliga a recorrer
   secuencialmente las tablas dependientes.
3. **Genera bloqueos largos** en operaciones administrativas sobre tablas
   grandes.

#### Cómo arreglarlo

A los tres índices que ya se habían identificado conviene sumar, por orden de
prioridad medida:

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_inscripciones_clase
  ON public.inscripciones (clase_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_respuestas_libro
  ON public.respuestas (libro_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_respuestas_unidad
  ON public.respuestas (unidad_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_respuestas_usuario_libro
  ON public.respuestas (usuario_id, libro_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tokens_usuario
  ON public.tokens (usuario_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_libro_activaciones_token
  ON public.libro_activaciones (token_id);
```

Con dos cuidados:

1. Usar `CONCURRENTLY` para no bloquear escrituras en producción.
2. **Verificar con datos reales antes de fijarlos.** Todo índice cuesta escritura
   y espacio; no conviene agregarlos sin evidencia de que ayudan.

> **Sobre los índices que parecen sobrar.** Con 1 500 filas cargadas, 22 de los 58
> índices registran `idx_scan = 0`, entre ellos `idx_inscripciones_est` y
> `idx_clases_docente`. **No se concluye que sobren**: con ese volumen el
> planificador prefiere recorridos secuenciales de todos modos. Es un dato a
> reevaluar con volumen de producción, no una recomendación de borrarlos.

**Esfuerzo:** Bajo, condicionado a tener un entorno con volumen representativo
para verificar.

---

<a id="aud-008"></a>

### AUD-008 — [MEDIA] La URL firmada del PDF dura una hora y se puede repartir

**Área:** Seguridad
**Dónde:** [`src/services/libros.service.js:32`](../src/services/libros.service.js#L32)
**CVSS 3.1:** 5.3 — `AV:N/AC:L/PR:L/UI:N/S:U/C:L/I:N/A:N`
**Evidencia:** [`evidencias/AUD-008_urls_firmadas.md`](evidencias/AUD-008_urls_firmadas.md)

#### Qué pasa

```js
const { data: signed, error: storageError } = await supabase.storage
  .from("libros")
  .createSignedUrl(libro.pdf_url, 3600);
```

El control de acceso se aplica al generar la URL: la RPC `get_libro_completo`
verifica licencia o rol antes de firmar. Pero una vez emitida, **la URL vale para
cualquiera que la tenga, durante 3 600 segundos**.

Un alumno con licencia legítima puede copiarla de las herramientas de desarrollo
y pasarla. Quien la reciba se descarga el PDF sin autenticarse, durante la hora
siguiente. La licencia no se vuelve a chequear.

Contraste interno: [`StoragePicker.jsx:31`](../src/components/StoragePicker.jsx#L31)
usa 300 segundos para las vistas previas del admin. El criterio más estricto
quedó aplicado al contenido menos sensible.

#### Qué tan grave es

Distribución no autorizada de material licenciado. Una hora alcanza de sobra para
mandar el enlace por un grupo de mensajería y que varios lo bajen.

Es media y no alta porque hace falta un usuario legítimo para empezar, la ventana
es acotada y no son datos personales. El impacto es principalmente comercial:
erosiona el licenciamiento por escuela.

Vale ser honesto: **ningún esquema de URL firmada resiste a un usuario autorizado
que decide repartir el contenido.** El objetivo realista es achicar la ventana y
detectar el abuso, no eliminarlo.

#### Cómo arreglarlo

1. **Bajar a 300 segundos**, igual que en `StoragePicker`, y renovar la firma
   desde el cliente mientras el lector siga abierto.
2. **Registrar cada emisión** (usuario, libro, timestamp) para poder detectar
   anomalías.
3. **Limitar la tasa de emisión por usuario**: decenas de firmas por hora sobre
   libros distintos es señal de extracción sistemática.
4. **Evaluar marcas de agua** por usuario en el PDF si proteger el material es
   prioritario. Es lo único con efecto disuasorio real, y tiene costo de
   procesamiento.

**Esfuerzo:** Bajo los puntos 1–2. Alto el 4.

---

<a id="aud-009"></a>

### AUD-009 — [MEDIA] Tres vulnerabilidades altas en dependencias de build

**Área:** Seguridad (cadena de suministro)
**Dónde:** [`package-lock.json`](../package-lock.json)
**CVSS 3.1:** hasta 7.5 (la más alta del conjunto)
**Evidencia:** [`evidencias/AUD-009_dependencias.md`](evidencias/AUD-009_dependencias.md)

#### Qué pasa

`npm audit` reporta 4 vulnerabilidades: 3 altas y 1 moderada.

| Paquete           | Severidad | CVE / Aviso                              | Tipo                                         |
| ----------------- | --------- | ---------------------------------------- | -------------------------------------------- |
| `brace-expansion` | Alta      | GHSA-rgw5-rvv9-x895 (CVSS 7.5)           | Denegación de servicio por arrays sin acotar |
| `js-yaml`         | Alta      | GHSA-5p4m-2wfm-xmqj, GHSA-2883-xcg3-v3hh | Consumo cuadrático de CPU                    |
| `nanoid`          | Alta      | GHSA-2v37-7h3g-55p8                      | Bucle infinito con tamaño cero               |
| `@humanfs/node`   | Moderada  | GHSA-p498-v437-472g                      | Recorrido de rutas por symlinks              |

**Las cuatro tienen corrección disponible** con `npm audit fix`.

#### Qué tan grave es

Los cuatro paquetes son **dependencias transitivas de la cadena de build**
(ESLint, Vite), no del código que corre en el navegador. Ninguna llega al bundle
de producción.

Por eso se clasifica media y no alta pese al CVSS de 7.5: para explotarlas hay
que controlar las entradas del proceso de build, lo que implica tener ya acceso
al repositorio o al pipeline de CI.

Pero no conviene descartarlo: es riesgo de cadena de suministro y arreglarlo no
cuesta casi nada.

#### Cómo arreglarlo

1. Correr `npm audit fix` y verificar que el build sigue funcionando.
2. **Automatizar la vigilancia**: activar Dependabot o Renovate, o agregar
   `npm audit --audit-level=high` al pipeline.
3. **Fijar versiones de las dependencias directas** para que los builds sean
   reproducibles.
4. **Vigilar `pdfjs-dist` con especial atención.** Hoy no tiene avisos, pero es
   la única dependencia de producción que procesa contenido no confiable (los
   PDFs subidos) y acumula antecedentes de vulnerabilidades de ejecución de
   código.

**Esfuerzo:** Bajo (menos de 1 día).

---

<a id="aud-010"></a>

### AUD-010 — [MEDIA] Un componente de 3 814 líneas

**Área:** Arquitectura y mantenibilidad
**Dónde:** [`src/components/ActivityCard.jsx`](../src/components/ActivityCard.jsx)
**Evidencia:** [`evidencias/AUD-010_arquitectura.md`](evidencias/AUD-010_arquitectura.md)

#### Qué pasa

`ActivityCard.jsx` tiene 3 814 líneas —el 22 % del código del cliente— con 54
definiciones de componentes o funciones y 28 ramas de tipo de actividad en un
solo archivo.

| Archivo                          | Líneas    | % del cliente |
| -------------------------------- | --------- | ------------- |
| `ActivityCard.jsx`               | 3 814     | 21,9 %        |
| `AdminLibroDetalle.jsx`          | 2 675     | 15,3 %        |
| `DocenteRespuestaEstudiante.jsx` | 1 283     | 7,4 %         |
| `ClaseDetalle.jsx`               | 911       | 5,2 %         |
| **Subtotal (4 de 54 archivos)**  | **8 683** | **49,8 %**    |

Cuatro archivos concentran la mitad del código.

#### Qué tan grave es

1. **Bloquea la división de código** (AUD-005): los 28 tipos entran al bundle
   inicial aunque una unidad use dos o tres.
2. **Riesgo de romper cosas**: tocar un tipo de actividad implica editar un
   archivo del que dependen los 28.
3. **Cuesta revisarlo**: un cambio chico produce un diff difícil de evaluar.
4. **Dificulta testear**: no hay infraestructura de tests en el proyecto, y un
   módulo así de grande encarece introducirlos.

Esto es deuda técnica, no un defecto: el código funciona. Importa porque
**condiciona la corrección de AUD-005** y encarece todo lo que venga después.

#### Cómo arreglarlo

Pasar a un registro de actividades con carga diferida:

```
src/components/actividades/
├── index.js                    // registro con imports dinámicos
├── Crucigrama.jsx
├── SopaDeLetras.jsx
├── Acrostico.jsx
└── … (28 módulos)
```

```js
// index.js
const REGISTRO = {
  crucigrama: () => import("./Crucigrama"),
  sopa_letras: () => import("./SopaDeLetras"),
  acrostico: () => import("./Acrostico"),
  // …
};

export function cargarActividad(tipo) {
  const cargador = REGISTRO[tipo];
  if (!cargador) throw new Error(`Tipo de actividad desconocido: ${tipo}`);
  return lazy(cargador);
}
```

**Hacerlo de a poco**, sacando primero los tipos más grandes y dejando el
componente actual como capa de compatibilidad. Reescribir 3 814 líneas de una vez
y sin tests es jugar con fuego.

**Esfuerzo:** Alto (1–2 semanas en modo incremental).

---

<a id="aud-017"></a>

### AUD-017 — [BAJA] `generar_token_10` es invocable sin autenticarse

**Área:** Seguridad
**Dónde:** [`supabase/schema.sql`](../supabase/schema.sql) — `public.generar_token_10()`
**CVSS 3.1:** 3.7 — `AV:N/AC:H/PR:N/UI:N/S:U/C:L/I:N/A:N`
**Evidencia:** [`evidencias/AUD-017_superficie_rpc_verificada.md`](evidencias/AUD-017_superficie_rpc_verificada.md)

#### Contexto: la superficie de RPC resultó más chica de lo que parecía

El esquema define 57 funciones, de las cuales el cliente invoca 17 y quedan 40
sin invocar. Esas 40 eran la parte menos explorada del sistema, y la lectura del
código no podía decir cuáles eran realmente alcanzables.

Se sondearon las 40 vía PostgREST, primero como `anon` y después con sesión de
estudiante:

```
Alcanzables como anon:        4 / 40
Alcanzables como estudiante:  4 / 40
```

**36 de 40 están correctamente protegidas.** El resultado es mayormente
tranquilizador. De las cuatro alcanzables, tres son inocuas: `es_admin` y
`sesion_es_aal2` responden `false` —o sea, dicen la verdad sin filtrar nada— y
`normalizar_respuesta_texto` es utilitaria, sin acceso a datos.

Queda una.

#### Qué pasa con `generar_token_10`

```sql
CREATE OR REPLACE FUNCTION public.generar_token_10()
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'extensions'
AS $function$
DECLARE
  v_alfabeto CONSTANT TEXT := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  v_bytes BYTEA := extensions.gen_random_bytes(10);
  v_token TEXT := '';
BEGIN
  FOR i IN 0..9 LOOP
    v_token := v_token || substr(v_alfabeto, get_byte(v_bytes, i) % 32 + 1, 1);
  END LOOP;
  RETURN v_token;
END;
$function$
```

```bash
curl -s -X POST "$URL/rest/v1/rpc/generar_token_10" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" \
  -H "Content-Type: application/json" -d '{}'
# -> "A6GR4PCMGS"
```

#### Qué tan grave es

Conviene ser preciso para no agrandarlo.

**Lo que NO pasa.** La función no consulta la base: genera una cadena aleatoria y
la devuelve. No revela tokens existentes, no confirma si un código es válido y no
crea ninguna fila en `tokens`. Por sí sola no es una vía de acceso.

**Lo que sí pasa.** Queda expuesto públicamente el **generador exacto de los
códigos de activación**: alfabeto, longitud y fuente de entropía. Un atacante
obtiene gratis la confirmación del formato preciso que tiene que enumerar, lo que
afina el ataque de AUD-002. Además cada llamada consume `gen_random_bytes` del
servidor, así que sirve como vector de consumo de recursos.

El defecto de fondo es de principio: una función auxiliar de uso exclusivamente
administrativo no debería poder invocarla un anónimo. Y la causa raíz es la misma
de AUD-006 — las `ALTER DEFAULT PRIVILEGES` le dan `EXECUTE` a `anon` sobre toda
función nueva.

#### Cómo arreglarlo

```sql
REVOKE EXECUTE ON FUNCTION public.generar_token_10()  FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generar_token_128() FROM anon, authenticated;
```

Y corregir las concesiones por defecto de AUD-006, que es lo que va a hacer que
el problema reaparezca con cada función nueva.

**Esfuerzo:** Bajo.

> **Nota aparte: versiones viejas que siguen ahí.** El esquema conserva al menos
> 10 funciones en versiones previas al endurecimiento, reconocibles por los
> sufijos `_pre_*` y `_fase3_interna`, más duplicados semánticos (`is_admin`
> junto a `es_admin`, `superadmin_resolver_accion` junto a su `_v2`). El sondeo
> indica que están cerradas, así que no es una vulnerabilidad. Pero conviene
> eliminarlas: son superficie que hay que mantener, y una migración futura podría
> reabrirles permisos por error.

---

<a id="aud-011"></a>

### AUD-011 — [BAJA] Escribe en `localStorage` en cada `mousemove`

**Área:** Rendimiento
**Dónde:** [`src/hooks/useInactivityTimeout.js:25`](../src/hooks/useInactivityTimeout.js#L25)

#### Qué pasa

```js
const events = ["mousemove", "mousedown", "keydown", "scroll", "touchstart"];
events.forEach((ev) => window.addEventListener(ev, reset, { passive: true }));

function reset() {
  localStorage.setItem(STORAGE_KEY, Date.now().toString());
  setMostrarAviso(false);
  clearTimeout(timers.current.warning);
  // … reprograma tres timers
}
```

Cada `mousemove` —que se dispara decenas de veces por segundo— hace una escritura
síncrona en `localStorage`, una actualización de estado de React y la
reprogramación de tres timers.

`localStorage` es una API **síncrona que bloquea el hilo principal**. Moviendo el
mouse de forma continua se generan cientos de escrituras por segundo.

#### Qué tan grave es

Gasto innecesario de CPU y posibles microbloqueos del hilo principal, que se
notan sobre todo en dispositivos de gama baja — justamente el escenario esperable
en una escuela. El `setMostrarAviso(false)` además dispara evaluaciones de
render en cada evento.

Es bajo: no compromete la seguridad y la lógica de expiración funciona bien. Es
un problema de eficiencia con arreglo sencillo.

#### Cómo arreglarlo

```js
const INTERVALO_MIN_MS = 5000;
let ultimaEscritura = 0;

function reset() {
  const ahora = Date.now();
  if (ahora - ultimaEscritura < INTERVALO_MIN_MS) return;
  ultimaEscritura = ahora;

  localStorage.setItem(STORAGE_KEY, String(ahora));
  setMostrarAviso((prev) => (prev ? false : prev)); // evita renders inútiles
  // … reprogramar timers
}
```

Cinco segundos sobran para un timeout de 30 minutos y reducen las escrituras en
varios órdenes de magnitud.

**Esfuerzo:** Bajo (menos de 1 hora).

---

<a id="aud-012"></a>

### AUD-012 — [BAJA] 73 efectos y casi ninguna memorización

**Área:** Rendimiento
**Dónde:** `src/` (transversal)

#### Qué pasa

Recuento de **invocaciones**, no de menciones: se cuenta `useEffect(` y no
`useEffect`, porque esto último incluye las 31 líneas de `import` y sobreestima
la cifra.

| Hook          | Invocaciones | Comando                                   |
| ------------- | ------------ | ----------------------------------------- |
| `useEffect`   | 73           | `grep -roE 'useEffect\(' src/ \| wc -l`   |
| `useCallback` | 4            | `grep -roE 'useCallback\(' src/ \| wc -l` |
| `useMemo`     | 1            | `grep -roE 'useMemo\(' src/ \| wc -l`     |
| `React.memo`  | 0            | `grep -roE '\bmemo\(' src/ \| wc -l`      |

73 efectos contra 5 memorizaciones y **ninguna memorización de componente**. La
concentración importa más que el total: 13 de los 73 están en
`ActivityCard.jsx` y 9 en `LectorLibro.jsx`.

#### Qué tan grave es

Cada cambio de estado en un componente padre vuelve a renderizar todo el árbol de
hijos. En `ActivityCard.jsx` (3 814 líneas, 54 componentes internos) y en las
vistas de progreso con tablas largas, eso es trabajo de render evitable.

Se deja en severidad baja a propósito: **memorizar de más es un antipatrón
conocido**, y React 19 trae optimizaciones que reducen la necesidad. No se
recomienda salir a poner `memo` en todos lados.

Lo que sí vale la pena señalar es la falta de instrumentación: no hay evidencia
de que se haya perfilado el render, así que no se sabe si el desbalance tiene
costo real.

#### Cómo arreglarlo

1. **Medir antes de optimizar**: perfilar con React DevTools Profiler las vistas
   más pesadas (`ActivityCard`, `DocenteRespuestaEstudiante`, `ClaseDetalle`).
2. Aplicar `React.memo` **sólo** donde el profiling lo señale.
3. **Evaluar el React Compiler** de React 19, que automatiza la memorización. El
   `README.md` dice que se excluyó del template por su impacto en los tiempos de
   build; conviene reconsiderarlo para producción.
4. Revisar los 73 efectos buscando dependencias faltantes o suscripciones sin
   limpiar, que son causa frecuente de fugas de memoria. Empezar por los 22 que
   se concentran en `ActivityCard.jsx` y `LectorLibro.jsx`.

**Esfuerzo:** Medio (hay que medir).

---

<a id="aud-013"></a>

### AUD-013 — [BAJA] Las fases 12 y 13 no tienen commit propio

**Área:** Proceso
**Dónde:** Historial de Git

#### Qué pasa

El historial completo son 7 commits:

```
070ac28 2026-08-22 responsive
52bdb6a 2026-08-19 Completa fase 11 y responsive del panel admin
5a30acf 2026-07-29 Corrige recarga de rutas en Vercel
9a46ba3 2026-07-29 Completa endurecimiento de seguridad fases 1 a 8
9c14c7d 2026-07-24 Modifica experiencia para docente, y desarrolla responsive…
5b7d8c4 2026-07-23 Agrega nuevos tipos de actividad…
97a5c30 2026-07-02 Versión Supabase - historial limpio
```

Las fases 1–8 y 11 tienen commit propio con mensaje descriptivo. En cambio
`security_phase12_tokens_10_chars.sql`,
`security_phase13_prevalidacion_anonima.sql`, la Edge Function `prevalidar-token`
y el `schema.sql` actualizado entraron todos juntos en `070ac28`, cuyo mensaje es
`"responsive"`.

Son los cambios de seguridad de mayor impacto de todo el conjunto: bajar la
entropía de los tokens a 50 bits y abrir el primer endpoint anónimo.

#### Qué tan grave es

Desde la auditoría, es **imposible verificar** qué se desplegó, cuándo y con qué
revisión previa. La documentación del equipo declara ambas fases como "preparadas
para despliegue", pero el historial no permite confirmar el estado real de
producción.

En la práctica:

- No se puede reconstruir la cronología ante un incidente.
- No hay revisión por pares identificable sobre los cambios de mayor riesgo.
- Revertir selectivamente es inviable: el commit mezcla ajustes de interfaz con
  cambios estructurales de seguridad.

No es un defecto del sistema sino del proceso que lo produce. Y **AUD-015 muestra
que no es teórico**: hay una divergencia concreta y verificable entre el esquema
versionado y lo que el sistema necesita para funcionar.

#### Cómo arreglarlo

1. **Un commit por cambio lógico**, con mensaje descriptivo. Los cambios de
   seguridad no van mezclados con ajustes de presentación.
2. **Etiquetar los despliegues** (`git tag`) con la versión que va a producción,
   para que sea verificable qué está corriendo.
3. **Registrar las migraciones aplicadas**: una tabla en la base con nombre de
   archivo, hash y fecha de aplicación.
4. **Exigir revisión por pares** para todo cambio que toque RLS, funciones
   `SECURITY DEFINER` o la superficie anónima.
5. **Documentar el estado real** de las fases 12 y 13 en producción. Es el punto
   de partida para cualquier verificación futura.

**Esfuerzo:** Bajo (es cambio de proceso, no de código).

---

<a id="aud-014"></a>

### AUD-014 — [BAJA] 46 `console.*` activos en producción

**Área:** Operación
**Dónde:** `src/` (46 ocurrencias)

#### Qué pasa

Hay 46 llamadas a `console.log`, `console.warn` y `console.error` en el cliente,
sin supresión en el build de producción. Varias exponen detalles de
infraestructura:

```js
console.warn(
  "[Libelula] No se pudo cargar el libro:",
  error.code,
  error.message,
);
console.warn(
  "[Libelula] No se pudo firmar PDF desde Storage:",
  originalPath,
  storageError.message,
);
```

#### Qué tan grave es

1. **Filtra información menor**: códigos de error de PostgreSQL y rutas internas
   de Storage quedan visibles en la consola del navegador. Sirve para
   reconocimiento, aunque solo no valga mucho.
2. **Suma peso** al bundle.
3. **Hace ruido** y dificulta distinguir un error real durante un incidente.

Hay un buen criterio ya aplicado en
[`libros.service.js:17`](../src/services/libros.service.js#L17): el log se omite
a propósito cuando el error es de acceso denegado, para no ensuciar con un caso
esperado. El criterio existe; falta aplicarlo de forma sistemática.

#### Cómo arreglarlo

Suprimir en producción conservando los errores:

```js
// vite.config.js
export default defineConfig({
  plugins: [react(), tailwindcss()],
  esbuild: {
    drop: ["debugger"],
    pure: ["console.log", "console.debug"],
  },
});
```

Para diagnóstico en producción conviene mandar los errores a un servicio de
telemetría (Sentry o similar) en vez de la consola. Eso además da visibilidad
operativa, que hoy no existe.

**Esfuerzo:** Bajo (menos de 1 hora).

---

## 5. Lo que funciona bien

Un informe que sólo lista defectos no describe el sistema con fidelidad. Esto se
verificó de forma independiente, y buena parte con el sistema corriendo.

### Verificado leyendo el código y el esquema

| Aspecto                             | Verificación                                                                                                                         |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Cobertura de RLS**                | Las 24 tablas de `public` tienen RLS activo, sin excepciones                                                                         |
| **Sin puntos de inyección**         | Cero `dangerouslySetInnerHTML`, `eval`, `new Function` o `innerHTML` en 17 450 líneas                                                |
| **Manejo de secretos**              | Ninguna credencial real en el historial de Git; `.env.example` sólo tiene marcadores                                                 |
| **`.gitignore`**                    | Cobertura amplia y pensada: claves, certificados, volcados, informes con datos personales                                            |
| **CSP**                             | Restrictiva y bien armada: `script-src 'self'` sin `unsafe-inline`, `object-src 'none'`, `frame-ancestors 'none'`, `base-uri 'self'` |
| **Cabeceras de seguridad**          | HSTS con `preload`, COOP, `X-Content-Type-Options`, `X-Frame-Options: DENY`, Permissions-Policy restrictiva                          |
| **Funciones `SECURITY DEFINER`**    | `search_path` fijado explícitamente a `'pg_catalog', 'public'`                                                                       |
| **`es_admin()` declarada `STABLE`** | Permite al planificador cachear el resultado dentro de la consulta                                                                   |
| **Expiración de sesión**            | Con aviso previo, sincronización entre pestañas y cierre a los 30 minutos                                                            |
| **Separación de roles**             | Cuatro roles diferenciados, con MFA `aal2` exigido para acciones sensibles                                                           |
| **Paginación en el admin**          | `.range()` correctamente aplicado en 5 consultas del panel                                                                           |
| **Manejo de errores**               | Los servicios propagan errores en vez de tragárselos (sólo 2 `catch` vacíos en todo el código)                                       |
| **`REVOKE` sistemático**            | 57 `REVOKE ON FUNCTION` explícitos: el equipo cerró permisos revocando primero y concediendo después. Es buena práctica y poco común |

### Verificado con el sistema corriendo

| Aspecto                             | Verificación                                                                       |
| ----------------------------------- | ---------------------------------------------------------------------------------- |
| Aislamiento de `respuestas`         | Un alumno no lee respuestas de otro (`RLS-A02`, `A03`)                             |
| Aislamiento de `actividad_progreso` | Confirmado (`RLS-A04`)                                                             |
| Aislamiento entre docentes          | El docente B no accede a datos de clase del A (`RLS-B02`, `B03`)                   |
| Integridad entre escuelas           | El docente B no modifica clases ajenas (`RLS-B04`)                                 |
| Superficie anónima                  | `anon` no lee ni escribe pese al `GRANT ALL` (`RLS-C01`–`C07`)                     |
| Escalada de privilegios             | El trigger `proteger_cambio_rol_aprobado` bloquea el ascenso a `admin` (`RLS-D01`) |
| Inscripción no autorizada           | Un alumno no se inscribe en clase ajena (`RLS-D02`)                                |
| Manipulación de notas               | Un alumno no puede falsear `es_correcta` (`RLS-D03`)                               |
| Creación de tokens                  | Un alumno no puede crear tokens (`RLS-D04`)                                        |
| Superficie de RPC                   | 36 de 40 funciones no invocadas están correctamente protegidas                     |

#### Cómo leer el resultado de la matriz

De 24 pruebas de aislamiento, 18 dieron el resultado esperado. Ese recuento
crudo engaña en dos direcciones, así que conviene desglosarlo:

|                           | Pruebas | Detalle                               |
| ------------------------- | ------- | ------------------------------------- |
| Resultado esperado        | 18      | —                                     |
| **Fallos reales**         | **5**   | `RLS-A05`, `A06`, `A07`, `B05`, `B06` |
| Expectativa mal calibrada | 1       | `RLS-D01`                             |

**Los cinco fallos reales son un solo defecto.** Las cinco pruebas atacan
`profiles` desde ángulos distintos —perfil puntual de otra escuela, enumeración
completa, columna `email`, desde estudiante y desde docente— y las cinco caen por
la misma política, `profiles_authenticated_read`. Es **una** causa raíz
(AUD-016), no cinco problemas independientes.

**El sexto no es un fallo del sistema sino de la prueba.** `RLS-D01` esperaba que
el intento de auto-ascenso a `admin` devolviera vacío (filtrado silencioso por
RLS) y en cambio devolvió error `42501 cambio_rol_requiere_aprobacion_aal2`: el
sistema **se defendió mejor de lo previsto**, rechazando de forma explícita en
lugar de descartar la fila en silencio. La expectativa estaba mal escrita; el
control funciona, y el error explícito es preferible al filtrado mudo.

Contado como corresponde: **una causa raíz de seguridad abierta, ningún control
de aislamiento académico vencido.** El aislamiento del contenido es sólido y el
defecto está circunscrito a `profiles` (AUD-016).

---

## 6. Plan de acción

Ordenado por relación entre impacto y esfuerzo.

### Prioridad 1 — Ahora (1–2 semanas)

| ID                | Acción                                                                        | Esfuerzo         |
| ----------------- | ----------------------------------------------------------------------------- | ---------------- |
| AUD-016           | Eliminar `profiles_authenticated_read` y reemplazarla por políticas acotadas  | Bajo–Medio       |
| AUD-002 + AUD-004 | Arreglar juntos el control de tasa y el CORS de la Edge Function              | Medio            |
| AUD-003           | **Rediseñar `respuestas_docente_scoped_read`** para eliminar el JOIN por fila | Medio            |
| AUD-006 + AUD-017 | Revocar permisos de `anon` en bloque y corregir las concesiones por defecto   | Bajo + regresión |
| AUD-009           | `npm audit fix` y activar vigilancia automática de dependencias               | Bajo             |

> **AUD-003 cambió de forma respecto de la primera versión de este plan.**
> Figuraba acá como «envolver `auth.uid()` en las 33 políticas, esfuerzo bajo».
> La medición lo desmintió: envolver da 972,8 ms contra 965,8 ms —sin efecto—
> porque las llamadas ya se promovían a `InitPlan`. Lo que cuesta es el JOIN de
> la política reevaluado 1 500 veces. El rediseño es más caro que el cambio
> mecánico que se prometía, pero es el único que rinde. Envolver las llamadas
> sigue valiendo como higiene sobre las otras 32 políticas: se movió a
> Prioridad 3.

**Verificación adicional, sin código de por medio:** confirmar si la
infraestructura de producción sobrescribe `x-real-ip` y `cf-connecting-ip` en el
borde. De eso depende que AUD-002 sea Alto o Crítico.

### Prioridad 2 — Corto plazo (1 mes)

| ID      | Acción                                                           | Esfuerzo   |
| ------- | ---------------------------------------------------------------- | ---------- |
| AUD-001 | Paginar y agregar en el servidor el progreso de clase            | Medio      |
| AUD-015 | Agregar el trigger al esquema y verificar reproducibilidad en CI | Bajo–Medio |
| AUD-005 | Dividir el código por rutas y diferir el worker de PDF           | Bajo       |
| AUD-008 | Bajar la vigencia de la URL firmada y registrar emisiones        | Bajo       |
| AUD-013 | Disciplina de commits y etiquetado de despliegues                | Bajo       |

### Prioridad 3 — Medio plazo (trimestre)

| ID                | Acción                                                             | Esfuerzo |
| ----------------- | ------------------------------------------------------------------ | -------- |
| AUD-007           | Índices sobre claves foráneas, midiendo antes                      | Bajo     |
| AUD-003 (higiene) | Envolver `auth.uid()` y `es_admin()` en las 32 políticas restantes | Bajo     |
| AUD-010           | Dividir `ActivityCard` de a poco                                   | Alto     |
| AUD-011, AUD-014  | Regular los eventos y suprimir la consola en producción            | Bajo     |
| AUD-012           | Perfilar el render y memorizar sólo donde haga falta               | Medio    |

---

## 7. Cómo se hizo y cómo reproducirlo

### 7.1 Entorno

| Componente        | Versión                             |
| ----------------- | ----------------------------------- |
| Sistema operativo | Linux 6.8.0-49-generic              |
| Node.js / npm     | Según el entorno de ejecución       |
| Vite (build)      | 8.1.5                               |
| Supabase local    | CLI sobre Docker, PostgreSQL 17     |
| Git               | Historial local completo, 7 commits |

Herramientas: `git`, `grep`, `awk`, `sed`, `find`, `wc`, `comm`, `npm audit`,
`npx vite build`, `psql`, y scripts propios en Node.

**No se usaron escáneres dinámicos** (ZAP, Burp, sqlmap, nmap): no había entorno
autorizado para pruebas activas, y las pruebas se hicieron exclusivamente contra
una instancia local.

### 7.2 Cómo se clasificó la severidad

- **CVSS 3.1** para los hallazgos de seguridad. Los de rendimiento, escalabilidad
  y arquitectura no llevan CVSS porque no es el marco adecuado: su severidad se
  argumenta en términos de impacto operativo.
- **OWASP Top 10 (2021)** como referencia de categorización.
- **OWASP ASVS v4.0** para control de acceso y gestión de sesiones.
- **Documentación de rendimiento de RLS de Supabase** y **documentación de
  PostgreSQL** sobre volatilidad de funciones, RLS e indexación de claves
  foráneas.

| Severidad   | Criterio                                                                                    |
| ----------- | ------------------------------------------------------------------------------------------- |
| **Crítica** | Falla en condiciones de uso normal, con corrupción silenciosa de datos o compromiso directo |
| **Alta**    | Explotable sin privilegios, o degradación severa dentro del horizonte de uso del producto   |
| **Media**   | Requiere condiciones previas o privilegios, o su impacto es acotado                         |
| **Baja**    | Deuda técnica, ineficiencia sin impacto en seguridad, o cuestión de proceso                 |

Un principio: **la severidad se argumenta, no se asigna**. Cada hallazgo explica
por qué recibe la suya, incluidos los casos en que queda por debajo de lo que
sugiere su CVSS (AUD-009) o por encima de su explotabilidad inmediata (AUD-001).

### 7.3 Revisión del código y el esquema

```bash
# Estructura y volumen
find src -type f \( -name '*.jsx' -o -name '*.js' \) | xargs wc -l | sort -rn

# Puntos de inyección y secretos
grep -rn "dangerouslySetInnerHTML" src/
grep -rn -E "\beval\(|innerHTML|new Function\(" src/
git log -p --all | grep -n -i -E 'eyJhbGciOi|service_role|SUPABASE_SERVICE'

# Cobertura de RLS: la diferencia debe ser vacía
grep -oP 'CREATE TABLE (IF NOT EXISTS )?"?public"?\."?\K[a-z_]+' \
  supabase/schema.sql | sort -u > all_tables.txt
grep -oP 'ALTER TABLE (ONLY )?"?public"?\."?\K[a-z_]+(?="? ENABLE ROW LEVEL SECURITY)' \
  supabase/schema.sql | sort -u > rls_on.txt
comm -23 all_tables.txt rls_on.txt

# Complejidad de las políticas
awk '/CREATE POLICY/,/;/' supabase/schema.sql | grep -c "EXISTS"
awk '/CREATE POLICY/,/;/' supabase/schema.sql | grep -o 'auth"\."uid"()' | wc -l

# Patrones de consulta del cliente
grep -rn "\.select(" src/services/*.js | grep -v "limit\|range\|single\|maybeSingle" | wc -l
grep -rn "\.in(" src/services/*.js | wc -l

# Build de producción y estrategia de fragmentación
npm ci && npx vite build
grep -rn "React.lazy\|lazy(\|Suspense" src/     # sin coincidencias

# Dependencias e historial
npm audit
git log --format='%h %ad %s' --date=short
```

### 7.4 Pruebas sobre instancia local

Las pruebas se ejecutaron a lo largo de tres fines de semana. El orden no es
arbitrario: cada etapa necesita lo que dejó armado la anterior.

| Fin de semana | Qué se hizo                                                                                       | Hallazgos                 |
| ------------- | ------------------------------------------------------------------------------------------------- | ------------------------- |
| **29–30 ago** | Montaje del entorno, esquema sobre base limpia, 7 usuarios, lectura de privilegios en el catálogo | AUD-015, AUD-006, AUD-007 |
| **5–6 sep**   | Generación de datos (2 escuelas aisladas), matriz de acceso cruzado, sondeo de las 40 RPC         | AUD-016, AUD-017          |
| **12–13 sep** | Carga de volumen (1 500 filas), `EXPLAIN (ANALYZE)`, truncamiento y evasión del control de tasa   | AUD-003, AUD-001, AUD-002 |

El primer fin de semana no requiere datos cargados: AUD-015 aparece al aplicar
el esquema y contar perfiles, y los privilegios de `anon` se leen del catálogo.
El segundo necesita los usuarios y escuelas del primero. El tercero necesita
volumen, y la prueba de rate limit exige además el secreto HMAC y reiniciar el
stack, por lo que quedó al final.

**Requisitos:** Docker, Node.js ≥ 20 y la CLI de Supabase.

```bash
npx supabase init
npx supabase start     # imprime API URL, anon key y service_role key

export SUPABASE_URL=http://127.0.0.1:54321
export SUPABASE_ANON_KEY=<anon key de la salida>
export SUPABASE_SERVICE_ROLE_KEY=<service_role key de la salida>
```

Esas claves son **locales y descartables**: las genera la CLI, son idénticas en
toda instalación y no tienen relación con las de producción.

```bash
# Aplicar el esquema auditado sobre una base limpia
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/schema.sql

# Ejecutar las pruebas
node scripts/01_crear_usuarios.mjs       # 7 usuarios, uno por rol
node scripts/02_generar_datos.mjs        # 2 escuelas aisladas, clases, contenido
node scripts/03_matriz_rls.mjs           # matriz de acceso cruzado
node scripts/04_superficie_rpc.mjs       # sondeo de las 40 RPC
node scripts/05_truncamiento_aud001.mjs  # truncamiento silencioso
node scripts/06_rate_limit_aud002.mjs    # evasión del control de tasa

psql "$DB_URL" -v docente_id="'<uuid>'" -v clase_id="'<uuid>'" \
     -f scripts/07_explain_rls.sql
```

Para las pruebas de volumen:

```bash
N_ESTUDIANTES=25 N_ACTIVIDADES=60 node scripts/02_generar_datos.mjs
```

Para la prueba de rate limit, el secreto HMAC debe estar presente **antes** de
levantar el stack:

```bash
echo 'PREVALIDACION_TOKEN_HASH_SECRET=<valor>' > supabase/functions/.env
npx supabase stop && npx supabase start
docker exec supabase_edge_runtime_Libelula env | grep PREVALIDACION   # debe existir
```

### 7.5 Criterios que se aplicaron

Cada hallazgo pasó tres filtros antes de entrar al informe:

1. **Reproducible**: hay un comando que un tercero puede correr para ver lo
   mismo.
2. **Localizado**: está anclado en archivo y línea concretos, o en un recuento
   verificable sobre el esquema.
3. **Impacto argumentado**: se describe un escenario de falla concreto, no una
   preocupación genérica.

Lo que no pasó esos filtros quedó afuera.

Dos criterios más, que conviene dejar por escrito:

**Las pruebas podían refutar hallazgos, y eso se habría registrado igual.** Cada
script declaraba el resultado esperado **antes** de correr. Una divergencia era un
hallazgo en cualquiera de las dos direcciones: tanto un control que falla como uno
que resulta más sólido de lo que parecía. Eso último efectivamente pasó — la
superficie de RPC resultó mucho más chica de lo que sugería el recuento de
funciones, y el informe lo dice (AUD-017).

**Un resultado negativo no es automáticamente una refutación.** Una primera
corrida de la prueba de rate limit dio "no demostrada" en los tres escenarios,
incluido el de control. No era un resultado sobre el sistema: faltaba el secreto
HMAC y la función abortaba con HTTP 500 antes de llegar al contador. Presentar
aquello como refutación de AUD-002 habría sido un error, y fue justamente el
grupo de control lo que permitió detectarlo.

### 7.6 Reproducción completa

```bash
git clone <repositorio> && cd Libelula
git checkout 070ac28b94542685fa55689ef88c71b733b92272
npm ci
# Seguir 7.3 y 7.4.
```

Cualquier diferencia respecto de lo documentado en
[`evidencias/`](evidencias/) indica que el árbol auditado no corresponde al
commit declarado.

---

## 8. Referencia del sistema

Mapa del sistema en el commit `070ac28`, para ubicar los hallazgos.

### 8.1 Arquitectura

```
┌─────────────────────────────────────────────────────────┐
│  NAVEGADOR                                              │
│  SPA React 19 · 1,38 MB · un solo archivo               │
│  Clave anónima de Supabase incrustada en el cliente     │
└────────────┬────────────────────────────────────────────┘
             │ HTTPS
     ┌───────┴────────┬──────────────────────┐
     ▼                ▼                      ▼
┌──────────┐   ┌─────────────┐    ┌────────────────────┐
│  Vercel  │   │  Supabase   │    │   Edge Function    │
│  (CDN)   │   │  PostgREST  │    │  prevalidar-token  │
│          │   │  Auth       │    │  SIN JWT ◄── ÚNICO │
│  CSP+    │   │  Storage    │    │  PUNTO ANÓNIMO     │
│  HSTS    │   │             │    │  service_role      │
└──────────┘   └──────┬──────┘    └─────────┬──────────┘
                      │                     │
                      ▼                     ▼
              ┌──────────────────────────────────┐
              │  PostgreSQL                      │
              │  24 tablas · RLS 24/24           │
              │  57 funciones · 41 SEC. DEFINER  │
              │  46 políticas · 25 índices       │
              └──────────────────────────────────┘
```

### 8.2 Puntos de entrada

| #   | Entrada                              | Autenticación              | Observación              |
| --- | ------------------------------------ | -------------------------- | ------------------------ |
| 1   | SPA servida por Vercel               | No (estática)              | Protegida por CSP y HSTS |
| 2   | PostgREST (Data API)                 | JWT de Supabase            | Control por RLS          |
| 3   | Supabase Auth                        | Pública (registro, sesión) | Fuera del alcance        |
| 4   | Supabase Storage                     | JWT + URL firmada          | Ver AUD-008              |
| 5   | **Edge Function `prevalidar-token`** | **Ninguna**                | **Ver AUD-002, AUD-004** |

### 8.3 Roles

| Rol          | Origen                       | Alcance                                             |
| ------------ | ---------------------------- | --------------------------------------------------- |
| `anon`       | Sin sesión                   | Registro, activación de token, prevalidación        |
| `estudiante` | Por defecto al registrarse   | Libros licenciados, progreso propio, unirse a clase |
| `docente`    | Lo asigna un administrador   | Sus clases, progreso de sus alumnos                 |
| `admin`      | RPC administrativa           | Escuelas, libros, tokens, usuarios                  |
| `superadmin` | Tabla `superadministradores` | Aprobación de acciones sensibles, exige MFA `aal2`  |

### 8.4 Base de datos

**24 tablas, todas con RLS activo:**

| Dominio                  | Tablas                                                                              |
| ------------------------ | ----------------------------------------------------------------------------------- |
| Identidad y organización | `profiles`, `escuelas`, `grados`, `superadministradores`                            |
| Contenido                | `libros`, `unidades`, `actividades`, `archivos_libro`                               |
| Licenciamiento           | `tokens`, `libro_activaciones`, `escuela_libros`                                    |
| Aula                     | `clases`, `clase_libros`, `inscripciones`                                           |
| Progreso académico       | `progreso`, `actividad_progreso`, `respuestas`, `limites_progreso`                  |
| Control de tasa          | `intentos_token`, `intentos_token_anonimos`, `intentos_clase`, `intentos_actividad` |
| Gobernanza               | `admin_logs`, `acciones_admin_pendientes`                                           |

**Con datos personales de menores**: `profiles`, `progreso`,
`actividad_progreso`, `respuestas`, `inscripciones`. Son el activo más sensible
del sistema.

**Políticas y funciones:**

| Métrica                    | Valor                                                                                           |
| -------------------------- | ----------------------------------------------------------------------------------------------- |
| Políticas RLS              | 46 (33 usan `auth.uid()`, ninguna envuelta; el costo medido está en el JOIN por fila — AUD-003) |
| Subconsultas en políticas  | 44                                                                                              |
| Cláusulas `EXISTS`         | 17                                                                                              |
| Funciones en `public`      | 57 (41 `SECURITY DEFINER`)                                                                      |
| Invocadas desde el cliente | 17                                                                                              |
| No invocadas               | 40 (36 correctamente protegidas — AUD-017)                                                      |
| Índices                    | 25 definidos; 17 claves foráneas sin cubrir (AUD-007)                                           |

### 8.5 Rutas del cliente

22 rutas en [`src/App.jsx`](../src/App.jsx), todas envueltas en componentes de
protección (15 usos de `RutaProtegida` y variantes): `/login`, `/activar`,
`/seguridad/mfa`, `/inicio`, las rutas de libro/unidad/actividad,
`/unirse-clase`, las cinco de `/panel-docente`, y las nueve de `/admin`.

**Importante:** la protección de rutas en el cliente es una comodidad de
interfaz, **no un control de seguridad**. El control real está en RLS y en los
permisos de ejecución de las funciones. Por eso las pruebas se dirigieron contra
la API, no contra la navegación.

### 8.6 Storage

Un bucket privado, `libros`, con autorización por objeto según acceso al libro.

| Origen                                                                                 | Vigencia | Referencia        |
| -------------------------------------------------------------------------------------- | -------- | ----------------- |
| [`libros.service.js:32`](../src/services/libros.service.js#L32) — PDF                  | 3 600 s  | AUD-008           |
| [`libros.service.js:72`](../src/services/libros.service.js#L72) — portada              | 3 600 s  | AUD-008           |
| [`StoragePicker.jsx:31`](../src/components/StoragePicker.jsx#L31) — vista previa admin | 300 s    | Criterio correcto |

### 8.7 Datos en el navegador

| Clave                                                  | Contenido               | Sensibilidad              |
| ------------------------------------------------------ | ----------------------- | ------------------------- |
| `iabooks_spread_<libroId>`                             | Página del lector       | Nula                      |
| `iabooks_last_activity`                                | Marca de actividad      | Nula                      |
| `libelula_libros_ocultos_<userId>`                     | Preferencia de interfaz | Baja (revela UUID)        |
| `colorear_<actividadId>`                               | Imagen en data URL      | Baja (puede crecer mucho) |
| `admin_sidebar_collapsed`, `docente_sidebar_collapsed` | Preferencia             | Nula                      |
| Sesión de Supabase                                     | JWT                     | **Alta**                  |

El JWT en `localStorage` es el comportamiento por defecto de
`@supabase/supabase-js` y es aceptable acá: no hay vectores de XSS y la CSP es
restrictiva. El timeout de 30 minutos reduce el riesgo de sesión abandonada.

`colorear_<actividadId>` guarda imágenes como data URL sin límite de tamaño ni
purga; con muchas actividades puede agotar la cuota de `localStorage`
(típicamente 5–10 MB) y provocar excepciones no controladas.

### 8.8 Secretos

| Variable                          | Ubicación         | Estado                                |
| --------------------------------- | ----------------- | ------------------------------------- |
| `VITE_SUPABASE_URL`               | Cliente           | Pública por diseño                    |
| `VITE_SUPABASE_ANON_KEY`          | Cliente           | Pública por diseño, contenida por RLS |
| `SUPABASE_SERVICE_ROLE_KEY`       | Sólo script local | Correctamente aislada                 |
| `PREVALIDACION_TOKEN_HASH_SECRET` | Edge Function     | Correctamente aislada                 |

Revisado el historial completo de Git: **ninguna credencial real expuesta.**

---

## 9. Qué queda pendiente

### 9.1 Lo que este informe no puede afirmar

- **Que el esquema auditado sea el que corre en producción.** Las pruebas se
  hicieron sobre el `schema.sql` versionado aplicado a una base limpia, y
  AUD-015 muestra al menos una divergencia concreta.
- **Que las cabeceras HTTP se apliquen efectivamente.** El `vercel.json` está
  bien escrito, pero no se comprobó sobre la URL real.
- **Si el límite por red de AUD-002 se sostiene en producción.** Depende de que
  la infraestructura sobrescriba las cabeceras de IP en el borde.

Lo que antes eran proyecciones analíticas —el truncamiento de AUD-001, el costo
de RLS de AUD-003, la evasión de AUD-002— **ya no lo son**: están medidos.

### 9.2 Verificaciones recomendadas

Por orden de importancia:

1. **Confirmar el manejo de cabeceras de IP en el borde** (AUD-002). Es lo que
   define si ese hallazgo es Alto o Crítico.
2. **Consultar los triggers de producción** (AUD-015), para saber cuál de las dos
   interpretaciones es la correcta.
3. **Repetir la matriz de acceso cruzado contra producción**, sobre todo las
   pruebas de `profiles` (AUD-016).
4. **Medir con volumen de producción** las consultas del panel docente, para
   validar las proyecciones de AUD-003 con datos reales.
5. **Verificar las cabeceras HTTP** sobre la URL desplegada.
6. **Revisar las dependencias transitivas** más allá de `npm audit`.

### 9.3 Riesgos que van a quedar

- **Los tokens de 50 bits.** Es una decisión deliberada del equipo para que se
  puedan imprimir. Incluso arreglado el control de tasa, quedan por debajo del
  estándar criptográfico habitual. Corresponde documentarlo como riesgo aceptado
  con su justificación de negocio, no dejarlo implícito.
- **No hay tests automatizados.** No se encontró infraestructura de pruebas. Toda
  corrección de las que propone este informe conlleva riesgo de regresión que hoy
  nadie detectaría.
- **No hay telemetría de errores.** Cero visibilidad operativa sobre lo que falla
  en producción.

---

_Informe elaborado sobre el commit `070ac28`. Las conclusiones se limitan a ese
estado del código y a las condiciones de alcance de la sección 2._
