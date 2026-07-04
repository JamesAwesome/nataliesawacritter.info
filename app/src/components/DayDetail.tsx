import type { Sighting } from '../api'
import { formatDay } from '../lib/format'
import { SightingRow } from './SightingRow'

type Props = {
  date: string
  sightings: Sighting[]
  onSelect: (id: string) => void
  onClose: () => void
}

export function DayDetail({ date, sightings, onSelect, onClose }: Props) {
  return (
    <div className="day-detail">
      <h2 className="sheet-heading">{formatDay(date)}</h2>
      <ul className="recent-list">
        {sightings.map((s) => (
          <SightingRow key={s.id} sighting={s} onSelect={onSelect} />
        ))}
      </ul>
      <button type="button" className="btn-secondary flow-cancel" onClick={onClose}>
        Close
      </button>
    </div>
  )
}
