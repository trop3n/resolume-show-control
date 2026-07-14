// Shared drag payload for authoring. HTML5 dataTransfer only exposes its data on `drop`
// (not during `dragover`), but lanes need to know the dragged clip's layer during
// `dragover` to decide whether they're a valid target — so we stash it here too.

export interface ClipDrag {
  layer: number
  clip: number
  label: string
}

export const dragState: { clip: ClipDrag | null } = { clip: null }
