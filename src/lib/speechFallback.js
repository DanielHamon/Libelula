// Algunos motores de voz no emiten eventos `boundary`. Un tramo corto limita
// lo que se repite al pausar antes de recibir el siguiente `end`.
const MAX_CHUNK_LENGTH = 42
const MIN_BREAK_LENGTH = 22

function nextChunk(text, cursor) {
  const remaining = text.slice(cursor)
  if (remaining.length <= MAX_CHUNK_LENGTH) return remaining
  const candidate = remaining.slice(0, MAX_CHUNK_LENGTH)
  const space = candidate.lastIndexOf(' ')
  const end = space >= MIN_BREAK_LENGTH ? space + 1 : MAX_CHUNK_LENGTH
  return remaining.slice(0, end)
}

export function createSpeechFallback({ synthesis, Utterance, onEnd, onError }) {
  let text = ''
  let cursor = 0
  let rate = 1
  let generation = 0
  let status = 'idle'

  function cancelCurrent() {
    generation += 1
    synthesis.cancel()
  }

  function speakNext() {
    if (cursor >= text.length) {
      status = 'idle'
      onEnd?.()
      return
    }
    const start = cursor
    const chunk = nextChunk(text, start)
    const currentGeneration = generation
    const utterance = new Utterance(chunk)
    utterance.lang = 'es'
    utterance.rate = rate
    utterance.onboundary = event => {
      if (currentGeneration === generation && Number.isFinite(event.charIndex)) {
        cursor = Math.max(cursor, start + event.charIndex)
      }
    }
    utterance.onend = () => {
      if (currentGeneration !== generation || status !== 'reading') return
      cursor = start + chunk.length
      speakNext()
    }
    utterance.onerror = () => {
      if (currentGeneration !== generation) return
      status = 'idle'
      onError?.()
    }
    synthesis.speak(utterance)
  }

  return {
    start(value, nextRate = 1) {
      cancelCurrent()
      text = value.trim()
      cursor = 0
      rate = nextRate
      status = 'reading'
      speakNext()
    },
    pause() {
      if (status !== 'reading') return
      status = 'paused'
      cancelCurrent()
    },
    resume() {
      if (status !== 'paused') return
      status = 'reading'
      speakNext()
    },
    setRate(nextRate) {
      rate = nextRate
      if (status === 'reading') {
        cancelCurrent()
        speakNext()
      }
    },
    stop() {
      status = 'idle'
      cancelCurrent()
      text = ''
      cursor = 0
    },
  }
}
