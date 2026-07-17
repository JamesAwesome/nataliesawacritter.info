import type { Sighting } from '../api'
import { nameFor } from '../lib/critters'
import { formatWhen } from '../lib/format'
import { hasLiked } from '../lib/likes'
import { quantityLabel } from '../lib/quantity'
import { CritterGlyph } from './CritterGlyph'

type Props = {
  sighting: Sighting
  onSelect?: (id: string) => void
  starred?: boolean
  onToggleLike?: (sighting: Sighting) => void
}

export function SightingRow({ sighting, onSelect, starred, onToggleLike }: Props) {
  const displayName = sighting.name ?? (nameFor(sighting.emoji) ?? sighting.emoji)
  const liked = onToggleLike !== undefined && hasLiked(sighting.id)
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
      {onToggleLike !== undefined && (
        <button
          type="button"
          className={liked ? 'like-button liked' : 'like-button'}
          aria-pressed={liked}
          aria-label={liked ? `Unlike ${displayName}` : `Like ${displayName}`}
          onClick={() => onToggleLike(sighting)}
        >
          <span aria-hidden="true">{liked ? '❤️' : '🤍'}</span>
          {sighting.likeCount > 0 && <span className="like-count">{sighting.likeCount}</span>}
        </button>
      )}
    </li>
  )
}
