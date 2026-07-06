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

// Canonical order, matching the server query (sighted date desc, then logged
// time desc). Applied after optimistic inserts so a backdated sighting lands in
// chronological place instead of jumping to the top. sightedOn is 'YYYY-MM-DD'
// and createdAt is an ISO string — both sort correctly as plain strings.
function compareSightings(a: Sighting, b: Sighting): number {
  if (a.sightedOn !== b.sightedOn) return a.sightedOn < b.sightedOn ? 1 : -1
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1
  return 0
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
        setSightings(rows)
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
          setSightings(rows)
          setStatus('ready')
        })
        .catch(() => {})
    }, []),
  )

  const addSighting = useCallback(async (fields: NewSightingInput, authHeader: string) => {
    const created = await createSighting(fields, authHeader)
    // Stable sort keeps `created` ahead of same-timestamp rows (newest-first).
    setSightings((current) => [created, ...current].sort(compareSightings))
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
