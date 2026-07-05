import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createTestDb } from '../testDb.js'
import type { createDb } from '../db/index.js'
import { pushSubscriptions } from '../db/schema.js'
import { createPushStore, type PushStore } from './store.js'

const SUB = { endpoint: 'https://push.example.com/send/abc', p256dh: 'key-p256dh', auth: 'key-auth' }

describe('push store', () => {
  let handle: ReturnType<typeof createDb>
  let store: PushStore

  beforeAll(async () => {
    handle = await createTestDb()
    store = createPushStore(handle.db)
  })

  afterAll(async () => {
    await handle?.pool.end()
  })

  beforeEach(async () => {
    await handle.db.delete(pushSubscriptions)
  })

  it('upserts by endpoint: same endpoint updates keys instead of duplicating', async () => {
    await store.upsert(SUB)
    await store.upsert({ ...SUB, p256dh: 'rotated-p256dh', auth: 'rotated-auth' })
    const rows = await store.listAll()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ endpoint: SUB.endpoint, p256dh: 'rotated-p256dh', auth: 'rotated-auth' })
    expect(rows[0].id).toMatch(/^[0-9a-f]{8}-/)
  })

  it('stores distinct endpoints as distinct rows', async () => {
    await store.upsert(SUB)
    await store.upsert({ ...SUB, endpoint: 'https://push.example.com/send/def' })
    expect(await store.listAll()).toHaveLength(2)
  })

  it('removeByEndpoint returns true then false', async () => {
    await store.upsert(SUB)
    expect(await store.removeByEndpoint(SUB.endpoint)).toBe(true)
    expect(await store.removeByEndpoint(SUB.endpoint)).toBe(false)
    expect(await store.listAll()).toEqual([])
  })
})
