import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Sighting } from '../api'
import { useSightings } from './useSightings'

const ROW: Sighting = {
  id: '3f9a26cc-1c0e-4c3a-9b52-08a1c2f4d9aa', emoji: '🦊', name: 'Fox',
  sightedOn: '2026-07-03', sightedTime: null, place: null, comment: null,
  photoPath: null, createdAt: '2026-07-03T12:00:00.000Z',
}

afterEach(() => {
  vi.unstubAllGlobals()
})

function stubFetchOnce(responses: Array<{ status: number; body: unknown }>) {
  const queue = [...responses]
  vi.stubGlobal('fetch', vi.fn(async () => {
    const next = queue.shift() ?? { status: 500, body: { error: 'internal' } }
    return new Response(JSON.stringify(next.body), { status: next.status })
  }))
}

describe('useSightings', () => {
  it('loads sightings on mount', async () => {
    stubFetchOnce([{ status: 200, body: [ROW] }])
    const { result } = renderHook(() => useSightings())
    expect(result.current.status).toBe('loading')
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.sightings).toEqual([ROW])
  })

  it('reports error state on load failure and recovers via retry', async () => {
    stubFetchOnce([
      { status: 500, body: { error: 'internal' } },
      { status: 200, body: [ROW] },
    ])
    const { result } = renderHook(() => useSightings())
    await waitFor(() => expect(result.current.status).toBe('error'))
    act(() => result.current.retry())
    expect(result.current.status).toBe('loading')
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.sightings).toEqual([ROW])
  })

  it('addSighting prepends the created row', async () => {
    const newRow = { ...ROW, id: '00000000-0000-4000-8000-000000000001', emoji: '🦉' }
    stubFetchOnce([
      { status: 200, body: [ROW] },
      { status: 201, body: newRow },
    ])
    const { result } = renderHook(() => useSightings())
    await waitFor(() => expect(result.current.status).toBe('ready'))
    await act(() => result.current.addSighting({ emoji: '🦉', sightedOn: '2026-07-03' }, 'Basic x'))
    expect(result.current.sightings.map((s) => s.emoji)).toEqual(['🦉', '🦊'])
  })

  it('addSighting rethrows ApiError without mutating state', async () => {
    stubFetchOnce([
      { status: 200, body: [ROW] },
      { status: 401, body: { error: 'unauthorized' } },
    ])
    const { result } = renderHook(() => useSightings())
    await waitFor(() => expect(result.current.status).toBe('ready'))
    await expect(
      act(() => result.current.addSighting({ emoji: '🦉', sightedOn: '2026-07-03' }, 'Basic bad')),
    ).rejects.toMatchObject({ status: 401 })
    expect(result.current.sightings).toEqual([ROW])
  })
})
