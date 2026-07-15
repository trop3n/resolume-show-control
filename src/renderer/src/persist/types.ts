import type { Trigger } from '../show/types'

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

export interface BankApi {
  list: () => Promise<SongMeta[]>
  save: (show: SavedShow, id?: string) => Promise<{ id: string }>
  load: (id: string) => Promise<SavedShow | null>
  remove: (id: string) => Promise<boolean>
  readAudio: (path: string) => Promise<AudioPayload | null>
  openAudio: () => Promise<{ path: string; name: string; data: ArrayBuffer } | null>
  pathForFile: (file: File) => string
}

declare global {
  interface Window {
    bank: BankApi
  }
}
