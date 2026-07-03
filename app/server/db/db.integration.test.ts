import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDb } from '../testDb.js'
import { createDb } from './index.js'
import { sightings } from './schema.js'

describe('migrations + sightings table', () => {
  let handle: ReturnType<typeof createDb>

  beforeAll(async () => {
    handle = await createTestDb()
  })

  afterAll(async () => {
    await handle?.pool.end()
  })

  it('inserts a sighting and reads it back', async () => {
    const [inserted] = await handle.db
      .insert(sightings)
      .values({ emoji: '🦊', name: 'Fox', sightedOn: '2026-07-02' })
      .returning()

    expect(inserted.id).toMatch(/^[0-9a-f]{8}-[0-9a-f-]{27}$/)
    expect(inserted.createdAt).toBeInstanceOf(Date)

    const rows = await handle.db.select().from(sightings)
    expect(rows).toHaveLength(1)
    expect(rows[0].emoji).toBe('🦊')
    expect(rows[0].name).toBe('Fox')
    expect(rows[0].sightedOn).toBe('2026-07-02')
    expect(rows[0].place).toBeNull()
  })
})
