import { useEffect, useRef } from 'react'
import type { Trigger } from './types'
import { schedulerStep, type SchedState } from './schedulerCore'

// Fast tick so a cue fires within a few ms of the playhead crossing it. Each tick is
// just a clock read + a comparison, so this is cheap.
const TICK_MS = 15

export interface ShowEngineOpts {
  triggers: Trigger[]
  isPlaying: boolean
  armed: boolean
  position: () => number
  getEpoch: () => number
  dispatch: (t: Trigger) => void
}

/**
 * The show engine. While playing AND armed, it watches the master clock and fires each
 * cue as the playhead crosses its time — the "Tale of Two Clocks" idea, adapted for OSC
 * (which has no future-scheduling API, so we detect crossings on a fast tick instead of
 * pre-scheduling audio events).
 *
 * Correctness by construction:
 *  - only fires cues in (lastPos, pos] each tick → each cue fires exactly once, in order;
 *  - a position jump (seek/stop/load bumps engine.epoch) rebaselines WITHOUT firing, so
 *    scrubbing across cues never machine-guns them;
 *  - a paused/disarmed engine simply isn't ticking, so nothing fires.
 */
export function useShowEngine({
  triggers,
  isPlaying,
  armed,
  position,
  getEpoch,
  dispatch
}: ShowEngineOpts): void {
  const triggersRef = useRef(triggers)
  triggersRef.current = triggers
  const positionRef = useRef(position)
  positionRef.current = position
  const epochRef = useRef(getEpoch)
  epochRef.current = getEpoch
  const dispatchRef = useRef(dispatch)
  dispatchRef.current = dispatch

  const active = isPlaying && armed

  useEffect(() => {
    if (!active) return
    let state: SchedState = { lastPos: positionRef.current(), lastEpoch: epochRef.current() }

    const id = window.setInterval(() => {
      const { fire, next } = schedulerStep(
        state,
        positionRef.current(),
        epochRef.current(),
        triggersRef.current
      )
      for (const t of fire) dispatchRef.current(t)
      state = next
    }, TICK_MS)

    return () => window.clearInterval(id)
  }, [active])
}
