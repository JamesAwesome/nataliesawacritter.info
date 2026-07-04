import type { Sighting } from '../api'
import { SightingRow } from './SightingRow'

type Props = {
  sightings: Sighting[]
  status: 'loading' | 'ready' | 'error'
  onRetry: () => void
  onSelect?: (id: string) => void
}

export function RecentCritters({ sightings, status, onRetry, onSelect }: Props) {
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
            <SightingRow key={s.id} sighting={s} onSelect={onSelect} />
          ))}
        </ul>
      )}
    </section>
  )
}
