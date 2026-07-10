import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createTestDb } from '../testDb.js'
import { createDb } from '../db/index.js'
import { emojiRequests } from '../db/schema.js'
import { createEmojiRequestsStore, type EmojiRequestsStore } from './store.js'

describe('emoji requests store', () => {
  let handle: ReturnType<typeof createDb>
  let store: EmojiRequestsStore

  beforeAll(async () => {
    handle = await createTestDb()
    store = createEmojiRequestsStore(handle.db)
  })

  afterAll(async () => {
    await handle?.pool.end()
  })

  beforeEach(async () => {
    await handle.db.delete(emojiRequests)
  })

  it('creates, lists newest-first, and removes', async () => {
    const first = await store.create({ name: 'Pigeon', note: null })
    const second = await store.create({ name: 'Owl', note: 'the barn kind' })
    expect(second.createdAt.getTime()).toBeGreaterThanOrEqual(first.createdAt.getTime())

    const list = await store.list()
    expect(list.map((r) => r.name)).toEqual(['Owl', 'Pigeon'])
    expect(list[0].note).toBe('the barn kind')

    expect(await store.remove(first.id)).toBe(true)
    expect(await store.remove('00000000-0000-0000-0000-000000000000')).toBe(false)
    expect((await store.list()).map((r) => r.name)).toEqual(['Owl'])
  })

  it('marks handled and filters pending', async () => {
    const pigeon = await store.create({ name: 'Pigeon', note: null })
    await store.create({ name: 'Owl', note: null })

    expect((await store.list({ pending: true })).map((r) => r.name)).toEqual(['Owl', 'Pigeon'])

    const handled = await store.markHandled(pigeon.id, { outcome: 'pr-opened', prUrl: 'https://example.test/pull/1' })
    expect(handled?.handledAt).toBeInstanceOf(Date)
    expect(handled?.outcome).toBe('pr-opened')
    expect(handled?.prUrl).toBe('https://example.test/pull/1')

    // pending now excludes Pigeon; the full list still has both.
    expect((await store.list({ pending: true })).map((r) => r.name)).toEqual(['Owl'])
    expect((await store.list()).map((r) => r.name)).toEqual(['Owl', 'Pigeon'])

    expect(await store.markHandled('00000000-0000-0000-0000-000000000000', { outcome: 'pr-opened', prUrl: null })).toBeNull()
  })
})
