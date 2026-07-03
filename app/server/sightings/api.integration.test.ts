import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../app.js'
import { createDb } from '../db/index.js'
import { withServer } from '../testUtils.js'
import { createSightingsStore, type Sighting } from './store.js'

const AUTH = 'Basic ' + Buffer.from('natalie:sekrit').toString('base64')

// The fetch types ship `Response.json(): Promise<unknown>`; narrow to the
// shape this test asserts on so it avoids `any`.
type SightingJson = Omit<Sighting, 'createdAt'> & { createdAt: string }

describe('sightings API against real postgres', () => {
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

  function app() {
    return createApp({
      checkDb: async () => {
        await handle.pool.query('SELECT 1')
      },
      sightingsStore: createSightingsStore(handle.db),
      writeCredentials: { user: 'natalie', password: 'sekrit' },
    })
  }

  it('POST → GET → DELETE → GET round-trips through HTTP and the database', async () => {
    await withServer(app(), async (base) => {
      const unauthorized = await fetch(`${base}/api/sightings`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ emoji: '🦉', sightedOn: '2026-07-03' }),
      })
      expect(unauthorized.status).toBe(401)

      const created = await fetch(`${base}/api/sightings`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: AUTH },
        body: JSON.stringify({ emoji: '🦉', sightedOn: '2026-07-03', name: 'Owl', place: 'oak tree' }),
      })
      expect(created.status).toBe(201)
      const sighting = (await created.json()) as SightingJson
      expect(sighting.emoji).toBe('🦉')

      const listed = (await (await fetch(`${base}/api/sightings`)).json()) as SightingJson[]
      expect(listed).toHaveLength(1)
      expect(listed[0].id).toBe(sighting.id)
      expect(listed[0].place).toBe('oak tree')

      const deleted = await fetch(`${base}/api/sightings/${sighting.id}`, {
        method: 'DELETE',
        headers: { authorization: AUTH },
      })
      expect(deleted.status).toBe(204)

      expect(await (await fetch(`${base}/api/sightings`)).json()).toEqual([])
    })
  })
})
