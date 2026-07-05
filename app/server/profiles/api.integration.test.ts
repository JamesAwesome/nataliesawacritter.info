import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../app.js'
import type { createDb } from '../db/index.js'
import { createSightingsStore } from '../sightings/store.js'
import { createTestDb } from '../testDb.js'
import { basic, fakePushStore, nullNotifier, withServer } from '../testUtils.js'
import { createProfilesStore } from './store.js'

const AUTH = basic('natalie', 'sekrit')

describe('profiles API against real postgres', () => {
  let handle: ReturnType<typeof createDb>

  beforeAll(async () => {
    handle = await createTestDb()
  })

  afterAll(async () => {
    await handle?.pool.end()
  })

  function app() {
    return createApp({
      checkDb: async () => {
        await handle.pool.query('SELECT 1')
      },
      sightingsStore: createSightingsStore(handle.db),
      profilesStore: createProfilesStore(handle.db),
      writeCredentials: { user: 'natalie', password: 'sekrit' },
      photosDir: '/tmp/unused-photos',
      pushStore: fakePushStore(),
      notifier: nullNotifier(),
    })
  }

  it('POST → GET → duplicate 409 → DELETE round-trips', async () => {
    await withServer(app(), async (base) => {
      const created = await fetch(`${base}/api/profiles`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: AUTH },
        body: JSON.stringify({ emoji: '🦊', name: 'Mr Fox', place: 'train station' }),
      })
      expect(created.status).toBe(201)
      const profile = (await created.json()) as { id: string; place: string | null }
      expect(profile.place).toBe('train station')

      const listed = (await (await fetch(`${base}/api/profiles`)).json()) as Array<{ id: string }>
      expect(listed).toHaveLength(1)

      const dup = await fetch(`${base}/api/profiles`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: AUTH },
        body: JSON.stringify({ emoji: '🦊', name: 'Mr Fox' }),
      })
      expect(dup.status).toBe(409)

      const deleted = await fetch(`${base}/api/profiles/${profile.id}`, {
        method: 'DELETE',
        headers: { authorization: AUTH },
      })
      expect(deleted.status).toBe(204)
      expect(await (await fetch(`${base}/api/profiles`)).json()).toEqual([])
    })
  })
})
