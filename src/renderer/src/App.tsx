import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CompositionModel } from './types'
import { useTransport } from './hooks/useTransport'
import Transport, { fmtTime } from './components/Transport'
import ClipGrid from './components/ClipGrid'

const DEFAULT_HOST = '172.16.8.27'

export default function App(): JSX.Element {
  const [host, setHost] = useState(DEFAULT_HOST)
  const [comp, setComp] = useState<CompositionModel | null>(null)
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [booting, setBooting] = useState(true)
  const [lastFired, setLastFired] = useState<string | null>(null)

  const t = useTransport()

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

  // Spacebar toggles transport — unless the user is typing in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const el = e.target as HTMLElement | null
      const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')
      if (e.code === 'Space' && !typing) {
        e.preventDefault()
        t.toggle()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [t])

  const fire = useCallback(async (layer: number, clip: number, name: string) => {
    await window.api.fireClip(layer, clip)
    setLastFired(`L${layer}·${clip} ${name}`.trim())
  }, [])

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

      <Transport t={t} />

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
        getPos={t.position}
      />
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
    'LOADING COMPOSITION ..............'
  ]
  return (
    <div className="boot">
      <div className="boot-inner">
        <div className="boot-title">
          RESOLUME · SHOW CONTROL <span>v0.1.0 · M1</span>
        </div>
        {lines.map((l, i) => (
          <div className="boot-line" key={i} style={{ animationDelay: `${i * 160}ms` }}>
            <span className="ln">{String(i).padStart(2, '0')}</span>
            {l}
          </div>
        ))}
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
  getPos
}: {
  host: string
  connected: boolean
  comp: CompositionModel | null
  totals: { layers: number; clips: number }
  lastFired: string | null
  bpm: number
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
      <LiveTC getPos={getPos} />
      <span className="chip grow">LAST FIRED · {lastFired ?? '—'}</span>
      <span className="chip">{clock}</span>
      <span className="chip ver">M1</span>
    </footer>
  )
}
