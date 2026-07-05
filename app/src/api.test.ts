import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, createProfile, createSighting, deletePhoto, deleteProfile, deleteSighting, deletePushSubscription, fetchVapidKey, listProfiles, listSightings, savePushSubscription, uploadPhoto } from './api'
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

const PROFILE = {
  id: '3f9a26cc-1c0e-4c3a-9b52-08a1c2f4d9aa',
  emoji: '🦊',
  name: 'Mr Fox',
  place: 'train station',
  createdAt: '2026-07-04T12:00:00.000Z',
}

describe('profiles api', () => {
  it('lists, creates with auth, and deletes', async () => {
    let mock = stubFetchQueue([{ status: 200, body: [PROFILE] }])
    await expect(listProfiles()).resolves.toEqual([PROFILE])
    expect(mock).toHaveBeenCalledWith('/api/profiles')

    mock = stubFetchQueue([{ status: 201, body: PROFILE }])
    await expect(createProfile({ emoji: '🦊', name: 'Mr Fox', place: 'train station' }, 'Basic x')).resolves.toEqual(PROFILE)
    expect(mock).toHaveBeenCalledWith('/api/profiles', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Basic x' },
      body: JSON.stringify({ emoji: '🦊', name: 'Mr Fox', place: 'train station' }),
    })

    mock = stubFetchQueue([{ status: 204, body: null }])
    await expect(deleteProfile(PROFILE.id, 'Basic x')).resolves.toBeUndefined()
    expect(mock).toHaveBeenCalledWith(`/api/profiles/${PROFILE.id}`, {
      method: 'DELETE',
      headers: { authorization: 'Basic x' },
    })
  })

  it('throws ApiError with status on conflict', async () => {
    stubFetchQueue([{ status: 409, body: { error: 'conflict' } }])
    await expect(createProfile({ emoji: '🦊', name: 'Mr Fox' }, 'Basic x')).rejects.toMatchObject({ status: 409 })
  })
})

describe('photo api', () => {
  it('uploads via PUT with the blob body and auth', async () => {
    const updated = makeSighting({ photoPath: '/api/photos/x-1.jpg' })
    const mock = stubFetchQueue([{ status: 200, body: updated }])
    const blob = new Blob(['jpg'], { type: 'image/jpeg' })
    await expect(uploadPhoto(updated.id, blob, 'Basic x')).resolves.toEqual(updated)
    expect(mock).toHaveBeenCalledWith(`/api/sightings/${updated.id}/photo`, {
      method: 'PUT',
      headers: { 'content-type': 'image/jpeg', authorization: 'Basic x' },
      body: blob,
    })
  })

  it('deletes via DELETE and throws ApiError on failure', async () => {
    stubFetchQueue([{ status: 204, body: null }, { status: 503, body: { error: 'writes disabled' } }])
    await expect(deletePhoto('id-1', 'Basic x')).resolves.toBeUndefined()
    await expect(deletePhoto('id-1', 'Basic x')).rejects.toMatchObject({ status: 503 })
  })
})

describe('push api', () => {
  it('fetchVapidKey returns the key, and null on 503 (push disabled)', async () => {
    const mock = stubFetchQueue([{ status: 200, body: { key: 'pub-key' } }])
    await expect(fetchVapidKey()).resolves.toBe('pub-key')
    expect(mock).toHaveBeenCalledWith('/api/push/vapid-public-key')
    stubFetchQueue([{ status: 503, body: { error: 'push disabled' } }])
    await expect(fetchVapidKey()).resolves.toBeNull()
  })

  it('savePushSubscription POSTs the subscription JSON', async () => {
    const sub = { endpoint: 'https://push.example.com/x', keys: { p256dh: 'pk', auth: 'ak' } }
    const mock = stubFetchQueue([{ status: 201, body: { ok: true } }])
    await expect(savePushSubscription(sub)).resolves.toBeUndefined()
    expect(mock).toHaveBeenCalledWith('/api/push/subscriptions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(sub),
    })
    stubFetchQueue([{ status: 400, body: { error: 'validation' } }])
    await expect(savePushSubscription(sub)).rejects.toMatchObject({ status: 400 })
  })

  it('deletePushSubscription DELETEs by endpoint', async () => {
    const mock = stubFetchQueue([{ status: 204, body: null }])
    await expect(deletePushSubscription('https://push.example.com/x')).resolves.toBeUndefined()
    expect(mock).toHaveBeenCalledWith('/api/push/subscriptions', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ endpoint: 'https://push.example.com/x' }),
    })
  })
})
