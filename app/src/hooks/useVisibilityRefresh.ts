import { useEffect } from 'react'

/**
 * Runs `refresh` when the page becomes visible again. Installed PWAs are
 * suspended and resumed rather than relaunched, so mount-time fetches go
 * stale — and standalone mode has no browser chrome to force a reload.
 */
export function useVisibilityRefresh(refresh: () => void): void {
  useEffect(() => {
    const onChange = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    document.addEventListener('visibilitychange', onChange)
    return () => document.removeEventListener('visibilitychange', onChange)
  }, [refresh])
}
