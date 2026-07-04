import { useState } from 'react'
import type { Sighting } from '../api'
import { filterByRange } from '../lib/insights'
import { SightingRow } from './SightingRow'

type Props = { sightings: Sighting[]; onSelect: (id: string) => void }

export function HistoryPane({ sightings, onSelect }: Props) {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const filtered = filterByRange(sightings, from, to)
  const hasFilter = from !== '' || to !== ''

  return (
    <section className="history-pane">
      <div className="history-filter">
        <input
          type="date"
          aria-label="From"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        />
        <span className="filter-to">to</span>
        <input
          type="date"
          aria-label="To"
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />
        {hasFilter && (
          <button
            type="button"
            className="link-button"
            onClick={() => {
              setFrom('')
              setTo('')
            }}
          >
            Clear
          </button>
        )}
      </div>
      {sightings.length === 0 ? (
        <p className="muted">No critters logged yet 🐾</p>
      ) : filtered.length === 0 ? (
        <p className="muted">No critters in that range 😿</p>
      ) : (
        <ul className="recent-list">
          {filtered.map((s) => (
            <SightingRow key={s.id} sighting={s} onSelect={onSelect} />
          ))}
        </ul>
      )}
    </section>
  )
}
