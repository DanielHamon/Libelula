# Piloto local del lector de voz — Roja como un tomate

> Este documento conserva la secuencia histórica del piloto. La implementación administrable actual, las migraciones y las pruebas están en [Narraciones administrables](NARRACIONES_ADMIN_PLAN.md). El estado de habilitación empieza deshabilitado y la versión de cuatro páginas se conserva sin borrar sus MP3.

**Alcance:** rama `feature/lector-voz-piloto`, Supabase local preservado. La versión 2 con ElevenLabs está publicada para las páginas PDF 8–11 del registro `roja_como_un_tomate`. La versión 1 con el tono de prueba está archivada; el registro duplicado `roja` no se modifica.

## Qué hace el código

- `supabase/voice_reader_pilot.sql` crea `narraciones_libro`, `narraciones_pagina` y el bucket privado `audiobooks`. Las tablas y los objetos solo pueden leerse cuando la narración está publicada, la página está lista y `puede_acceder_libro` concede acceso. El navegador no recibe permisos de escritura.
- `scripts/voice-pilot-local.mjs` lee el PDF de la réplica, busca la primera página con texto suficiente y publica **un tono WAV técnico** de 1,5 segundos. El hash del texto es de esa página. El script exige la réplica local y no sobrescribe una versión existente.
- `src/components/NarradorLibro.jsx` aparece únicamente para `roja_como_un_tomate` si encuentra una narración publicada. Firma la URL al reproducir, conserva la firma durante su vigencia, y ofrece reproducir, pausar, continuar, reiniciar, velocidad y navegación. Al terminar una página, espera un segundo y continúa con la siguiente, dentro del mismo pliego o en el siguiente. En páginas sin audio piloto usa la voz disponible en el dispositivo como respaldo.
- El respaldo del navegador divide el texto en tramos de hasta 42 caracteres. Pausar cancela la locución y continuar retoma desde la última palabra informada por el navegador; si este no informa límites de palabras, repite como máximo el tramo actual. La velocidad reinicia ese tramo con el valor elegido.
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

La voz del navegador de prueba no emitió eventos `boundary`. Con los tramos de 42 caracteres, al pausar tras varios tramos y continuar se repitió solo el tramo en curso; al cambiar velocidad tampoco se volvió al inicio de la página. La reanudación exacta dentro del tramo depende de que el motor de voz informe una posición. Los archivos de audio sí conservan la posición exacta mediante `HTMLAudioElement.currentTime`.

## Estado de la voz real

El usuario generó, escuchó y publicó los cuatro MP3 en Supabase local el 18-11-2026; también comprobó manualmente que los controles del reproductor funcionan. El verificador local confirmó el acceso a los cuatro MP3 para una cuenta activada y la denegación para una cuenta sin acceso. El tono WAV de la versión 1 permanece como fixture archivado y no debe copiarse a otro entorno.

El avance automático de un segundo está implementado en el frontend, pendiente de comprobación auditiva en navegador. La precarga de la próxima página pertenece a la integración posterior.

## Prueba con ElevenLabs Free

El tramo predeterminado es **PDF 8–11**, cuatro páginas consecutivas con texto extraíble: **707 caracteres** según el PDF local revisado el 17-11-2026. PDF 6 no se eligió porque aparece como imagen sin texto extraíble. El texto exacto que se enviaría se guarda solo en `.reports/voice-pilot/texto-para-narrar.json`, excluido de Git. Revisa ese archivo antes de generar.

ElevenLabs publica 10.000 créditos mensuales para Free y un crédito por carácter para Multilingual v2. El costo esperado de este tramo es aproximadamente 707 créditos, sujeto al saldo real y a las condiciones de la cuenta. El script consulta la suscripción y se niega a generar si no es Free o si el saldo indicado no alcanza. Usa el endpoint oficial de creación de voz con `eleven_multilingual_v2` y `mp3_44100_128`. [Precios](https://elevenlabs.io/pricing), [API TTS](https://elevenlabs.io/docs/api-reference/text-to-speech/convert), [suscripción](https://elevenlabs.io/docs/api-reference/user/subscription/get).

1. En ElevenLabs, crea una API key desde **Developers → API Keys** con permisos de TTS, consulta de voz y suscripción. Puedes ponerle un límite de créditos para este piloto. Copia el `voice_id` desde **My Voices → ⋯ → Copy voice ID**. [Claves](https://elevenlabs.io/docs/help-center/technical/how-do-i-authorize-myself-using-an-api-key), [voice ID](https://elevenlabs.io/docs/help-center/technical/how-do-i-find-the-voice-id-of-my-voices-via-the-website-and-api).
2. Crea en el worktree el archivo ignorado `.env.elevenlabs.local` con permisos `600` y este contenido, usando tus propios valores. No pongas la clave en una variable `VITE_` ni la compartas por chat.

   ```text
   ELEVENLABS_API_KEY=tu_clave
   ELEVENLABS_VOICE_ID=identificador_de_la_voz
   ```

3. Ejecuta `node scripts/elevenlabs-pilot.mjs plan` para revisar las páginas. Después, `node scripts/elevenlabs-pilot.mjs generate`. La generación guarda cada MP3 en `.reports/voice-pilot/audio-cache/`, lo valida, lo sube al bucket privado y crea una **versión 2 en borrador**. Repetir el comando omite páginas listas y reutiliza el archivo local si falló la subida, para no gastar créditos otra vez.
4. Escucha los cuatro MP3. Cuando estén aprobados, ejecuta `node scripts/elevenlabs-pilot.mjs publish` para archivar el tono de prueba y mostrar la versión 2 en el lector local. La función SQL verifica que estén las cuatro páginas y sus objetos antes del cambio atómico.

El generador acepta `--pages` con tres o cuatro páginas PDF consecutivas, por ejemplo `--pages 9,10,11`, y exige usar la misma selección al generar y publicar. La versión 2 ya está publicada en la réplica local: no vuelvas a ejecutar `generate` o `publish` para esta versión.
