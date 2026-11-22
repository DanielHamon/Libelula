import assert from 'node:assert/strict'
import test from 'node:test'
import { createSpeech, getSubscription, getVoiceSettings } from './elevenlabs-api.mjs'

test('consulta cuota y voz; solicita MP3 con el modelo y texto previstos', async () => {
  const originalFetch = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options })
    if (url.endsWith('/settings')) return Response.json({ stability: 0.5, similarity_boost: 0.75, speed: 1, extra: 'ignorar' })
    if (url.endsWith('/subscription')) return Response.json({ tier: 'free', character_count: 0, character_limit: 10000 })
    return new Response(Uint8Array.from([0xff, 0xfb, 0x90, 0x64]))
  }
  try {
    const settings = await getVoiceSettings('clave-de-prueba', 'voz1234567890')
    const subscription = await getSubscription('clave-de-prueba')
    const audio = await createSpeech({
      text: 'Texto de prueba', voiceId: 'voz1234567890', settings, apiKey: 'clave-de-prueba',
      model: 'eleven_multilingual_v2', format: 'mp3_44100_128',
    })
    assert.deepEqual(settings, { stability: 0.5, similarity_boost: 0.75, speed: 1 })
    assert.equal(subscription.tier, 'free')
    assert.equal(audio.length, 4)
    assert.equal(calls.length, 3)
    assert.equal(calls[2].url, 'https://api.elevenlabs.io/v1/text-to-speech/voz1234567890?output_format=mp3_44100_128')
    assert.equal(calls[2].options.headers['xi-api-key'], 'clave-de-prueba')
    assert.deepEqual(JSON.parse(calls[2].options.body), {
      text: 'Texto de prueba', model_id: 'eleven_multilingual_v2', voice_settings: settings,
    })
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('muestra el detalle del error sin revelar clave ni ID de voz', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => Response.json({
    detail: {
      status: 'voice_not_available',
      message: 'La clave clave-de-prueba no puede usar voz1234567890; contacto@example.com',
    },
  }, { status: 402 })
  try {
    await assert.rejects(
      createSpeech({ text: 'Texto de prueba', voiceId: 'voz1234567890', settings: {},
        apiKey: 'clave-de-prueba', model: 'eleven_multilingual_v2', format: 'mp3_44100_128' }),
      error => error.message.includes('HTTP 402 (voice_not_available)')
        && !error.message.includes('clave-de-prueba')
        && !error.message.includes('voz1234567890')
        && !error.message.includes('contacto@example.com'),
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})
