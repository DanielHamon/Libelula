# Fase 12 — tokens de 10 caracteres

Esta fase cambia únicamente los tokens generados después de la migración. Los
tokens largos `TL-`/`TD-` ya emitidos continúan siendo válidos hasta que se
activen, expiren o sean revocados.

## Aplicación

1. Ejecutar `security_phase12_tokens_10_chars.sql` en el SQL Editor de Supabase.
2. Ejecutar `security_phase12_tokens_10_chars_verify.sql`; todos los indicadores
   booleanos deben devolver `true`.
3. Generar un token de libro y uno docente desde el panel. Ambos deben contener
   exactamente 10 caracteres del alfabeto `0123456789ABCDEFGHJKMNPQRSTVWXYZ`.
4. Activar ambos tokens y comprobar que no puedan reutilizarse.
5. Comprobar también un token largo emitido antes de esta fase.

## Propiedades

- Cada token tiene 50 bits de entropía (`32^10` combinaciones).
- No se generan `I`, `L`, `O` ni `U`, para evitar confusiones al transcribir.
- Las firmas públicas de las RPC, el rate limit y el consumo de un solo uso no
  cambian.
- `tokens.id` sigue siendo `TEXT` y las claves foráneas históricas no cambian.
