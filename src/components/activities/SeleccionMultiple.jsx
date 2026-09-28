import { useState, useRef } from 'react'
import { C, btnP, btnS } from './activityStyles'
import { FeedbackBox, AttemptsLeft } from './ActivityFeedback'
import { registrarError } from '../../lib/diagnostics'

export default function SeleccionMultiple({ pregunta, opciones, pista, estilo = 'lista', retroalimentacion, retroalimentacionError, onComplete, onAttempt, completada, savedAnswer, maxIntentos = 2, primaryColor = C.pink }) {
  const [seleccionadas, setSeleccionadas] = useState(() => new Set(
    savedAnswer?.seleccionadasIndices
      ?? opciones.map((op, idx) => savedAnswer?.seleccionadas?.includes(op.texto) ? idx : null).filter(idx => idx != null)
  ))
  const [resultado, setResultado] = useState(null)
  const [intentos, setIntentos] = useState(0)
  const [showPista, setShowPista] = useState(false)
  const [resultadosChip, setResultadosChip] = useState({})
  const [enviando, setEnviando] = useState(false)
  const [errorIntento, setErrorIntento] = useState('')
  const firedRef = useRef(false)
  const onCompleteRef = useRef(onComplete); onCompleteRef.current = onComplete

  const correctas = opciones.map((op, idx) => (op.esCorrecta ? idx : null)).filter(idx => idx !== null)
  const selIdxs = [...seleccionadas]
  const payload = {
    seleccionadas: selIdxs.map(idx => opciones[idx]?.texto || ''),
    correctas: correctas.map(idx => opciones[idx]?.texto || ''),
    opcionElegida: selIdxs.map(idx => opciones[idx]?.texto || '').join(' | '),
    seleccionadasIndices: selIdxs,
    respuestas: opciones.map((op, idx) => ({
      texto: op.texto,
      esCorrecta: !!op.esCorrecta,
      seleccionada: seleccionadas.has(idx),
      respondio: seleccionadas.has(idx),
    })),
  }
  const allOk = opciones.length > 0 && opciones.every((op, idx) => !!op.esCorrecta === seleccionadas.has(idx))
  const serverMode = typeof onAttempt === 'function'
  const isLocked = enviando || resultado === 'correct' || resultado === 'agotado' || completada
  const restantes = maxIntentos - intentos

  function toggle(idx) {
    if (isLocked) return
    if (!serverMode && estilo === 'chips') {
      if (resultadosChip[idx] === 'ok') return
      const correcta = !!opciones[idx]?.esCorrecta
      const nextResultados = { ...resultadosChip, [idx]: correcta ? 'ok' : 'no' }
      setResultadosChip(nextResultados)
      if (correcta) {
        const next = new Set(seleccionadas)
        next.add(idx)
        setSeleccionadas(next)
        const encontroTodas = correctas.length > 0 && correctas.every(correctIndex => next.has(correctIndex))
        if (encontroTodas) {
          setResultado('correct')
          if (!firedRef.current) {
            firedRef.current = true
            onCompleteRef.current({
              seleccionadas: [...next].map(index => opciones[index]?.texto || ''),
              correctas: correctas.map(index => opciones[index]?.texto || ''),
              seleccionadasIndices: [...next],
            }, true)
          }
        }
      } else {
        const nextIntentos = intentos + 1
        setIntentos(nextIntentos)
        if (nextIntentos >= maxIntentos) {
          setResultado('agotado')
          if (!firedRef.current) {
            firedRef.current = true
            onCompleteRef.current({
              seleccionadas: [...seleccionadas].map(index => opciones[index]?.texto || ''),
              correctas: correctas.map(index => opciones[index]?.texto || ''),
              seleccionadasIndices: [...seleccionadas],
            }, false)
          }
        }
      }
      return
    }
    setSeleccionadas(prev => {
      const next = new Set(prev)
      next.has(idx) ? next.delete(idx) : next.add(idx)
      return next
    })
    if (resultado) setResultado(null)
  }

  async function verificar() {
    if (isLocked || firedRef.current) return
    if (serverMode) {
      if (seleccionadas.size === 0) return
      setEnviando(true)
      setErrorIntento('')
      try {
        const respuestaPublica = {
          seleccionadas: selIdxs.map(idx => opciones[idx]?.texto || ''),
          opcionElegida: selIdxs.map(idx => opciones[idx]?.texto || '').join(' | '),
          seleccionadasIndices: selIdxs,
        }
        const evaluacion = await onAttempt(respuestaPublica)
        setIntentos(evaluacion.intentos)
        if (evaluacion.esCorrecta) {
          setResultado('correct')
          firedRef.current = true
        } else if (evaluacion.agotado) {
          setResultado('agotado')
          firedRef.current = true
        } else {
          setResultado('wrong')
        }
      } catch (error) {
        registrarError("evaluarIntento:", error)
        setErrorIntento('No pudimos verificar tu respuesta. Inténtalo de nuevo.')
      } finally {
        setEnviando(false)
      }
      return
    }
    const ok = allOk
    setResultado(ok ? 'correct' : 'wrong')
    if (ok) {
      firedRef.current = true
      onCompleteRef.current(payload, true)
      return
    }
    const n = intentos + 1
    setIntentos(n)
    if (n >= maxIntentos) {
      setResultado('agotado')
      firedRef.current = true
      onCompleteRef.current(payload, false)
    }
  }

  function estadoOpcion(idx) {
    const sel = seleccionadas.has(idx)
    if (serverMode) {
      if (resultado === 'correct') return sel ? 'ok' : null
      if (resultado === 'wrong' || resultado === 'agotado') return sel ? 'no' : null
      return sel ? 'sel' : null
    }
    const correcta = !!opciones[idx]?.esCorrecta
    if (resultado === 'correct') return correcta ? 'ok' : null
    if (resultado === 'wrong' || resultado === 'agotado') {
      if (sel && correcta) return 'ok'
      if (sel && !correcta) return 'no'
      if (!sel && correcta) return 'missed'
    }
    return sel ? 'sel' : null
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {pista && (
        <div style={{ border: '2px solid #FDE047', background: '#FEFCE8', borderRadius: 12, color: '#854D0E', overflow: 'hidden' }}>
          <button type="button" onClick={() => setShowPista(value => !value)} style={{ width: '100%', border: 'none', background: 'transparent', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', color: 'inherit', fontFamily: 'Nunito', fontWeight: 800, cursor: 'pointer' }}>
            <span>💡 <span style={{ marginLeft: 8 }}>Pista:</span></span>
            <span style={{ fontSize: 12 }}>{showPista ? 'Ocultar pista ▲' : 'Ver pista ▼'}</span>
          </button>
          {showPista && <div style={{ padding: '0 14px 12px 42px', fontSize: 13, fontWeight: 700 }}>{pista}</div>}
        </div>
      )}
      {pregunta && <p style={{ fontSize: 18, fontWeight: 600, color: C.text, margin: 0, lineHeight: 1.5 }}>{pregunta}</p>}
      <p style={{ fontSize: 13, fontWeight: 700, color: C.textMuted, margin: 0 }}>
        {estilo === 'chips' ? 'Selecciona todas las palabras correctas.' : 'Marca todas las opciones correctas y luego verifica.'}
      </p>
      <div style={{ display: 'flex', flexDirection: estilo === 'chips' ? 'row' : 'column', flexWrap: estilo === 'chips' ? 'wrap' : 'nowrap', justifyContent: estilo === 'chips' ? 'center' : 'flex-start', gap: estilo === 'chips' ? 9 : 10 }}>
        {opciones.map((op, idx) => {
          const estado = estadoOpcion(idx)
          const ok = estado === 'ok'
          const bad = estado === 'no'
          const missed = estado === 'missed'
          const sel = estado === 'sel'
          const primaryLight = `${primaryColor}18`
          const bg = ok ? C.greenLight : bad ? C.redLight : missed ? '#FFF7ED' : sel ? primaryLight : '#fff'
          const border = ok ? C.green : bad ? C.red : missed ? '#F59E0B' : sel ? primaryColor : primaryLight
          const badgeBg = ok ? C.green : bad ? C.red : missed ? '#F59E0B' : sel ? primaryColor : primaryLight
          const badgeColor = ok || bad || missed || sel ? '#fff' : primaryColor
          if (estilo === 'chips') {
            const chipOk = serverMode ? ok : resultadosChip[idx] === 'ok'
            const chipWrong = serverMode ? bad : resultadosChip[idx] === 'no'
            const chipSelected = serverMode && sel
            return (
              <button key={idx} onClick={() => toggle(idx)} style={{
                padding: '8px 16px', borderRadius: 50,
                border: `2px solid ${chipOk ? C.green : chipWrong ? C.red : chipSelected ? primaryColor : `${primaryColor}55`}`,
                background: chipOk ? C.greenLight : chipWrong ? C.redLight : chipSelected ? `${primaryColor}22` : `${primaryColor}0f`,
                color: chipOk ? C.green : chipWrong ? C.red : primaryColor,
                cursor: isLocked ? 'default' : 'pointer', fontFamily: 'Nunito',
                fontSize: 13, fontWeight: 800, textTransform: 'uppercase',
                transition: 'all 0.15s', transform: chipOk && !isLocked ? 'translateY(-2px)' : 'none',
                boxShadow: chipOk && !isLocked ? `0 3px 10px ${C.green}25` : 'none',
              }}>
                {chipOk ? '✓ ' : chipWrong ? '✗ ' : ''}{op.texto}
              </button>
            )
          }
          return (
            <button
              key={idx}
              onClick={() => toggle(idx)}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 12,
                padding: '14px 16px',
                borderRadius: 14,
                border: `2px solid ${border}`,
                background: bg,
                cursor: isLocked ? 'default' : 'pointer',
                textAlign: 'left',
                fontFamily: 'Nunito',
                transition: 'all 0.15s',
                boxShadow: `0 2px 6px ${primaryColor}0f`,
              }}
            >
              <span style={{
                width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                background: badgeBg, color: badgeColor,
                fontWeight: 800, fontSize: 14, display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                marginTop: 1,
              }}>
                {ok ? '✓' : bad ? '✗' : missed ? '!' : String.fromCharCode(65 + idx)}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                  <span style={{ width: 14, height: 14, borderRadius: 3, border: `2px solid ${border}`, background: sel || ok ? border : '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 10, fontWeight: 900, flexShrink: 0 }}>
                    {sel || ok ? '✓' : ''}
                  </span>
                  <span style={{ fontSize: 16, fontWeight: 600, color: ok ? C.green : bad ? C.red : missed ? '#B45309' : C.text, lineHeight: 1.45 }}>
                    {op.texto}
                  </span>
                </span>
              </span>
            </button>
          )
        })}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {(serverMode || estilo !== 'chips') && !isLocked && <button onClick={verificar} disabled={seleccionadas.size === 0 || enviando} style={btnP(seleccionadas.size > 0 && !enviando ? primaryColor : C.border)}>{enviando ? 'Verificando…' : 'Verificar ✓'}</button>}
        {(serverMode || estilo !== 'chips') && resultado === 'wrong' && !isLocked && <button onClick={() => setResultado(null)} style={btnS}>↺ Revisar</button>}
        <AttemptsLeft restantes={restantes} max={maxIntentos} locked={isLocked} />
      </div>
      {resultado === 'correct' && <FeedbackBox ok msg={retroalimentacion || '✅ Seleccionaste todas las respuestas correctas.'} />}
      {resultado === 'wrong' && <FeedbackBox ok={false} msg={retroalimentacionError || '❌ Revisa todas las opciones correctas antes de volver a verificar.'} />}
      {resultado === 'agotado' && <FeedbackBox ok={false} msg="Intentos agotados. La actividad quedó registrada." />}
      {errorIntento && <div role="alert" style={{ color: C.red, fontSize: 13, fontWeight: 700 }}>{errorIntento}</div>}
    </div>
  )
}
