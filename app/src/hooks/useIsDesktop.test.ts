import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DESKTOP_QUERY, useIsDesktop } from './useIsDesktop'

type Listener = (event: MediaQueryListEvent) => void

function stubMatchMedia(matches: boolean) {
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
  const matchMedia = vi.fn(() => mql)
  vi.stubGlobal('matchMedia', matchMedia)
  return {
    mql,
    matchMedia,
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
    const { fireChange } = stubMatchMedia(false)
    const { result } = renderHook(() => useIsDesktop())
    expect(result.current).toBe(false)
    act(() => {
      fireChange(true)
    })
    expect(result.current).toBe(true)
  })

  it('removes its listener on unmount', () => {
    const { mql } = stubMatchMedia(false)
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
