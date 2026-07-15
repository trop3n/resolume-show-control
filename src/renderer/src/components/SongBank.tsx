import type { SongBankApi } from '../persist/useSongBank'

function fmtWhen(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) + ' ' +
    d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

export default function SongBank({
  bank,
  open,
  onClose
}: {
  bank: SongBankApi
  open: boolean
  onClose: () => void
}): JSX.Element | null {
  if (!open) return null
  return (
    <div className="bank-overlay" onClick={onClose}>
      <aside className="bank" onClick={(e) => e.stopPropagation()}>
        <header className="bank-head">
          <span className="bank-title">SONG BANK</span>
          <button className="bank-x" onClick={onClose} title="Close">
            ×
          </button>
        </header>

        <section className="bank-current">
          <label className="bank-lbl">CURRENT SHOW</label>
          <input
            className="bank-name"
            value={bank.name}
            placeholder="untitled show"
            spellCheck={false}
            onChange={(e) => bank.setName(e.target.value)}
          />
          <div className="bank-audio">
            {bank.audioMissing ? (
              <span className="bank-missing">audio missing — OPEN to relink</span>
            ) : (
              <span>♪ {bank.audioName ?? 'no audio loaded'}</span>
            )}
          </div>
          <div className="bank-actions">
            <button className="seg" onClick={() => void bank.openAudio()}>
              OPEN AUDIO
            </button>
            <button className="seg" onClick={() => void bank.save()}>
              SAVE{bank.dirty ? ' ●' : ''}
            </button>
            <button className="seg" onClick={() => void bank.saveAsNew()}>
              SAVE AS NEW
            </button>
            <button className="seg danger" onClick={bank.newShow}>
              NEW
            </button>
          </div>
        </section>

        <div className="bank-listwrap">
          <label className="bank-lbl">LIBRARY · {bank.library.length}</label>
          {bank.library.length === 0 && <div className="bank-empty">no saved shows yet</div>}
          <ul className="bank-list">
            {bank.library.map((s) => (
              <li
                key={s.id}
                className={`bank-row ${s.id === bank.currentId ? 'cur' : ''}`}
                onDoubleClick={() => void bank.loadShow(s.id)}
              >
                <div className="bank-row-main">
                  <span className="bank-row-name">{s.name}</span>
                  <span className="bank-row-meta">
                    {s.bpm} BPM · {s.cueCount} cues · {s.audioName ?? 'no audio'} · {fmtWhen(s.savedAt)}
                  </span>
                </div>
                <button className="seg" onClick={() => void bank.loadShow(s.id)}>
                  LOAD
                </button>
                <button
                  className="bank-del"
                  title="Delete show"
                  onClick={() => void bank.deleteShow(s.id)}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  )
}
