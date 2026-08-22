# Fase 13 — prevalidación antes del registro

La fase añade una prevalidación anónima limitada. No modifica las RPC de
activación existentes y nunca reserva ni consume el token antes del registro.

## 1. Base de datos

En el SQL Editor de Supabase:

1. Ejecutar `security_phase13_prevalidacion_anonima.sql`.
2. Ejecutar `security_phase13_prevalidacion_anonima_verify.sql`.
3. Confirmar que todos los indicadores sean `true`.

## 2. Secreto de la Edge Function

Generar un secreto aleatorio de al menos 32 bytes y guardarlo en Supabase. Por
ejemplo, desde una terminal con OpenSSL:

```bash
openssl rand -hex 32
supabase secrets set PREVALIDACION_TOKEN_HASH_SECRET=VALOR_GENERADO
```

El secreto se usa únicamente para seudonimizar la red y el dispositivo antes de
registrar el rate limit. No debe incluirse en variables `VITE_*` ni enviarse al
navegador.

## 3. Despliegue

Desplegar la función sin exigir JWT, ya que su finalidad es atender usuarios
que todavía no tienen cuenta:

```bash
supabase functions deploy prevalidar-token --no-verify-jwt
```

`SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` son secretos disponibles por
defecto dentro de las Edge Functions alojadas en Supabase.

## 4. Pruebas

1. Cerrar sesión y abrir `/activar`.
2. Introducir un código inexistente: debe rechazarse antes de mostrar registro.
3. Introducir un código válido: debe mostrar el formulario de registro.
4. Completar el registro: debe volver a validar y activar el código.
5. Repetir el código consumido: debe rechazarse en la primera pantalla.
6. Confirmar que la respuesta de la función solo contiene `valido` y, en caso
   de rechazo, un `motivo` genérico; nunca datos del libro o institución.
