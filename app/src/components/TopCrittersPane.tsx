import { useMemo } from 'react'
import type { Sighting } from '../api'
import { leaderboard } from '../lib/insights'
import { LeaderboardList } from './LeaderboardList'

type Props = { sightings: Sighting[] }

export function TopCrittersPane({ sightings }: Props) {
  // Memoized: this pane stays mounted (hidden) on other tabs, so without this
  // the O(n log n) leaderboard would recompute on every unrelated App re-render.
  const rows = useMemo(() => leaderboard(sightings), [sightings])
  if (rows.length === 0) {
    return (
      <section className="top-critters-pane">
        <p className="muted">No critters logged yet 🐾</p>
      </section>
    )
  }
  return (
    <section className="top-critters-pane">
      <LeaderboardList rows={rows} />
    </section>
  )
}
