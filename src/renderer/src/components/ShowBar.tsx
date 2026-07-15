import { useEffect, useState } from 'react'
import type { Trigger } from '../show/types'
import { fmtTime } from './Transport'

/** Next upcoming cue after the playhead — self-updating so the bar doesn't re-render. */
function NextCue({
  triggers,
  getPos
}: {
  triggers: Trigger[]
  getPos: () => number
}): JSX.Element {
  const [txt, setTxt] = useState('—')
  useEffect(() => {
    let raf = 0
    let last = ''
    const loop = (): void => {
      const pos = getPos()
      let best: Trigger | null = null
      for (const t of triggers) {
        if (t.time > pos && (!best || t.time < best.time)) best = t
      }
      const s = best
        ? `${fmtTime(best.time)}  ${best.kind === 'clip' ? `L${best.layer}·${best.clip} ${best.label}` : `COL ${best.column}`}`
        : '—'
      if (s !== last) {
        last = s
        setTxt(s)
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [triggers, getPos])
  return <span className="next-cue">NEXT ▸ {txt}</span>
}

export default function ShowBar({
  armed,
  live,
  connected,
  triggers,
  getPos,
  onToggleArm,
  onPanic,
  onOperator
}: {
  armed: boolean
  live: boolean
  connected: boolean
  triggers: Trigger[]
  getPos: () => number
  onToggleArm: () => void
  onPanic: () => void
  onOperator: () => void
}): JSX.Element {
  return (
    <section className={`showbar ${armed ? 'armed' : ''} ${live ? 'live' : ''}`}>
      <span className="sb-label">SHOW ENGINE</span>
      <span className={`sb-state ${armed ? 'on' : ''}`}>
        <span className="sb-dot" />
        {armed ? (live ? 'LIVE · FIRING' : 'ARMED') : 'SAFE'}
      </span>
      {armed && !connected && <span className="sb-warn">no link — cues won't reach Arena</span>}
      <NextCue triggers={triggers} getPos={getPos} />
      <button className="sb-op" onClick={onOperator} title="Fullscreen operator mode">
        OPERATOR
      </button>
      <button
        className={`sb-arm ${armed ? 'on' : ''}`}
        onClick={onToggleArm}
        title="Arm the timeline to fire cues on playback"
      >
        {armed ? 'DISARM' : 'ARM'}
      </button>
      <button className="sb-panic" onClick={onPanic} title="Stop, disarm, and blackout">
        PANIC
      </button>
    </section>
  )
}
