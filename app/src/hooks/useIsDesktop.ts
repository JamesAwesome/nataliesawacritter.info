import { useEffect, useState } from 'react'

// Keep in sync with the `@media (min-width: 880px)` breakpoint in index.css.
const DESKTOP_QUERY = '(min-width: 880px)'

function matchesDesktop(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia(DESKTOP_QUERY).matches
}

/**
 * Tracks whether the viewport is at/above the desktop breakpoint so App can
 * render the mobile vs. desktop RecentCritters slot exclusively, rather than
 * mounting both and relying on CSS to hide one (which would duplicate
 * accessible content — e.g. the same sighting's name — in the DOM).
 */
export function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(matchesDesktop)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mql = window.matchMedia(DESKTOP_QUERY)
    const handler = () => setIsDesktop(mql.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])

  return isDesktop
}
