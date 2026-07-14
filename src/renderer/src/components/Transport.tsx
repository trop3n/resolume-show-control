import { useEffect, useRef, useState } from 'react'
import type { TransportApi } from '../hooks/useTransport'

export function fmtTime(sec: number): string {
  if (!isFinite(sec) || sec < 0) sec = 0
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  const cs = Math.floor((sec * 100) % 100)
  return `${m}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`
}

/** Self-updating time readout — owns a rAF loop so it re-renders alone, not its parent. */
function TimeReadout({ getPos, duration }: { getPos: () => number; duration: number }): JSX.Element {
  const [txt, setTxt] = useState('0:00.00')
  useEffect(() => {
    let raf = 0
    let last = ''
    const loop = (): void => {
      const s = fmtTime(getPos())
      if (s !== last) {
        last = s
        setTxt(s)
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [getPos])
  return (
    <span className="tc">
      {txt}
      <span className="tc-dur"> / {fmtTime(duration)}</span>
    </span>
  )
}

export default function Transport({ t }: { t: TransportApi }): JSX.Element {
  const fileRef = useRef<HTMLInputElement>(null)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const playing = t.state === 'playing'

  const open = async (file: File | undefined): Promise<void> => {
    if (!file) return
    setLoadErr(null)
    try {
      await t.loadFile(file)
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : 'decode failed')
    }
  }

  return (
    <section
      className={`transport ${dragging ? 'drag' : ''}`}
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        void open(e.dataTransfer.files[0])
      }}
    >
      <div className="transport-controls">
        <button className="tbtn" title="Open song" onClick={() => fileRef.current?.click()}>
          OPEN
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="audio/*"
          hidden
          onChange={(e) => void open(e.target.files?.[0])}
        />
        <button
          className="tbtn stop"
          title="Stop (return to zero)"
          disabled={!t.hasSong}
          onClick={t.stop}
        >
          ■
        </button>
        <button
          className={`tbtn play ${playing ? 'on' : ''}`}
          title="Play / Pause (Space)"
          disabled={!t.hasSong}
          onClick={t.toggle}
        >
          {playing ? '❚❚' : '▶'}
        </button>

        <TimeReadout getPos={t.position} duration={t.duration} />

        <div className="bpmbox">
          <label className="lbl">BPM</label>
          <input
            className="num"
            type="number"
            min={40}
            max={300}
            step={0.1}
            value={t.bpm}
            onChange={(e) => {
              const v = parseFloat(e.target.value)
              if (!isNaN(v)) t.setBpm(v)
            }}
          />
          <button className="tbtn tap" title="Tap tempo" onClick={t.tap}>
            TAP
          </button>
        </div>

        <div className="bpmbox">
          <label className="lbl" title="Downbeat of bar 1 (seconds)">
            OFFSET
          </label>
          <input
            className="num"
            type="number"
            min={0}
            step={0.01}
            value={Number(t.beatOffset.toFixed(3))}
            onChange={(e) => {
              const v = parseFloat(e.target.value)
              if (!isNaN(v)) t.setBeatOffset(v)
            }}
          />
        </div>

        <div className="songname" title={t.songName ?? ''}>
          {loadErr ? <span className="songerr">load error: {loadErr}</span> : t.songName ?? 'no song loaded — OPEN or drop an audio file'}
        </div>
      </div>
    </section>
  )
}
