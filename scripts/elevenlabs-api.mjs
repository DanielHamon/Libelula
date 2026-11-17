const API_BASE = 'https://api.elevenlabs.io'

async function request(path, apiKey, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { 'xi-api-key': apiKey, ...options.headers },
    signal: AbortSignal.timeout(options.method === 'POST' ? 120_000 : 30_000),
  })
  if (!response.ok) throw new Error(`ElevenLabs ${options.method || 'GET'} respondió HTTP ${response.status}`)
  return response
}

export async function getVoiceSettings(apiKey, voiceId) {
  const response = await request(`/v1/voices/${encodeURIComponent(voiceId)}/settings`, apiKey)
  const stored = await response.json()
  return Object.fromEntries(['stability', 'similarity_boost', 'style', 'use_speaker_boost', 'speed']
    .filter(key => stored[key] != null).map(key => [key, stored[key]]))
}

export async function getSubscription(apiKey) {
  const response = await request('/v1/user/subscription', apiKey)
  return response.json()
}

export async function createSpeech({ text, voiceId, settings, apiKey, model, format }) {
  const response = await request(`/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=${encodeURIComponent(format)}`, apiKey, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({ text, model_id: model, voice_settings: settings }),
  })
  return Buffer.from(await response.arrayBuffer())
}
