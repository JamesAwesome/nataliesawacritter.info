import { vi, beforeEach, afterEach, type Mock } from 'vitest'
import type { Sighting, Profile } from '../api'

let counter = 0

export function makeSighting(overrides: Partial<Sighting> = {}): Sighting {
  counter += 1
  return {
    id: `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`,
    emoji: '🦊',
    name: 'Fox',
    sightedOn: '2026-07-02',
    sightedTime: null,
    place: null,
    comment: null,
    photoPath: null,
    createdAt: '2026-07-02T12:00:00.000Z',
    ...overrides,
  }
}

export function stubFetchQueue(responses: Array<{ status: number; body: unknown }>): Mock {
  const queue = [...responses]
  const mock = vi.fn(async () => {
    const next = queue.shift() ?? { status: 500, body: { error: 'internal' } }
    return new Response(next.body === null ? null : JSON.stringify(next.body), { status: next.status })
  })
  vi.stubGlobal('fetch', mock)
  return mock
}

export function stubFetchByUrl(routes: Record<string, Array<{ status: number; body: unknown }>>): Mock {
  const queues = new Map(Object.entries(routes).map(([url, rs]) => [url, [...rs]]))
  const mock = vi.fn(async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : new URL(input.url, 'http://x').pathname
    const key = [...queues.keys()].find((k) => url.startsWith(k))
    const next = (key !== undefined ? queues.get(key)!.shift() : undefined) ?? { status: 500, body: { error: 'internal' } }
    return new Response(next.body === null ? null : JSON.stringify(next.body), { status: next.status })
  })
  vi.stubGlobal('fetch', mock)
  return mock
}

export function stubMatchMedia(matches: boolean): { fireChange(matches: boolean): void } {
  let current = matches
  const listeners = new Set<(e: { matches: boolean }) => void>()
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
    get matches() { return current },
    media: query,
    addEventListener: (_: string, fn: (e: { matches: boolean }) => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: (e: { matches: boolean }) => void) => listeners.delete(fn),
  })))
  return {
    fireChange(next: boolean) {
      current = next
      for (const fn of listeners) fn({ matches: next })
    },
  }
}

export const FIXED_NOW = '2026-07-03T15:00:00'

export function useFakeClock(): void {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(FIXED_NOW))
  })
  afterEach(() => {
    vi.useRealTimers()
  })
}

let profileSeq = 0

export function makeProfile(overrides: Partial<Profile> = {}): Profile {
  profileSeq += 1
  return {
    id: `00000000-0000-4000-8000-${String(profileSeq).padStart(12, '0')}`,
    emoji: '🦊',
    name: 'Mr Fox',
    place: 'train station',
    createdAt: '2026-07-04T12:00:00.000Z',
    ...overrides,
  }
}
