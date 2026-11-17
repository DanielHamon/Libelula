import assert from 'node:assert/strict'
import test from 'node:test'
import { createSpeechFallback } from './speechFallback.js'

class FakeUtterance {
  constructor(text) { this.text = text }
}

test('pausar cancela la voz y continuar retoma desde la última palabra', () => {
  const spoken = []
  let cancelled = 0
  const synthesis = {
    speak(utterance) { spoken.push(utterance) },
    cancel() { cancelled += 1 },
  }
  const reader = createSpeechFallback({ synthesis, Utterance: FakeUtterance })
  reader.start('Hola mundo de prueba.', 1)
  assert.equal(spoken[0].text, 'Hola mundo de prueba.')
  spoken[0].onboundary({ charIndex: 5 })
  reader.pause()
  assert.equal(cancelled, 2)
  spoken[0].onend()
  assert.equal(spoken.length, 1)
  reader.setRate(1.25)
  reader.resume()
  assert.equal(spoken[1].text, 'mundo de prueba.')
  assert.equal(spoken[1].rate, 1.25)
})

test('cambiar velocidad durante la lectura reinicia solo el texto pendiente', () => {
  const spoken = []
  const synthesis = { speak: utterance => spoken.push(utterance), cancel() {} }
  const reader = createSpeechFallback({ synthesis, Utterance: FakeUtterance })
  reader.start('Una frase de ejemplo.', 1)
  spoken[0].onboundary({ charIndex: 4 })
  reader.setRate(0.8)
  assert.equal(spoken[1].text, 'frase de ejemplo.')
  assert.equal(spoken[1].rate, 0.8)
  spoken[0].onend()
  assert.equal(spoken.length, 2)
})

test('sin eventos de palabra retoma desde el tramo actual, no desde la página', () => {
  const spoken = []
  const synthesis = { speak: utterance => spoken.push(utterance), cancel() {} }
  const reader = createSpeechFallback({ synthesis, Utterance: FakeUtterance })
  reader.start('La niña descubrió un color inesperado mientras caminaba por el jardín y luego llamó a sus amigos para contarles la historia.', 1)
  assert.ok(spoken[0].text.length <= 42)
  spoken[0].onend()
  const currentChunk = spoken[1].text
  assert.ok(currentChunk.length <= 42)
  reader.pause()
  reader.resume()
  assert.equal(spoken[2].text, currentChunk)
  assert.notEqual(spoken[2].text, spoken[0].text)
  reader.setRate(1.25)
  assert.equal(spoken[3].text, currentChunk)
  assert.equal(spoken[3].rate, 1.25)
})
