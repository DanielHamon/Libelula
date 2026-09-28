import { useState, useRef } from 'react'
import { C } from './activityStyles'
import { FeedbackBox, MissingField } from './ActivityFeedback'

export default function TarjetasVolteables({ instruccion, tarjetas, textoFrente = 'Haz clic para descubrir', mensajeFinal = '¡Descubriste todas las tarjetas!', onComplete, completada }) {
  const cards = tarjetas.map((card, idx) => ({
    id: String(card.id ?? `tarjeta-${idx + 1}`),
    emoji: card.emoji || card.icono || '❓',
    frente: card.frente || card.titulo || card.nombre || textoFrente,
    reverso: card.reverso || card.texto || card.descripcion || '',
    color: card.color || [C.purple, C.blue, C.teal, C.orange, C.pink][idx % 5],
  })).filter(card => card.frente && card.reverso)
  const [volteadas, setVolteadas] = useState(() => new Set())
  const [descubiertas, setDescubiertas] = useState(() => new Set())
  const firedRef = useRef(false)

  function voltear(card) {
    if (completada) return
    const nextFlipped = new Set(volteadas)
    nextFlipped.has(card.id) ? nextFlipped.delete(card.id) : nextFlipped.add(card.id)
    setVolteadas(nextFlipped)
    if (!nextFlipped.has(card.id)) return
    const nextDiscovered = new Set(descubiertas); nextDiscovered.add(card.id); setDescubiertas(nextDiscovered)
    if (nextDiscovered.size === cards.length && !firedRef.current) {
      firedRef.current = true
      onComplete({ tarjetasDescubiertas: cards.map(item => ({ id: item.id, frente: item.frente })), total: cards.length }, null)
    }
  }

  if (cards.length === 0) return <MissingField campo="tarjetas" />
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {instruccion && <p style={{ fontSize: 15, fontWeight: 700, color: C.text, lineHeight: 1.5, margin: 0 }}>{instruccion}</p>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 14 }}>
        {cards.map(card => {
          const flipped = volteadas.has(card.id)
          return (
            <button key={card.id} type="button" onClick={() => voltear(card)} aria-pressed={flipped} aria-label={`${flipped ? 'Ocultar' : 'Descubrir'} ${card.frente}`} style={{ height: 175, padding: 0, border: 'none', background: 'transparent', perspective: 900, cursor: completada ? 'default' : 'pointer', fontFamily: 'Nunito' }}>
              <span style={{ position: 'relative', display: 'block', width: '100%', height: '100%', transformStyle: 'preserve-3d', transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)', transition: 'transform 500ms cubic-bezier(.2,.7,.2,1)' }}>
                <span style={{ position: 'absolute', inset: 0, backfaceVisibility: 'hidden', borderRadius: 16, padding: 16, boxSizing: 'border-box', background: `linear-gradient(145deg, ${card.color}, ${card.color}CC)`, color: '#fff', border: '3px solid #fff', boxShadow: `0 7px 20px ${card.color}45`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                  <span style={{ fontSize: 38 }}>{card.emoji}</span>
                  <span style={{ fontSize: 16, fontWeight: 900 }}>{card.frente}</span>
                  <span style={{ fontSize: 10, fontWeight: 800, opacity: .85 }}>Toca para voltear</span>
                </span>
                <span style={{ position: 'absolute', inset: 0, backfaceVisibility: 'hidden', transform: 'rotateY(180deg)', borderRadius: 16, padding: 16, boxSizing: 'border-box', background: '#fff', color: C.text, border: `3px solid ${card.color}`, boxShadow: `0 7px 20px ${card.color}30`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 9 }}>
                  <span style={{ fontSize: 30 }}>{card.emoji}</span>
                  <span style={{ color: card.color, fontSize: 14, fontWeight: 900 }}>{card.frente}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.4 }}>{card.reverso}</span>
                </span>
              </span>
            </button>
          )
        })}
      </div>
      <span style={{ fontSize: 13, fontWeight: 800, color: descubiertas.size === cards.length ? C.green : C.textMuted }}>Descubiertas: {descubiertas.size} / {cards.length}</span>
      {(completada || descubiertas.size === cards.length) && <FeedbackBox ok msg={mensajeFinal} />}
    </div>
  )
}
