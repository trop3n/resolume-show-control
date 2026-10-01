import { useCallback, useEffect, useState } from 'react'
import type { DesktopSource, PrevizAssignment, PrevizSurface } from '../types'

export default function PrevizPanel({
  open,
  onClose
}: {
  open: boolean
  onClose: () => void
}): JSX.Element | null {
  const [windowOpen, setWindowOpen] = useState(false)
  const [sources, setSources] = useState<DesktopSource[]>([])
  const [surfaces, setSurfaces] = useState<PrevizSurface[]>([])
  const [assignments, setAssignments] = useState<PrevizAssignment[]>([])
  const [busy, setBusy] = useState('')

  const refresh = useCallback(async (): Promise<void> => {
    const [isOpen, foundSources, foundSurfaces, assigned] = await Promise.all([
      window.previz.isOpen(),
      window.previz.sources(),
      window.previz.surfaces(),
      window.previz.assignments()
    ])
    setWindowOpen(isOpen)
    setSources(foundSources)
    setSurfaces(foundSurfaces)
    setAssignments(assigned)
  }, [])

  useEffect(() => {
    if (open) void refresh()
  }, [open, refresh])

  if (!open) return null

  const assignedName = (surfaceId: string): string =>
    assignments.find((a) => a.surfaceId === surfaceId)?.sourceName ?? ''

  const pick = async (surfaceId: string, sourceId: string): Promise<void> => {
    setBusy(surfaceId)
    if (sourceId === '') await window.previz.unassign(surfaceId)
    else await window.previz.assign(surfaceId, sourceId)
    setBusy('')
    await refresh()
  }

  const openWindow = async (): Promise<void> => {
    await window.previz.open()
    await refresh()
  }

  const closeWindow = async (): Promise<void> => {
    await window.previz.close()
    await refresh()
  }

  return (
    <div className="previz-overlay" onClick={onClose}>
      <aside className="previz" onClick={(e) => e.stopPropagation()}>
        <header className="previz-head">
          <span className="previz-title">PREVIZ</span>
          <button className="previz-x" onClick={onClose} title="Close">
            ×
          </button>
        </header>

        <section className="previz-window">
          <label className="previz-lbl">PREVIZ WINDOW</label>
          <div className="previz-actions">
            <button className="btn" onClick={() => void openWindow()}>
              {windowOpen ? 'FOCUS' : 'OPEN'}
            </button>
            <button className="btn" disabled={!windowOpen} onClick={() => void closeWindow()}>
              CLOSE
            </button>
            <button className="btn" onClick={() => void refresh()}>
              REFRESH
            </button>
          </div>
          <div className="previz-hint">
            {windowOpen
              ? 'Each surface can show a window from this computer.'
              : 'Open the previz window to put live content on its surfaces.'}
          </div>
        </section>

        <div className="previz-list">
          {surfaces.map((surface) => (
            <div className="previz-row" key={surface.id}>
              <div className="previz-row-name">{surface.name}</div>
              <select
                className="previz-select"
                disabled={busy === surface.id}
                value={sources.find((s) => s.name === assignedName(surface.id))?.id ?? ''}
                onChange={(e) => void pick(surface.id, e.target.value)}
              >
                <option value="">— nothing —</option>
                {sources.map((source) => (
                  <option key={source.id} value={source.id}>
                    {source.name}
                  </option>
                ))}
              </select>
              {assignedName(surface.id) !== '' && (
                <div className="previz-row-meta">{assignedName(surface.id)}</div>
              )}
            </div>
          ))}
          {windowOpen && surfaces.length === 0 && (
            <div className="previz-empty">no surfaces reported</div>
          )}
        </div>
      </aside>
    </div>
  )
}
