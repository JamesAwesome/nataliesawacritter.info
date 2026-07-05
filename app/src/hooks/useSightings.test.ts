import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { type Sighting } from '../api'
import { makeSighting, stubFetchQueue } from '../test/helpers'
import { useSightings } from './useSightings'

const ROW = makeSighting({
  id: '3f9a26cc-1c0e-4c3a-9b52-08a1c2f4d9aa',
  sightedOn: '2026-07-03',
  createdAt: '2026-07-03T12:00:00.000Z',
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('useSightings', () => {
  it('loads sightings on mount', async () => {
    stubFetchQueue([{ status: 200, body: [ROW] }])
    const { result } = renderHook(() => useSightings())
    expect(result.current.status).toBe('loading')
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.sightings).toEqual([ROW])
  })

  it('reports error state on load failure and recovers via retry', async () => {
    stubFetchQueue([
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
    stubFetchQueue([
      { status: 200, body: [ROW] },
      { status: 201, body: newRow },
    ])
    const { result } = renderHook(() => useSightings())
    await waitFor(() => expect(result.current.status).toBe('ready'))
    await act(() => result.current.addSighting({ emoji: '🦉', sightedOn: '2026-07-03' }, 'Basic x'))
    expect(result.current.sightings.map((s) => s.emoji)).toEqual(['🦉', '🦊'])
  })

  it('addSighting rethrows ApiError without mutating state', async () => {
    stubFetchQueue([
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

  it('removeSighting deletes the row from state on 204', async () => {
    const row = makeSighting()
    stubFetchQueue([
      { status: 200, body: [row] },
      { status: 204, body: null },
    ])
    const { result } = renderHook(() => useSightings())
    await waitFor(() => expect(result.current.status).toBe('ready'))
    await act(() => result.current.removeSighting(row.id, 'Basic x'))
    expect(result.current.sightings).toEqual([])
  })

  it('removeSighting treats 404 as success', async () => {
    const row = makeSighting()
    stubFetchQueue([
      { status: 200, body: [row] },
      { status: 404, body: { error: 'not found' } },
    ])
    const { result } = renderHook(() => useSightings())
    await waitFor(() => expect(result.current.status).toBe('ready'))
    await act(() => result.current.removeSighting(row.id, 'Basic x'))
    expect(result.current.sightings).toEqual([])
  })

  it('removeSighting rethrows other errors without touching state', async () => {
    const row = makeSighting()
    stubFetchQueue([
      { status: 200, body: [row] },
      { status: 503, body: { error: 'writes disabled' } },
    ])
    const { result } = renderHook(() => useSightings())
    await waitFor(() => expect(result.current.status).toBe('ready'))
    await expect(
      act(() => result.current.removeSighting(row.id, 'Basic x')),
    ).rejects.toMatchObject({ status: 503 })
    expect(result.current.sightings).toEqual([row])
  })

  it('addSighting resolves with the created row', async () => {
    const created = makeSighting()
    stubFetchQueue([
      { status: 200, body: [] },
      { status: 201, body: created },
    ])
    const { result } = renderHook(() => useSightings())
    await waitFor(() => expect(result.current.status).toBe('ready'))
    let returned: Sighting | undefined
    await act(async () => {
      returned = await result.current.addSighting({ emoji: '🦊', sightedOn: '2026-07-01' }, 'Basic x')
    })
    expect(returned).toEqual(created)
  })

  it('applySighting replaces the matching row in place', async () => {
    const original = makeSighting()
    stubFetchQueue([{ status: 200, body: [original] }])
    const { result } = renderHook(() => useSightings())
    await waitFor(() => expect(result.current.status).toBe('ready'))
    const updated = { ...original, photoPath: '/api/photos/x-1.jpg' }
    act(() => result.current.applySighting(updated))
    expect(result.current.sightings).toEqual([updated])
  })

  it('refetches silently when the page becomes visible again', async () => {
    const fresh = makeSighting({ id: '00000000-0000-4000-8000-000000000002', emoji: '🦝' })
    stubFetchQueue([
      { status: 200, body: [ROW] },
      { status: 200, body: [fresh, ROW] },
    ])
    const { result } = renderHook(() => useSightings())
    await waitFor(() => expect(result.current.status).toBe('ready'))
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await waitFor(() => expect(result.current.sightings).toHaveLength(2))
    expect(result.current.status).toBe('ready')
  })

  it('keeps the stale list when the visibility refetch fails', async () => {
    stubFetchQueue([
      { status: 200, body: [ROW] },
      { status: 500, body: { error: 'internal' } },
    ])
    const { result } = renderHook(() => useSightings())
    await waitFor(() => expect(result.current.status).toBe('ready'))
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await act(async () => {})
    expect(result.current.sightings).toEqual([ROW])
    expect(result.current.status).toBe('ready')
  })

  it('does not refetch while the page is hidden', async () => {
    const mock = stubFetchQueue([{ status: 200, body: [ROW] }])
    const { result } = renderHook(() => useSightings())
    await waitFor(() => expect(result.current.status).toBe('ready'))
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await act(async () => {})
    expect(mock).toHaveBeenCalledTimes(1)
  })

  it('recovers from an initial load error via a visibility refetch', async () => {
    stubFetchQueue([
      { status: 500, body: { error: 'internal' } },
      { status: 200, body: [ROW] },
    ])
    const { result } = renderHook(() => useSightings())
    await waitFor(() => expect(result.current.status).toBe('error'))
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.sightings).toEqual([ROW])
  })
})
