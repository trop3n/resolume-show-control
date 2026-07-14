import dgram from 'node:dgram'
import { EventEmitter } from 'node:events'
import WebSocket from 'ws'

// ---- Simplified model the UI consumes -------------------------------------
export interface ClipModel {
  index: number // 1-based
  name: string
  connected: string // 'Connected' | 'Disconnected' | 'Empty'
  hasContent: boolean
}
export interface LayerModel {
  index: number // 1-based
  name: string
  bypassed: boolean
  clips: ClipModel[]
}
export interface CompositionModel {
  name: string
  layers: LayerModel[]
}

// Resolume represents every field as a parameter object: { id, valuetype, value }.
const val = (p: unknown, fallback?: unknown): unknown =>
  p && typeof p === 'object' && 'value' in (p as object) ? (p as { value: unknown }).value : fallback

/**
 * All Resolume I/O for one Arena machine. Verified against Arena 7.8+:
 *   REST : http://<host>:8080/api/v1
 *   OSC  : <host>:7000  /composition/layers/L/clips/C/connect  (int 1 = fire)
 *   WS   : ws://<host>:8080/api/v1  → full-composition JSON snapshots on change
 */
export class ResolumeClient extends EventEmitter {
  readonly host: string
  readonly restPort = 8080
  readonly oscPort = 7000
  private ws?: WebSocket
  private readonly osc = dgram.createSocket('udp4')
  private reconnectTimer?: NodeJS.Timeout
  private closedByUser = false

  constructor(host: string) {
    super()
    this.host = host
  }

  get restBase(): string {
    return `http://${this.host}:${this.restPort}/api/v1`
  }

  thumbnailUrl(layer: number, clip: number): string {
    return `${this.restBase}/composition/layers/${layer}/clips/${clip}/thumbnail`
  }

  // ---- REST: reliable initial snapshot ------------------------------------
  async getComposition(): Promise<CompositionModel> {
    const res = await fetch(`${this.restBase}/composition`)
    if (!res.ok) throw new Error(`REST ${res.status} from ${this.restBase}/composition`)
    return this.parse(await res.json())
  }

  private parse(comp: any): CompositionModel {
    const layers: LayerModel[] = (comp?.layers ?? []).map((L: any, li: number) => ({
      index: li + 1,
      name: String(val(L?.name, `Layer ${li + 1}`)),
      bypassed: Boolean(val(L?.bypassed, false)),
      clips: (L?.clips ?? []).map((c: any, ci: number) => {
        const connected = String(val(c?.connected, 'Empty'))
        return {
          index: ci + 1,
          name: String(val(c?.name, '')),
          connected,
          hasContent: connected !== 'Empty'
        }
      })
    }))
    return { name: String(val(comp?.name, '(untitled)')), layers }
  }

  // ---- OSC: fire (dependency-free encoder) --------------------------------
  private encodeOsc(address: string, arg: number, type: 'i' | 'f'): Buffer {
    const pad = (b: Buffer): Buffer => {
      const rem = b.length % 4
      return rem === 0 ? b : Buffer.concat([b, Buffer.alloc(4 - rem)])
    }
    const addr = pad(Buffer.from(address + '\0', 'ascii'))
    const tag = pad(Buffer.from(',' + type + '\0', 'ascii'))
    const body = Buffer.alloc(4)
    if (type === 'i') body.writeInt32BE(arg | 0)
    else body.writeFloatBE(arg)
    return Buffer.concat([addr, tag, body])
  }

  private sendOsc(address: string, arg = 1, type: 'i' | 'f' = 'i'): void {
    this.osc.send(this.encodeOsc(address, arg, type), this.oscPort, this.host)
  }

  fireClip(layer: number, clip: number): void {
    this.sendOsc(`/composition/layers/${layer}/clips/${clip}/connect`, 1)
  }

  // Same verified /connect scheme; column addressing to confirm on your setup.
  fireColumn(column: number): void {
    this.sendOsc(`/composition/columns/${column}/connect`, 1)
  }

  // ---- WebSocket: live mirror ---------------------------------------------
  connectWs(): void {
    this.closedByUser = false
    const ws = new WebSocket(`ws://${this.host}:${this.restPort}/api/v1`, { perMessageDeflate: false })
    this.ws = ws

    ws.on('open', () => this.emit('status', { connected: true }))
    ws.on('message', (data: WebSocket.RawData) => {
      let msg: any
      try {
        msg = JSON.parse(data.toString())
      } catch {
        return
      }
      // Arena pushes full-composition snapshots (they contain `layers`); other
      // messages are source/effect registries we ignore for the grid.
      // TODO(M1): subscribe to specific parameter ids for small targeted deltas
      // instead of re-parsing the full ~5 MB snapshot on every change.
      if (msg && Array.isArray(msg.layers)) this.emit('state', this.parse(msg))
    })
    ws.on('close', () => {
      this.emit('status', { connected: false })
      if (!this.closedByUser) this.reconnectTimer = setTimeout(() => this.connectWs(), 2000)
    })
    ws.on('error', () => {
      try {
        ws.close()
      } catch {
        /* ignore */
      }
    })
  }

  disconnect(): void {
    this.closedByUser = true
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    try {
      this.ws?.close()
    } catch {
      /* ignore */
    }
  }
}
