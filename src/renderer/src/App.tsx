import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CompositionModel } from './types'
import type { Trigger } from './show/types'
import { useTransport } from './hooks/useTransport'
import { useShow } from './show/useShow'
import { useShowEngine } from './show/useShowEngine'
import { useSongBank } from './persist/useSongBank'
import Transport, { fmtTime } from './components/Transport'
import ShowBar from './components/ShowBar'
import Timeline from './components/Timeline'
import ClipGrid from './components/ClipGrid'
import SongBank from './components/SongBank'
import OperatorView from './components/OperatorView'

const DEFAULT_HOST = '172.16.8.27'

export default function App(): JSX.Element {
  const [host, setHost] = useState(DEFAULT_HOST)
  const [comp, setComp] = useState<CompositionModel | null>(null)
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [booting, setBooting] = useState(true)
  const [lastFired, setLastFired] = useState<string | null>(null)
  const [armed, setArmed] = useState(false)
  const [firedIds, setFiredIds] = useState<Set<string>>(() => new Set())
  const [bankOpen, setBankOpen] = useState(false)
  const [operator, setOperator] = useState(false)
  // Fire all cues this many ms early to compensate for output latency. Persisted per
  // install (a rig property, not per-show); positive = fire earlier.
  const [latencyMs, setLatencyMs] = useState<number>(() => {
    const v = Number(localStorage.getItem('rsc.latencyMs'))
    return Number.isFinite(v) ? v : 0
  })
  const changeLatency = useCallback((ms: number) => {
    const v = Math.max(-500, Math.min(1000, Math.round(ms)))
    setLatencyMs(v)
    try {
      localStorage.setItem('rsc.latencyMs', String(v))
    } catch {
      /* ignore */
    }
  }, [])

  const t = useTransport()
  const show = useShow()
  const bank = useSongBank(t, show)

  const connect = useCallback(async (h: string) => {
    setError(null)
    try {
      const model = await window.api.connect(h)
      setComp(model)
      setConnected(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setConnected(false)
    }
  }, [])

  // Live mirror: Arena pushes composition snapshots over the WebSocket.
  useEffect(() => {
    const offState = window.api.onState((m) => setComp(m))
    const offStatus = window.api.onStatus((s) => setConnected(s.connected))
    return () => {
      offState()
      offStatus()
    }
  }, [])

  useEffect(() => {
    connect(DEFAULT_HOST)
    const timer = window.setTimeout(() => setBooting(false), 1500)
    return () => window.clearTimeout(timer)
  }, [connect])

  // Global keys: Space toggles transport, Ctrl/Cmd-S saves the show.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const el = e.target as HTMLElement | null
      const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')
      if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault()
        void bank.save()
      } else if (e.code === 'Space' && !typing) {
        e.preventDefault()
        t.toggle()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [t, bank])

  // brief green flash on a cue chip when it fires
  const pulse = useCallback((id: string) => {
    setFiredIds((s) => new Set(s).add(id))
    window.setTimeout(() => {
      setFiredIds((s) => {
        const n = new Set(s)
        n.delete(id)
        return n
      })
    }, 260)
  }, [])

  // Manual fire from the clip grid — always live: it's an explicit operator action,
  // not gated by ARM (ARM only gates the automated timeline).
  const fire = useCallback(async (layer: number, clip: number, name: string) => {
    console.log(`[fire] manual → L${layer}/${clip} "${name}"`)
    await window.api.fireClip(layer, clip)
    setLastFired(`L${layer}·${clip} ${name}`.trim())
  }, [])

  // Automated dispatch from the show engine.
  const dispatch = useCallback(
    (trig: Trigger) => {
      if (trig.kind === 'clip') {
        console.log(`[fire] cue → L${trig.layer}/${trig.clip} "${trig.label}" @ ${trig.time.toFixed(2)}s`)
        window.api.fireClip(trig.layer, trig.clip)
        setLastFired(`▸ L${trig.layer}·${trig.clip} ${trig.label}`.trim())
      } else {
        console.log(`[fire] cue → column ${trig.column} @ ${trig.time.toFixed(2)}s`)
        window.api.fireColumn(trig.column)
        setLastFired(`▸ COL ${trig.column}`)
      }
      pulse(trig.id)
    },
    [pulse]
  )

  useShowEngine({
    triggers: show.triggers,
    isPlaying: t.state === 'playing',
    armed,
    latencyMs,
    position: t.position,
    getEpoch: t.getEpoch,
    dispatch
  })

  // PANIC: halt the transport + disarm (guarantees no further cue fires), then a
  // best-effort blackout of the wall.
  const panic = useCallback(() => {
    t.stop()
    setArmed(false)
    window.api.disconnectAll()
    setLastFired('■ PANIC · disconnect all')
  }, [t])

  const totals = useMemo(() => {
    if (!comp) return { layers: 0, clips: 0 }
    return {
      layers: comp.layers.length,
      clips: comp.layers.reduce((n, l) => n + l.clips.filter((c) => c.hasContent).length, 0)
    }
  }, [comp])

  return (
    <div className="app">
      {booting && <BootSplash host={host} />}

      <header className="topbar">
        <div className="brand">
          <span className="dot" />
          RESOLUME<span className="brand-2">·SHOW CONTROL</span>
        </div>
        <div className="conn">
          <input
            className="host"
            value={host}
            spellCheck={false}
            onChange={(e) => setHost(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') connect(host)
            }}
          />
          <button className="btn" onClick={() => connect(host)}>
            CONNECT
          </button>
          <span className={`led ${connected ? 'ok' : 'off'}`}>{connected ? 'LINKED' : 'NO LINK'}</span>
        </div>
      </header>

      {error && (
        <div className="error">
          link error: {error} — is Arena’s Webserver enabled at {host}:8080?
        </div>
      )}

      <Transport
        t={t}
        showName={bank.name}
        dirty={bank.dirty}
        onOpenAudio={bank.openAudio}
        onDropFile={bank.loadDropped}
        onOpenBank={() => setBankOpen(true)}
      />

      <ShowBar
        armed={armed}
        live={armed && t.state === 'playing'}
        connected={connected}
        triggers={show.triggers}
        getPos={t.position}
        onToggleArm={() => setArmed((a) => !a)}
        onPanic={panic}
        onOperator={() => setOperator(true)}
        latencyMs={latencyMs}
        onLatency={changeLatency}
      />

      <Timeline
        buffer={t.buffer}
        duration={t.duration}
        bpm={t.bpm}
        beatOffset={t.beatOffset}
        getPos={t.position}
        onSeek={t.seek}
        layers={comp?.layers ?? []}
        show={show}
        firedIds={firedIds}
        playing={t.state === 'playing'}
      />

      <main className="grid-wrap">
        {comp ? (
          <ClipGrid comp={comp} host={host} onFire={fire} />
        ) : (
          <div className="empty">Connecting to {host}…</div>
        )}
      </main>

      <StatusBar
        host={host}
        connected={connected}
        comp={comp}
        totals={totals}
        lastFired={lastFired}
        bpm={t.bpm}
        cues={show.triggers.length}
        getPos={t.position}
      />

      <SongBank bank={bank} open={bankOpen} onClose={() => setBankOpen(false)} />

      {operator && (
        <OperatorView
          t={t}
          show={show}
          armed={armed}
          live={armed && t.state === 'playing'}
          connected={connected}
          lastFired={lastFired}
          onToggleArm={() => setArmed((a) => !a)}
          onPanic={panic}
          onExit={() => setOperator(false)}
        />
      )}
    </div>
  )
}

