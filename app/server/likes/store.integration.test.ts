import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { createTestDb } from '../testDb.js'
import { createSightingsStore } from '../sightings/store.js'
import { createLikesStore } from './store.js'

let handle: Awaited<ReturnType<typeof createTestDb>>
let sightings: ReturnType<typeof createSightingsStore>
let likes: ReturnType<typeof createLikesStore>

beforeAll(async () => {
  handle = await createTestDb()
  sightings = createSightingsStore(handle.db)
  likes = createLikesStore(handle.db)
})
afterAll(async () => {
  await handle?.pool.end()
})

const FIELDS = {
  emoji: '🦊', sightedOn: '2026-07-16', name: null,
  sightedTime: null, place: null, comment: null, quantity: '1' as const,
}
const DEV_A = '11111111-1111-4111-8111-111111111111'
const DEV_B = '22222222-2222-4222-8222-222222222222'

describe('likes store', () => {
  it('counts one like per device — re-liking is a no-op (unique constraint)', async () => {
    const s = await sightings.create(FIELDS)
    await likes.like(s.id, DEV_A)
    await likes.like(s.id, DEV_A) // duplicate → ON CONFLICT DO NOTHING
    expect(await likes.countFor(s.id)).toBe(1)
    await likes.like(s.id, DEV_B)
    expect(await likes.countFor(s.id)).toBe(2)
  })

  it('unlike removes only that device’s like and is idempotent', async () => {
    const s = await sightings.create(FIELDS)
    await likes.like(s.id, DEV_A)
    await likes.like(s.id, DEV_B)
    await likes.unlike(s.id, DEV_A)
    await likes.unlike(s.id, DEV_A) // second unlike: no-op
    expect(await likes.countFor(s.id)).toBe(1)
  })

  it('cascades away when the sighting is deleted', async () => {
    const s = await sightings.create(FIELDS)
    await likes.like(s.id, DEV_A)
    await sightings.remove(s.id)
    expect(await likes.countFor(s.id)).toBe(0)
  })

  it('countFor is 0 for a sighting with no likes', async () => {
    const s = await sightings.create(FIELDS)
    expect(await likes.countFor(s.id)).toBe(0)
  })
})
