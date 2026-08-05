import type { Trigger } from '../show/types'
import type { Bank } from '../../../preload'

// Renderer-side typed view of a persisted show. Main's SavedShow (in main/songbank.ts)
// types `cues` as unknown[] because main is deliberately decoupled from the Trigger
// schema. Main's isValidShow validates cue shape at the load boundary, so the renderer
// can safely use this richer type downstream — see the cast in useSongBank.loadShow.
export interface SavedShow {
  version: 1
  name: string
  audioPath: string | null
  audioName: string | null
  bpm: number
  beatOffset: number
  cues: Trigger[]
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

// BankApi is the IPC method surface — sourced from the preload implementation so the
// two can't drift. SavedShow above is the renderer's typed view of what crosses that
// surface; the structural mismatch on `cues` is resolved at the load boundary.
export type BankApi = Bank

declare global {
  interface Window {
    bank: Bank
  }
}
