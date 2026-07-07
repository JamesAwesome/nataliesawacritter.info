import { readFileSync } from 'node:fs'
import { sql } from 'drizzle-orm'
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

  it('0004 normalizes legacy AM/PM sighted_time to sortable 24h, leaving others alone', async () => {
    await handle.db.delete(sightings)
    await handle.db.insert(sightings).values([
      { emoji: '🦉', sightedOn: '2026-07-05', sightedTime: '3:08 PM' },
      { emoji: '🦆', sightedOn: '2026-07-05', sightedTime: '12:00 AM' },
      { emoji: '🐸', sightedOn: '2026-07-05', sightedTime: '11:59 PM' },
      { emoji: '🐢', sightedOn: '2026-07-05', sightedTime: '15:08' }, // already 24h
      { emoji: '🦡', sightedOn: '2026-07-05', sightedTime: 'dusk' }, // free-text
      { emoji: '🦝', sightedOn: '2026-07-05', sightedTime: null }, // "just now"
    ])
    // Run the ACTUAL migration SQL (not a copy) against the seeded rows.
    const migration = readFileSync(new URL('../../drizzle/0004_normalize_sighted_time.sql', import.meta.url), 'utf8')
    await handle.db.execute(sql.raw(migration))

    const rows = await handle.db.select().from(sightings)
    const time = Object.fromEntries(rows.map((r) => [r.emoji, r.sightedTime]))
    expect(time['🦉']).toBe('15:08') // 3:08 PM → 15:08
    expect(time['🦆']).toBe('00:00') // 12:00 AM → 00:00
    expect(time['🐸']).toBe('23:59') // 11:59 PM → 23:59
    expect(time['🐢']).toBe('15:08') // already 24h, unchanged
    expect(time['🦡']).toBe('dusk') // free-text, unchanged
    expect(time['🦝']).toBeNull() // null, unchanged
  })
})
