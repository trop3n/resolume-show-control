import { contextBridge, ipcRenderer } from 'electron'
import type { CompositionModel } from '../main/resolume-client'

const api = {
  connect: (host: string): Promise<CompositionModel> => ipcRenderer.invoke('resolume:connect', host),
  getComposition: (): Promise<CompositionModel | null> => ipcRenderer.invoke('resolume:getComposition'),
  fireClip: (layer: number, clip: number): Promise<boolean> =>
    ipcRenderer.invoke('resolume:fireClip', layer, clip),
  fireColumn: (column: number): Promise<boolean> => ipcRenderer.invoke('resolume:fireColumn', column),
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

export type Api = typeof api
