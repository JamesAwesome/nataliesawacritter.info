import type { Sighting } from '../api'
import { formatWhen } from '../lib/format'

type Props = { sighting: Sighting; onSelect?: (id: string) => void }

export function SightingRow({ sighting, onSelect }: Props) {
  const body = (
    <>
      <span className="recent-emoji" aria-hidden="true">{sighting.emoji}</span>
      <span className="recent-main">
        <span className="recent-name">{sighting.name ?? sighting.emoji}</span>
        <span className="recent-meta">{formatWhen(sighting.sightedOn, sighting.sightedTime)}</span>
      </span>
      <span className="recent-chevron" aria-hidden="true">›</span>
    </>
  )
  return (
    <li className={onSelect === undefined ? 'recent-row' : undefined}>
      {onSelect === undefined ? (
        body
      ) : (
        <button type="button" className="recent-row row-button" onClick={() => onSelect(sighting.id)}>
          {body}
        </button>
      )}
    </li>
  )
}
