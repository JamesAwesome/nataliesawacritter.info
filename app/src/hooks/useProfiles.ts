import { useCallback, useEffect, useState } from 'react'
import {
  ApiError,
  createProfile,
  deleteProfile,
  listProfiles,
  type NewProfileInput,
  type Profile,
} from '../api'

export type ProfilesState = {
  profiles: Profile[]
  status: 'loading' | 'ready' | 'error'
  addProfile(fields: NewProfileInput, authHeader: string): Promise<void>
  removeProfile(id: string, authHeader: string): Promise<void>
  retry(): void
}

export function useProfiles(): ProfilesState {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [loadCount, setLoadCount] = useState(0)

  useEffect(() => {
    let cancelled = false
    listProfiles()
      .then((rows) => {
        if (cancelled) return
        setProfiles(rows)
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

  const addProfile = useCallback(async (fields: NewProfileInput, authHeader: string) => {
    try {
      const created = await createProfile(fields, authHeader)
      setProfiles((current) => [created, ...current])
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // Already saved server-side — converge on the existing row.
        setProfiles(await listProfiles())
        return
      }
      throw err
    }
  }, [])

  const removeProfile = useCallback(async (id: string, authHeader: string) => {
    try {
      await deleteProfile(id, authHeader)
    } catch (err) {
      // 404 = already gone server-side; fall through to local removal
      if (!(err instanceof ApiError && err.status === 404)) throw err
    }
    setProfiles((current) => current.filter((p) => p.id !== id))
  }, [])

  return { profiles, status, addProfile, removeProfile, retry }
}
