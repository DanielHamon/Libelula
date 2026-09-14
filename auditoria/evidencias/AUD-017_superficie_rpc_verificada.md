# AUD-017 — Superficie de las RPC no invocadas: verificación y hallazgo residual

**Dominio:** Seguridad / superficie de ataque
**Origen:** Fase 2 (dinámica). Resuelve la verificación pendiente nº 2 de la §8.2.
**Fecha de la prueba:** 2026-09-06 (segundo fin de semana: sondeo de las 40 RPC)

---

## Contexto

La sección 8.2 del informe principal señalaba como verificación pendiente la
**enumeración de las funciones RPC no invocadas desde el cliente**, y la
describía como «la superficie de ataque menos explorada del sistema». El
análisis estático no podía determinar cuáles eran efectivamente alcanzables.

Primera corrección de dato: el informe indica 42 funciones no invocadas (57
definidas, 15 utilizadas). El recuento sobre el código fuente arroja **17
invocadas y 40 no invocadas**.

```bash
grep -rhoP "\.rpc\(\s*'\K[a-z_0-9]+" src/ | sort -u | wc -l   # 17
grep -oP 'CREATE OR REPLACE FUNCTION "public"\."\K[a-z_0-9]+' \
  supabase/schema.sql | sort -u | wc -l                        # 57
```

## Procedimiento

Se invocaron las 40 funciones a través de PostgREST, primero con el rol `anon`
y después con una sesión autenticada de estudiante, clasificando la respuesta:

| Código | Interpretación |
|---|---|
| `PGRST202` | No expuesta para ese rol |
| `42501` | Permiso denegado |
| otro error | La función se ejecutó y falló por argumentos: **es alcanzable** |
| éxito | Alcanzable y ejecutable |

## Resultado

```
Alcanzables como anon:        4 / 40
Alcanzables como estudiante:  4 / 40
```

**36 de las 40 funciones no son alcanzables por un usuario sin privilegios.** La
preocupación que la §8.2 dejaba abierta queda en buena medida acotada: la
superficie real es mucho menor de lo que el recuento de funciones sugería.

Las cuatro alcanzables:

| Función | Rol | Respuesta | Valoración |
|---|---|---|---|
| `es_admin` | anon y estudiante | `false` | Correcto: responde con la verdad sin filtrar nada |
| `sesion_es_aal2` | anon y estudiante | `false` | Correcto: refleja el estado real de la sesión |
| `generar_token_10` | anon y estudiante | `"A6GR4PCMGS"` | **Hallazgo**: ver abajo |
| `normalizar_respuesta_texto` | anon y estudiante | utilitaria | Sin acceso a datos |

## Hallazgo residual: `generar_token_10` expuesta públicamente

**Severidad propuesta:** Baja
**CVSS 3.1:** 3.7 — `AV:N/AC:H/PR:N/UI:N/S:U/C:L/I:N/A:N`

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

Comprobación:

```bash
curl -s -X POST "$URL/rest/v1/rpc/generar_token_10" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" \
  -H "Content-Type: application/json" -d '{}'
# -> "A6GR4PCMGS"
```

### Valoración del riesgo

Conviene ser preciso sobre el alcance real, para no sobredimensionarlo:

**Lo que NO ocurre.** La función no consulta la base de datos: genera una cadena
aleatoria y la devuelve. No revela tokens existentes, no confirma si un código
es válido y no crea ninguna fila en `tokens`. No constituye por sí sola una vía
de acceso.

**Lo que sí ocurre.** Queda expuesto públicamente el **generador exacto de
códigos de activación**: alfabeto, longitud y fuente de entropía. Un atacante
obtiene así, sin coste, la confirmación del formato preciso que debe enumerar,
lo que perfecciona el ataque descrito en AUD-002. Además, cada invocación
consume `gen_random_bytes` del servidor, de modo que la función es utilizable
como vector de consumo de recursos.

El defecto de fondo es de principio: una función auxiliar de uso exclusivamente
administrativo no debería ser invocable por un usuario anónimo. Es la misma
causa raíz de AUD-006 —las `ALTER DEFAULT PRIVILEGES` conceden `EXECUTE` a
`anon` sobre toda función nueva—, manifestada en un caso concreto.

### Remediación

```sql
REVOKE EXECUTE ON FUNCTION public.generar_token_10()  FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generar_token_128() FROM anon, authenticated;
```

Y, como medida estructural, corregir las concesiones por defecto (AUD-006), que
es lo que provocará que el problema reaparezca con cada función nueva.

## Consecuencia para el informe

La verificación pendiente nº 2 de la §8.2 queda resuelta. El resultado es
**mayoritariamente tranquilizador**: 36 de 40 funciones están correctamente
protegidas. Corresponde atenuar en el informe final la calificación de esta
superficie como «la menos explorada», sustituyéndola por el dato verificado, y
añadir el hallazgo residual sobre `generar_token_10`.
