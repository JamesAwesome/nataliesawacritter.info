import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeSighting, stubFetchQueue } from '../test/helpers'
import { useSightings } from './useSightings'

const ROW = makeSighting({
  id: '3f9a26cc-1c0e-4c3a-9b52-08a1c2f4d9aa',
  sightedOn: '2026-07-03',
  createdAt: '2026-07-03T12:00:00.000Z',
})

afterEach(() => {
  vi.unstubAllGlobals()
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
})
