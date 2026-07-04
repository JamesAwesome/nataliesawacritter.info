import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, createSighting, deleteSighting, listSightings } from './api'
import { makeSighting, stubFetchQueue } from './test/helpers'

afterEach(() => {
  vi.unstubAllGlobals()
})

const ROW = makeSighting({
  id: '3f9a26cc-1c0e-4c3a-9b52-08a1c2f4d9aa',
  sightedOn: '2026-07-03',
  createdAt: '2026-07-03T12:00:00.000Z',
})

describe('listSightings', () => {
  it('GETs /api/sightings and returns the array', async () => {
    const mock = stubFetchQueue([{ status: 200, body: [ROW] }])
    await expect(listSightings()).resolves.toEqual([ROW])
    expect(mock).toHaveBeenCalledWith('/api/sightings')
  })

  it('throws ApiError with status on failure', async () => {
    stubFetchQueue([{ status: 500, body: { error: 'internal' } }])
    await expect(listSightings()).rejects.toMatchObject({ status: 500 })
    stubFetchQueue([{ status: 500, body: { error: 'internal' } }])
    await expect(listSightings()).rejects.toBeInstanceOf(ApiError)
  })
})

describe('createSighting', () => {
  it('POSTs JSON with the auth header and returns the created row', async () => {
    const mock = stubFetchQueue([{ status: 201, body: ROW }])
    const result = await createSighting({ emoji: '🦊', sightedOn: '2026-07-03', name: 'Fox' }, 'Basic abc')
    expect(result).toEqual(ROW)
    expect(mock).toHaveBeenCalledWith('/api/sightings', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Basic abc' },
      body: JSON.stringify({ emoji: '🦊', sightedOn: '2026-07-03', name: 'Fox' }),
    })
  })

  it('throws ApiError 401 on bad credentials', async () => {
    stubFetchQueue([{ status: 401, body: { error: 'unauthorized' } }])
    await expect(
      createSighting({ emoji: '🦊', sightedOn: '2026-07-03' }, 'Basic bad'),
    ).rejects.toMatchObject({ status: 401 })
  })

  it('throws ApiError 503 when writes are disabled', async () => {
    stubFetchQueue([{ status: 503, body: { error: 'writes disabled' } }])
    await expect(
      createSighting({ emoji: '🦊', sightedOn: '2026-07-03' }, 'Basic abc'),
    ).rejects.toMatchObject({ status: 503 })
  })
})

describe('deleteSighting', () => {
  it('DELETEs with the auth header and resolves on 204', async () => {
    const mock = stubFetchQueue([{ status: 204, body: null }])
    await expect(deleteSighting('abc-id', 'Basic xyz')).resolves.toBeUndefined()
    expect(mock).toHaveBeenCalledWith('/api/sightings/abc-id', {
      method: 'DELETE',
      headers: { authorization: 'Basic xyz' },
    })
  })

  it('throws ApiError with status on failure', async () => {
    stubFetchQueue([{ status: 401, body: { error: 'unauthorized' } }])
    await expect(deleteSighting('abc-id', 'Basic bad')).rejects.toMatchObject({ status: 401 })
  })
})
