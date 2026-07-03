import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createDb } from './index.js'
import { sightings } from './schema.js'

describe('migrations + sightings table', () => {
  let container: StartedPostgreSqlContainer
  let handle: ReturnType<typeof createDb>

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:18.4').start()
    handle = createDb(container.getConnectionUri())
    await migrate(handle.db, { migrationsFolder: 'drizzle' })
  })

  afterAll(async () => {
    await handle?.pool.end()
    await container?.stop()
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
