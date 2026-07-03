import pg from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import * as schema from './schema.js'

export function createDb(connectionString: string) {
  const pool = new pg.Pool({ connectionString })
  const db = drizzle(pool, { schema })
  return { pool, db }
}
