// Web Audio transport — the master clock the whole show schedules against.
// Position is derived from AudioContext.currentTime (sample-accurate), never from a
// setInterval/Date counter. M3's look-ahead scheduler will read the same clock.

export type TransportState = 'stopped' | 'playing'
type Listener = () => void

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

class AudioEngine {
  private ctx: AudioContext | null = null
  private gain: GainNode | null = null
  private buffer: AudioBuffer | null = null
  private source: AudioBufferSourceNode | null = null

  private startedAtCtx = 0 // ctx.currentTime when the current source started
  private startOffset = 0 // buffer offset (s) at that moment; == position while stopped
  private _state: TransportState = 'stopped'
  private stoppingManually = false // lets onended tell manual stop from natural end
  private _epoch = 0 // bumped on any position discontinuity (seek/stop/load)

  private listeners = new Set<Listener>()

  /** Lazily create the context on first use so it's tied to a user gesture. */
  private ensure(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext()
      this.gain = this.ctx.createGain()
      this.gain.connect(this.ctx.destination)
    }
    return this.ctx
  }

  /** Notified on discrete transitions only (play/pause/stop/load/end) — never per frame. */
  subscribe(l: Listener): () => void {
    this.listeners.add(l)
    return () => {
      this.listeners.delete(l)
    }
  }
  private emit(): void {
    this.listeners.forEach((l) => l())
  }

  get state(): TransportState {
    return this._state
  }
  get hasSong(): boolean {
    return !!this.buffer
  }
  get audioBuffer(): AudioBuffer | null {
    return this.buffer
  }
  get duration(): number {
    return this.buffer?.duration ?? 0
  }
  get context(): AudioContext | null {
    return this.ctx
  }
  /** Increments whenever the playhead jumps (seek/stop/load). The scheduler watches
   *  this to rebaseline instead of firing every cue it "crossed" during a jump. */
  get epoch(): number {
    return this._epoch
  }

  async load(data: ArrayBuffer): Promise<AudioBuffer> {
    const ctx = this.ensure()
    const buf = await ctx.decodeAudioData(data)
    this.hardStop()
    this.buffer = buf
    this.startOffset = 0
    this._state = 'stopped'
    this._epoch++
    this.emit()
    return buf
  }

  /** Clear the loaded song entirely (used by "new show"). */
  unload(): void {
    this.hardStop()
    this.buffer = null
    this.startOffset = 0
    this._state = 'stopped'
    this._epoch++
    this.emit()
  }

  /** Current playback position in seconds — read this imperatively from a rAF loop. */
  position(): number {
    if (!this.buffer) return 0
    if (this._state === 'playing' && this.ctx) {
      const p = this.startOffset + (this.ctx.currentTime - this.startedAtCtx)
      return p >= this.buffer.duration ? this.buffer.duration : p
    }
    return this.startOffset
  }

  private hardStop(): void {
    if (this.source) {
      this.stoppingManually = true
      try {
        this.source.stop()
      } catch {
        /* already stopped */
      }
      this.source.disconnect()
      this.source = null
      this.stoppingManually = false
    }
  }

  private startSource(offset: number): void {
    const ctx = this.ensure()
    void ctx.resume()
    const src = ctx.createBufferSource()
    src.buffer = this.buffer!
    src.connect(this.gain!)
    src.onended = (): void => {
      if (this.stoppingManually) return // manual stop/seek — ignore
      this.source = null
      this.startOffset = this.buffer ? this.buffer.duration : 0
      this._state = 'stopped'
      this.emit()
    }
    src.start(0, offset)
    this.source = src
    this.startedAtCtx = ctx.currentTime
    this.startOffset = offset
    this._state = 'playing'
  }

  play(): void {
    if (!this.buffer || this._state === 'playing') return
    let offset = this.startOffset
    if (offset >= this.buffer.duration - 0.02) offset = 0 // restart if parked at the end
    this.startSource(offset)
    this.emit()
  }

  /** Pause and hold position. */
  pause(): void {
    if (this._state !== 'playing') return
    const pos = this.position()
    this.hardStop()
    this.startOffset = pos
    this._state = 'stopped'
    this.emit()
  }

  toggle(): void {
    if (this._state === 'playing') this.pause()
    else this.play()
  }

  /** Stop and return to zero. */
  stop(): void {
    this.hardStop()
    this.startOffset = 0
    this._state = 'stopped'
    this._epoch++
    this.emit()
  }

  /** Seek without changing play/pause state. No emit — position is read via rAF. */
  seek(t: number): void {
    if (!this.buffer) return
    const c = clamp(t, 0, this.buffer.duration)
    if (this._state === 'playing') {
      this.hardStop()
      this.startSource(c)
    } else {
      this.startOffset = c
    }
    this._epoch++
  }
}

export const engine = new AudioEngine()
