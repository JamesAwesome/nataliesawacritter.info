import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createTestDb } from '../testDb.js'
import { createDb } from '../db/index.js'
import { sightings } from '../db/schema.js'
import { createSightingsStore, type SightingsStore } from './store.js'

describe('sightings store', () => {
  let handle: ReturnType<typeof createDb>
  let store: SightingsStore

  beforeAll(async () => {
    handle = await createTestDb()
    store = createSightingsStore(handle.db)
  })

  afterAll(async () => {
    await handle?.pool.end()
  })

  beforeEach(async () => {
    await handle.db.delete(sightings)
  })

  const fox = (overrides: Partial<Parameters<SightingsStore['create']>[0]> = {}) => ({
    emoji: '🦊',
    sightedOn: '2026-07-02',
    name: 'Fox',
    sightedTime: null,
    place: null,
    comment: null,
    ...overrides,
  })

  it('create returns the persisted row with generated id and createdAt', async () => {
    const row = await store.create(fox({ place: 'backyard' }))
    expect(row.id).toMatch(/^[0-9a-f]{8}-[0-9a-f-]{27}$/)
    expect(row.createdAt).toBeInstanceOf(Date)
    expect(row.photoPath).toBeNull()
    expect(row.place).toBe('backyard')
  })

  it('list orders by sightedOn desc then createdAt desc', async () => {
    await store.create(fox({ sightedOn: '2026-07-01', name: 'oldest' }))
    const firstOfDay = await store.create(fox({ sightedOn: '2026-07-03', name: 'day-first' }))
    const secondOfDay = await store.create(fox({ sightedOn: '2026-07-03', name: 'day-second' }))
    await store.create(fox({ sightedOn: '2026-07-02', name: 'middle' }))
    expect(secondOfDay.createdAt.getTime()).toBeGreaterThanOrEqual(firstOfDay.createdAt.getTime())

    const names = (await store.list()).map((s) => s.name)
    expect(names).toEqual(['day-second', 'day-first', 'middle', 'oldest'])
  })

  it('filters by from/to inclusively, with open-ended bounds', async () => {
    await store.create(fox({ sightedOn: '2026-07-01', name: 'a' }))
    await store.create(fox({ sightedOn: '2026-07-02', name: 'b' }))
    await store.create(fox({ sightedOn: '2026-07-03', name: 'c' }))

    expect((await store.list({ from: '2026-07-02', to: '2026-07-03' })).map((s) => s.name)).toEqual(['c', 'b'])
    expect((await store.list({ from: '2026-07-02' })).map((s) => s.name)).toEqual(['c', 'b'])
    expect((await store.list({ to: '2026-07-01' })).map((s) => s.name)).toEqual(['a'])
    expect(await store.list({ from: '2026-07-04' })).toEqual([])
  })

  it('remove returns true for an existing row and false for a missing one', async () => {
    const row = await store.create(fox())
    expect(await store.remove(row.id)).toBe(true)
    expect(await store.list()).toEqual([])
    expect(await store.remove('00000000-0000-0000-0000-000000000000')).toBe(false)
  })
})
