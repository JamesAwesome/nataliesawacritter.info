import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { inject } from 'vitest'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { createDb } from './db/index.js'

/**
 * Fresh database on the suite's single shared Postgres container.
 * One call per test file — files run in parallel workers, so each
 * gets its own isolated database instead of its own container.
 */
export async function createTestDb() {
  const adminUri = inject('pgAdminUri')
  const dbName = 'test_' + randomUUID().replaceAll('-', '')
  const admin = new pg.Client({ connectionString: adminUri })
  await admin.connect()
  await admin.query(`CREATE DATABASE ${dbName}`)
  await admin.end()
  const url = new URL(adminUri)
  url.pathname = `/${dbName}`
  const handle = createDb(url.toString())
  await migrate(handle.db, { migrationsFolder: 'drizzle' })
  return handle
}
