import { useCallback, useEffect, useState } from 'react'
import { ApiError, createSighting, deleteSighting, listSightings, type NewSightingInput, type Sighting } from '../api'
import { useVisibilityRefresh } from './useVisibilityRefresh'

export type SightingsState = {
  sightings: Sighting[]
  status: 'loading' | 'ready' | 'error'
  addSighting(fields: NewSightingInput, authHeader: string): Promise<Sighting>
  removeSighting(id: string, authHeader: string): Promise<void>
  applySighting(updated: Sighting): void
  retry(): void
}

// A sighting's recorded time as sortable 24h ('15:08'), normalizing any legacy
// 'h:mm AM/PM' rows; null for no-time ("just now") or free-text values.
function to24h(value: string | null): string | null {
  if (value === null) return null
  if (/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return value
  const m = /^(\d{1,2}):([0-5]\d) (AM|PM)$/i.exec(value)
  if (m === null) return null
  const hour = (Number(m[1]) % 12) + (m[3].toUpperCase() === 'PM' ? 12 : 0)
  return `${String(hour).padStart(2, '0')}:${m[2]}`
}

// Canonical order — latest sighting first: by sighted date, then time-of-day
// (untimed rows sink below timed ones within a day), then most-recently logged
// as the final tiebreak. Keeps the list in the order Natalie saw things, not the
// order she happened to log them. sightedOn/createdAt sort as plain strings.
function compareSightings(a: Sighting, b: Sighting): number {
  if (a.sightedOn !== b.sightedOn) return a.sightedOn < b.sightedOn ? 1 : -1
  const ta = to24h(a.sightedTime)
  const tb = to24h(b.sightedTime)
  if (ta !== tb) {
    if (ta === null) return 1
    if (tb === null) return -1
    return ta < tb ? 1 : -1
  }
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1
  return 0
}

function sorted(rows: Sighting[]): Sighting[] {
  return [...rows].sort(compareSightings)
}

export function useSightings(): SightingsState {
  const [sightings, setSightings] = useState<Sighting[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [loadCount, setLoadCount] = useState(0)

  useEffect(() => {
    let cancelled = false
    listSightings()
      .then((rows) => {
        if (cancelled) return
        setSightings(sorted(rows))
        setStatus('ready')
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [loadCount])

  const retry = useCallback(() => {
    setStatus('loading')
    setLoadCount((n) => n + 1)
  }, [])

  // Silent: on failure keep whatever is on screen; on success also clear a
  // stale error state (a resumed PWA may have errored days ago).
  useVisibilityRefresh(
    useCallback(() => {
      listSightings()
        .then((rows) => {
          setSightings(sorted(rows))
          setStatus('ready')
        })
        .catch(() => {})
    }, []),
  )

  const addSighting = useCallback(async (fields: NewSightingInput, authHeader: string) => {
    const created = await createSighting(fields, authHeader)
    // Stable sort keeps `created` ahead of same-timestamp rows (newest-first).
    setSightings((current) => sorted([created, ...current]))
    return created
  }, [])

  const removeSighting = useCallback(async (id: string, authHeader: string) => {
    try {
      await deleteSighting(id, authHeader)
    } catch (err) {
      // 404 = already gone server-side; fall through to local removal
      if (!(err instanceof ApiError && err.status === 404)) throw err
    }
    setSightings((current) => current.filter((s) => s.id !== id))
  }, [])

  const applySighting = useCallback((updated: Sighting) => {
    setSightings((current) => current.map((s) => (s.id === updated.id ? updated : s)))
  }, [])

  return { sightings, status, addSighting, removeSighting, applySighting, retry }
}
