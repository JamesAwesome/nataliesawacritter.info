import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { createApp } from './app.js'
import { createDb } from './db/index.js'
import { createSightingsStore } from './sightings/store.js'

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  console.error('DATABASE_URL is required')
  process.exit(1)
}

const { pool, db } = createDb(connectionString)

// cwd-relative: run from app/ in dev, /app in the container
await migrate(db, { migrationsFolder: 'drizzle' })
console.log('migrations up to date')

const writeUser = process.env.WRITE_USER ?? ''
const writePassword = process.env.WRITE_PASSWORD ?? ''
const writeCredentials =
  writeUser !== '' && writePassword !== '' ? { user: writeUser, password: writePassword } : null
if (!writeCredentials) {
  const missing = [writeUser === '' ? 'WRITE_USER' : null, writePassword === '' ? 'WRITE_PASSWORD' : null]
    .filter(Boolean)
    .join(' and ')
  console.warn(`${missing} not set — write endpoints disabled (503)`)
}

const app = createApp({
  checkDb: async () => {
    await pool.query('SELECT 1')
  },
  sightingsStore: createSightingsStore(db),
  writeCredentials,
})

const port = Number(process.env.PORT ?? 8080)
const server = app.listen(port, () => {
  console.log(`critter-tracker listening on :${port}`)
})

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close(() => {
      void pool.end()
    })
  })
}
