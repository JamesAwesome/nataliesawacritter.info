import { useCallback, useEffect, useState } from 'react'
import { ApiError, createSighting, deleteSighting, listSightings, type NewSightingInput, type Sighting } from '../api'

export type SightingsState = {
  sightings: Sighting[]
  status: 'loading' | 'ready' | 'error'
  addSighting(fields: NewSightingInput, authHeader: string): Promise<void>
  removeSighting(id: string, authHeader: string): Promise<void>
  retry(): void
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

  const addSighting = useCallback(async (fields: NewSightingInput, authHeader: string) => {
    const created = await createSighting(fields, authHeader)
    setSightings((current) => [created, ...current])
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

  return { sightings, status, addSighting, removeSighting, retry }
}
