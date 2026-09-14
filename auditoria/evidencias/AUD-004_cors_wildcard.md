# Evidencia — AUD-004

**Hallazgo:** CORS permisivo (`*`) en el único endpoint sin autenticación
**Severidad:** Alta · CVSS 3.1: 5.3 (`AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:N`)
**Commit:** `070ac28`

---

## Comandos de reproducción

```bash
git checkout 070ac28
head -5 supabase/functions/prevalidar-token/index.ts
```

## Salida registrada

```ts
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-device-id',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
```

---

## Análisis

El comodín `*` en `Access-Control-Allow-Origin` se aplica al único endpoint
desplegado sin verificación de JWT. Cualquier sitio web puede invocarlo desde el
navegador de sus visitantes.

### Incoherencia de postura

`vercel.json` define una CSP estricta para el frontend:

```bash
grep -o "frame-ancestors[^;]*\|object-src[^;]*\|script-src [^;]*" vercel.json
```
```
script-src 'self'
object-src 'none'
frame-ancestors 'none'
```

El mismo criterio defensivo no se aplicó a la Edge Function.

---

## Impacto como multiplicador de AUD-002

El comodín permite distribuir la enumeración de tokens (AUD-002) entre los
navegadores de los visitantes de un sitio de terceros:

```
Sitio malicioso incrusta JavaScript que llama a prevalidar-token.
  Visitante 1 (IP A) → prueba tokens → cuenta contra IP A
  Visitante 2 (IP B) → prueba tokens → cuenta contra IP B
  Visitante N (IP N) → prueba tokens → cuenta contra IP N
```

Cada visitante aporta una dirección IP distinta, **neutralizando por completo el
límite por red** aun si este fuera robusto. Por eso AUD-002 y AUD-004 deben
corregirse conjuntamente.

Impactos adicionales:
- Consumo de la cuota de ejecución de Edge Functions del proyecto.
- Uso del validador como oráculo por integraciones no autorizadas.

---

## Nota sobre el alcance de CORS

CORS es un control del **navegador**, no del servidor. No impide peticiones
directas hechas fuera de un navegador (curl, scripts). Restringir el origen
elimina el vector de **distribución masiva vía navegadores de terceros**, pero
**no sustituye** un control de tasa robusto (AUD-002). Ambas correcciones son
necesarias y complementarias.
