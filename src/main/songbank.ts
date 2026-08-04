import { randomUUID } from 'node:crypto'
import { readFile, writeFile, readdir, unlink, mkdir } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { app, dialog, type BrowserWindow } from 'electron'

// A persisted show: cues + tempo + a *reference* to the audio file on disk (not the audio
// bytes — that keeps show files tiny and lets the same audio back many shows).
export interface SavedShow {
  version: 1
  name: string
  audioPath: string | null
  audioName: string | null
  bpm: number
  beatOffset: number
  cues: unknown[] // Trigger[] on the renderer side; opaque here
  savedAt: string
}

export interface SongMeta {
  id: string
  name: string
  bpm: number
  cueCount: number
  audioName: string | null
  savedAt: string
}

export interface AudioPayload {
  name: string
  data: ArrayBuffer
}

const AUDIO_EXT = ['wav', 'aif', 'aiff', 'flac', 'mp3', 'm4a', 'aac', 'ogg', 'opus']

// Boundary validation for show files loaded from disk. We keep `cues` opaque to main
// elsewhere (it's the renderer's schema), but at the load boundary we structurally check
// each cue so a malformed or future-schema file can't reach the engine and crash dispatch.
function isValidCue(x: unknown): boolean {
  if (!x || typeof x !== 'object') return false
  const t = x as Record<string, unknown>
  if (typeof t.id !== 'string' || typeof t.time !== 'number' || !Number.isFinite(t.time)) return false
  if (t.kind === 'clip') {
    return (
      typeof t.layer === 'number' &&
      typeof t.clip === 'number' &&
      typeof t.label === 'string'
    )
  }
  if (t.kind === 'column') {
    return typeof t.column === 'number' && typeof t.label === 'string'
  }
  return false
}

function isValidShow(x: unknown): x is SavedShow {
  if (!x || typeof x !== 'object') return false
  const s = x as Record<string, unknown>
  return (
    s.version === 1 &&
    typeof s.name === 'string' &&
    (s.audioPath === null || typeof s.audioPath === 'string') &&
    (s.audioName === null || typeof s.audioName === 'string') &&
    typeof s.bpm === 'number' &&
    Number.isFinite(s.bpm) &&
    typeof s.beatOffset === 'number' &&
    Number.isFinite(s.beatOffset) &&
    Array.isArray(s.cues) &&
    (s.cues as unknown[]).every(isValidCue) &&
    typeof s.savedAt === 'string'
  )
}

function bankDir(): string {
  return join(app.getPath('userData'), 'songbank')
}

async function ensureDir(): Promise<string> {
  const dir = bankDir()
  await mkdir(dir, { recursive: true })
  return dir
}

function toArrayBuffer(buf: Buffer): ArrayBuffer {
  const ab = new ArrayBuffer(buf.byteLength)
  new Uint8Array(ab).set(buf)
  return ab
}

export async function listSongs(): Promise<SongMeta[]> {
  const dir = await ensureDir()
  const files = (await readdir(dir)).filter((f) => f.endsWith('.json'))
  const metas: SongMeta[] = []
  for (const f of files) {
    try {
      const show = JSON.parse(await readFile(join(dir, f), 'utf8')) as SavedShow
      metas.push({
        id: f.replace(/\.json$/, ''),
        name: show.name,
        bpm: show.bpm,
        cueCount: Array.isArray(show.cues) ? show.cues.length : 0,
        audioName: show.audioName,
        savedAt: show.savedAt
      })
    } catch {
      /* skip unreadable/corrupt entries */
    }
  }
  return metas.sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1))
}

export async function saveSong(show: SavedShow, id?: string): Promise<{ id: string }> {
  const dir = await ensureDir()
  const useId = id && /^[a-f0-9-]+$/i.test(id) ? id : randomUUID()
  await writeFile(join(dir, `${useId}.json`), JSON.stringify(show, null, 2), 'utf8')
  return { id: useId }
}

export async function loadSong(id: string): Promise<SavedShow | null> {
  if (!/^[a-f0-9-]+$/i.test(id)) return null
  try {
    const parsed: unknown = JSON.parse(await readFile(join(bankDir(), `${id}.json`), 'utf8'))
    if (!isValidShow(parsed)) {
      console.warn(`[songbank] ${id}.json failed schema validation — refusing`)
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export async function deleteSong(id: string): Promise<boolean> {
  if (!/^[a-f0-9-]+$/i.test(id)) return false
  try {
    await unlink(join(bankDir(), `${id}.json`))
    return true
  } catch {
    return false
  }
}

export async function readAudio(path: string): Promise<AudioPayload | null> {
  const ext = extname(path).toLowerCase().replace(/^\./, '')
  if (!AUDIO_EXT.includes(ext)) return null
  try {
    const buf = await readFile(path)
    return { name: basename(path), data: toArrayBuffer(buf) }
  } catch {
    return null
  }
}

export async function openAudioDialog(
  win: BrowserWindow | null
): Promise<{ path: string; name: string; data: ArrayBuffer } | null> {
  const opts = {
    title: 'Open song audio',
    properties: ['openFile' as const],
    filters: [{ name: 'Audio', extensions: AUDIO_EXT }]
  }
  const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
  if (res.canceled || res.filePaths.length === 0) return null
  const path = res.filePaths[0]
  const audio = await readAudio(path)
  if (!audio) return null
  return { path, name: audio.name, data: audio.data }
}
