import { nameFor } from '../lib/critters'
import type { LeaderRow } from '../lib/insights'

// docs/design/README.md §4 — the 7-stop rainbow, cycled index i and i+2 per row.
// Token references (not hex) keep the no-raw-hex rule.
const BAR_COLORS = [
  'var(--tint-pink)',
  'var(--tint-peach)',
  'var(--tint-yellow)',
  'var(--tint-mint)',
  'var(--tint-aqua)',
  'var(--tint-sky)',
  'var(--tint-lavender)',
]
const MEDALS = ['🥇', '🥈', '🥉']

type Props = { rows: LeaderRow[] }

export function LeaderboardList({ rows }: Props) {
  const max = rows.length > 0 ? rows[0].count : 1 // rows are count-desc, so [0] is the max
  return (
    <ol className="leaderboard">
      {rows.map((row, i) => {
        const width = Math.round(Math.max(8, (row.count / max) * 100) * 100) / 100
        const gradient = `linear-gradient(90deg, ${BAR_COLORS[i % 7]}, ${BAR_COLORS[(i + 2) % 7]})`
        return (
          <li
            key={`${row.emoji} ${row.name ?? ''}`}
            className="leader-row"
            aria-label={`Rank ${i + 1}: ${row.name ?? nameFor(row.emoji) ?? row.emoji}, ${row.count} sighting${row.count === 1 ? '' : 's'}`}
          >
            <span className="leader-rank">{i < 3 ? MEDALS[i] : `#${i + 1}`}</span>
            <span className="leader-critter">
              <span className="leader-emoji" aria-hidden="true">
                {row.emoji}
              </span>
              {row.name !== null && <span className="leader-name">{row.name}</span>}
            </span>
            <span className="leader-bar-track">
              <span className="leader-bar-fill" style={{ width: `${width}%`, background: gradient }} />
            </span>
            <span className="leader-count">{row.count}</span>
          </li>
        )
      })}
    </ol>
  )
}
