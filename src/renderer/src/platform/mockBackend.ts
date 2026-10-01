// Browser-only mock of the Electron main process. Installed by main.tsx when
// `window.api` is absent (i.e. running under `npm run web`, not inside Electron).
// It stands in for Resolume + the filesystem so the UI is fully explorable for design,
// with NO live output and localStorage instead of real saved files.
import type { CompositionModel, PrevizApi, PrevizAssignment, ResolumeApi } from '../types'
import type { BankApi } from '../persist/types'
// Wire types — the mock stands in for main, so it speaks main's schema (where cues are
// unknown[] rather than the renderer's Trigger[]). Path intentionally crosses into main
// to mirror what the real IPC returns.
import type { AudioPayload, SavedShow, SongMeta } from '../../../main/songbank'

const CLIP_NAMES = [
  'Intro Loop',
  'Beat Drop',
  'Warm Grid',
  'Aurora',
  'Ink Bloom',
  'Neon Rain',
  'Slow Tide',
  'Starfield',
  'Pulse',
  'Sunrise'
]

function makeComp(): CompositionModel {
  const layerDefs = [
    { name: 'IMAG', clips: 4 },
    { name: 'Lyrics', clips: 3 },
    { name: 'Lower Third', clips: 2 },
    { name: 'Foreground FX', clips: 5 },
    { name: 'Backgrounds', clips: 6 },
    { name: 'Ambience', clips: 3 }
  ]
  return {
    name: 'Preview Composition',
    layers: layerDefs.map((L, li) => ({
      index: li + 1,
      name: L.name,
      bypassed: false,
      clips: Array.from({ length: L.clips }, (_, ci) => ({
        index: ci + 1,
        name: CLIP_NAMES[(li * 3 + ci) % CLIP_NAMES.length],
        connected: 'Disconnected',
        hasContent: true
      }))
    }))
  }
}

let comp: CompositionModel = makeComp()
const stateCbs = new Set<(m: CompositionModel) => void>()
const statusCbs = new Set<(s: { connected: boolean }) => void>()

function emitState(): void {
  const snap = structuredClone(comp)
  stateCbs.forEach((cb) => cb(snap))
}

function connectClip(layer: number, clip: number): void {
  const L = comp.layers.find((l) => l.index === layer)
  if (!L) return
  for (const c of L.clips) {
    if (c.hasContent) c.connected = c.index === clip ? 'Connected' : 'Disconnected'
  }
}

const api: ResolumeApi = {
  connect: async () => {
    comp = makeComp()
    queueMicrotask(() => statusCbs.forEach((cb) => cb({ connected: true })))
    return structuredClone(comp)
  },
  getComposition: async () => structuredClone(comp),
  fireClip: async (layer, clip) => {
    connectClip(layer, clip)
    emitState()
    return true
  },
  fireColumn: async (column) => {
    for (const L of comp.layers) {
      const target = L.clips.find((c) => c.index === column && c.hasContent)
      if (target) connectClip(L.index, column)
    }
    emitState()
    return true
  },
  disconnectAll: async () => {
    for (const L of comp.layers) for (const c of L.clips) if (c.connected === 'Connected') c.connected = 'Disconnected'
    emitState()
    return true
  },
  onState: (cb) => {
    stateCbs.add(cb)
    return () => {
      stateCbs.delete(cb)
    }
  },
  onStatus: (cb) => {
    statusCbs.add(cb)
    cb({ connected: true })
    return () => {
      statusCbs.delete(cb)
    }
  }
}

// ---- Song bank: localStorage + in-session audio cache -----------------------
const LS_KEY = 'rsc.preview.bank'
const audioCache = new Map<string, AudioPayload>()

type StoredShow = SavedShow & { id: string }

function readAll(): Record<string, StoredShow> {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || '{}')
  } catch {
    return {}
  }
}
function writeAll(obj: Record<string, StoredShow>): void {
  localStorage.setItem(LS_KEY, JSON.stringify(obj))
}

function pickFile(): Promise<{ path: string; name: string; data: ArrayBuffer } | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'audio/*'
    input.onchange = async (): Promise<void> => {
      const f = input.files?.[0]
      if (!f) return resolve(null)
      const data = await f.arrayBuffer()
      const path = `mem://${f.name}`
      audioCache.set(path, { name: f.name, data: data.slice(0) }) // keep a master copy
      resolve({ path, name: f.name, data })
    }
    input.oncancel = (): void => resolve(null)
    input.click()
  })
}

const bank: BankApi = {
  list: async (): Promise<SongMeta[]> =>
    Object.values(readAll())
      .map((s) => ({
        id: s.id,
        name: s.name,
        bpm: s.bpm,
        cueCount: s.cues.length,
        audioName: s.audioName,
        savedAt: s.savedAt
      }))
      .sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1)),
  save: async (show, id) => {
    const all = readAll()
    const useId = id || crypto.randomUUID()
    all[useId] = { ...show, id: useId }
    writeAll(all)
    return { id: useId }
  },
  load: async (id) => {
    const all = readAll()
    if (!all[id]) return null
    const { id: _drop, ...show } = all[id]
    return show as SavedShow
  },
  remove: async (id) => {
    const all = readAll()
    delete all[id]
    writeAll(all)
    return true
  },
  readAudio: async (path) => {
    const cached = audioCache.get(path)
    return cached ? { name: cached.name, data: cached.data.slice(0) } : null
  },
  openAudio: () => pickFile(),
  pathForFile: () => ''
}

// Previz: the real one opens a second Electron window and captures OS windows, neither of
// which exists in a browser. Assignments live in memory so the panel is still explorable.
const MOCK_SOURCES = [
  { id: 'window:1', name: 'NDI - RESOLUMEWORKSTATION.LOCAL (Arena - LED Wall Previz) (3072x1408/60p)' },
  { id: 'window:2', name: 'Resolume Arena' },
  { id: 'window:3', name: 'ProPresenter' },
  { id: 'screen:0', name: 'Entire screen' }
]
const MOCK_SURFACES = [
  { id: 'led', name: 'LED Wall', kind: 'led' },
  { id: 'imag-hl', name: 'Side Screen, House Left', kind: 'led' },
  { id: 'imag-hr', name: 'Side Screen, House Right', kind: 'led' },
  { id: 'projection', name: 'Balcony Projection', kind: 'projection' }
]
let mockOpen = false
let mockAssignments: PrevizAssignment[] = []

const previz: PrevizApi = {
  open: async () => {
    mockOpen = true
    return true
  },
  close: async () => {
    mockOpen = false
    return true
  },
  isOpen: async () => mockOpen,
  sources: async () => MOCK_SOURCES,
  surfaces: async () => (mockOpen ? MOCK_SURFACES : []),
  assignments: async () => mockAssignments,
  assign: async (surfaceId, sourceId) => {
    const source = MOCK_SOURCES.find((s) => s.id === sourceId)
    if (!source || !mockOpen) return false
    mockAssignments = [
      ...mockAssignments.filter((a) => a.surfaceId !== surfaceId),
      { surfaceId, sourceName: source.name }
    ]
    return true
  },
  unassign: async (surfaceId) => {
    mockAssignments = mockAssignments.filter((a) => a.surfaceId !== surfaceId)
    return true
  }
}

export function installMockBackend(): boolean {
  if (window.api) return false // real Electron preload is present
  comp = makeComp()
  window.api = api
  window.bank = bank
  window.previz = previz
  console.info('%c[preview] mock backend — UI only, no live Resolume, localStorage saves', 'color:#22d3ee')
  return true
}
