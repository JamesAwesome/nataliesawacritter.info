import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { createApp } from './app.js'
import { createDb } from './db/index.js'

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  console.error('DATABASE_URL is required')
  process.exit(1)
}

const { pool, db } = createDb(connectionString)

// cwd-relative: run from app/ in dev, /app in the container
await migrate(db, { migrationsFolder: 'drizzle' })
console.log('migrations up to date')

const app = createApp({
  checkDb: async () => {
    await pool.query('SELECT 1')
  },
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
