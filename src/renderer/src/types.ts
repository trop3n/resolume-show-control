import type { Api, Previz } from '../../preload'

// The renderer's view of the composition mirror and the IPC surface. Both are typed from
// the preload's exposed implementations (single source of truth) — see preload/index.ts.
// Re-exported here under the historical names so existing imports keep working.
export type { CompositionModel, ClipModel, LayerModel } from '../../main/resolume-client'
export type ResolumeApi = Api
export type PrevizApi = Previz
export type { PrevizAssignment, PrevizSurface } from '../../main/previz'
export type { DesktopSource } from '../../main/previz-sources'

declare global {
  interface Window {
    api: Api
    previz: Previz
  }
}
