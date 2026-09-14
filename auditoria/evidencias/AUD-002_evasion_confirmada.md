# AUD-002 — Confirmación empírica de la evasión del control de tasa

**Hallazgo original:** AUD-002 (Alta) — fase 1, análisis estático
**Estado tras la fase 2:** **CONFIRMADO por prueba controlada**
**Componente:** `supabase/functions/prevalidar-token/index.ts:59`
**CVSS 3.1:** 7.5 — `AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N`
**Fecha de la prueba:** 2026-09-13 (tercer fin de semana: prueba con grupo de control)

---

## Qué se sometió a prueba

La fase 1 sostenía, por lectura del código, que el límite de 10 intentos por
hora y dispositivo es evadible porque `deviceHash` se deriva de `x-device-id` y
`user-agent`, ambos encabezados bajo control del cliente.

La fase 2 lo somete a un **contraste con grupo de control**, contra la función
servida en `127.0.0.1`, con el secreto HMAC presente y el contador a cero:

| Escenario | Identificador | Predicción si AUD-002 es cierto |
|---|---|---|
| **A (control)** | `x-device-id` fijo | Debe bloquearse hacia el intento 11 |
| **B** | `x-device-id` rotativo | **No debe bloquearse nunca** |
| **C** | `user-agent` rotativo | No debe bloquearse |

El criterio de conclusión se fijó **antes** de ejecutar la prueba, y consta así
registrado en la versión previa de este documento.

## Resultado

```
--- A. device-id FIJO (control) ---
  intentos:         25
  bloqueados:       15
  primer bloqueo:   11

--- B. device-id ROTATIVO (evasión propuesta) ---
  intentos:         25
  bloqueados:       0
  primer bloqueo:   NINGUNO

--- C. user-agent ROTATIVO ---
  intentos:         25
  bloqueados:       0
  primer bloqueo:   NINGUNO

EVASIÓN DEL LÍMITE POR DISPOSITIVO: CONFIRMADA
```

El contraste es inequívoco. **Mismo endpoint, misma ventana temporal, misma
dirección IP de origen.** La única variable que cambia entre A y B es el valor
de un encabezado HTTP que el cliente elige libremente:

- Con identificador fijo, el bloqueo aparece en el intento **11**, coincidiendo
  exactamente con el límite de 10 que declara `prevalidar_token_anonimo`.
- Rotando el identificador, **25 intentos consecutivos sin un solo bloqueo**.

El escenario C confirma que `user-agent` constituye un segundo eje de evasión
sobre el mismo hash, tal como la fase 1 anticipó.

## Evidencia forense en la tabla de contadores

El estado de `intentos_token_anonimos` tras los tres escenarios es la prueba más
directa del mecanismo:

```sql
SELECT count(*) AS total,
       count(DISTINCT red_hash)         AS hashes_red,
       count(DISTINCT dispositivo_hash) AS hashes_dispositivo
FROM public.intentos_token_anonimos;
```

```
total | hashes_red | hashes_dispositivo
------+------------+-------------------
   60 |          1 |                 51
```

**60 intentos registrados, procedentes de una única red, repartidos en 51
identificadores de dispositivo distintos.** La distribución por hash lo muestra
con claridad:

```
4293aec5bc7a... | 10   <- escenario A: identificador fijo, detenido en el límite
052141ec3629... |  1   <- escenario B/C: un identificador nuevo por petición
29ff2265c7e6... |  1
bde08582472f... |  1
4e488b7a62e2... |  1
…                      (50 hashes más, con 1 intento cada uno)
```

Un solo hash acumula 10 intentos —exactamente el límite, tras el cual el
escenario A quedó bloqueado— mientras que los 50 restantes registran uno cada
uno. **El contador nunca llega a acumular porque cada petición estrena
identificador.**

Obsérvese que las 60 filas comparten `red_hash`: todas provienen de la misma
dirección IP. El límite de red (100/hora) no se alcanzó con 60 intentos, pero
habría sido el único freno restante.

## Por qué ocurre

```ts
const device    = request.headers.get('x-device-id')?.slice(0, 128) || 'sin-dispositivo'
const userAgent = request.headers.get('user-agent')?.slice(0, 256) || 'sin-agente'
const [networkHash, deviceHash] = await Promise.all([
  hmac(`red\n${ip}`, hashSecret),
  hmac(`dispositivo\n${device}\n${userAgent}`, hashSecret),
])
```

