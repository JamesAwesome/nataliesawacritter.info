import { useMemo, useState } from 'react'
import type { Sighting } from '../api'
import { isFriendSighting } from '../lib/friends'
import { filterByRange } from '../lib/insights'
import { SightingRow } from './SightingRow'

type Props = { sightings: Sighting[]; onSelect: (id: string) => void; friendKeys: Set<string> }

export function HistoryPane({ sightings, onSelect, friendKeys }: Props) {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [friendsOnly, setFriendsOnly] = useState(false)
  // Memoized: the pane stays mounted (hidden) on other tabs; only re-filter when
  // the sightings or a bound changes, not on every unrelated App re-render.
  const ranged = useMemo(() => filterByRange(sightings, from, to), [sightings, from, to])
  const filtered = useMemo(
    () => (friendsOnly ? ranged.filter((s) => isFriendSighting(s, friendKeys)) : ranged),
    [ranged, friendsOnly, friendKeys],
  )
  const hasFilter = from !== '' || to !== '' || friendsOnly

  return (
    <section className="history-pane">
      <div className="history-filter">
        <input
          type="date"
          aria-label="From"
          value={from}
          max={to || undefined}
          onChange={(e) => setFrom(e.target.value)}
        />
        <span className="filter-to">to</span>
        <input
          type="date"
          aria-label="To"
          value={to}
          min={from || undefined}
          onChange={(e) => setTo(e.target.value)}
        />
        <button
          type="button"
          className={friendsOnly ? 'friends-chip active' : 'friends-chip'}
          aria-pressed={friendsOnly}
          onClick={() => setFriendsOnly((v) => !v)}
        >
          ⭐ Friends
        </button>
        {hasFilter && (
          <button
            type="button"
            className="link-button"
            onClick={() => {
              setFrom('')
              setTo('')
              setFriendsOnly(false)
            }}
          >
            Clear
          </button>
        )}
      </div>
      {sightings.length === 0 ? (
        <p className="muted">No critters logged yet 🐾</p>
      ) : filtered.length === 0 ? (
        <p className="muted">{friendsOnly ? 'No friend sightings here 😿' : 'No critters in that range 😿'}</p>
      ) : (
        <ul className="recent-list">
          {filtered.map((s) => (
            <SightingRow key={s.id} sighting={s} onSelect={onSelect} starred={isFriendSighting(s, friendKeys)} />
          ))}
        </ul>
      )}
    </section>
  )
}
