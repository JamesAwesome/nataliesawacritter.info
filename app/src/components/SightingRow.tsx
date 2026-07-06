import type { Sighting } from '../api'
import { nameFor } from '../lib/critters'
import { formatWhen } from '../lib/format'
import { CritterGlyph } from './CritterGlyph'

type Props = { sighting: Sighting; onSelect?: (id: string) => void; starred?: boolean }

export function SightingRow({ sighting, onSelect, starred }: Props) {
  const body = (
    <>
      <CritterGlyph emoji={sighting.emoji} className="recent-emoji" />
      <span className="recent-main">
        <span className="recent-name">
          {sighting.name ?? (nameFor(sighting.emoji) ?? sighting.emoji)}
          {starred === true && (
            <>
              <span className="row-star" aria-hidden="true">⭐</span>
              <span className="visually-hidden">, friend</span>
            </>
          )}
        </span>
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
