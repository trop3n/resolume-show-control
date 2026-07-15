// Pure unit tests for the show engine's crossing-detection scheduler.
// Run with:  npm test   (Node 22+ strips the TS types)
import { schedulerStep, type SchedState } from '../src/renderer/src/show/schedulerCore.ts'
import type { Trigger } from '../src/renderer/src/show/types.ts'

let pass = 0
let fail = 0
function assert(cond: boolean, msg: string): void {
  if (cond) {
    pass++
  } else {
    fail++
    console.error('  ✗ ' + msg)
  }
}

const clip = (id: string, time: number): Trigger => ({
  id,
  kind: 'clip',
  time,
  layer: 1,
  clip: 1,
  label: id
})

/** Drive the scheduler across a sequence of (pos, epoch) ticks, collecting fired ids. */
function run(triggers: Trigger[], ticks: Array<[number, number]>, start: SchedState): string[] {
  let state = start
  const fired: string[] = []
  for (const [pos, epoch] of ticks) {
    const r = schedulerStep(state, pos, epoch, triggers)
    for (const t of r.fire) fired.push(t.id)
    state = r.next
  }
  return fired
}

// 1. Each cue fires once, in order, as the playhead crosses it.
{
  const tr = [clip('a', 1), clip('b', 2), clip('c', 3)]
  const fired = run(
    tr,
    [
      [0, 0],
      [0.5, 0],
      [1.0, 0],
      [1.5, 0],
      [2.0, 0],
      [2.9, 0],
      [3.0, 0],
      [3.5, 0]
    ],
    { lastPos: 0, lastEpoch: 0 }
  )
  assert(JSON.stringify(fired) === JSON.stringify(['a', 'b', 'c']), `crossing order: got ${fired}`)
}

// 2. No double-fire when the playhead sits still or ticks past a cue repeatedly.
{
  const tr = [clip('a', 1)]
  const fired = run(
    tr,
    [
      [0.9, 0],
      [1.0, 0],
      [1.0, 0],
      [1.1, 0],
      [1.2, 0]
    ],
    { lastPos: 0, lastEpoch: 0 }
  )
  assert(fired.length === 1 && fired[0] === 'a', `fire-once: got ${fired}`)
}

// 3. Seek FORWARD (epoch bump) must NOT machine-gun every skipped cue.
{
  const tr = [clip('a', 1), clip('b', 2), clip('c', 3), clip('d', 4)]
  const fired = run(
    tr,
    [
      [0.5, 0],
      [1.0, 0], // fires a
      [3.5, 1], // SEEK: epoch changed → rebaseline, fire nothing
      [3.6, 1],
      [4.0, 1] // fires d only
    ],
    { lastPos: 0, lastEpoch: 0 }
  )
  assert(
    JSON.stringify(fired) === JSON.stringify(['a', 'd']),
    `no machine-gun on forward seek: got ${fired}`
  )
}

// 4. Seek BACKWARD (epoch bump) fires nothing on the jump, then re-fires as re-crossed.
{
  const tr = [clip('a', 1), clip('b', 2)]
  const fired = run(
    tr,
    [
      [1.5, 0], // fires a
      [2.5, 0], // fires b
      [0.0, 1], // SEEK back to start: rebaseline, no fire
      [1.2, 1], // re-crosses a
      [2.2, 1] // re-crosses b
    ],
    { lastPos: 0, lastEpoch: 0 }
  )
  assert(
    JSON.stringify(fired) === JSON.stringify(['a', 'b', 'a', 'b']),
    `backward seek then replay: got ${fired}`
  )
}

// 5. Two cues inside one tick window fire in TIME order regardless of array order.
{
  const tr = [clip('late', 1.1), clip('early', 1.05)]
  const fired = run(tr, [[1.0, 0], [1.2, 0]], { lastPos: 0, lastEpoch: 0 })
  assert(
    JSON.stringify(fired) === JSON.stringify(['early', 'late']),
    `in-window ordering: got ${fired}`
  )
}

// 6. Coincident cues (same time) both fire.
{
  const tr = [clip('x', 2), clip('y', 2)]
  const fired = run(tr, [[1.9, 0], [2.05, 0]], { lastPos: 0, lastEpoch: 0 })
  assert(fired.length === 2 && fired.includes('x') && fired.includes('y'), `coincident: got ${fired}`)
}

// 7. A cue exactly at the starting baseline does NOT fire (half-open interval).
{
  const tr = [clip('at0', 0)]
  const fired = run(tr, [[0.0, 0], [0.5, 0]], { lastPos: 0, lastEpoch: 0 })
  assert(fired.length === 0, `cue at baseline not fired: got ${fired}`)
}

// 8. Arming mid-song (baseline at current pos) does not retro-fire earlier cues.
{
  const tr = [clip('early', 1), clip('later', 5)]
  const fired = run(tr, [[3.2, 0], [5.1, 0]], { lastPos: 3, lastEpoch: 0 })
  assert(
    JSON.stringify(fired) === JSON.stringify(['later']),
    `arm mid-song no retro-fire: got ${fired}`
  )
}

console.log(`scheduler core: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
