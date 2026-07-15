import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { computePeaks } from '../audio/peaks'

const WAVE_DIM = 'rgba(123,135,148,0.55)'
const WAVE_BRIGHT = '#22d3ee'

// Draws just the waveform (one device-px column per bucket). The beat/bar grid and the
// playhead are drawn by the Timeline as a single overlay spanning every lane, so they
// stay aligned with the cues by construction.
function renderWave(
  canvas: HTMLCanvasElement,
  peaks: { min: Float32Array; max: Float32Array; buckets: number },
  W: number,
  H: number,
  color: string
): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.clearRect(0, 0, W, H)
  const mid = H / 2
  const amp = (H / 2) * 0.9
  ctx.fillStyle = color
  for (let b = 0; b < peaks.buckets; b++) {
    const y1 = mid + peaks.min[b] * amp
    const y2 = mid + peaks.max[b] * amp
    ctx.fillRect(b, y1, 1, Math.max(1, y2 - y1))
  }
}

export default function Waveform({
  buffer,
  duration,
  getPos,
  onSeek
}: {
  buffer: AudioBuffer | null
  duration: number
  getPos: () => number
  onSeek: (t: number) => void
}): JSX.Element {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const baseDimRef = useRef<HTMLCanvasElement | null>(null)
  const baseBrightRef = useRef<HTMLCanvasElement | null>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })

  const durationRef = useRef(duration)
  const getPosRef = useRef(getPos)
  durationRef.current = duration
  getPosRef.current = getPos

  const seekingRef = useRef(false)

  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    setSize({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  // (re)build peaks + cached wave layers on song / size change (incl. zoom width change)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || size.w === 0) return
    const dpr = window.devicePixelRatio || 1
    // Clamp to stay under the browser's max canvas dimension (~32767px in Chromium).
    const W = Math.min(32000, Math.max(1, Math.floor(size.w * dpr)))
    const H = Math.max(1, Math.floor(size.h * dpr))
    canvas.width = W
    canvas.height = H
    canvas.style.width = `${size.w}px`
    canvas.style.height = `${size.h}px`

    if (!buffer) {
      baseDimRef.current = null
      baseBrightRef.current = null
      canvas.getContext('2d')?.clearRect(0, 0, W, H)
      return
    }

    const peaks = computePeaks(buffer, W)
    const dim = document.createElement('canvas')
    dim.width = W
    dim.height = H
    const bright = document.createElement('canvas')
    bright.width = W
    bright.height = H
    renderWave(dim, peaks, W, H, WAVE_DIM)
    renderWave(bright, peaks, W, H, WAVE_BRIGHT)
    baseDimRef.current = dim
    baseBrightRef.current = bright
  }, [buffer, size.w, size.h])

  // composite dim waveform + bright "played" portion up to the playhead
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
