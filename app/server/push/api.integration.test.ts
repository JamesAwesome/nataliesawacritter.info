import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createApp } from '../app.js'
import type { createDb } from '../db/index.js'
import { createProfilesStore } from '../profiles/store.js'
import { createSightingsStore } from '../sightings/store.js'
import { createTestDb } from '../testDb.js'
import { basic, withServer } from '../testUtils.js'
import { createNotifier, type PushTarget } from './notifier.js'
import { createPushStore } from './store.js'

const AUTH = basic('natalie', 'sekrit')
const TODAY = new Date().toISOString().slice(0, 10)
const CONFIG = { subject: 'mailto:james@example.com', publicKey: 'pub', privateKey: 'priv' }

describe('push delivery through the sightings API', () => {
  let handle: ReturnType<typeof createDb>

  beforeAll(async () => {
    handle = await createTestDb()
  })

  afterAll(async () => {
    await handle?.pool.end()
  })

  it('subscribes, delivers on a fresh sighting, prunes a 410 endpoint, skips backdated', async () => {
    const pushStore = createPushStore(handle.db)
    const sent: Array<{ target: PushTarget; payload: string }> = []
    const notifier = createNotifier({
      config: CONFIG,
      store: pushStore,
      send: async (target, payload) => {
        if (target.endpoint.endsWith('/dead')) throw Object.assign(new Error('gone'), { statusCode: 410 })
        sent.push({ target, payload })
        return {}
      },
      today: () => TODAY,
    })
    const app = createApp({
      checkDb: async () => {
        await handle.pool.query('SELECT 1')
      },
      sightingsStore: createSightingsStore(handle.db),
      profilesStore: createProfilesStore(handle.db),
      writeCredentials: { user: 'natalie', password: 'sekrit' },
      photosDir: '/tmp/unused-photos',
      pushStore,
      notifier,
    })

    await withServer(app, async (base) => {
      for (const endpoint of ['https://push.example.com/live', 'https://push.example.com/dead']) {
        const res = await fetch(`${base}/api/push/subscriptions`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ endpoint, keys: { p256dh: 'pk', auth: 'ak' } }),
        })
        expect(res.status).toBe(201)
      }

      const backdated = await fetch(`${base}/api/sightings`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: AUTH },
        body: JSON.stringify({ emoji: '🐢', sightedOn: '2020-01-01' }),
      })
      expect(backdated.status).toBe(201)

      const fresh = await fetch(`${base}/api/sightings`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: AUTH },
        body: JSON.stringify({ emoji: '🦊', sightedOn: TODAY, name: 'Mr Fox' }),
      })
      expect(fresh.status).toBe(201)

      await vi.waitFor(async () => {
        expect(sent).toHaveLength(1) // live endpoint only, fresh sighting only
        expect(await pushStore.listAll()).toHaveLength(1) // dead endpoint pruned
      })
      expect(sent[0].target.endpoint).toBe('https://push.example.com/live')
      expect(JSON.parse(sent[0].payload)).toEqual({ title: '🦊 Natalie saw Mr Fox!', body: '', url: '/' })
    })
  })
})
