import type { Sighting } from '../api'
import { formatWhen } from '../lib/format'

type Props = {
  sightings: Sighting[]
  status: 'loading' | 'ready' | 'error'
  onRetry: () => void
}

export function RecentCritters({ sightings, status, onRetry }: Props) {
  return (
    <section className="recent-critters" data-testid="recent-critters">
      <h2>Recent Critters</h2>
      {status === 'loading' && <p className="muted">Checking the burrow…</p>}
      {status === 'error' && (
        <p className="muted">
          Couldn't load sightings 😿{' '}
          <button type="button" className="link-button" onClick={onRetry}>
            Retry
          </button>
        </p>
      )}
      {status === 'ready' && sightings.length === 0 && (
        <p className="muted">No critters yet — log the first one!</p>
      )}
      {status === 'ready' && sightings.length > 0 && (
        <ul className="recent-list">
          {sightings.slice(0, 4).map((s) => (
            <li key={s.id} className="recent-row">
              <span className="recent-emoji" aria-hidden="true">{s.emoji}</span>
              <span className="recent-main">
                <span className="recent-name">{s.name ?? s.emoji}</span>
                <span className="recent-meta">{formatWhen(s.sightedOn, s.sightedTime)}</span>
              </span>
              <span className="recent-chevron" aria-hidden="true">›</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
