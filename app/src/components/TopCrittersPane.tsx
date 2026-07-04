import type { Sighting } from '../api'
import { leaderboard } from '../lib/insights'
import { LeaderboardList } from './LeaderboardList'

type Props = { sightings: Sighting[] }

export function TopCrittersPane({ sightings }: Props) {
  const rows = leaderboard(sightings)
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
