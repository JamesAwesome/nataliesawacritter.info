import path from 'node:path'
import express, { type Express, type RequestHandler } from 'express'
import { requireWriteAuth } from './auth.js'
import { errorHandler } from './errorHandler.js'
import { sightingsRouter } from './sightings/routes.js'
import type { SightingsStore } from './sightings/store.js'

export interface AppDeps {
  /** Resolves if the database is reachable, throws otherwise. */
  checkDb: () => Promise<void>
  sightingsStore: SightingsStore
  /** null → write endpoints respond 503 "writes disabled" (deny by default). */
  writeCredentials: { user: string; password: string } | null
}

const writesDisabled: RequestHandler = (_req, res) => {
  res.status(503).json({ error: 'writes disabled' })
}

export function createApp(deps: AppDeps): Express {
  const app = express()
  app.use(express.json())

  app.get('/api/health', async (_req, res) => {
    try {
      await deps.checkDb()
      res.json({ ok: true, db: true })
    } catch (err) {
      console.error('health check failed:', err)
      res.status(503).json({ ok: false, db: false })
    }
  })

  const writeGate = deps.writeCredentials
    ? requireWriteAuth(deps.writeCredentials.user, deps.writeCredentials.password)
    : writesDisabled
  app.use('/api/sightings', sightingsRouter(deps.sightingsStore, writeGate))

  const clientDir = path.resolve(import.meta.dirname, '../client')
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) {
      res.status(404).json({ error: 'not found' })
      return
    }
    if (process.env.NODE_ENV === 'production') {
      next() // fall through to static / SPA fallback below
      return
    }
    res.status(404).send('client is served by vite in development')
  })
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(clientDir))
    app.use((_req, res) => {
      res.sendFile('index.html', { root: clientDir })
    })
  }

  app.use(errorHandler)

  return app
}
