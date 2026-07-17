import type { Sighting } from '../api'
import { formatDay } from '../lib/format'
import { isFriendSighting } from '../lib/friends'
import { SightingRow } from './SightingRow'

type Props = {
  date: string
  sightings: Sighting[]
  onSelect: (id: string) => void
  onClose: () => void
  friendKeys: Set<string>
  onToggleLike?: (s: Sighting) => void
}

export function DayDetail({ date, sightings, onSelect, onClose, friendKeys, onToggleLike }: Props) {
  return (
    <div className="day-detail">
      <h2 className="sheet-heading">{formatDay(date)}</h2>
      <ul className="recent-list">
        {sightings.map((s) => (
          <SightingRow
            key={s.id}
            sighting={s}
            onSelect={onSelect}
            onToggleLike={onToggleLike}
            starred={isFriendSighting(s, friendKeys)}
          />
        ))}
      </ul>
      <button type="button" className="btn-secondary flow-cancel" onClick={onClose}>
        Close
      </button>
    </div>
  )
}
