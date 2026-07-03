import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, createSighting, listSightings } from './api'

function stubFetch(status: number, body: unknown) {
  const mock = vi.fn(async () => new Response(JSON.stringify(body), { status }))
  vi.stubGlobal('fetch', mock)
  return mock
}

afterEach(() => {
  vi.unstubAllGlobals()
})

const ROW = {
  id: '3f9a26cc-1c0e-4c3a-9b52-08a1c2f4d9aa', emoji: '🦊', name: 'Fox',
  sightedOn: '2026-07-03', sightedTime: null, place: null, comment: null,
  photoPath: null, createdAt: '2026-07-03T12:00:00.000Z',
}

describe('listSightings', () => {
  it('GETs /api/sightings and returns the array', async () => {
    const mock = stubFetch(200, [ROW])
    await expect(listSightings()).resolves.toEqual([ROW])
    expect(mock).toHaveBeenCalledWith('/api/sightings')
  })

  it('throws ApiError with status on failure', async () => {
    stubFetch(500, { error: 'internal' })
    await expect(listSightings()).rejects.toMatchObject({ status: 500 })
    stubFetch(500, { error: 'internal' })
    await expect(listSightings()).rejects.toBeInstanceOf(ApiError)
  })
})

describe('createSighting', () => {
  it('POSTs JSON with the auth header and returns the created row', async () => {
    const mock = stubFetch(201, ROW)
    const result = await createSighting({ emoji: '🦊', sightedOn: '2026-07-03', name: 'Fox' }, 'Basic abc')
    expect(result).toEqual(ROW)
    expect(mock).toHaveBeenCalledWith('/api/sightings', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Basic abc' },
      body: JSON.stringify({ emoji: '🦊', sightedOn: '2026-07-03', name: 'Fox' }),
    })
  })

  it('throws ApiError 401 on bad credentials', async () => {
    stubFetch(401, { error: 'unauthorized' })
    await expect(
      createSighting({ emoji: '🦊', sightedOn: '2026-07-03' }, 'Basic bad'),
    ).rejects.toMatchObject({ status: 401 })
  })

  it('throws ApiError 503 when writes are disabled', async () => {
    stubFetch(503, { error: 'writes disabled' })
    await expect(
      createSighting({ emoji: '🦊', sightedOn: '2026-07-03' }, 'Basic abc'),
    ).rejects.toMatchObject({ status: 503 })
  })
})
