import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { LayerModel } from '../types'
import type { ShowApi } from '../show/useShow'
import type { ColumnTrigger, SnapRes, Trigger } from '../show/types'
import { snapTime, timeFromClientX } from '../show/snap'
import { dragState } from '../show/drag'
import Waveform from './Waveform'
import { fmtTime } from './Transport'

const GUTTER = 132 // must match --gutter in styles.css
const BEATS_PER_BAR = 4
const MAX_CONTENT = 12000 // px cap — keeps the waveform canvas under the browser limit

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
  show,
  firedIds,
  playing
}: {
  buffer: AudioBuffer | null
  duration: number
  bpm: number
  beatOffset: number
  getPos: () => number
  onSeek: (t: number) => void
  layers: LayerModel[]
  show: ShowApi
  firedIds: Set<string>
  playing: boolean
}): JSX.Element {
  const [snap, setSnap] = useState<SnapRes>('beat')
  const [zoom, setZoom] = useState(1)
  const [viewportW, setViewportW] = useState(0)
  const snapArgs: SnapArgs = { res: snap, bpm, beatOffset, duration }

  const scrollRef = useRef<HTMLDivElement>(null)
  const phRef = useRef<HTMLDivElement>(null)

  // available track width (excludes the sticky gutter); content width scales with zoom
  const availW = Math.max(200, viewportW - GUTTER)
  const contentPx = Math.min(MAX_CONTENT, Math.round(availW * zoom))
  const atMaxZoom = contentPx >= MAX_CONTENT

  const durationRef = useRef(duration)
  const getPosRef = useRef(getPos)
  const contentRef = useRef(contentPx)
  const playingRef = useRef(playing)
  durationRef.current = duration
  getPosRef.current = getPos
  contentRef.current = contentPx
  playingRef.current = playing

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setViewportW(el.clientWidth))
    ro.observe(el)
    setViewportW(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  // playhead lives inside the scrolled content, positioned in px; while playing zoomed
  // in, keep it in view (page-scroll when it drifts outside the middle 80%)
  useEffect(() => {
    let raf = 0
    const loop = (): void => {
      const d = durationRef.current
      const content = contentRef.current
      const frac = d > 0 ? getPosRef.current() / d : 0
      const el = phRef.current
      if (el) el.style.transform = `translateX(${GUTTER + frac * content}px)`

      const scroll = scrollRef.current
      if (playingRef.current && scroll) {
        const viewTrackW = scroll.clientWidth - GUTTER
        if (content > viewTrackW) {
          const p = frac * content
          const left = scroll.scrollLeft
          if (p < left + viewTrackW * 0.1 || p > left + viewTrackW * 0.9) {
            scroll.scrollLeft = Math.max(0, Math.min(content - viewTrackW, p - viewTrackW * 0.5))
          }
        }
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  // Selected cue: Del/Backspace removes, Esc deselects, ←/→ nudge by a beat (Shift = bar).
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return
      if ((e.key === 'Delete' || e.key === 'Backspace') && show.selectedId) {
        e.preventDefault()
        show.remove(show.selectedId)
      } else if (e.key === 'Escape') {
        show.select(null)
      } else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && show.selectedId) {
        const trig = show.triggers.find((t) => t.id === show.selectedId)
        if (!trig) return
        e.preventDefault()
        const beat = bpm > 0 ? 60 / bpm : 0.1
        const step = (e.shiftKey ? beat * BEATS_PER_BAR : beat) * (e.key === 'ArrowLeft' ? -1 : 1)
        show.move(trig.id, Math.max(0, Math.min(duration, trig.time + step)))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [show, bpm, duration])

  const lanes = layers.filter((l) => l.clips.some((c) => c.hasContent))

  const fit = (): void => {
    setZoom(1)
    scrollRef.current?.scrollTo({ left: 0 })
  }
  const zoomIn = (): void => setZoom((z) => Math.min(64, z * 1.6))
  const zoomOut = (): void => setZoom((z) => Math.max(1, z / 1.6))

  if (duration <= 0) {
    return (
      <section className="timeline empty-tl">
        <div className="tl-placeholder">— load a song to build the show timeline —</div>
      </section>
    )
  }

  // grid geometry
  const beatDur = bpm > 0 ? 60 / bpm : 0
  const barDur = beatDur * BEATS_PER_BAR
  const pxPerBeat = beatDur > 0 ? contentPx * (beatDur / duration) : 0
  const pxPerBar = pxPerBeat * BEATS_PER_BAR
  const showBeats = pxPerBeat >= 9
  const labelEvery = pxPerBar >= 44 ? 1 : pxPerBar >= 22 ? 2 : pxPerBar >= 11 ? 4 : 8

  const bars: { x: number; n: number }[] = []
  const beats: number[] = []
  if (beatDur > 0) {
    const iStart = Math.ceil((0 - beatOffset) / beatDur)
    const iEnd = Math.floor((duration - beatOffset) / beatDur)
    for (let i = iStart; i <= iEnd; i++) {
      const t = beatOffset + i * beatDur
      if (t < 0) continue
      const x = (t / duration) * 100
      const isBar = ((i % BEATS_PER_BAR) + BEATS_PER_BAR) % BEATS_PER_BAR === 0
      if (isBar) bars.push({ x, n: Math.round(i / BEATS_PER_BAR) + 1 })
      else if (showBeats) beats.push(x)
    }
  }

  const cssVars = { ['--content' as string]: `${contentPx}px` }

  const selected = show.selectedId
    ? show.triggers.find((t) => t.id === show.selectedId)
    : undefined
  const selLabel = selected
    ? `${selected.kind === 'clip' ? `L${selected.layer}·${selected.clip}` : `COL ${selected.column}`} @ ${fmtTime(selected.time)}`
    : null

  return (
    <section className="timeline">
      <div className="tl-head">
        <span className="tl-title">TIMELINE</span>
        <span className="tl-snap">
          SNAP
          {(['off', 'beat', 'bar'] as SnapRes[]).map((r) => (
            <button key={r} className={`seg ${snap === r ? 'on' : ''}`} onClick={() => setSnap(r)}>
              {r.toUpperCase()}
            </button>
          ))}
        </span>
        <span className="tl-zoom">
          ZOOM
          <button className="seg" onClick={zoomOut} disabled={zoom <= 1} title="Zoom out">
            −
          </button>
          <button className="seg" onClick={fit} title="Fit whole song">
            {zoom <= 1 ? 'FIT' : `${zoom.toFixed(1)}×`}
          </button>
          <button className="seg" onClick={zoomIn} disabled={atMaxZoom} title="Zoom in">
            +
          </button>
        </span>
        {selLabel ? (
          <span className="tl-sel">SEL {selLabel} · ←/→ nudge</span>
        ) : (
          <span className="tl-hint">drag clips onto a lane · double-click COLUMNS · Del removes</span>
        )}
        <span className="tl-count">{show.triggers.length} CUES</span>
        <button className="seg danger" onClick={show.clear} disabled={show.triggers.length === 0}>
          CLEAR
        </button>
      </div>

      <div className="tl-scroll" ref={scrollRef}>
        <div className="tl-inner" style={cssVars}>
          {/* ruler — numbers only; the lines come from the grid overlay */}
          <div className="tl-row ruler">
            <div className="tl-gutter">BARS</div>
            <div
              className="tl-track ruler-track"
              onClick={(e) => onSeek(timeFromClientX(e.clientX, e.currentTarget, duration))}
            >
              {bars.map(
                (b) =>
                  (b.n - 1) % labelEvery === 0 && (
                    <span key={b.n} className="bar-n" style={{ left: `${b.x}%` }}>
                      {b.n}
                    </span>
                  )
              )}
            </div>
          </div>

          {/* waveform — shares the exact time axis with the lanes below */}
          <div className="tl-row wave">
            <div className="tl-gutter">WAVE</div>
            <div className="tl-track">
              <Waveform buffer={buffer} duration={duration} getPos={getPos} onSeek={onSeek} />
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
                    <TriggerChip
                      key={t.id}
                      trig={t}
                      show={show}
                      snapArgs={snapArgs}
                      fired={firedIds.has(t.id)}
                    />
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
                  <TriggerChip
                    key={t.id}
                    trig={t}
                    show={show}
                    snapArgs={snapArgs}
                    fired={firedIds.has(t.id)}
                    editableColumn
                  />
                ))}
            </div>
          </div>

          {/* grid overlay + playhead — span every row, aligned to the same axis */}
          <div className="tl-grid">
            {beats.map((x, i) => (
              <div key={`bt${i}`} className="gl beat" style={{ left: `${x}%` }} />
            ))}
            {bars.map((b) => (
              <div key={`br${b.n}`} className="gl bar" style={{ left: `${b.x}%` }} />
            ))}
          </div>
          <div className="tl-playhead" ref={phRef}>
            <div className="ph-line" />
          </div>
        </div>
      </div>
    </section>
  )
}

function TriggerChip({
  trig,
  show,
  snapArgs,
  fired,
  editableColumn
}: {
  trig: Trigger
  show: ShowApi
  snapArgs: SnapArgs
  fired?: boolean
  editableColumn?: boolean
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const moving = useRef(false)
  const selected = show.selectedId === trig.id
  const left = snapArgs.duration > 0 ? (trig.time / snapArgs.duration) * 100 : 0
  const label =
    trig.kind === 'clip' ? `${trig.clip}·${trig.label}` : `COL ${(trig as ColumnTrigger).column}`

  return (
    <div
      ref={ref}
      className={`trig ${trig.kind} ${selected ? 'sel' : ''} ${fired ? 'fired' : ''}`}
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
