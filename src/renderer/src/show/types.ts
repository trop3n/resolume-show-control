// A Show is an ordered set of triggers on a timeline. Each trigger says "at time T,
// fire this clip / this column". M2 authors them; M3's scheduler will play them back.

export type SnapRes = 'off' | 'beat' | 'bar'

export interface ClipTrigger {
  id: string
  kind: 'clip'
  time: number // seconds from song start
  layer: number
  clip: number
  label: string
}

export interface ColumnTrigger {
  id: string
  kind: 'column'
  time: number
  column: number
  label: string
}

export type Trigger = ClipTrigger | ColumnTrigger
