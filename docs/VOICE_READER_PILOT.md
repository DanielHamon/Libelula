# Piloto local del lector de voz — Roja como un tomate

**Alcance:** rama `feature/lector-voz-piloto`, Supabase local preservado. Una sola página del registro `roja_como_un_tomate`; el registro duplicado `roja` no se modifica. Ningún audio se generó con ElevenLabs.

## Qué hace el código

- `supabase/voice_reader_pilot.sql` crea `narraciones_libro`, `narraciones_pagina` y el bucket privado `audiobooks`. Las tablas y los objetos solo pueden leerse cuando la narración está publicada, la página está lista y `puede_acceder_libro` concede acceso. El navegador no recibe permisos de escritura.
- `scripts/voice-pilot-local.mjs` lee el PDF de la réplica, busca la primera página con texto suficiente y publica **un tono WAV técnico** de 1,5 segundos. El hash del texto es de esa página. El script exige la réplica local y no sobrescribe una versión existente.
- `src/components/NarradorLibro.jsx` aparece únicamente para `roja_como_un_tomate` si encuentra una narración publicada. Firma la URL al reproducir, conserva la firma durante su vigencia, y ofrece reproducir, pausar, continuar, reiniciar, velocidad y navegación manual. En páginas sin audio piloto usa la voz disponible en el dispositivo como respaldo.
- El respaldo del navegador divide el texto en tramos breves. Pausar cancela la locución y continuar retoma desde la última palabra informada por el navegador; si este no informa límites de palabras, puede repetir el tramo actual. La velocidad reinicia el tramo pendiente con el valor elegido.
- El panel toma el color de acento del libro y adapta los controles a pantallas pequeñas.
- `scripts/verify-voice-pilot-local.mjs` comprueba lectura y descarga con una activación ficticia y denegación para un usuario sin acceso. Solo se conecta a `127.0.0.1:54431`.

## Ejecución en la réplica local

Desde el worktree, con la réplica preservada activa y `.env.local` enlazado mediante el script privado `link-worktree.py`:

```bash
docker exec -i supabase_db_iabooks-replica-20261110 \
  psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f - \
  < supabase/voice_reader_pilot.sql
node scripts/voice-pilot-local.mjs
node scripts/verify-voice-pilot-local.mjs
npm run build
npm run lint
```

La migración y la carga ya se ejecutaron en la réplica local el 17-11-2026. Quedó publicado un audio técnico en la página PDF **4 de 32**. La prueba de acceso y descarga pasó con un usuario local activado; la lectura y la firma se denegaron a otro usuario sin acceso. Build y lint pasaron. En navegador local se abrió el libro con una sesión ficticia, se mostró el control y se seleccionó la página 4; no hubo errores de página. El audio del navegador no se escuchó ni se midió manualmente durante esta verificación.

Después del ajuste visual y de controles se verificó de nuevo en navegador local: en la página 5, Pausar dejó `speechSynthesis.speaking` en `false`, Continuar volvió a `true` y la locución tomó `1,25×`; en la página 4, el elemento de audio quedó pausado y su `playbackRate` cambió de `0,8` a `1,25`. Se inspeccionó el panel en escritorio y a 390 px, sin errores de página. No se hizo una evaluación auditiva de la voz.

## Para continuar con voz real

Confirmar la versión final del PDF y registrar `voice_id`, modelo y ajustes exactos de ElevenLabs. Generar una nueva versión de narración con MP3 de las páginas elegidas, revisar el sonido y publicarla solo después de aprobarla. El tono WAV de la versión 1 permanece como fixture local y no debe copiarse a otro entorno.

Este piloto aún usa navegación manual del audio; el avance automático y la precarga de la próxima página pertenecen a la integración posterior.
