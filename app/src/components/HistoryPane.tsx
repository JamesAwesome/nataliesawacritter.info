import { useMemo, useState } from 'react'
import type { Sighting } from '../api'
import { nameFor } from '../lib/critters'
import { isFriendSighting } from '../lib/friends'
import { filterByRange } from '../lib/insights'
import { SightingRow } from './SightingRow'

/** Case-insensitive match against what the row shows: the given name (or its
 *  species name, same source as the picker filter) and the place. */
function matchesQuery(s: Sighting, q: string): boolean {
  const haystack = [s.name ?? nameFor(s.emoji), s.place]
  return haystack.some((part) => part !== null && part !== undefined && part.toLowerCase().includes(q))
}

type Props = {
  sightings: Sighting[]
  onSelect: (id: string) => void
  friendKeys: Set<string>
  onToggleLike?: (s: Sighting) => void
}

export function HistoryPane({ sightings, onSelect, friendKeys, onToggleLike }: Props) {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [friendsOnly, setFriendsOnly] = useState(false)
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  // Memoized: the pane stays mounted (hidden) on other tabs; only re-filter when
  // the sightings or a bound changes, not on every unrelated App re-render.
  const ranged = useMemo(() => filterByRange(sightings, from, to), [sightings, from, to])
  const filtered = useMemo(() => {
    const byFriends = friendsOnly ? ranged.filter((s) => isFriendSighting(s, friendKeys)) : ranged
    return q === '' ? byFriends : byFriends.filter((s) => matchesQuery(s, q))
  }, [ranged, friendsOnly, friendKeys, q])
  const hasFilter = from !== '' || to !== '' || friendsOnly || query !== ''

  return (
    <section className="history-pane">
      <input
        type="search"
        className="picker-filter"
        placeholder="Filter critters…"
        aria-label="Filter critters"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
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
              setQuery('')
            }}
          >
            Clear
          </button>
        )}
      </div>
      {sightings.length === 0 ? (
        <p className="muted">No critters logged yet 🐾</p>
      ) : filtered.length === 0 ? (
        <p className="muted">
          {q !== ''
            ? `No critters match “${query.trim()}” 😿`
            : friendsOnly
              ? 'No friend sightings here 😿'
              : 'No critters in that range 😿'}
        </p>
      ) : (
        <ul className="recent-list">
          {filtered.map((s) => (
            <SightingRow
              key={s.id}
              sighting={s}
              onSelect={onSelect}
              onToggleLike={onToggleLike}
              starred={isFriendSighting(s, friendKeys)}
            />
          ))}
        </ul>
      )}
    </section>
  )
}
