import { useEffect, useMemo, useRef } from 'react'
import type { TransportApi } from '../hooks/useTransport'
import type { ShowApi } from '../show/useShow'
import type { Trigger } from '../show/types'
import { fmtTime } from './Transport'

function cueLabel(t: Trigger): string {
  return t.kind === 'clip' ? `L${t.layer}·${t.clip}   ${t.label}` : `COLUMN ${t.column}`
}

/**
 * Fullscreen live-performance view. Monitoring + master control only — the show engine
 * keeps running behind this overlay, so cues still fire. Smooth values (timecode,
 * countdown, progress) are written to the DOM imperatively from one rAF loop so the
 * panel never re-renders per frame.
 */
export default function OperatorView({
  t,
  show,
  armed,
  live,
  connected,
  lastFired,
  onToggleArm,
  onPanic,
  onExit
}: {
  t: TransportApi
  show: ShowApi
  armed: boolean
  live: boolean
  connected: boolean
  lastFired: string | null
  onToggleArm: () => void
  onPanic: () => void
  onExit: () => void
}): JSX.Element {
  const sorted = useMemo(
    () => [...show.triggers].sort((a, b) => a.time - b.time),
    [show.triggers]
  )
  const sortedRef = useRef(sorted)
  sortedRef.current = sorted

  const durationRef = useRef(t.duration)
  const getPosRef = useRef(t.position)
  durationRef.current = t.duration
  getPosRef.current = t.position

  const tcRef = useRef<HTMLSpanElement>(null)
  const cdRef = useRef<HTMLDivElement>(null)
  const nextRef = useRef<HTMLDivElement>(null)
  const fillRef = useRef<HTMLDivElement>(null)
  const phRef = useRef<HTMLDivElement>(null)
  const lastNext = useRef<string | null>(null)

  useEffect(() => {
    let raf = 0
    const loop = (): void => {
      const pos = getPosRef.current()
      const dur = durationRef.current
      const frac = dur > 0 ? Math.min(1, pos / dur) : 0

      if (tcRef.current) tcRef.current.textContent = `${fmtTime(pos)} / ${fmtTime(dur)}`
      if (fillRef.current) fillRef.current.style.width = `${frac * 100}%`
      if (phRef.current) phRef.current.style.left = `${frac * 100}%`

      let next: Trigger | undefined
      for (const c of sortedRef.current) {
        if (c.time > pos) {
          next = c
          break
        }
      }
      const id = next ? next.id : null
      if (id !== lastNext.current) {
        lastNext.current = id
        if (nextRef.current) nextRef.current.textContent = next ? cueLabel(next) : 'END OF SHOW'
      }
      if (cdRef.current) {
        const secs = next ? next.time - pos : -1
        cdRef.current.textContent = next ? `IN ${secs.toFixed(1)}s` : '—'
        cdRef.current.classList.toggle('imminent', secs >= 0 && secs < 2)
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  // Escape exits operator mode.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onExit()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onExit])

  const playing = t.state === 'playing'
  const stateText = armed ? (live ? 'LIVE' : 'ARMED') : 'SAFE'

  return (
    <div className={`operator ${armed ? 'armed' : ''}`}>
      <header className="op-head">
        <span className="op-brand">
          RESOLUME<span>· OPERATOR</span>
        </span>
        <span className={`op-state ${armed ? (live ? 'live' : 'armed') : 'safe'}`}>
          <span className="op-state-dot" />
          {stateText}
        </span>
        <button className="op-exit" onClick={onExit}>
          EXIT ✕
        </button>
      </header>

      <div className="op-body">
        <div className="op-next-lbl">NEXT CUE</div>
        <div className="op-cd" ref={cdRef}>
          —
        </div>
        <div className="op-next-name" ref={nextRef}>
          {sorted.length === 0 ? 'NO CUES' : '—'}
        </div>

        <div className="op-progress">
          <div className="op-fill" ref={fillRef} />
          {t.duration > 0 &&
            sorted.map((c) => (
              <div
                key={c.id}
                className={`op-tick ${c.kind}`}
                style={{ left: `${(c.time / t.duration) * 100}%` }}
              />
            ))}
          <div className="op-ph" ref={phRef} />
        </div>
        <div className="op-tc">
          <span ref={tcRef}>0:00.00 / 0:00.00</span>
        </div>
      </div>

      <div className="op-controls">
        <button className="op-btn play" onClick={t.toggle} disabled={!t.hasSong}>
          {playing ? '❚❚ PAUSE' : '▶ PLAY'}
        </button>
        <button className="op-btn stop" onClick={t.stop} disabled={!t.hasSong}>
          ■ STOP
        </button>
        <button className={`op-btn arm ${armed ? 'on' : ''}`} onClick={onToggleArm}>
          {armed ? 'DISARM' : 'ARM'}
        </button>
        <button className="op-btn panic" onClick={onPanic}>
          PANIC
        </button>
      </div>

      <footer className="op-foot">
        <span className="op-foot-lbl">LAST FIRED</span>
        <span className="op-foot-val">{lastFired ?? '—'}</span>
        {!connected && <span className="op-nolink">● NO LINK</span>}
      </footer>
    </div>
  )
}
