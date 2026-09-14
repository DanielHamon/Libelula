# Evidencia — AUD-002

**Hallazgo:** Control de tasa evadible mediante encabezado controlado por el cliente
**Severidad:** Alta · CVSS 3.1: 7.5 (`AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N`)
**Commit:** `070ac28`

---

## Comandos de reproducción

```bash
git checkout 070ac28
cat supabase/functions/prevalidar-token/index.ts
```

---

## Código afectado

`supabase/functions/prevalidar-token/index.ts:53-66`

```ts
const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
const ip = request.headers.get('x-real-ip')          // ← precedencia 1
  || request.headers.get('cf-connecting-ip')         // ← precedencia 2
  || forwardedFor                                    // ← precedencia 3
  || 'ip-desconocida'
const device    = request.headers.get('x-device-id')?.slice(0, 128) || 'sin-dispositivo'
const userAgent = request.headers.get('user-agent')?.slice(0, 256) || 'sin-agente'
const [networkHash, deviceHash] = await Promise.all([
  hmac(`red\n${ip}`, hashSecret),
  hmac(`dispositivo\n${device}\n${userAgent}`, hashSecret),
])
```

---

## Análisis

### El identificador de dispositivo lo controla el cliente

`x-device-id` es un encabezado HTTP arbitrario. Nada impide enviar un valor
distinto en cada petición:

```
Petición 1:  x-device-id: aaaa-0001    → deviceHash A → cuenta 1/10
Petición 2:  x-device-id: aaaa-0002    → deviceHash B → cuenta 1/10
Petición 3:  x-device-id: aaaa-0003    → deviceHash C → cuenta 1/10
...
```

El límite de 10 por hora y dispositivo **nunca se alcanza**: cada petición
aparenta provenir de un dispositivo nuevo.

El cálculo de HMAC no aporta seguridad en este punto. HMAC protege la
**confidencialidad** del identificador almacenado (no se guarda la IP en claro),
no su **autenticidad**. Un valor falsificado produce un hash válido y distinto.

### El user-agent también es del cliente

Forma parte del mismo hash de dispositivo, ampliando aún más el espacio de
evasión.

### La cadena de precedencia de IP prioriza encabezados falsificables

`x-real-ip` y `cf-connecting-ip` se leen **antes** que `x-forwarded-for`. Estos
encabezados son fiables **solo si la infraestructura del borde los sobrescribe**
en cada petición entrante. Si alguno se propaga desde el cliente sin reescritura,
también el límite de red (100/hora) es evadible.

> **No verificado sin acceso al entorno desplegado.** Es el punto de
> verificación prioritario. Debe confirmarse contra la instancia real si estos
> encabezados llegan a la función tal como los envía el cliente o si el borde de
> Supabase/Deno los reemplaza.

---

## Amplificación: entropía de tokens a 50 bits

Según la documentación del equipo (`SECURITY_AUDIT_STATUS.md`, fase 12), los
tokens se generan con Crockford Base32, 10 caracteres, 50 bits de entropía. La
función confirma que se aceptan tokens en un rango amplio:

```ts
if (token.length < 6 || token.length > 128) {
  return json({ valido: false, motivo: 'token_invalido' })
}
```

Con el control de tasa evadido, la barrera efectiva contra la enumeración es la
**densidad de tokens válidos**, no el espacio teórico de 2⁵⁰. Al inicio de un
ciclo lectivo, con lotes impresos distribuidos, la densidad de códigos activos es
elevada.

---

## Aspecto correcto de la implementación

La función responde siempre con la misma forma —booleano más motivo genérico—
sin filtrar metadatos del token:

```ts
if (token.length < 6 || token.length > 128) {
  return json({ valido: false, motivo: 'token_invalido' })
}
```

Es una decisión de diseño acertada: evita un oráculo de enumeración basado en
mensajes de error diferenciados. No obstante, la distinción entre respuesta
válida e inválida es en sí misma suficiente para la enumeración una vez
comprometido el control de tasa.

---

## Prueba de concepto (para entorno autorizado)

```bash
# Simulación de evasión del límite por dispositivo.
# NO ejecutar contra producción sin autorización explícita.
ENDPOINT="https://<proyecto>.supabase.co/functions/v1/prevalidar-token"

for i in $(seq 1 100); do
  curl -s -X POST "$ENDPOINT" \
    -H "Content-Type: application/json" \
    -H "x-device-id: dispositivo-generado-$i" \
    -d "{\"token\":\"$(generar_candidato_base32)\"}"
done
# Confirmación: las 100 peticiones se procesan sin que se active
# el límite de 10 por dispositivo.
```

---

## Verificación pendiente

1. Confirmar si el borde de Supabase sobrescribe `x-real-ip` /
   `cf-connecting-ip`. Determina si el límite de red es o no evadible.
2. Medir la tasa de aciertos real con la densidad de tokens de un ciclo lectivo.
3. Validar el efecto de las medidas de remediación (prueba de trabajo, cookie
   firmada, demora progresiva).
