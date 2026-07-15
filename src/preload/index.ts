import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { CompositionModel } from '../main/resolume-client'
import type { AudioPayload, SavedShow, SongMeta } from '../main/songbank'

const api = {
  connect: (host: string): Promise<CompositionModel> => ipcRenderer.invoke('resolume:connect', host),
  getComposition: (): Promise<CompositionModel | null> => ipcRenderer.invoke('resolume:getComposition'),
  fireClip: (layer: number, clip: number): Promise<boolean> =>
    ipcRenderer.invoke('resolume:fireClip', layer, clip),
  fireColumn: (column: number): Promise<boolean> => ipcRenderer.invoke('resolume:fireColumn', column),
  disconnectAll: (): Promise<boolean> => ipcRenderer.invoke('resolume:disconnectAll'),
  onState: (cb: (m: CompositionModel) => void): (() => void) => {
    const h = (_e: unknown, m: CompositionModel): void => cb(m)
    ipcRenderer.on('resolume:state', h)
    return () => ipcRenderer.removeListener('resolume:state', h)
  },
  onStatus: (cb: (s: { connected: boolean }) => void): (() => void) => {
    const h = (_e: unknown, s: { connected: boolean }): void => cb(s)
    ipcRenderer.on('resolume:status', h)
    return () => ipcRenderer.removeListener('resolume:status', h)
  }
}

contextBridge.exposeInMainWorld('api', api)

// Song bank + audio persistence (kept separate from the Resolume `api`).
const bank = {
  list: (): Promise<SongMeta[]> => ipcRenderer.invoke('bank:list'),
  save: (show: SavedShow, id?: string): Promise<{ id: string }> =>
    ipcRenderer.invoke('bank:save', show, id),
  load: (id: string): Promise<SavedShow | null> => ipcRenderer.invoke('bank:load', id),
  remove: (id: string): Promise<boolean> => ipcRenderer.invoke('bank:delete', id),
  readAudio: (path: string): Promise<AudioPayload | null> =>
    ipcRenderer.invoke('bank:readAudio', path),
  openAudio: (): Promise<{ path: string; name: string; data: ArrayBuffer } | null> =>
    ipcRenderer.invoke('bank:openAudio'),
  // Resolve a dropped File's absolute path (sanctioned replacement for File.path).
  pathForFile: (file: File): string => {
    try {
      return webUtils.getPathForFile(file)
    } catch {
      return ''
    }
  }
}

contextBridge.exposeInMainWorld('bank', bank)

export type Api = typeof api
export type Bank = typeof bank
