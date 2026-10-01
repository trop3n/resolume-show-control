import { createReadStream } from 'node:fs'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { extname, join, normalize, sep } from 'node:path'
import {
  app,
  BrowserWindow,
  desktopCapturer,
  session,
  type DesktopCapturerSource
} from 'electron'
import { matchSource, type DesktopSource } from './previz-sources'

export interface PrevizSurface {
  id: string
  name: string
  kind: string
}

export interface PrevizAssignment {
  surfaceId: string
  sourceName: string
}

const PARTITION = 'previz'

const MIME: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.glb': 'model/gltf-binary',
  '.html': 'text/html; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.wasm': 'application/wasm',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2'
}

let server: Server | null = null
let port = 0
let win: BrowserWindow | null = null
let pending: DesktopCapturerSource | null = null
let assignments: PrevizAssignment[] = []
let loaded = false

function viewerRoot(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'previz')
    : join(app.getAppPath(), 'resources', 'previz')
}

function storePath(): string {
  return join(app.getPath('userData'), 'previz.json')
}

function isAssignment(value: unknown): value is PrevizAssignment {
  const a = value as Record<string, unknown> | null
  return !!a && typeof a.surfaceId === 'string' && typeof a.sourceName === 'string'
}

async function load(): Promise<void> {
  if (loaded) return
  loaded = true
  try {
    const raw = JSON.parse(await readFile(storePath(), 'utf8')) as { assignments?: unknown }
    assignments = Array.isArray(raw.assignments) ? raw.assignments.filter(isAssignment) : []
  } catch {
    assignments = []
  }
}

async function save(): Promise<void> {
  await mkdir(app.getPath('userData'), { recursive: true })
  await writeFile(storePath(), JSON.stringify({ version: 1, assignments }, null, 2), 'utf8')
}

async function startServer(): Promise<number> {
  if (server) return port
  const base = viewerRoot()
  const next = createServer((req, res) => {
    const path = new URL(req.url ?? '/', 'http://127.0.0.1').pathname
    const rel = normalize(decodeURIComponent(path)).replace(/^[/\\]+/, '')
    const file = rel === '' ? join(base, 'index.html') : join(base, rel)
    if (file !== join(base, 'index.html') && !file.startsWith(base + sep)) {
      res.writeHead(403).end()
      return
    }
    stat(file)
      .then((info) => {
        if (info.isDirectory()) throw new Error('directory')
        res.writeHead(200, {
          'Content-Type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
          'Content-Length': info.size,
          'Cache-Control': 'no-cache'
        })
        createReadStream(file).pipe(res)
      })
      .catch(() => res.writeHead(404).end('not found'))
  })
  await new Promise<void>((resolve, reject) => {
    next.once('error', reject)
    next.listen(0, '127.0.0.1', resolve)
  })
  const address = next.address()
  server = next
  port = typeof address === 'object' && address !== null ? address.port : 0
  return port
}

export function previzOrigin(): string {
  return port === 0 ? '' : `http://127.0.0.1:${port}`
}

export function isPrevizOpen(): boolean {
  return win !== null && !win.isDestroyed()
}

export async function sources(): Promise<DesktopSource[]> {
  const found = await desktopCapturer.getSources({
    types: ['window', 'screen'],
    thumbnailSize: { width: 0, height: 0 }
  })
  return found
    .filter((s) => s.name.trim() !== '')
    .map((s) => ({ id: s.id, name: s.name }))
}

export async function surfaces(): Promise<PrevizSurface[]> {
  if (!isPrevizOpen()) return []
  return win!.webContents.executeJavaScript(
    'window.previzHost ? window.previzHost.surfaces() : []'
  ) as Promise<PrevizSurface[]>
}

export function assignmentList(): PrevizAssignment[] {
  return assignments
}

export async function assign(surfaceId: string, sourceId: string): Promise<boolean> {
  if (!isPrevizOpen()) return false
  const found = await desktopCapturer.getSources({
    types: ['window', 'screen'],
    thumbnailSize: { width: 0, height: 0 }
  })
  const source = found.find((s) => s.id === sourceId)
  if (!source) return false

  pending = source
  try {
    await win!.webContents.executeJavaScript(
      `window.previzHost.capture(${JSON.stringify(surfaceId)})`
    )
  } catch {
    return false
  } finally {
    pending = null
  }

  assignments = [
    ...assignments.filter((a) => a.surfaceId !== surfaceId),
    { surfaceId, sourceName: source.name }
  ]
  await save()
  return true
}

export async function unassign(surfaceId: string): Promise<boolean> {
  assignments = assignments.filter((a) => a.surfaceId !== surfaceId)
  await save()
  if (isPrevizOpen()) {
    await win!.webContents.executeJavaScript(
      `window.previzHost.detach(${JSON.stringify(surfaceId)})`
    )
  }
  return true
}

async function restore(): Promise<void> {
  await load()
  if (assignments.length === 0) return
  const available = await sources()
  for (const saved of [...assignments]) {
    const match = matchSource(saved.sourceName, available)
    if (match) await assign(saved.surfaceId, match.id)
  }
}

export async function openPrevizWindow(): Promise<boolean> {
  if (isPrevizOpen()) {
    win!.focus()
    return true
  }

  const p = await startServer()
  const origin = `http://127.0.0.1:${p}`
  const previzSession = session.fromPartition(PARTITION)

  previzSession.setDisplayMediaRequestHandler((_request, callback) => {
    if (pending) callback({ video: pending })
    else callback({})
  })
  previzSession.setPermissionRequestHandler((_contents, permission, callback, details) => {
    const allowed = permission === 'display-capture' || permission === 'media'
    callback(allowed && details.requestingUrl.startsWith(origin))
  })

  win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 820,
    minHeight: 520,
    backgroundColor: '#0c0d10',
    show: false,
    autoHideMenuBar: true,
    title: 'Sanctuary Previz',
    webPreferences: {
      partition: PARTITION,
      sandbox: true,
      contextIsolation: true
    }
  })
  win.on('ready-to-show', () => win?.show())
  win.on('closed', () => {
    win = null
  })
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  await win.loadURL(`${origin}/`)
  await restore()
  return true
}

export function closePrevizWindow(): boolean {
  if (isPrevizOpen()) win!.close()
  win = null
  return true
}

export function stopPrevizServer(): void {
  server?.close()
  server = null
  port = 0
}
