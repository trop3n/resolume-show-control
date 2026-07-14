import type { CompositionModel } from '../types'
import { dragState } from '../show/drag'

export default function ClipGrid({
  comp,
  host,
  onFire
}: {
  comp: CompositionModel
  host: string
  onFire: (layer: number, clip: number, name: string) => void
}): JSX.Element {
  return (
    <div className="grid">
      {comp.layers.map((layer) => {
        const clips = layer.clips.filter((c) => c.hasContent)
        return (
          <div className={`row ${layer.bypassed ? 'bypassed' : ''}`} key={layer.index}>
            <div className="row-head">
              <span className="lnum">L{layer.index}</span>
              <span className="lname" title={layer.name}>
                {layer.name || '—'}
              </span>
              {layer.bypassed && <span className="tag">BYP</span>}
            </div>
            <div className="clips">
              {clips.length === 0 && <span className="row-empty">no clips</span>}
              {clips.map((clip) => (
                <button
                  key={clip.index}
                  className={`clip ${clip.connected === 'Connected' ? 'live' : ''}`}
                  title={`${clip.name} — L${layer.index}/${clip.index} · click to fire · drag onto a lane to schedule`}
                  draggable
                  onDragStart={(e) => {
                    dragState.clip = { layer: layer.index, clip: clip.index, label: clip.name }
                    e.dataTransfer.effectAllowed = 'copy'
                    e.dataTransfer.setData('text/plain', `L${layer.index}/${clip.index}`)
                  }}
                  onDragEnd={() => {
                    dragState.clip = null
                  }}
                  onClick={() => onFire(layer.index, clip.index, clip.name)}
                >
                  <img
                    className="thumb"
                    loading="lazy"
                    alt=""
                    src={`http://${host}:8080/api/v1/composition/layers/${layer.index}/clips/${clip.index}/thumbnail`}
                  />
                  <span className="cname">{clip.name}</span>
                  <span className="cidx">{clip.index}</span>
                </button>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