`deviceHash` es función pura de dos valores que el cliente controla. Un
`x-device-id` nuevo produce un `deviceHash` nuevo, y la consulta del contador
—`WHERE dispositivo_hash = p_dispositivo_hash`— no encuentra antecedentes. El
contador arranca de cero en cada petición.

El HMAC no corrige esto: protege la **confidencialidad** del identificador
almacenado, no su **autenticidad**. No existe ningún secreto del lado del
cliente que impida fabricar identificadores arbitrarios.

## Lo que la prueba también establece

Verificado sobre el cuerpo de `prevalidar_token_anonimo` en la base de datos, no
sobre documentación del equipo:

```sql
IF v_intentos_red >= 100 OR v_intentos_dispositivo >= 10 THEN
  RETURN jsonb_build_object('valido', false, 'motivo', 'demasiados_intentos');
END IF;
```

Los límites son **100 por red y 10 por dispositivo**, en ventana de una hora,
tal como la fase 1 atribuía al equipo.

Se observa además que la función **inserta la fila de intento antes de validar
el token**, de modo que el contador por red sí registra toda petición. El límite
de red de 100/hora es, por tanto, **el único control que permanece efectivo**
frente a este ataque.

## Impacto revisado

La fase 1 clasificó el hallazgo como Alto por proyección. La medición lo
sostiene y precisa el techo del ataque:

- El límite por dispositivo (10/hora) es **enteramente evadible**: no impone
  coste alguno al atacante.
- Queda el límite por red (100/hora por IP). Un atacante con acceso a múltiples
  direcciones IP —proxys residenciales, redes móviles, o **los navegadores de
  visitantes de un sitio de terceros, vía el CORS comodín de AUD-004**—
  multiplica ese techo sin esfuerzo.

La combinación con AUD-004 es lo que convierte esto en un problema serio: el
comodín `Access-Control-Allow-Origin: *` permite distribuir la enumeración entre
navegadores ajenos, cada uno aportando una IP distinta, lo que neutraliza
también el límite por red.

Y todo ello sobre tokens de **50 bits de entropía** (fase 12), cuya defensa el
propio equipo trasladó al control de tasa que aquí se demuestra evadible.

## Reproducción

```bash
# El secreto debe estar presente ANTES de arrancar el stack:
#   echo 'PREVALIDACION_TOKEN_HASH_SECRET=<valor>' > supabase/functions/.env
#   npx supabase stop && npx supabase start
docker exec supabase_edge_runtime_Libelula env | grep PREVALIDACION   # debe existir

psql "$DB_URL" -c "TRUNCATE public.intentos_token_anonimos;"
INTENTOS=25 node scripts/06_rate_limit_aud002.mjs
```

Artefacto: [`resultados/aud002_rate_limit.json`](../pruebas/resultados/aud002_rate_limit.json)

### Nota sobre el primer intento fallido

Una ejecución anterior arrojó «no demostrada» en los tres escenarios, incluido
el de control. No era un resultado sobre el sistema, sino un fallo de montaje:
faltaba el secreto HMAC y la función abortaba con HTTP 500 antes de alcanzar el
contador (`intentos_token_anonimos` quedó en 0 filas). Se registra porque
**presentar aquella ejecución como refutación de AUD-002 habría sido un error**,
y porque el grupo de control es justamente lo que permitió detectarlo.

## Nota de alcance

Ejecutado exclusivamente contra `127.0.0.1`; el script aborta si el destino no
es localhost. **No se dirigió tráfico alguno a producción.**

Permanece sin verificar —y sólo puede comprobarse sobre el entorno desplegado,
fuera de alcance— si la infraestructura de producción sobrescribe `x-real-ip` y
`cf-connecting-ip` en el borde. Si no lo hiciera, **también el límite por red
sería evadible**, y el hallazgo pasaría de Alto a Crítico. Es el punto de
verificación prioritario para el equipo.

## Remediación

Se mantiene la de la fase 1, cuya prioridad queda ahora respaldada por medición:
eliminar `x-device-id` como base del control de tasa y sustituirlo por una
prueba de trabajo, CAPTCHA (Turnstile/hCaptcha) o cookie firmada por el
servidor; corregir conjuntamente el CORS de AUD-004; introducir demora
progresiva por red; y reevaluar la entropía de 50 bits una vez corregido el
control.
