import type { Trigger } from './types'

export interface SchedState {
  lastPos: number
  lastEpoch: number
}

/**
 * Pure per-tick step of the show engine — no timers, no React, no I/O, so it's fully
 * unit-testable. Given the previous state and the current clock reading, it returns the
 * cues that should fire now (in time order) and the next state.
 *
 * Rules:
 *  - epoch changed (seek/stop/load) → rebaseline, fire nothing (never machine-gun a scrub);
 *  - otherwise fire every cue in (lastPos, pos] → each cue fires once, in order;
 *  - pos not advancing (paused / rewound) → fire nothing.
 */
export function schedulerStep(
  state: SchedState,
  pos: number,
  epoch: number,
  triggers: Trigger[]
): { fire: Trigger[]; next: SchedState } {
  if (epoch !== state.lastEpoch) {
    return { fire: [], next: { lastPos: pos, lastEpoch: epoch } }
  }
  let fire: Trigger[] = []
  if (pos > state.lastPos) {
    const lo = state.lastPos
    fire = triggers.filter((t) => t.time > lo && t.time <= pos).sort((a, b) => a.time - b.time)
  }
  return { fire, next: { lastPos: pos, lastEpoch: epoch } }
}
