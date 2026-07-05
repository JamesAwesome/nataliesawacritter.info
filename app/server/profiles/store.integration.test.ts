import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createTestDb } from '../testDb.js'
import type { createDb } from '../db/index.js'
import { critterProfiles } from '../db/schema.js'
import { createProfilesStore, type ProfilesStore } from './store.js'

describe('profiles store', () => {
  let handle: ReturnType<typeof createDb>
  let store: ProfilesStore

  beforeAll(async () => {
    handle = await createTestDb()
    store = createProfilesStore(handle.db)
  })

  afterAll(async () => {
    await handle?.pool.end()
  })

  beforeEach(async () => {
    await handle.db.delete(critterProfiles)
  })

  it('creates and lists profiles most-recent-first', async () => {
    const first = await store.create({ emoji: '🦊', name: 'Mr Fox', place: 'train station' })
    const second = await store.create({ emoji: '🦉', name: 'Professor Hoot', place: null })
    expect(first).toMatchObject({ ok: true })
    expect(second).toMatchObject({ ok: true })
    const rows = await store.list()
    expect(rows.map((p) => p.name)).toEqual(['Professor Hoot', 'Mr Fox'])
    expect(rows[1].place).toBe('train station')
    expect(rows[1].id).toMatch(/^[0-9a-f]{8}-/)
  })

  it('signals conflict for a duplicate emoji+name and allows same name with another emoji', async () => {
    await store.create({ emoji: '🦊', name: 'Mr Fox', place: null })
    expect(await store.create({ emoji: '🦊', name: 'Mr Fox', place: 'elsewhere' })).toEqual({
      ok: false,
      conflict: true,
    })
    expect(await store.create({ emoji: '🐺', name: 'Mr Fox', place: null })).toMatchObject({ ok: true })
    expect(await store.list()).toHaveLength(2)
  })

  it('remove returns true then false', async () => {
    const created = await store.create({ emoji: '🦊', name: 'Mr Fox', place: null })
    if (!created.ok) throw new Error('setup failed')
    expect(await store.remove(created.row.id)).toBe(true)
    expect(await store.remove(created.row.id)).toBe(false)
  })
})
