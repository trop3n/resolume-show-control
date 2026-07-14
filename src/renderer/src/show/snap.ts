import type { SnapRes } from './types'

/** Snap a time (s) to the nearest beat or bar, anchored on the downbeat (beatOffset). */
export function snapTime(
  t: number,
  res: SnapRes,
  bpm: number,
  beatOffset: number,
  duration: number
): number {
  const clamp = (v: number): number => Math.max(0, Math.min(v, duration))
  if (res === 'off' || bpm <= 0) return clamp(t)
  const beat = 60 / bpm
  const step = res === 'bar' ? beat * 4 : beat
  return clamp(beatOffset + Math.round((t - beatOffset) / step) * step)
}

/** Time (s) at a client X coordinate within a track element that spans [0, duration]. */
export function timeFromClientX(clientX: number, el: HTMLElement, duration: number): number {
  const r = el.getBoundingClientRect()
  if (r.width <= 0) return 0
  const frac = Math.max(0, Math.min(1, (clientX - r.left) / r.width))
  return frac * duration
}
