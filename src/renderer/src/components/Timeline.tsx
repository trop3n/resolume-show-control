import { useEffect, useRef, useState } from 'react'
import type { LayerModel } from '../types'
import type { ShowApi } from '../show/useShow'
import type { ColumnTrigger, SnapRes, Trigger } from '../show/types'
import { snapTime, timeFromClientX } from '../show/snap'
import { dragState } from '../show/drag'
import Waveform from './Waveform'

interface SnapArgs {
  res: SnapRes
  bpm: number
  beatOffset: number
  duration: number
}

export default function Timeline({
  buffer,
  duration,
  bpm,
  beatOffset,
  getPos,
  onSeek,
  layers,
  show
}: {
  buffer: AudioBuffer | null
  duration: number
  bpm: number
  beatOffset: number
  getPos: () => number
  onSeek: (t: number) => void
  layers: LayerModel[]
  show: ShowApi
}): JSX.Element {
  const [snap, setSnap] = useState<SnapRes>('beat')
  const snapArgs: SnapArgs = { res: snap, bpm, beatOffset, duration }

  // live values for the persistent playhead loop
  const durationRef = useRef(duration)
  const getPosRef = useRef(getPos)
  durationRef.current = duration
  getPosRef.current = getPos

  const phRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let raf = 0
    const loop = (): void => {
      const el = phRef.current
      if (el) {
        const d = durationRef.current
        el.style.left = d > 0 ? `${(getPosRef.current() / d) * 100}%` : '0%'
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  // Delete / Backspace removes the selected trigger; Escape clears selection.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return
      if ((e.key === 'Delete' || e.key === 'Backspace') && show.selectedId) {
        e.preventDefault()
        show.remove(show.selectedId)
      } else if (e.key === 'Escape') {
        show.select(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [show])

  const lanes = layers.filter((l) => l.clips.some((c) => c.hasContent))

  if (duration <= 0) {
    return (
      <section className="timeline empty-tl">
        <div className="tl-placeholder">— load a song to build the show timeline —</div>
      </section>
    )
  }

  // bar ticks for the ruler
  const bars: { x: number; n: number }[] = []
  if (bpm > 0) {
    const bar = (60 / bpm) * 4
    for (let m = 0, t = beatOffset; t <= duration; m++, t = beatOffset + m * bar) {
      if (t >= 0) bars.push({ x: (t / duration) * 100, n: m + 1 })
    }
  }
  const labelEvery = bars.length > 64 ? 8 : bars.length > 32 ? 4 : 1

  return (
    <section className="timeline">
      <div className="tl-head">
        <span className="tl-title">TIMELINE</span>
        <span className="tl-snap">
          SNAP
          {(['off', 'beat', 'bar'] as SnapRes[]).map((r) => (
            <button
              key={r}
              className={`seg ${snap === r ? 'on' : ''}`}
              onClick={() => setSnap(r)}
            >
              {r.toUpperCase()}
            </button>
          ))}
        </span>
        <span className="tl-hint">drag clips onto a lane · double-click the COLUMNS lane · Del removes</span>
        <span className="tl-count">{show.triggers.length} CUES</span>
        <button className="seg danger" onClick={show.clear} disabled={show.triggers.length === 0}>
          CLEAR
        </button>
      </div>

      <div className="tl-scroll">
        {/* ruler */}
        <div className="tl-row ruler">
          <div className="tl-gutter">BARS</div>
          <div
            className="tl-track ruler-track"
            onClick={(e) => onSeek(timeFromClientX(e.clientX, e.currentTarget, duration))}
          >
            {bars.map((b) => (
              <div key={b.n} className="bar-tick" style={{ left: `${b.x}%` }}>
                {(b.n - 1) % labelEvery === 0 && <span className="bar-n">{b.n}</span>}
              </div>
            ))}
          </div>
        </div>

        {/* waveform — shares the exact time axis with the lanes below */}
        <div className="tl-row wave">
          <div className="tl-gutter">WAVE</div>
          <div className="tl-track">
            <Waveform
              buffer={buffer}
              duration={duration}
              bpm={bpm}
              beatOffset={beatOffset}
              getPos={getPos}
              onSeek={onSeek}
            />
          </div>
        </div>

        {/* one lane per layer with content */}
        {lanes.map((layer) => (
          <div className="tl-row lane" key={layer.index}>
            <div className="tl-gutter" title={layer.name}>
              <span className="g-num">L{layer.index}</span>
              <span className="g-name">{layer.name || '—'}</span>
            </div>
            <div
              className="tl-track lane-track"
              onClick={() => show.select(null)}
              onDragOver={(e) => {
                const d = dragState.clip
                if (d && d.layer === layer.index) {
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'copy'
                }
              }}
              onDrop={(e) => {
                const d = dragState.clip
                if (!d || d.layer !== layer.index || duration <= 0) return
                e.preventDefault()
                const t = snapTime(
                  timeFromClientX(e.clientX, e.currentTarget, duration),
                  snap,
                  bpm,
                  beatOffset,
                  duration
                )
                show.addClip(d.layer, d.clip, t, d.label)
              }}
            >
              {show.triggers
                .filter((t): t is Trigger => t.kind === 'clip' && t.layer === layer.index)
                .map((t) => (
                  <TriggerChip key={t.id} trig={t} show={show} snapArgs={snapArgs} />
                ))}
            </div>
          </div>
        ))}

        {/* columns lane */}
        <div className="tl-row lane cols">
          <div className="tl-gutter">
            <span className="g-num">▦</span>
            <span className="g-name">COLUMNS</span>
          </div>
          <div
            className="tl-track lane-track"
            onClick={() => show.select(null)}
            onDoubleClick={(e) => {
              if (duration <= 0) return
              const t = snapTime(
                timeFromClientX(e.clientX, e.currentTarget, duration),
                snap,
                bpm,
                beatOffset,
                duration
              )
              show.addColumn(t, 1)
            }}
          >
            {show.triggers
              .filter((t): t is Trigger => t.kind === 'column')
              .map((t) => (
                <TriggerChip key={t.id} trig={t} show={show} snapArgs={snapArgs} editableColumn />
              ))}
          </div>
        </div>
      </div>

      <div className="tl-playhead" ref={phRef}>
        <div className="ph-line" />
      </div>
    </section>
  )
}

function TriggerChip({
  trig,
  show,
  snapArgs,
  editableColumn
}: {
  trig: Trigger
  show: ShowApi
  snapArgs: SnapArgs
  editableColumn?: boolean
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const moving = useRef(false)
  const selected = show.selectedId === trig.id
  const left = snapArgs.duration > 0 ? (trig.time / snapArgs.duration) * 100 : 0
  const label = trig.kind === 'clip' ? `${trig.clip}·${trig.label}` : `COL ${(trig as ColumnTrigger).column}`

  return (
    <div
      ref={ref}
      className={`trig ${trig.kind} ${selected ? 'sel' : ''}`}
      style={{ left: `${left}%` }}
      title={label}
      onClick={(e) => {
        e.stopPropagation()
        show.select(trig.id)
      }}
      onPointerDown={(e) => {
        e.stopPropagation()
        show.select(trig.id)
        moving.current = true
        ref.current?.setPointerCapture(e.pointerId)
      }}
      onPointerMove={(e) => {
        if (!moving.current) return
        const lane = ref.current?.parentElement as HTMLElement | null
        if (!lane) return
        const t = snapTime(
          timeFromClientX(e.clientX, lane, snapArgs.duration),
          snapArgs.res,
          snapArgs.bpm,
          snapArgs.beatOffset,
          snapArgs.duration
        )
        show.move(trig.id, t)
      }}
      onPointerUp={(e) => {
        moving.current = false
        ref.current?.releasePointerCapture(e.pointerId)
      }}
    >
      <span className="trig-tick" />
      <span className="trig-label">{label}</span>
      {selected && editableColumn && trig.kind === 'column' && (
        <span className="trig-step">
          <button
            onClick={(e) => {
              e.stopPropagation()
              show.setColumn(trig.id, trig.column - 1)
            }}
          >
            −
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              show.setColumn(trig.id, trig.column + 1)
            }}
          >
            +
          </button>
        </span>
      )}
      {selected && (
        <button
          className="trig-x"
          onClick={(e) => {
            e.stopPropagation()
            show.remove(trig.id)
          }}
        >
          ×
        </button>
      )}
    </div>
  )
}
