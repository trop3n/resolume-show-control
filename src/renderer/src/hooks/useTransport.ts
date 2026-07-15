import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { engine, type TransportState } from '../audio/engine'

export interface TransportApi {
  state: TransportState
  hasSong: boolean
  duration: number
  buffer: AudioBuffer | null
  songName: string | null
  bpm: number
  beatOffset: number
  position: () => number
  getEpoch: () => number
  setBpm: (n: number) => void
  setBeatOffset: (n: number) => void
  tap: () => void
  loadFile: (file: File) => Promise<void>
  loadData: (data: ArrayBuffer, name: string) => Promise<void>
  unload: () => void
  play: () => void
  pause: () => void
  toggle: () => void
  stop: () => void
  seek: (t: number) => void
}

const MAX_TAPS = 6
const TAP_RESET_MS = 2000

export function useTransport(): TransportApi {
  const [, force] = useReducer((n: number) => n + 1, 0)
  useEffect(() => engine.subscribe(force), [])

  const [buffer, setBuffer] = useState<AudioBuffer | null>(null)
  const [songName, setSongName] = useState<string | null>(null)
  const [bpm, setBpm] = useState(120)
  const [beatOffset, setBeatOffset] = useState(0)

  const loadData = useCallback(async (data: ArrayBuffer, name: string) => {
    const buf = await engine.load(data)
    setBuffer(buf)
    setSongName(name)
  }, [])

  const loadFile = useCallback(
    async (file: File) => {
      await loadData(await file.arrayBuffer(), file.name)
    },
    [loadData]
  )

  const unload = useCallback(() => {
    engine.unload()
    setBuffer(null)
    setSongName(null)
  }, [])

  const taps = useRef<number[]>([])
  const tap = useCallback(() => {
    const now = performance.now()
    const arr = taps.current
    if (arr.length && now - arr[arr.length - 1] > TAP_RESET_MS) arr.length = 0
    arr.push(now)
    if (arr.length > MAX_TAPS) arr.shift()
    if (arr.length >= 2) {
      let sum = 0
      for (let i = 1; i < arr.length; i++) sum += arr[i] - arr[i - 1]
      const avg = sum / (arr.length - 1)
      const next = Math.round((60000 / avg) * 10) / 10
      if (next >= 40 && next <= 300) setBpm(next)
    }
  }, [])

  const position = useCallback(() => engine.position(), [])
  const getEpoch = useCallback(() => engine.epoch, [])
  const play = useCallback(() => engine.play(), [])
  const pause = useCallback(() => engine.pause(), [])
  const toggle = useCallback(() => engine.toggle(), [])
  const stop = useCallback(() => engine.stop(), [])
  const seek = useCallback((t: number) => engine.seek(t), [])

  return {
    state: engine.state,
    hasSong: engine.hasSong,
    duration: engine.duration,
    buffer,
    songName,
    bpm,
    beatOffset,
    position,
    getEpoch,
    setBpm,
    setBeatOffset,
    tap,
    loadFile,
    loadData,
    unload,
    play,
    pause,
    toggle,
    stop,
    seek
  }
}