function BootSplash({ host }: { host: string }): JSX.Element {
  const lines = [
    'BLACKPIXEL SHOW KERNEL ............ OK',
    `RESOLUME LINK ${host}:8080 ....... REST`,
    'OSC BUS :7000 .................... ARMED',
    'LIVE MIRROR ws /api/v1 ........... SUBSCRIBED',
    'AUDIO CLOCK · WEB AUDIO .......... READY',
    'TIMELINE ENGINE .................. LOADED',
    'SHOW SCHEDULER ................... SAFE',
    'SONG BANK ........................ MOUNTED',
    'LOADING COMPOSITION ..............'
  ]
  return (
    <div className="boot">
      <div className="boot-inner">
        <div className="boot-title">
          RESOLUME · SHOW CONTROL <span>v0.1.0 · M6</span>
        </div>
        {lines.map((l, i) => (
          <div className="boot-line" key={i} style={{ animationDelay: `${i * 160}ms` }}>
            <span className="ln">{String(i).padStart(2, '0')}</span>
            {l}
          </div>
        ))}
        <div className="boot-bar">
          <div className="boot-fill" />
        </div>
      </div>
    </div>
  )
}

/** Live timecode chip — self-updating so the status bar doesn't re-render per frame. */
function LiveTC({ getPos }: { getPos: () => number }): JSX.Element {
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
  return <span className="chip clock">TC {txt}</span>
}

function StatusBar({
  host,
  connected,
  comp,
  totals,
  lastFired,
  bpm,
  cues,
  getPos
}: {
  host: string
  connected: boolean
  comp: CompositionModel | null
  totals: { layers: number; clips: number }
  lastFired: string | null
  bpm: number
  cues: number
  getPos: () => number
}): JSX.Element {
  const [clock, setClock] = useState('')
  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date().toLocaleTimeString('en-GB')), 1000)
    return () => window.clearInterval(timer)
  }, [])
  return (
    <footer className="statusbar">
      <span className={`chip ${connected ? 'ok' : 'off'}`}>{connected ? 'LINK OK' : 'OFFLINE'}</span>
      <span className="chip">{host}:8080</span>
      <span className="chip">COMP · {comp?.name ?? '—'}</span>
      <span className="chip">
        {totals.layers} LAYERS · {totals.clips} CLIPS
      </span>
      <span className="chip">BPM {bpm}</span>
      <span className="chip">CUES {cues}</span>
      <LiveTC getPos={getPos} />
      <span className="chip grow">LAST FIRED · {lastFired ?? '—'}</span>
      <span className="chip">{clock}</span>
      <span className="chip ver">M6</span>
    </footer>
  )
}
