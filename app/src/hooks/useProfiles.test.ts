import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { stubFetchQueue } from '../test/helpers'
import { useProfiles } from './useProfiles'

const PROFILE = {
  id: '3f9a26cc-1c0e-4c3a-9b52-08a1c2f4d9aa',
  emoji: '🦊',
  name: 'Mr Fox',
  place: 'train station',
  createdAt: '2026-07-04T12:00:00.000Z',
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useProfiles', () => {
  it('loads on mount and prepends on add', async () => {
    const second = { ...PROFILE, id: '00000000-0000-4000-8000-000000000001', name: 'Professor Hoot', emoji: '🦉' }
    stubFetchQueue([
      { status: 200, body: [PROFILE] },
      { status: 201, body: second },
    ])
    const { result } = renderHook(() => useProfiles())
    await waitFor(() => expect(result.current.status).toBe('ready'))
    await act(() => result.current.addProfile({ emoji: '🦉', name: 'Professor Hoot' }, 'Basic x'))
    expect(result.current.profiles.map((p) => p.name)).toEqual(['Professor Hoot', 'Mr Fox'])
  })

  it('treats 409 as success and refetches', async () => {
    stubFetchQueue([
      { status: 200, body: [] },
      { status: 409, body: { error: 'conflict' } },
      { status: 200, body: [PROFILE] },
    ])
    const { result } = renderHook(() => useProfiles())
    await waitFor(() => expect(result.current.status).toBe('ready'))
    await act(() => result.current.addProfile({ emoji: '🦊', name: 'Mr Fox' }, 'Basic x'))
    await waitFor(() => expect(result.current.profiles).toEqual([PROFILE]))
  })

  it('removeProfile deletes locally on 204 and treats 404 as success', async () => {
    stubFetchQueue([
      { status: 200, body: [PROFILE] },
      { status: 404, body: { error: 'not found' } },
    ])
    const { result } = renderHook(() => useProfiles())
    await waitFor(() => expect(result.current.status).toBe('ready'))
    await act(() => result.current.removeProfile(PROFILE.id, 'Basic x'))
    expect(result.current.profiles).toEqual([])
  })

  it('rethrows other errors without touching state', async () => {
    stubFetchQueue([
      { status: 200, body: [PROFILE] },
      { status: 503, body: { error: 'writes disabled' } },
    ])
    const { result } = renderHook(() => useProfiles())
    await waitFor(() => expect(result.current.status).toBe('ready'))
    await expect(
      act(() => result.current.removeProfile(PROFILE.id, 'Basic x')),
    ).rejects.toMatchObject({ status: 503 })
    expect(result.current.profiles).toEqual([PROFILE])
  })
})
