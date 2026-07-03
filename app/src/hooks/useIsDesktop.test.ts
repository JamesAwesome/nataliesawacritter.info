import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { stubMatchMedia } from '../test/helpers'
import { DESKTOP_QUERY, useIsDesktop } from './useIsDesktop'

type Listener = (event: MediaQueryListEvent) => void

// useIsDesktop reads `mql.matches` off the single MediaQueryList object it
// captures in its effect (matching real browser behavior, where that object
// is live) rather than off the dispatched event. The shared `stubMatchMedia`
// helper hands back a fresh object literal on every `matchMedia()` call, so
// its `fireChange` can't mutate the reference the hook already captured — it
// only suits consumers that read `event.matches`. Keep this small
// mutable-reference stub for the two tests that depend on that captured
// object staying live (the change-event toggle and listener cleanup).
function stubMatchMediaLive(matches: boolean) {
  const listeners = new Set<Listener>()
  const mql = {
    matches,
    media: DESKTOP_QUERY,
    addEventListener: vi.fn((event: string, listener: Listener) => {
      if (event === 'change') listeners.add(listener)
    }),
    removeEventListener: vi.fn((event: string, listener: Listener) => {
      if (event === 'change') listeners.delete(listener)
    }),
  }
  vi.stubGlobal('matchMedia', vi.fn(() => mql))
  return {
    mql,
    fireChange(nextMatches: boolean) {
      mql.matches = nextMatches
      for (const listener of listeners) {
        listener({ matches: nextMatches } as MediaQueryListEvent)
      }
    },
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useIsDesktop', () => {
  it('returns false when matchMedia is undefined (jsdom default)', () => {
    const { result } = renderHook(() => useIsDesktop())
    expect(result.current).toBe(false)
  })

  it('returns true when a stubbed matchMedia reports matches: true for the desktop query', () => {
    stubMatchMedia(true)
    const { result } = renderHook(() => useIsDesktop())
    expect(result.current).toBe(true)
  })

  it('toggles when the stubbed MediaQueryList fires a change event', () => {
    const { fireChange } = stubMatchMediaLive(false)
    const { result } = renderHook(() => useIsDesktop())
    expect(result.current).toBe(false)
    act(() => {
      fireChange(true)
    })
    expect(result.current).toBe(true)
  })

  it('removes its listener on unmount', () => {
    const { mql } = stubMatchMediaLive(false)
    const { unmount } = renderHook(() => useIsDesktop())
    expect(mql.addEventListener).toHaveBeenCalledWith('change', expect.any(Function))
    unmount()
    expect(mql.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function))
  })

  it('breakpoint stays in sync with index.css', () => {
    // Split `import.meta.url` out of the `new URL(...)` call so Vite's static
    // asset-URL analysis (which rewrites the literal `new URL('x', import.meta.url)`
    // pattern to a dev-server URL) doesn't intercept this — we need the real
    // file:// URL to read the source file from disk.
    const metaUrl = import.meta.url
    const css = readFileSync(fileURLToPath(new URL('../index.css', metaUrl)), 'utf8')
    const match = DESKTOP_QUERY.match(/min-width:\s*(\d+)px/)
    expect(match).not.toBeNull()
    expect(css).toContain(`@media (min-width: ${match![1]}px)`)
  })
})
