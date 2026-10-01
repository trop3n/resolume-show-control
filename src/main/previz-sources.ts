export interface DesktopSource {
  id: string
  name: string
}

export function normaliseSourceName(name: string): string {
  return name
    .replace(/\((?=[^)]*\d)[^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

export function matchSource(savedName: string, sources: DesktopSource[]): DesktopSource | null {
  const exact = sources.filter((s) => s.name === savedName)
  if (exact.length === 1) return exact[0]

  const target = normaliseSourceName(savedName)
  if (target === '') return null

  const same = sources.filter((s) => normaliseSourceName(s.name) === target)
  if (same.length === 1) return same[0]

  const overlapping = sources.filter((s) => {
    const other = normaliseSourceName(s.name)
    return other !== '' && (other.startsWith(target) || target.startsWith(other))
  })
  return overlapping.length === 1 ? overlapping[0] : null
}
