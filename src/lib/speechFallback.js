const MAX_CHUNK_LENGTH = 220

function nextChunk(text, cursor) {
  const remaining = text.slice(cursor)
  if (remaining.length <= MAX_CHUNK_LENGTH) return remaining
  const candidate = remaining.slice(0, MAX_CHUNK_LENGTH)
  const sentenceEnd = Math.max(candidate.lastIndexOf('. '), candidate.lastIndexOf('? '), candidate.lastIndexOf('! '))
  const space = candidate.lastIndexOf(' ')
  const end = sentenceEnd >= 100 ? sentenceEnd + 2 : space >= 100 ? space + 1 : MAX_CHUNK_LENGTH
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
