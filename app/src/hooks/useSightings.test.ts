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
  it('inserts an added sighting in sighted-date order, not just at the top', async () => {
    const newer = makeSighting({
      id: '00000000-0000-4000-8000-0000000000a1',
      emoji: '🦉',
      sightedOn: '2026-07-05',
      createdAt: '2026-07-05T09:00:00.000Z',
    })
    // Sighted earlier (07-01) but logged most recently (07-06) — must sort BELOW the 07-05 one.
    const backdated = makeSighting({
      id: '00000000-0000-4000-8000-0000000000b2',
      emoji: '🦊',
      sightedOn: '2026-07-01',
      createdAt: '2026-07-06T09:00:00.000Z',
    })
    stubFetchQueue([
      { status: 200, body: [newer] },
      { status: 201, body: backdated },
    ])
    const { result } = renderHook(() => useSightings())
    await waitFor(() => expect(result.current.status).toBe('ready'))
    await act(() => result.current.addSighting({ emoji: '🦊', sightedOn: '2026-07-01' }, 'Basic x'))
    expect(result.current.sightings.map((s) => s.sightedOn)).toEqual(['2026-07-05', '2026-07-01'])
  })
  it('orders same-day sightings by sighting time (latest first), not by log order', async () => {
    const cardinal = makeSighting({
      id: '00000000-0000-4000-8000-0000000000c1', name: 'Cardinal',
      sightedOn: '2026-07-05', sightedTime: '19:30', createdAt: '2026-07-05T10:00:00.000Z',
    })
    // Seen at 3:08 PM but logged LATER than the cardinal — must still sort below it.
    const seagull = makeSighting({
      id: '00000000-0000-4000-8000-0000000000c2', name: 'Seagull',
      sightedOn: '2026-07-05', sightedTime: '15:08', createdAt: '2026-07-05T23:00:00.000Z',
    })
    stubFetchQueue([{ status: 200, body: [seagull, cardinal] }])
    const { result } = renderHook(() => useSightings())
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.sightings.map((s) => s.name)).toEqual(['Cardinal', 'Seagull'])
  })
  it('sinks untimed sightings below timed ones on the same day, latest-logged first', async () => {
    const timed = makeSighting({
      id: '00000000-0000-4000-8000-0000000000d1', name: 'Timed',
      sightedOn: '2026-07-05', sightedTime: '09:00', createdAt: '2026-07-05T01:00:00.000Z',
    })
    const untimedEarly = makeSighting({
      id: '00000000-0000-4000-8000-0000000000d2', name: 'UntimedEarly',
      sightedOn: '2026-07-05', sightedTime: null, createdAt: '2026-07-05T02:00:00.000Z',
    })
    const untimedLate = makeSighting({
      id: '00000000-0000-4000-8000-0000000000d3', name: 'UntimedLate',
      sightedOn: '2026-07-05', sightedTime: null, createdAt: '2026-07-05T03:00:00.000Z',
    })
    stubFetchQueue([{ status: 200, body: [untimedEarly, timed, untimedLate] }])
    const { result } = renderHook(() => useSightings())
    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.sightings.map((s) => s.name)).toEqual(['Timed', 'UntimedLate', 'UntimedEarly'])
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
