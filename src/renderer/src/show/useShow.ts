import { useCallback, useMemo, useState } from 'react'
import type { Trigger } from './types'

function uid(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2)
}

export interface ShowApi {
  triggers: Trigger[]
  selectedId: string | null
  addClip: (layer: number, clip: number, time: number, label: string) => void
  addColumn: (time: number, column?: number) => void
  loadTriggers: (triggers: Trigger[]) => void
  move: (id: string, time: number) => void
  setColumn: (id: string, column: number) => void
  remove: (id: string) => void
  select: (id: string | null) => void
  clear: () => void
}

export function useShow(): ShowApi {
  const [triggers, setTriggers] = useState<Trigger[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const addClip = useCallback((layer: number, clip: number, time: number, label: string) => {
    const t: Trigger = { id: uid(), kind: 'clip', time, layer, clip, label }
    setTriggers((xs) => [...xs, t])
    setSelectedId(t.id)
  }, [])

  const addColumn = useCallback((time: number, column = 1) => {
    const t: Trigger = { id: uid(), kind: 'column', time, column, label: `Col ${column}` }
    setTriggers((xs) => [...xs, t])
    setSelectedId(t.id)
  }, [])

  const loadTriggers = useCallback((next: Trigger[]) => {
    setTriggers(next)
    setSelectedId(null)
  }, [])

  const move = useCallback((id: string, time: number) => {
    setTriggers((xs) => xs.map((t) => (t.id === id ? { ...t, time } : t)))
  }, [])

  const setColumn = useCallback((id: string, column: number) => {
    const c = Math.max(1, Math.round(column))
    setTriggers((xs) =>
      xs.map((t) => (t.id === id && t.kind === 'column' ? { ...t, column: c, label: `Col ${c}` } : t))
    )
  }, [])

  const remove = useCallback((id: string) => {
    setTriggers((xs) => xs.filter((t) => t.id !== id))
    setSelectedId((s) => (s === id ? null : s))
  }, [])

  const select = useCallback((id: string | null) => setSelectedId(id), [])

  const clear = useCallback(() => {
    setTriggers([])
    setSelectedId(null)
  }, [])

  // Stable identity except when the show data itself changes, so consumers' effects
  // (e.g. the timeline's Delete-key handler) don't re-bind on unrelated re-renders.
  return useMemo(
    () => ({
      triggers,
      selectedId,
      addClip,
      addColumn,
      loadTriggers,
      move,
      setColumn,
      remove,
      select,
      clear
    }),
    [triggers, selectedId, addClip, addColumn, loadTriggers, move, setColumn, remove, select, clear]
  )
}
