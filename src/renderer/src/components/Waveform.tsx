import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { computePeaks } from '../audio/peaks'

const WAVE_DIM = 'rgba(123,135,148,0.55)'
const WAVE_BRIGHT = '#22d3ee'
const GRID = 'rgba(34,211,238,0.13)'
const BAR = 'rgba(34,211,238,0.34)'
const PLAYHEAD = '#a5f3fc'
const BEATS_PER_BAR = 4

function renderBase(
  canvas: HTMLCanvasElement,
  peaks: { min: Float32Array; max: Float32Array; buckets: number },
  W: number,
  H: number,
  dpr: number,
  wave: string,
  duration: number,
  bpm: number,
  beatOffset: number
): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, W, H)

  // beat / bar grid behind the waveform
  if (bpm > 0 && duration > 0) {
    const beatDur = 60 / bpm
    const pxPerBeat = (beatDur / duration) * W
    const drawBeats = pxPerBeat >= 6
    const drawBars = pxPerBeat * BEATS_PER_BAR >= 5
    if (drawBars || drawBeats) {
      const iStart = Math.ceil((0 - beatOffset) / beatDur)
      const iEnd = Math.floor((duration - beatOffset) / beatDur)
      for (let i = iStart; i <= iEnd; i++) {
        const isBar = ((i % BEATS_PER_BAR) + BEATS_PER_BAR) % BEATS_PER_BAR === 0
        if (isBar ? !drawBars : !drawBeats) continue
        const x = Math.round(((beatOffset + i * beatDur) / duration) * W) + 0.5
        ctx.strokeStyle = isBar ? BAR : GRID
        ctx.lineWidth = isBar ? Math.max(1, dpr) : Math.max(1, dpr * 0.5)
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, H)
        ctx.stroke()
      }
    }
  }

  // waveform — one device-pixel column per bucket
  const mid = H / 2
  const amp = (H / 2) * 0.9
  ctx.fillStyle = wave
  for (let b = 0; b < peaks.buckets; b++) {
    const y1 = mid + peaks.min[b] * amp
    const y2 = mid + peaks.max[b] * amp
    ctx.fillRect(b, y1, 1, Math.max(1, y2 - y1))
  }
}

export default function Waveform({
  buffer,
  duration,
  bpm,
  beatOffset,
  getPos,
  onSeek
}: {
  buffer: AudioBuffer | null
  duration: number
  bpm: number
  beatOffset: number
  getPos: () => number
  onSeek: (t: number) => void
}): JSX.Element {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const baseDimRef = useRef<HTMLCanvasElement | null>(null)
  const baseBrightRef = useRef<HTMLCanvasElement | null>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const dprRef = useRef(1)

  // live values read by the persistent rAF loop, kept in refs to avoid restarting it
  const durationRef = useRef(duration)
  const getPosRef = useRef(getPos)
  durationRef.current = duration
  getPosRef.current = getPos

  const seekingRef = useRef(false)

  // track container size
  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight })
    })
    ro.observe(el)
    setSize({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  // (re)build peaks + cached base layers on song / size / tempo change
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || size.w === 0) return
    const dpr = window.devicePixelRatio || 1
    dprRef.current = dpr
    const W = Math.max(1, Math.floor(size.w * dpr))
    const H = Math.max(1, Math.floor(size.h * dpr))
    canvas.width = W
    canvas.height = H
    canvas.style.width = `${size.w}px`
    canvas.style.height = `${size.h}px`

    if (!buffer) {
      baseDimRef.current = null
      baseBrightRef.current = null
      const ctx = canvas.getContext('2d')
      ctx?.clearRect(0, 0, W, H)
      return
    }

    const peaks = computePeaks(buffer, W)
    const dim = document.createElement('canvas')
    dim.width = W
    dim.height = H
    const bright = document.createElement('canvas')
    bright.width = W
    bright.height = H
    renderBase(dim, peaks, W, H, dpr, WAVE_DIM, duration, bpm, beatOffset)
    renderBase(bright, peaks, W, H, dpr, WAVE_BRIGHT, duration, bpm, beatOffset)
    baseDimRef.current = dim
    baseBrightRef.current = bright
  }, [buffer, size.w, size.h, bpm, beatOffset, duration])

  // persistent playhead loop — composites cached bases + progress + playhead
  useEffect(() => {
    let raf = 0
    const loop = (): void => {
      const canvas = canvasRef.current
      const ctx = canvas?.getContext('2d')
      if (canvas && ctx) {
        const W = canvas.width
        const H = canvas.height
        ctx.clearRect(0, 0, W, H)
        const dim = baseDimRef.current
        const bright = baseBrightRef.current
        if (dim) ctx.drawImage(dim, 0, 0)
        const dur = durationRef.current
        const x = dur > 0 ? (getPosRef.current() / dur) * W : 0
        if (x > 0 && bright) {
          const sw = Math.max(1, Math.min(W, x))
          ctx.drawImage(bright, 0, 0, sw, H, 0, 0, sw, H)
        }
        if (dur > 0) {
          const dpr = dprRef.current
          ctx.fillStyle = PLAYHEAD
          ctx.fillRect(Math.max(0, x - dpr), 0, Math.max(2, dpr * 2), H)
        }
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  const doSeek = (clientX: number): void => {
    const canvas = canvasRef.current
    const dur = durationRef.current
    if (!canvas || dur <= 0) return
    const rect = canvas.getBoundingClientRect()
    const frac = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    onSeek(frac * dur)
  }

  return (
    <div className="waveform" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className="wave-canvas"
        onPointerDown={(e) => {
          seekingRef.current = true
          e.currentTarget.setPointerCapture(e.pointerId)
          doSeek(e.clientX)
        }}
        onPointerMove={(e) => {
          if (seekingRef.current) doSeek(e.clientX)
        }}
        onPointerUp={(e) => {
          seekingRef.current = false
          e.currentTarget.releasePointerCapture(e.pointerId)
        }}
      />
      {!buffer && <div className="wave-empty">— load a song to see the waveform —</div>}
    </div>
  )
}
