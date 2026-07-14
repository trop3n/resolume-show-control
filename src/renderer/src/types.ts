export interface ClipModel {
  index: number
  name: string
  connected: string
  hasContent: boolean
}
export interface LayerModel {
  index: number
  name: string
  bypassed: boolean
  clips: ClipModel[]
}
export interface CompositionModel {
  name: string
  layers: LayerModel[]
}

export interface ResolumeApi {
  connect: (host: string) => Promise<CompositionModel>
  getComposition: () => Promise<CompositionModel | null>
  fireClip: (layer: number, clip: number) => Promise<boolean>
  fireColumn: (column: number) => Promise<boolean>
  onState: (cb: (m: CompositionModel) => void) => () => void
  onStatus: (cb: (s: { connected: boolean }) => void) => () => void
}

declare global {
  interface Window {
    api: ResolumeApi
  }
}
