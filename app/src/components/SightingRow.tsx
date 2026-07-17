import type { Sighting } from '../api'
import { nameFor } from '../lib/critters'
import { formatWhen } from '../lib/format'
import { quantityLabel } from '../lib/quantity'
import { CritterGlyph } from './CritterGlyph'
import { LikeButton } from './LikeButton'

type Props = {
  sighting: Sighting
  onSelect?: (id: string) => void
  starred?: boolean
  onToggleLike?: (sighting: Sighting) => void
}

export function SightingRow({ sighting, onSelect, starred, onToggleLike }: Props) {
  const displayName = sighting.name ?? (nameFor(sighting.emoji) ?? sighting.emoji)
  const body = (
    <>
      <CritterGlyph emoji={sighting.emoji} className="recent-emoji" />
      <span className="recent-main">
        <span className="recent-name">
          {displayName}
          {quantityLabel(sighting.quantity) !== '' && (
            <span className="qty-badge">{quantityLabel(sighting.quantity)}</span>
          )}
          {starred === true && (
            <>
              <span className="row-star" aria-hidden="true">⭐</span>
              <span className="visually-hidden">, friend</span>
            </>
          )}
          {sighting.photoPath !== null && (
            <>
              <span className="row-photo" aria-hidden="true">📸</span>
              <span className="visually-hidden">, has photo</span>
            </>
          )}
        </span>
        <span className="recent-meta">{formatWhen(sighting.sightedOn, sighting.sightedTime)}</span>
      </span>
      <span className="recent-chevron" aria-hidden="true">›</span>
    </>
  )
  return (
    <li className="recent-row">
      {onSelect === undefined ? (
        <div className="row-open">{body}</div>
      ) : (
        <button type="button" className="row-open" onClick={() => onSelect(sighting.id)}>
          {body}
        </button>
      )}
      {onToggleLike !== undefined && <LikeButton sighting={sighting} onToggle={onToggleLike} />}
    </li>
  )
}
